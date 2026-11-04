import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";

import { useAuth } from "./useAuth";
import { isSupabaseConfigured } from "@/lib/env";

export const REQUIRE_AUTH_COPY = {
  loading: "Loading…",
} as const;

interface GuardProps {
  children: ReactNode;
}

/**
 * Protects private routes. While the session is loading it renders a
 * placeholder instead of redirecting (no flicker, deep link preserved).
 * Anonymous users go to `/sign-in` with the origin location in state.
 */
export function RequireAuth({ children }: GuardProps) {
  const { status } = useAuth();
  const location = useLocation();

  // Without Supabase config auth cannot work: render the shell so the setup
  // banner explains the setup instead of bouncing to a dead sign-in form.
  if (!isSupabaseConfigured) {
    return <>{children}</>;
  }

  if (status === "loading") {
    return (
      <div
        role="status"
        className="flex min-h-dvh items-center justify-center text-ui text-muted"
      >
        {REQUIRE_AUTH_COPY.loading}
      </div>
    );
  }

  if (status === "anonymous") {
    return <Navigate to="/sign-in" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

/**
 * Protects public-only auth routes. Authenticated users go home;
 * loading renders the same placeholder so no redirect happens mid-init.
 */
export function RedirectIfAuthed({ children }: GuardProps) {
  const { status } = useAuth();

  if (!isSupabaseConfigured) {
    return <>{children}</>;
  }

  if (status === "loading") {
    return (
      <div
        role="status"
        className="flex min-h-dvh items-center justify-center text-ui text-muted"
      >
        {REQUIRE_AUTH_COPY.loading}
      </div>
    );
  }

  if (status === "authenticated") {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
