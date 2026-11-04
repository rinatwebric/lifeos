import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import type { AssistantProposal } from "@/lib/aiProposals";

import { ASSISTANT_ERROR_MESSAGES, AssistantServiceError } from "./errors";
import { useApproveProposal, useRejectProposal } from "./hooks";
import { ProposalActionRow } from "./ProposalActionRow";

export interface ProposalModalProps {
  open: boolean;
  proposalId: string;
  proposal: AssistantProposal;
  timeZone: string;
  onClose: () => void;
  onDecided?: () => void;
}

function errorCopy(error: unknown): { code: string; text: string; showRetry: boolean } {
  if (error instanceof AssistantServiceError) {
    if (error.code === "expired") {
      return { code: error.code, text: error.message, showRetry: false };
    }
    if (error.code === "already_decided") {
      return { code: error.code, text: error.message, showRetry: false };
    }
    return { code: error.code, text: error.message, showRetry: true };
  }
  return { code: "unknown", text: ASSISTANT_ERROR_MESSAGES.unknown, showRetry: true };
}

/**
 * Review a pending proposal (step 8). Shows the model summary + reasoning,
 * then every action in human language with a per-item checkbox. Accept all
 * sends every index, Accept selected sends the subset, Reject discards.
 * Manual editing (plan Р5) is out of scope: the client never sends its own
 * actions (see plan-phase-4 §8.1).
 */
export function ProposalModal({
  open,
  proposalId,
  proposal,
  timeZone,
  onClose,
  onDecided,
}: ProposalModalProps) {
  const allIndexes = proposal.actions.map((_, index) => index);
  const [selected, setSelected] = useState<Set<number>>(new Set(allIndexes));
  const approveMutation = useApproveProposal();
  const rejectMutation = useRejectProposal();
  const busy = approveMutation.isPending || rejectMutation.isPending;
  const decideError = approveMutation.error ?? rejectMutation.error;
  const errorInfo = decideError ? errorCopy(decideError) : null;

  const toggle = (index: number, next: boolean): void => {
    setSelected((previous) => {
      const copy = new Set(previous);
      if (next) {
        copy.add(index);
      } else {
        copy.delete(index);
      }
      return copy;
    });
  };

  const handleAcceptAll = async (): Promise<void> => {
    try {
      await approveMutation.mutateAsync({ proposalId, selectedIndexes: allIndexes });
      onDecided?.();
      onClose();
    } catch {
      // Error surfaces through approveMutation.error with a coded message.
    }
  };

  const handleAcceptSelected = async (): Promise<void> => {
    try {
      const sorted = [...selected].sort((a, b) => a - b);
      await approveMutation.mutateAsync({ proposalId, selectedIndexes: sorted });
      onDecided?.();
      onClose();
    } catch {
      // Error surfaces through approveMutation.error.
    }
  };

  const handleReject = async (): Promise<void> => {
    try {
      await rejectMutation.mutateAsync(proposalId);
      onDecided?.();
      onClose();
    } catch {
      // Error surfaces through rejectMutation.error.
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Review proposal"
      description="Nothing is applied yet. Choose which actions to accept — the rest stay untouched."
    >
      <div className="space-y-4">
        <div className="space-y-1">
          <p className="text-ui font-medium text-content text-pretty">{proposal.summary}</p>
          <p className="text-ui text-muted text-pretty">{proposal.reasoning}</p>
        </div>

        <ul className="space-y-2">
          {proposal.actions.map((action, index) => (
            <ProposalActionRow
              key={index}
              action={action}
              index={index}
              checked={selected.has(index)}
              disabled={busy}
              timeZone={timeZone}
              onToggle={toggle}
            />
          ))}
        </ul>

        {errorInfo ? (
          <div role="alert" className="space-y-2">
            <p className="text-ui font-medium text-content">
              {errorInfo.code === "expired" ? "Proposal expired" : "Could not decide the proposal"}
            </p>
            <p className="text-ui text-muted">{errorInfo.text}</p>
            {errorInfo.code === "expired" ? (
              <p className="text-ui text-muted">
                Start a new conversation for a fresh suggestion.
              </p>
            ) : null}
            {errorInfo.showRetry ? (
              <Button
                variant="secondary"
                size="lg"
                disabled={busy}
                onClick={() => {
                  approveMutation.reset();
                  rejectMutation.reset();
                }}
              >
                Dismiss
              </Button>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button size="lg" disabled={busy} onClick={() => void handleAcceptAll()}>
            Accept all
          </Button>
          <Button
            variant="secondary"
            size="lg"
            disabled={busy || selected.size === 0}
            onClick={() => void handleAcceptSelected()}
          >
            Accept selected ({selected.size})
          </Button>
          <Button
            variant="ghost"
            size="lg"
            disabled={busy}
            data-autofocus
            onClick={() => void handleReject()}
          >
            Reject
          </Button>
        </div>
        <p className="text-micro text-muted">
          Accept applies only the checked actions. Reject discards the whole proposal.
        </p>
      </div>
    </Dialog>
  );
}
