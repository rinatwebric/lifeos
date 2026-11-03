import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode } from "react";

import { AuthProvider, useAuth, type AuthContextValue } from "./AuthProvider";
import { exchangeCodeFromUrl, getSession, onAuthStateChange } from "./api";

// Unit boundary: the provider talks to ./api, never to Supabase directly.
vi.mock("./api", () => ({
  exchangeCodeFromUrl: vi.fn(),
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
}));

// Deterministic in CI and on machines with a filled `.env.local`: these tests
// cover the configured branch (the unconfigured branch has its own test file).
vi.mock("@/lib/env", () => ({ isSupabaseConfigured: true }));

const mockedExchange = vi.mocked(exchangeCodeFromUrl);
const mockedGetSession = vi.mocked(getSession);
const mockedOnAuthStateChange = vi.mocked(onAuthStateChange);

function sessionFor(userId: string): Session {
  return { user: { id: userId } } as unknown as Session;
}

function lastCallback(): (event: AuthChangeEvent, session: Session | null) => void {
  const call = mockedOnAuthStateChange.mock.calls.at(-1);

  if (!call) {
    throw new Error("onAuthStateChange was not subscribed");
  }

  return call[0];
}

function renderProvider() {
  const queryClient = new QueryClient();
  const clearSpy = vi.spyOn(queryClient, "clear");
  let latest: AuthContextValue | null = null;

  function Probe() {
    latest = useAuth();
    return null;
  }

  const view = render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </QueryClientProvider>,
  );
  return { view, clearSpy, latest: () => latest };
}

beforeEach(() => {
  mockedExchange.mockResolvedValue(null);
  mockedGetSession.mockResolvedValue(null);
  mockedOnAuthStateChange.mockImplementation(() => ({ unsubscribe: vi.fn() }));
});

describe("AuthProvider", () => {
  it("starts loading, then anonymous when there is no session", async () => {
    const { latest } = renderProvider();

    expect(latest()?.status).toBe("loading");

    await waitFor(() => expect(latest()?.status).toBe("anonymous"));
    expect(latest()?.user).toBeNull();
    expect(latest()?.session).toBeNull();
  });

  it("is authenticated when a session exists", async () => {
    mockedGetSession.mockResolvedValue(sessionFor("user-a"));

    const { latest } = renderProvider();

    await waitFor(() => expect(latest()?.status).toBe("authenticated"));
    expect(latest()?.user?.id).toBe("user-a");
  });

  it("clears the query cache on SIGNED_OUT without refetching the session", async () => {
    mockedGetSession.mockResolvedValue(sessionFor("user-a"));
    const { clearSpy, latest } = renderProvider();

    await waitFor(() => expect(latest()?.status).toBe("authenticated"));
    expect(clearSpy).not.toHaveBeenCalled();

    lastCallback()("SIGNED_OUT", null);

    await waitFor(() => expect(latest()?.status).toBe("anonymous"));
    expect(clearSpy).toHaveBeenCalledTimes(1);
    // The callback only applies state; it never calls Supabase (deadlock risk).
    expect(mockedGetSession).toHaveBeenCalledTimes(1);
  });

  it("clears the cache when a different user signs in, but not on re-emit", async () => {
    mockedGetSession.mockResolvedValue(sessionFor("user-a"));
    const { clearSpy, latest } = renderProvider();

    await waitFor(() => expect(latest()?.status).toBe("authenticated"));

    lastCallback()("SIGNED_IN", sessionFor("user-a"));
    expect(clearSpy).not.toHaveBeenCalled();

    lastCallback()("SIGNED_IN", sessionFor("user-b"));

    await waitFor(() => expect(latest()?.user?.id).toBe("user-b"));
    expect(clearSpy).toHaveBeenCalledTimes(1);
  });

  it("unsubscribes on unmount; StrictMode double-mount leaves one live subscription", async () => {
    const unsubscribes: Array<ReturnType<typeof vi.fn>> = [];
    mockedOnAuthStateChange.mockImplementation(() => {
      const unsubscribe = vi.fn();
      unsubscribes.push(unsubscribe);
      return { unsubscribe };
    });

    const queryClient = new QueryClient();
    let latest: AuthContextValue | null = null;

    function Probe() {
      latest = useAuth();
      return null;
    }

    const view = render(
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <Probe />
          </AuthProvider>
        </QueryClientProvider>
      </StrictMode>,
    );

    await waitFor(() => expect(latest?.status).toBe("anonymous"));

    // StrictMode mounts the effect twice; the first subscription must be cleaned up.
    expect(mockedOnAuthStateChange).toHaveBeenCalledTimes(2);
    expect(unsubscribes).toHaveLength(2);
    expect(unsubscribes[0]).toHaveBeenCalledTimes(1);
    expect(unsubscribes[1]).not.toHaveBeenCalled();

    view.unmount();
    expect(unsubscribes[1]).toHaveBeenCalledTimes(1);
  });

  it("useAuth throws outside AuthProvider", () => {
    function Outside() {
      useAuth();
      return null;
    }

    expect(() => render(<Outside />)).toThrow("useAuth must be used within AuthProvider");
  });
});
