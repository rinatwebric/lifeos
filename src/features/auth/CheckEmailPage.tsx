import { useEffect, useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";

import { AuthAlert } from "./AuthControls";
import { resendConfirmation } from "./api";
import { AuthServiceError, toAuthError, translateAuthError, type AuthErrorCode } from "./errors";
import { useMessages } from "@/lib/i18n/I18nContext";
import { tmpl } from "@/lib/i18n/format";

export const RESEND_COOLDOWN_SECONDS = 60;

export const CHECK_EMAIL_COPY = {
  title: "Check your email",
  sentTo: "We sent a confirmation link to",
  spamHint: "It can take a few minutes to arrive. Check the spam folder if you do not see it.",
  resend: "Resend confirmation email",
  resending: "Sending…",
  cooldownPrefix: "Resend available in",
  sent: "If this email is registered, a confirmation message was sent. Check your inbox (and the spam folder).",
  backPrompt: "Wrong address or already confirmed?",
  backLink: "Back to sign in",
} as const;

interface CheckEmailLocationState {
  email?: string;
}

interface CheckEmailPageProps {
  /** Override for tests; production always uses `RESEND_COOLDOWN_SECONDS`. */
  cooldownSeconds?: number;
}

type Result = { tone: "success" | "error"; text: string } | { tone: "success" | "error"; code: AuthErrorCode } | null;

/**
 * Post-signup landing when email confirmation is ON. The email arrives via
 * `location.state` (never the URL); a direct visit without state redirects
 * to `/sign-up`. Result copy is identical for known and unknown addresses.
 */
export function CheckEmailPage({ cooldownSeconds = RESEND_COOLDOWN_SECONDS }: CheckEmailPageProps) {
  const m = useMessages();
  const t = m.auth.checkEmail;
  const location = useLocation();
  const state = (location.state ?? null) as CheckEmailLocationState | null;
  const email = state?.email;

  const [cooldown, setCooldown] = useState(0);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<Result>(null);

  useEffect(() => {
    if (cooldown <= 0) {
      return;
    }

    const timer = window.setInterval(() => {
      setCooldown((previous) => (previous <= 1 ? 0 : previous - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [cooldown]);

  if (!email) {
    return <Navigate to="/sign-up" replace />;
  }

  const resultText =
    result === null
      ? null
      : "text" in result
        ? result.text
        : "code" in result
          ? translateAuthError(result.code, m)
          : t.sent;

  const resultTone = result === null ? "success" : result.tone;

  const onResend = async (): Promise<void> => {
    if (sending || cooldown > 0) {
      return;
    }

    setSending(true);
    setResult(null);

    try {
      await resendConfirmation(email);
      setCooldown(cooldownSeconds);
      setResult({ tone: "success", text: t.sent });
    } catch (error) {
      const authError = error instanceof AuthServiceError ? error : toAuthError(error);

      if (authError.code === "rate_limited" || authError.code === "network") {
        setResult({ tone: "error", code: authError.code });
      } else {
        // Unknown / not-found style failures map to the same generic copy so
        // the page never leaks whether the address is registered.
        setCooldown(cooldownSeconds);
        setResult({ tone: "success", text: t.sent });
      }
    } finally {
      setSending(false);
    }
  };

  const resendDisabled = sending || cooldown > 0;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-heading font-semibold tracking-tight text-content">{t.title}</h1>
        <p className="text-ui text-muted">
          {t.sentTo} <span className="font-medium text-content">{email}</span>
        </p>
      </div>

      <p className="text-ui text-muted">{t.spamHint}</p>

      {resultText ? <AuthAlert tone={resultTone}>{resultText}</AuthAlert> : null}

      <button
        type="button"
        onClick={() => void onResend()}
        disabled={resendDisabled}
        className="h-11 w-full rounded-control bg-accent px-4 py-2 text-ui font-medium text-accent-content transition-[opacity] duration-fast ease-standard hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {sending ? t.resending : cooldown > 0 ? tmpl(t.cooldown, { seconds: cooldown }) : t.resend}
      </button>

      <p className="text-center text-ui text-muted">
        {t.wrongAddress}{" "}
        <Link to="/sign-in" className="font-medium text-content underline-offset-4 hover:underline">
          {t.backToSignIn}
        </Link>
      </p>
    </div>
  );
}
