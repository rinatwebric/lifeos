import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { supabaseEnv } from "@/lib/env";

let client: SupabaseClient | null = null;

/**
 * Lazily creates the browser Supabase client so the app can render a setup
 * notice instead of crashing when environment variables are missing.
 */
export function getSupabaseClient(): SupabaseClient {
  if (!supabaseEnv) {
    throw new Error(
      "Supabase is not configured. Copy .env.example to .env.local and set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
    );
  }

  client ??= createClient(supabaseEnv.VITE_SUPABASE_URL, supabaseEnv.VITE_SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return client;
}
