import { isSupabaseConfigured } from "@/lib/env";

export function SetupBanner() {
  if (isSupabaseConfigured) {
    return null;
  }

  return (
    <div
      role="status"
      className="border-b border-line bg-surface-muted px-4 py-2 text-micro text-muted sm:px-6 lg:px-8"
    >
      <span className="font-medium text-content">Supabase is not connected.</span> Copy{" "}
      <code className="rounded bg-canvas px-1 py-0.5">.env.example</code> to{" "}
      <code className="rounded bg-canvas px-1 py-0.5">.env.local</code> and add your project URL and
      anon key to enable authentication and data.
    </div>
  );
}
