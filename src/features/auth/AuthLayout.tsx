import { Outlet } from "react-router-dom";

import { Brand } from "@/components/layout/Brand";

export const AUTH_LAYOUT_COPY = {
  tagline: "Sign in to continue to your personal operating system.",
} as const;

/**
 * Standalone layout for auth screens: centered card, no sidebar or mobile
 * navigation. Auth routes live outside `AppLayout` (wired in unit 5).
 */
export function AuthLayout() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-md rounded-card border border-line bg-surface p-6 shadow-raised sm:p-8">
        <div className="flex flex-col items-center gap-1 text-center">
          <Brand showTagline />
          <p className="text-micro text-muted">{AUTH_LAYOUT_COPY.tagline}</p>
        </div>
        <div className="mt-6">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
