import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";

import { AuthAlert, AuthField, AuthSubmit } from "./AuthControls";
import { signUp } from "./api";
import { translateAuthError, AuthServiceError, toAuthError, type AuthErrorCode } from "./errors";
import { zodResolver } from "./resolver";
import { signUpSchema, type SignUpValues } from "./schemas";
import { useMessages } from "@/lib/i18n/I18nContext";

export const SIGN_UP_COPY = {
  title: "Create your account",
  subtitle: "One account for goals, tasks, planning and progress.",
  nameLabel: "Full name (optional)",
  namePlaceholder: "Ada Lovelace",
  emailLabel: "Email",
  emailPlaceholder: "you@example.com",
  passwordLabel: "Password",
  passwordHint: "At least 6 characters.",
  submit: "Create account",
  submitting: "Creating account…",
  signInPrompt: "Already have an account?",
  signInLink: "Sign in",
} as const;

/**
 * Registration. Confirmation ON (Supabase returns no session) goes to
 * `/check-email` with the email in `location.state` (never in the URL);
 * confirmation OFF goes straight to `/`.
 */
export function SignUpPage() {
  const m = useMessages();
  const navigate = useNavigate();
  const [formErrorCode, setFormErrorCode] = useState<AuthErrorCode | null>(null);
  const t = m.auth.signUp;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { fullName: "", email: "", password: "" },
  });

  const onSubmit = async (values: SignUpValues): Promise<void> => {
    setFormErrorCode(null);

    try {
      const result = await signUp({
        email: values.email,
        password: values.password,
        fullName: values.fullName?.trim() ? values.fullName.trim() : undefined,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });

      if (result.needsConfirmation) {
        await navigate("/check-email", { state: { email: values.email } });
      } else {
        await navigate("/", { replace: true });
      }
    } catch (error) {
      const authError = error instanceof AuthServiceError ? error : toAuthError(error);
      setFormErrorCode(authError.code);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-heading font-semibold tracking-tight text-content">{t.title}</h1>
        <p className="text-ui text-muted">{t.subtitle}</p>
      </div>

      {formErrorCode ? <AuthAlert tone="error">{translateAuthError(formErrorCode, m)}</AuthAlert> : null}

      <form
        noValidate
        onSubmit={(event) => void handleSubmit(onSubmit)(event)}
        className="space-y-4"
      >
        <AuthField
          id="sign-up-name"
          label={t.nameLabel}
          type="text"
          autoComplete="name"
          placeholder={t.namePlaceholder}
          error={errors.fullName?.message}
          {...register("fullName")}
        />
        <AuthField
          id="sign-up-email"
          label={t.emailLabel}
          type="email"
          autoComplete="email"
          placeholder={t.emailPlaceholder}
          error={errors.email?.message}
          {...register("email")}
        />
        <div>
          <AuthField
            id="sign-up-password"
            label={t.passwordLabel}
            type="password"
            autoComplete="new-password"
            aria-describedby={
              errors.password
                ? "sign-up-password-error sign-up-password-hint"
                : "sign-up-password-hint"
            }
            error={errors.password?.message}
            {...register("password")}
          />
          {!errors.password ? (
            <p id="sign-up-password-hint" className="mt-1 text-caption text-muted">
              {t.passwordHint}
            </p>
          ) : null}
        </div>
        <AuthSubmit pending={isSubmitting} pendingLabel={t.submitting}>
          {t.submit}
        </AuthSubmit>
      </form>

      <p className="text-center text-ui text-muted">
        {t.signInPrompt}{" "}
        <Link to="/sign-in" className="font-medium text-content underline-offset-4 hover:underline">
          {t.signInLink}
        </Link>
      </p>
    </div>
  );
}
