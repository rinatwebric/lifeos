import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";

import { AuthAlert, AuthField, AuthSubmit } from "./AuthControls";
import { signUp } from "./api";
import { AUTH_ERROR_MESSAGES, AuthServiceError, toAuthError } from "./errors";
import { zodResolver } from "./resolver";
import { signUpSchema, type SignUpValues } from "./schemas";

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
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { fullName: "", email: "", password: "" },
  });

  const onSubmit = async (values: SignUpValues): Promise<void> => {
    setFormError(null);

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
      setFormError(AUTH_ERROR_MESSAGES[authError.code]);
    }
  };

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-content">{SIGN_UP_COPY.title}</h1>
        <p className="text-sm text-muted">{SIGN_UP_COPY.subtitle}</p>
      </div>

      {formError ? <AuthAlert tone="error">{formError}</AuthAlert> : null}

      <form
        noValidate
        onSubmit={(event) => void handleSubmit(onSubmit)(event)}
        className="space-y-4"
      >
        <AuthField
          id="sign-up-name"
          label={SIGN_UP_COPY.nameLabel}
          type="text"
          autoComplete="name"
          placeholder={SIGN_UP_COPY.namePlaceholder}
          error={errors.fullName?.message}
          {...register("fullName")}
        />
        <AuthField
          id="sign-up-email"
          label={SIGN_UP_COPY.emailLabel}
          type="email"
          autoComplete="email"
          placeholder={SIGN_UP_COPY.emailPlaceholder}
          error={errors.email?.message}
          {...register("email")}
        />
        <div>
          <AuthField
            id="sign-up-password"
            label={SIGN_UP_COPY.passwordLabel}
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
            <p id="sign-up-password-hint" className="mt-1 text-xs text-muted">
              {SIGN_UP_COPY.passwordHint}
            </p>
          ) : null}
        </div>
        <AuthSubmit pending={isSubmitting} pendingLabel={SIGN_UP_COPY.submitting}>
          {SIGN_UP_COPY.submit}
        </AuthSubmit>
      </form>

      <p className="text-center text-sm text-muted">
        {SIGN_UP_COPY.signInPrompt}{" "}
        <Link to="/sign-in" className="font-medium text-content underline-offset-4 hover:underline">
          {SIGN_UP_COPY.signInLink}
        </Link>
      </p>
    </div>
  );
}
