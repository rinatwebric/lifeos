import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { AuthAlert, AuthField, AuthSubmit } from "./AuthControls";
import { resendConfirmation, signIn } from "./api";
import { DemoSignInButton } from "./DemoSignInButton";
import { translateAuthError, AuthServiceError, toAuthError, type AuthErrorCode } from "./errors";
import { zodResolver } from "./resolver";
import { signInSchema, type SignInValues } from "./schemas";
import { useMessages } from "@/lib/i18n/I18nContext";

export const SIGN_IN_COPY = {
  title: "Welcome back",
  subtitle: "Sign in to continue to LifeOS.",
  emailLabel: "Email",
  emailPlaceholder: "you@example.com",
  passwordLabel: "Password",
  submit: "Sign in",
  submitting: "Signing in…",
  passwordResetSuccess: "Your password was updated. Sign in with your new password.",
  emailNotConfirmed:
    "This email is not confirmed yet. Check your inbox for the confirmation link, or request a new one.",
  resend: "Resend confirmation email",
  resending: "Sending…",
  resendSent: "Confirmation email sent. Check your inbox (and the spam folder).",
  signUpPrompt: "New to LifeOS?",
  signUpLink: "Create an account",
  resetPrompt: "Forgot your password?",
  resetLink: "Reset it",
} as const;

interface SignInLocationState {
  passwordReset?: boolean;
  email?: string;
  from?: { pathname?: string };
}

/** Email + password sign-in. Unconfirmed emails get a resend hint (no dead end). */
export function SignInPage() {
  const m = useMessages();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? null) as SignInLocationState | null;

  // Error code (not text) so an open error re-renders in the new language.
  const [formErrorCode, setFormErrorCode] = useState<AuthErrorCode | null>(null);
  const [demoErrorCode, setDemoErrorCode] = useState<AuthErrorCode | null>(null);
  const [unconfirmedEmail, setUnconfirmedEmail] = useState<string | null>(null);
  const [resendStatus, setResendStatus] = useState<"idle" | "sending" | "sent">("idle");

  const t = m.auth.signIn;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: state?.email ?? "", password: "" },
  });

  const formError = formErrorCode ? translateAuthError(formErrorCode, m) : demoErrorCode ? translateAuthError(demoErrorCode, m) : null;

  const onSubmit = async (values: SignInValues): Promise<void> => {
    setFormErrorCode(null);
    setDemoErrorCode(null);
    setUnconfirmedEmail(null);
    setResendStatus("idle");

    try {
      await signIn(values);
      const fromPath = state?.from?.pathname ?? "/";
      await navigate(fromPath, { replace: true });
    } catch (error) {
      const authError = error instanceof AuthServiceError ? error : toAuthError(error);

      if (authError.code === "email_not_confirmed") {
        setUnconfirmedEmail(values.email);
        return;
      }

      setFormErrorCode(authError.code);
    }
  };

  const onResend = async (): Promise<void> => {
    if (!unconfirmedEmail || resendStatus === "sending") {
      return;
    }

    setResendStatus("sending");
    setFormErrorCode(null);

    try {
      await resendConfirmation(unconfirmedEmail);
      setResendStatus("sent");
    } catch (error) {
      const authError = error instanceof AuthServiceError ? error : toAuthError(error);
      setResendStatus("idle");
      setFormErrorCode(authError.code);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-heading font-semibold tracking-tight text-content">{t.title}</h1>
        <p className="text-ui text-muted">{t.subtitle}</p>
      </div>

      {state?.passwordReset ? <AuthAlert tone="success">{t.passwordResetSuccess}</AuthAlert> : null}

      {formError ? <AuthAlert tone="error">{formError}</AuthAlert> : null}

      {unconfirmedEmail ? (
        <AuthAlert tone="info">
          <p>{t.emailNotConfirmed}</p>
          <button
            type="button"
            onClick={() => void onResend()}
            disabled={resendStatus !== "idle"}
            className="mt-2 inline-flex min-h-11 items-center font-medium text-content underline underline-offset-4 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {resendStatus === "sending" ? t.resending : resendStatus === "sent" ? t.resendSent : t.resend}
          </button>
        </AuthAlert>
      ) : null}

      <form
        noValidate
        onSubmit={(event) => void handleSubmit(onSubmit)(event)}
        className="space-y-4"
      >
        <AuthField
          id="sign-in-email"
          label={t.emailLabel}
          type="email"
          autoComplete="email"
          placeholder={t.emailPlaceholder}
          error={errors.email?.message}
          {...register("email")}
        />
        <AuthField
          id="sign-in-password"
          label={t.passwordLabel}
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register("password")}
        />
        <AuthSubmit pending={isSubmitting} pendingLabel={t.submitting}>
          {t.submit}
        </AuthSubmit>
      </form>

      <DemoSignInButton onError={(code) => setDemoErrorCode(code)} />

      <div className="space-y-2 text-center text-ui text-muted">
        <p>
          {t.resetPrompt}{" "}
          <Link
            to="/reset-password"
            className="font-medium text-content underline-offset-4 hover:underline"
          >
            {t.resetLink}
          </Link>
        </p>
        <p>
          {t.signUpPrompt}{" "}
          <Link
            to="/sign-up"
            className="font-medium text-content underline-offset-4 hover:underline"
          >
            {t.signUpLink}
          </Link>
        </p>
      </div>
    </div>
  );
}
