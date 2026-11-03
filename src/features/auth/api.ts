import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";

import { getSupabaseClient } from "@/lib/supabase/client";

import { toAuthError } from "./errors";

export interface SignUpInput {
  email: string;
  password: string;
  fullName?: string;
  timezone?: string;
}

export interface SignUpResult {
  user: User | null;
  session: Session | null;
  /**
   * True when email confirmation is ON: Supabase returns no session after
   * signUp and the UI must show the check-email screen (with resend).
   * False means confirmation is OFF and the UI can redirect to `/` directly.
   */
  needsConfirmation: boolean;
}

export interface SignInInput {
  email: string;
  password: string;
}

function resolveTimezone(timezone?: string): string {
  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return timezone ?? browserZone ?? "UTC";
}

/**
 * Registers a user. The `handle_new_user` trigger creates `profiles`
 * (timezone + full_name from metadata) and `user_preferences` rows.
 * Never leaks whether the email already exists: that mapping lives in
 * `errors.ts` (`user_already_exists` uses generic copy).
 */
export async function signUp(input: SignUpInput): Promise<SignUpResult> {
  const client = getSupabaseClient();
  const { data, error } = await client.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: {
        timezone: resolveTimezone(input.timezone),
        ...(input.fullName ? { full_name: input.fullName } : {}),
      },
    },
  });

  if (error) {
    throw toAuthError(error);
  }

  return { user: data.user, session: data.session, needsConfirmation: data.session === null };
}

export async function signIn(input: SignInInput): Promise<{ user: User; session: Session }> {
  const client = getSupabaseClient();
  const { data, error } = await client.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });

  if (error) {
    throw toAuthError(error);
  }

  return { user: data.user, session: data.session };
}

export async function signOut(): Promise<void> {
  const client = getSupabaseClient();
  const { error } = await client.auth.signOut();

  if (error) {
    throw toAuthError(error);
  }
}

/**
 * Starts the recovery flow: Supabase emails a link that returns to
 * `redirectTo` (must be allow-listed in the Supabase dashboard).
 * Completing the flow signs the user in, then the new password is set
 * with `updatePassword`.
 */
export async function resetPassword(email: string, redirectTo?: string): Promise<void> {
  const client = getSupabaseClient();
  const { error } = await client.auth.resetPasswordForEmail(
    email,
    redirectTo ? { redirectTo } : undefined,
  );

  if (error) {
    throw toAuthError(error);
  }
}

/** Sets the new password in the recovery flow (requires a recovery session). */
export async function updatePassword(newPassword: string): Promise<{ user: User }> {
  const client = getSupabaseClient();
  const { data, error } = await client.auth.updateUser({ password: newPassword });

  if (error) {
    throw toAuthError(error);
  }

  return { user: data.user };
}

/** Resends the signup confirmation email (check-email screen). */
export async function resendConfirmation(
  email: string,
  emailRedirectTo?: string,
): Promise<void> {
  const client = getSupabaseClient();
  const { error } = await client.auth.resend({
    type: "signup",
    email,
    options: emailRedirectTo ? { emailRedirectTo } : undefined,
  });

  if (error) {
    throw toAuthError(error);
  }
}

export async function getSession(): Promise<Session | null> {
  const client = getSupabaseClient();
  const { data, error } = await client.auth.getSession();

  if (error) {
    throw toAuthError(error);
  }

  return data.session;
}

export type AuthStateCallback = (event: AuthChangeEvent, session: Session | null) => void;

/** Subscribes to auth changes; caller must call `unsubscribe` on cleanup. */
export function onAuthStateChange(callback: AuthStateCallback): { unsubscribe: () => void } {
  const client = getSupabaseClient();
  const { data } = client.auth.onAuthStateChange(callback);

  return { unsubscribe: () => data.subscription.unsubscribe() };
}
