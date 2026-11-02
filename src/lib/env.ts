import { z } from "zod";

/**
 * Only public, browser-safe values belong here. Supabase service-role keys and
 * AI provider keys must never be exposed through `VITE_*` variables.
 */
const publicEnvSchema = z.object({
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(20),
});

export type SupabaseEnv = z.infer<typeof publicEnvSchema>;

const parsed = publicEnvSchema.safeParse(import.meta.env);

/** Public Supabase configuration, or `null` when `.env.local` is not set up yet. */
export const supabaseEnv: SupabaseEnv | null = parsed.success ? parsed.data : null;

export const isSupabaseConfigured = supabaseEnv !== null;

/** Comma-separated list of missing or invalid environment variables, or an empty string. */
export function describeMissingEnv(): string {
  if (parsed.success) {
    return "";
  }

  return parsed.error.issues
    .map((issue) => issue.path.join(".") || "(unknown variable)")
    .join(", ");
}