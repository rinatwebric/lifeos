/**
 * CORS for the `ai-assistant` Edge Function (browser clients only).
 *
 * The frontend lives on Vercel (`*.vercel.app`) while the function lives on
 * `*.supabase.co`, so every call is cross-origin: the browser sends a
 * preflight `OPTIONS` first and refuses to read the response unless it
 * carries `Access-Control-Allow-Origin`. Without this module the function
 * worked from `curl` but the app saw only "Network error" — a blocked
 * response, not a failed request.
 *
 * Pure module (no Deno imports) so the contract is unit-tested under Vitest.
 * The origin is `*` on purpose: authentication travels in the `Authorization`
 * header (never cookies), and RLS still scopes every row to `auth.uid()`.
 */

export const CORS_ALLOW_ORIGIN = "*";
/** Headers Supabase's client sends: apikey + bearer token + JSON body. */
export const CORS_ALLOW_HEADERS = "authorization, x-client-info, apikey, content-type";
export const CORS_ALLOW_METHODS = "POST, OPTIONS";
export const CORS_MAX_AGE_SECONDS = "86400";

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": CORS_ALLOW_ORIGIN,
  "Access-Control-Allow-Headers": CORS_ALLOW_HEADERS,
  "Access-Control-Allow-Methods": CORS_ALLOW_METHODS,
  "Access-Control-Max-Age": CORS_MAX_AGE_SECONDS,
};

/** Answer to the browser preflight: no body, no auth, just the permissions. */
export function preflightResponse(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}