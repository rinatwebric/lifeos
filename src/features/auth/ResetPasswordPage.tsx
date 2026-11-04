import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";

import { AuthAlert, AuthField, AuthSubmit } from "./AuthControls";
import { resetPassword, signOut, updatePassword } from "./api";
import { translateAuthError, AuthServiceError, toAuthError, type AuthErrorCode } from "./errors";
import { zodResolver } from "./resolver";
import {
  requestResetSchema,
  setNewPasswordSchema,
  type RequestResetValues,
  type SetNewPasswordValues,
} from "./schemas";
import { useMessages } from "@/lib/i18n/I18nContext";
import { en } from "@/lib/i18n/dictionaries/en";

export type ResetPasswordMode = "request" | "update";

const _rp = en.auth.resetPassword;

/**
 * Back-compat copy for tests: the EN source of the reset strings. The page
 * itself renders `m.auth.resetPassword` so open forms re-translate on
 * language switch.
 */
export const RESET_PASSWORD_COPY = {
  requestTitle: _rp.requestTitle,
  requestSubtitle: _rp.requestDescription,
  mailOffNotice: _rp.mailOffNotice,
  emailLabel: _rp.emailLabel,
  emailPlaceholder: _rp.emailPlaceholder,
  requestSubmit: _rp.sendLink,
  requesting: _rp.sending,
  requestSentMailOff: _rp.requestSentMailOff,
  updateTitle: _rp.chooseTitle,
  updateSubtitle: _rp.chooseHint,
  passwordLabel: _rp.newPasswordLabel,
  confirmLabel: _rp.confirmLabel,
  updateSubmit: _rp.saveNew,
  updating: _rp.saving,
  expiredLink: _rp.invalidLink,
  requestNewLink: _rp.requestNew,
  backToSignIn: _rp.backToSignIn,
} as const;

interface ResetPasswordPageProps {
  /** Unit 5 routes `request` vs `update` on the recovery session; defaults to `request`. */
  initialMode?: ResetPasswordMode;
}

/**
 * Two modes in one page. Request mode sends the recovery email (generic
 * success copy, no leak). Update mode sets the new password on the recovery
 * session, then signs out and returns to `/sign-in` with a success flag. A
 * stale link (`session_missing`) falls back to the request form.
 */
export function ResetPasswordPage({ initialMode = "request" }: ResetPasswordPageProps) {
  const m = useMessages();
  const t = m.auth.resetPassword;
  const navigate = useNavigate();
  const [mode, setMode] = useState<ResetPasswordMode>(initialMode);
  // Code state so open errors re-translate on language switch.
  const [formErrorCode, setFormErrorCode] = useState<AuthErrorCode | null>(null);
  const [requestSent, setRequestSent] = useState(false);
  const [expiredLink, setExpiredLink] = useState(false);

  const requestForm = useForm<RequestResetValues>({
    resolver: zodResolver(requestResetSchema),
    defaultValues: { email: "" },
  });

  const updateForm = useForm<SetNewPasswordValues>({
    resolver: zodResolver(setNewPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const onRequest = async (values: RequestResetValues): Promise<void> => {
    setFormErrorCode(null);

    try {
      await resetPassword(values.email);
      setRequestSent(true);
    } catch (error) {
      const authError = error instanceof AuthServiceError ? error : toAuthError(error);
      setFormErrorCode(authError.code);
    }
  };

  const onUpdate = async (values: SetNewPasswordValues): Promise<void> => {
    setFormErrorCode(null);
    setExpiredLink(false);

    try {
      await updatePassword(values.password);
      await signOut();
      await navigate("/sign-in", { state: { passwordReset: true }, replace: true });
    } catch (error) {
      const authError = error instanceof AuthServiceError ? error : toAuthError(error);

      if (authError.code === "session_missing") {
        setExpiredLink(true);
        setMode("request");
        return;
      }

      setFormErrorCode(authError.code);
    }
  };

  if (mode === "update") {
    return (
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-heading font-semibold tracking-tight text-content">{t.chooseTitle}</h1>
          <p className="text-ui text-muted">{t.chooseHint}</p>
        </div>

        {formErrorCode ? (
          <AuthAlert tone="error">{translateAuthError(formErrorCode, m)}</AuthAlert>
        ) : null}

        <form
          noValidate
          onSubmit={(event) => void updateForm.handleSubmit(onUpdate)(event)}
          className="space-y-4"
        >
          <AuthField
            id="reset-new-password"
            label={t.newPasswordLabel}
            type="password"
            autoComplete="new-password"
            error={updateForm.formState.errors.password?.message}
            {...updateForm.register("password")}
          />
          <AuthField
            id="reset-confirm-password"
            label={t.confirmLabel}
            type="password"
            autoComplete="new-password"
            error={updateForm.formState.errors.confirmPassword?.message}
            {...updateForm.register("confirmPassword")}
          />
          <AuthSubmit pending={updateForm.formState.isSubmitting} pendingLabel={t.saving}>
            {t.saveNew}
          </AuthSubmit>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-heading font-semibold tracking-tight text-content">{t.requestTitle}</h1>
        <p className="text-ui text-muted">{t.requestDescription}</p>
      </div>

      {expiredLink ? <AuthAlert tone="error">{t.invalidLink}</AuthAlert> : null}
      <p className="rounded-control border border-line bg-surface-muted px-3 py-2 text-ui text-muted">
        {t.mailOffNotice}
      </p>
      {formErrorCode ? (
        <AuthAlert tone="error">{translateAuthError(formErrorCode, m)}</AuthAlert>
      ) : null}
      {requestSent ? <AuthAlert tone="success">{t.requestSentMailOff}</AuthAlert> : null}

      <form
        noValidate
        onSubmit={(event) => void requestForm.handleSubmit(onRequest)(event)}
        className="space-y-4"
      >
        <AuthField
          id="reset-email"
          label={t.emailLabel}
          type="email"
          autoComplete="email"
          placeholder={t.emailPlaceholder}
          error={requestForm.formState.errors.email?.message}
          {...requestForm.register("email")}
        />
        <AuthSubmit pending={requestForm.formState.isSubmitting} pendingLabel={t.sending}>
          {requestSent ? t.requestNew : t.sendLink}
        </AuthSubmit>
      </form>

      <p className="text-center text-ui text-muted">
        <Link to="/sign-in" className="font-medium text-content underline-offset-4 hover:underline">
          {t.backToSignIn}
        </Link>
      </p>
    </div>
  );
}
