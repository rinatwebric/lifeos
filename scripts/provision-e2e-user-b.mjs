/* One-time provisioning of a second isolated e2e user (user B).
 * The shared project has Confirm email OFF, so signUp sends no email and
 * returns a session immediately — no SMTP involved, no bounce risk.
 * Safe to rerun: an existing address falls back to sign-in check.
 * Usage: E2E_EMAIL_B=... E2E_PASSWORD_B=... node scripts/provision-e2e-user-b.mjs
 * (values go to .env.e2e by hand; never commit them). */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const anon = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? "";
const email = process.env.E2E_EMAIL_B ?? "";
const password = process.env.E2E_PASSWORD_B ?? "";

if (!url || !anon || !email || !password) {
  console.error("Need SUPABASE_URL, SUPABASE_ANON_KEY, E2E_EMAIL_B, E2E_PASSWORD_B in env.");
  process.exit(2);
}

const client = createClient(url, anon);
const { data, error } = await client.auth.signUp({ email, password });

if (!error && data.session) {
  console.log(`signed up ${email}`);
  process.exit(0);
}

if (error && /already|registered|exists/i.test(error.message)) {
  const { data: signIn, error: signInError } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (!signInError && signIn.session) {
    console.log(`${email} already exists, sign-in works`);
    process.exit(0);
  }
  console.error("sign-in failed:", signInError?.message);
  process.exit(1);
}

console.error("sign-up failed:", error?.message);
process.exit(1);
