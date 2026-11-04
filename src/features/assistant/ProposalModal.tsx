import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import type { AssistantProposal } from "@/lib/aiProposals";
import { tmpl } from "@/lib/i18n/format";
import { useMessages } from "@/lib/i18n/I18nContext";

import { translateAssistantError, type AssistantErrorCode } from "./errors";
import { AssistantServiceError } from "./errors";
import { useApproveProposal, useRejectProposal } from "./hooks";
import { ProposalActionRow } from "./ProposalActionRow";

export interface ProposalDecisionOutcome {
  kind: "approved";
  applied: number;
  total: number;
}

export type ProposalDecided =
  | ProposalDecisionOutcome
  | { kind: "rejected" };

export interface ProposalModalProps {
  open: boolean;
  proposalId: string;
  proposal: AssistantProposal;
  timeZone: string;
  onClose: () => void;
  onDecided?: (outcome: ProposalDecided) => void;
}

function errorCodeOf(error: unknown): AssistantErrorCode {
  if (error instanceof AssistantServiceError) {
    return error.code;
  }
  return "unknown";
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
  const m = useMessages();
  const t = m.assistant;
  const allIndexes = proposal.actions.map((_, index) => index);
  const [selected, setSelected] = useState<Set<number>>(new Set(allIndexes));
  const approveMutation = useApproveProposal();
  const rejectMutation = useRejectProposal();
  const busy = approveMutation.isPending || rejectMutation.isPending;
  const decideError = approveMutation.error ?? rejectMutation.error;
  // Code state so open errors re-translate on language switch.
  const decideErrorCode: AssistantErrorCode | null = decideError ? errorCodeOf(decideError) : null;

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
      const result = await approveMutation.mutateAsync({ proposalId, selectedIndexes: allIndexes });
      onDecided?.({ kind: "approved", applied: result.applied, total: result.total });
      onClose();
    } catch {
      // Error surfaces through approveMutation.error with a coded message.
    }
  };

  const handleAcceptSelected = async (): Promise<void> => {
    try {
      const sorted = [...selected].sort((a, b) => a - b);
      const result = await approveMutation.mutateAsync({ proposalId, selectedIndexes: sorted });
      onDecided?.({ kind: "approved", applied: result.applied, total: result.total });
      onClose();
    } catch {
      // Error surfaces through approveMutation.error.
    }
  };

  const handleReject = async (): Promise<void> => {
    try {
      await rejectMutation.mutateAsync(proposalId);
      onDecided?.({ kind: "rejected" });
      onClose();
    } catch {
      // Error surfaces through rejectMutation.error.
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t.reviewTitle}
      description={t.reviewHint}
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

        {decideErrorCode ? (
          <div role="alert" className="space-y-2">
            <p className="text-ui font-medium text-content">
              {decideErrorCode === "expired" ? t.proposalExpired : t.proposalUndecided}
            </p>
            <p className="text-ui text-muted">{translateAssistantError(decideErrorCode, m)}</p>
            {decideErrorCode === "expired" ? (
              <p className="text-ui text-muted">
                {t.startNewConversation}
              </p>
            ) : null}
            {decideErrorCode === "expired" || decideErrorCode === "already_decided" ? null : (
              <Button
                variant="secondary"
                size="lg"
                disabled={busy}
                onClick={() => {
                  approveMutation.reset();
                  rejectMutation.reset();
                }}
              >
                {t.dismiss}
              </Button>
            )}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button size="lg" disabled={busy} onClick={() => void handleAcceptAll()}>
            {t.acceptAll}
          </Button>
          <Button
            variant="secondary"
            size="lg"
            disabled={busy || selected.size === 0}
            onClick={() => void handleAcceptSelected()}
          >
            {tmpl(t.acceptSelected, { count: selected.size })}
          </Button>
          <Button
            variant="ghost"
            size="lg"
            disabled={busy}
            data-autofocus
            onClick={() => void handleReject()}
          >
            {t.reject}
          </Button>
        </div>
        <p className="text-micro text-muted">
          {t.acceptHint}
        </p>
      </div>
    </Dialog>
  );
}
