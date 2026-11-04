import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/Button";

import { signIn } from "./api";
import { getDemoCredentials, isDemoSignInAvailable } from "./demoAccount";
import { AuthServiceError, toAuthError, type AuthErrorCode } from "./errors";
import { useMessages } from "@/lib/i18n/I18nContext";

export const DEMO_SIGN_IN_COPY = {
  button: "Explore the demo account",
  pending: "Signing in…",
  caption: "Signs in to a shared demo account with sample goals and tasks.",
} as const;

interface DemoSignInButtonProps {
  /** Same channel as the sign-in form error (`AuthAlert`); code so it re-translates. */
  onError: (code: AuthErrorCode) => void;
}

/**
 * One-click entry into the shared demo account (iteration 3, unit 2).
 * Uses the existing `signIn()` service — no `service_role`, no e2e account,
 * no `AuthProvider`/RLS changes. Renders nothing when the demo env is absent.
 */
export function DemoSignInButton({ onError }: DemoSignInButtonProps) {
  const m = useMessages();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const available = isDemoSignInAvailable();

  if (!available) {
    return null;
  }

  const handleClick = async (): Promise<void> => {
    const credentials = getDemoCredentials();

    if (!credentials || pending) {
      return;
    }

    setPending(true);

    try {
      await signIn(credentials);
      await navigate("/", { replace: true });
    } catch (error) {
      const authError = error instanceof AuthServiceError ? error : toAuthError(error);
      onError(authError.code);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-1.5 text-center">
      <Button
        variant="secondary"
        className="w-full"
        disabled={pending}
        loading={pending}
        onClick={() => void handleClick()}
      >
        {pending ? m.auth.demo.signingIn : m.auth.demo.title}
      </Button>
      <p className="text-micro text-muted">{m.auth.demo.hint}</p>
    </div>
  );
}
