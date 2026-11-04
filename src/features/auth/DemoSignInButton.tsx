import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/Button";

import { signIn } from "./api";
import { getDemoCredentials, isDemoSignInAvailable } from "./demoAccount";
import { AUTH_ERROR_MESSAGES, AuthServiceError, toAuthError } from "./errors";

export const DEMO_SIGN_IN_COPY = {
  button: "Explore the demo account",
  pending: "Signing in…",
  caption: "Signs in to a shared demo account with sample goals and tasks.",
  unavailable: "Demo account is unavailable in this environment.",
} as const;

interface DemoSignInButtonProps {
  /** Same channel as the sign-in form error (`AuthAlert`). */
  onError: (message: string) => void;
}

/**
 * One-click entry into the shared demo account (iteration 3, unit 2).
 * Uses the existing `signIn()` service — no `service_role`, no e2e account,
 * no `AuthProvider`/RLS changes. Without demo env renders an honest
 * unavailable note instead of a dead button.
 */
export function DemoSignInButton({ onError }: DemoSignInButtonProps) {
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const available = isDemoSignInAvailable();

  if (!available) {
    return <p className="text-center text-micro text-muted">{DEMO_SIGN_IN_COPY.unavailable}</p>;
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
      onError(AUTH_ERROR_MESSAGES[authError.code]);
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
        {pending ? DEMO_SIGN_IN_COPY.pending : DEMO_SIGN_IN_COPY.button}
      </Button>
      <p className="text-micro text-muted">{DEMO_SIGN_IN_COPY.caption}</p>
    </div>
  );
}
