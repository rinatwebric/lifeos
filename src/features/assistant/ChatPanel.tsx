import { useState } from "react";
import { MessageSquare, Plus } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Textarea } from "@/components/ui/Textarea";
import { cn } from "@/lib/cn";
import type { AssistantProposal } from "@/lib/aiProposals";
import { pluralCategory, tmpl } from "@/lib/i18n/format";
import { useLocale, useMessages } from "@/lib/i18n/I18nContext";

import { translateAssistantError, AssistantServiceError, type AssistantErrorCode } from "./errors";
import { useConversations, useMessages as useAssistantMessages, useSendMessage } from "./hooks";
import { ProposalModal } from "./ProposalModal";

const MAX_MESSAGE_CHARS = 4000;

function errorCode(error: unknown): AssistantErrorCode {
  if (error instanceof AssistantServiceError) {
    return error.code;
  }
  return "unknown";
}

function errorText(error: unknown, m: Parameters<typeof translateAssistantError>[1]): string {
  return translateAssistantError(errorCode(error), m);
}

function ConversationSkeleton() {
  const m = useMessages();

  return (
    <div role="status" aria-label={m.assistant.loadingConversations}>
      <span className="sr-only">{m.assistant.loadingConversations}</span>
      <div className="space-y-3 motion-safe:animate-pulse" aria-hidden="true">
        <div className="h-11 w-full rounded-control bg-surface-muted" />
        <div className="h-11 w-full rounded-control bg-surface-muted" />
      </div>
    </div>
  );
}

function MessagesSkeleton() {
  const m = useMessages();

  return (
    <div role="status" aria-label={m.assistant.loadingMessages}>
      <span className="sr-only">{m.assistant.loadingMessages}</span>
      <div className="space-y-3 motion-safe:animate-pulse" aria-hidden="true">
        <div className="h-14 w-full rounded-control bg-surface-muted" />
        <div className="h-14 w-full rounded-control bg-surface-muted" />
      </div>
    </div>
  );
}

export function ChatPanel() {
  const m = useMessages();
  const t = m.assistant;
  const locale = useLocale();
  const conversationsQuery = useConversations();
  const [selectedId, setSelectedId] = useState<string | null | undefined>(undefined);
  const [draft, setDraft] = useState("");
  const conversations = conversationsQuery.data ?? [];
  // No effect: the first dialog is the default until the user picks another
  // one (`undefined` = not chosen yet, `null` = explicit new conversation).
  const effectiveId = selectedId === undefined ? (conversations[0]?.id ?? null) : selectedId;
  const messagesQuery = useAssistantMessages(effectiveId ?? undefined);
  const sendMutation = useSendMessage();
  const [lastProposal, setLastProposal] = useState<{
    proposalId: string;
    proposal: AssistantProposal;
    conversationId: string;
  } | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [decision, setDecision] = useState<{ kind: "approved"; applied: number; total: number } | { kind: "rejected" } | null>(null);
  const userTimeZone =
    typeof Intl !== "undefined"
      ? (Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC")
      : "UTC";

  const trimmed = draft.trim();
  const tooLong = draft.length > MAX_MESSAGE_CHARS;
  const sendDisabled = trimmed.length === 0 || tooLong || sendMutation.isPending;

  const examplePrompts = [t.exampleFrontend, t.exampleSick, t.exampleStuck];

  const handleSubmit = async (): Promise<void> => {
    if (sendDisabled) {
      return;
    }
    try {
      const result = await sendMutation.mutateAsync({
        message: draft,
        conversationId: effectiveId,
      });
      setDraft("");
      setSelectedId(result.conversationId);
      setDecision(null);
      if (result.proposal.actions.length > 0) {
        setLastProposal({
          proposalId: result.proposalId,
          proposal: result.proposal,
          conversationId: result.conversationId,
        });
      } else {
        // An answer without actions is plain text — nothing to review, and no
        // duplicate summary card next to the message bubble.
        setLastProposal(null);
      }
    } catch {
      // Error surfaces through sendMutation.error with a coded message.
    }
  };

  const showReview = lastProposal !== null && lastProposal.conversationId === effectiveId;

  const sendErrorCode = sendMutation.error ? errorCode(sendMutation.error) : null;

  const proposedCount = lastProposal?.proposal.actions.length ?? 0;
  const proposedCat = pluralCategory(locale, proposedCount);

  return (
    <>
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <Card className="space-y-3 lg:w-72 lg:shrink-0">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-ui font-medium text-content">{t.conversations}</h2>
          <Button
            variant="secondary"
            size="lg"
            onClick={() => {
              setSelectedId(null);
              setDraft("");
              sendMutation.reset();
            }}
          >
            <Plus className="size-4" aria-hidden="true" />
            {t.newChat}
          </Button>
        </div>
        {conversationsQuery.isLoading ? (
          <ConversationSkeleton />
        ) : conversationsQuery.isError ? (
          <div role="alert" className="space-y-2">
            <p className="text-ui text-content">{errorText(conversationsQuery.error, m)}</p>
            <Button
              variant="secondary"
              size="lg"
              onClick={() => void conversationsQuery.refetch()}
            >
              {m.common.retry}
            </Button>
          </div>
        ) : conversations.length === 0 ? (
          <p className="text-ui text-muted">{t.noConversations}</p>
        ) : (
          <ul className="space-y-1">
            {conversations.map((conversation) => {
              const active = conversation.id === effectiveId;
              return (
                <li key={conversation.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(conversation.id);
                      sendMutation.reset();
                    }}
                    aria-current={active ? "true" : undefined}
                    title={conversation.title}
                    className={cn(
                      "flex min-h-11 w-full items-center gap-2 rounded-control px-3 text-left text-ui transition-[color,background-color] duration-fast ease-standard",
                      active
                        ? "bg-accent font-medium text-accent-content"
                        : "text-content hover:bg-surface-muted",
                    )}
                  >
                    <MessageSquare className="size-4 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{conversation.title}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card className="min-w-0 flex-1 space-y-4">
        <div className="space-y-1">
          <h2 className="text-heading text-content">{t.chat}</h2>
          <p className="text-ui text-muted">
            {t.proposalsOnly}
          </p>
        </div>

        {effectiveId === null || (messagesQuery.isSuccess && (messagesQuery.data ?? []).length === 0) ? (
          <EmptyState
            icon={MessageSquare}
            title={t.askPlaceholder}
            description={t.askHint}
            action={
              <div className="flex flex-col gap-2">
                {examplePrompts.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => setDraft(example)}
                    className="inline-flex min-h-11 items-center justify-center rounded-control border border-line bg-surface px-3 text-ui text-content transition-[color,background-color] duration-fast ease-standard hover:bg-surface-muted"
                  >
                    {example}
                  </button>
                ))}
              </div>
            }
          />
        ) : messagesQuery.isLoading ? (
          <MessagesSkeleton />
        ) : messagesQuery.isError ? (
          <div role="alert" className="space-y-2">
            <p className="text-ui font-medium text-content">{t.loadMessagesError}</p>
            <p className="text-ui text-muted">{errorText(messagesQuery.error, m)}</p>
            <Button variant="secondary" size="lg" onClick={() => void messagesQuery.refetch()}>
              {m.common.retry}
            </Button>
          </div>
        ) : (
          <ol className="space-y-3">
            {(messagesQuery.data ?? []).map((message) => (
              <li
                key={message.id}
                className={cn(
                  "rounded-control border border-line p-3",
                  message.role === "user" ? "bg-surface-muted" : "bg-surface",
                )}
              >
                <p className="text-micro text-muted">
                  {message.role === "user" ? t.you : t.assistantName}
                </p>
                <p className="text-body text-content text-pretty">{message.content}</p>
              </li>
            ))}
          </ol>
        )}

        {showReview && lastProposal ? (
          <div className="space-y-2 rounded-control border border-line bg-surface-muted p-3">
            <p className="text-ui font-medium text-content text-pretty">
              {lastProposal.proposal.summary}
            </p>
            <p className="text-ui text-muted text-pretty">
              {proposedCat === "one" ? t.proposedActionsOne : tmpl(t.proposedActionsMany, { count: proposedCount })}
            </p>
            <Button size="lg" onClick={() => setReviewOpen(true)}>
              {t.reviewProposal}
            </Button>
          </div>
        ) : null}

        {decision ? (
          <p role="status" className="text-ui text-muted">
            {decision.kind === "approved"
              ? tmpl(t.appliedOf, { done: decision.applied, total: decision.total })
              : t.rejected}
          </p>
        ) : null}

        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
        >
          <label htmlFor="assistant-composer" className="text-ui font-medium text-content">
            {t.messageLabel}
          </label>
          <Textarea
            id="assistant-composer"
            rows={3}
            value={draft}
            disabled={sendMutation.isPending}
            placeholder={t.messagePlaceholder}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                event.preventDefault();
                void handleSubmit();
              }
            }}
            invalid={tooLong}
            aria-describedby="assistant-composer-count"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p
              id="assistant-composer-count"
              className={cn("text-micro tabular-nums", tooLong ? "text-danger" : "text-muted")}
            >
              {draft.length} / {MAX_MESSAGE_CHARS}
            </p>
            <Button type="submit" size="lg" disabled={sendDisabled} loading={sendMutation.isPending}>
              {t.send}
            </Button>
          </div>
          <p className="text-micro text-muted">{t.sendHint}</p>
          {tooLong ? (
            <p role="alert" className="text-ui text-danger">
              {t.messageTooLong}
            </p>
          ) : null}
          {sendErrorCode ? (
            <div role="alert" className="space-y-2">
              <p className="text-ui font-medium text-content">{t.sendMessageError}</p>
              <p className="text-ui text-muted">{translateAssistantError(sendErrorCode, m)}</p>
              {sendErrorCode === "rate_limited" ? (
                <p className="text-ui text-muted">
                  {t.dailyLimit}
                </p>
              ) : null}
              <Button variant="secondary" size="lg" onClick={() => void handleSubmit()}>
                {m.common.retry}
              </Button>
            </div>
          ) : null}
        </form>
      </Card>
    </div>
    {showReview && lastProposal ? (
      <ProposalModal
        key={lastProposal.proposalId}
        open={reviewOpen}
        proposalId={lastProposal.proposalId}
        proposal={lastProposal.proposal}
        timeZone={userTimeZone}
        onClose={() => setReviewOpen(false)}
        onDecided={(outcome) => {
          if (outcome.kind === "approved") {
            setDecision({ kind: "approved", applied: outcome.applied, total: outcome.total });
          } else {
            setDecision({ kind: "rejected" });
          }
          setLastProposal(null);
          setReviewOpen(false);
        }}
      />
    ) : null}
    </>
  );
}
