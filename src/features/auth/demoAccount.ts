/**
 * Demo account credentials (iteration 3, unit 2).
 *
 * The demo account is a shared, public showcase login with sample data only.
 * Credentials come from `VITE_DEMO_EMAIL` / `VITE_DEMO_PASSWORD` (Vercel env,
 * never hardcoded) and are read from `import.meta.env` at call time so tests
 * can stub them with `vi.stubEnv`. Returns `null` when either value is empty.
 * Never point this at the e2e account: visitors mutate demo data, while
 * e2e asserts must stay stable.
 */

export interface DemoCredentials {
  email: string;
  password: string;
}

function readEnv(name: "VITE_DEMO_EMAIL" | "VITE_DEMO_PASSWORD"): string {
  const value: unknown = import.meta.env[name];
  return typeof value === "string" ? value.trim() : "";
}

/** Demo credentials, or `null` when the env is not configured. */
export function getDemoCredentials(): DemoCredentials | null {
  const email = readEnv("VITE_DEMO_EMAIL");
  const password = readEnv("VITE_DEMO_PASSWORD");

  if (!email || !password) {
    return null;
  }

  return { email, password };
}

/** True when the demo sign-in button should render. */
export function isDemoSignInAvailable(): boolean {
  return getDemoCredentials() !== null;
}
