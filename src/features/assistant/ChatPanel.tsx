import { useState } from "react";
import { MessageSquare, Plus } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Textarea } from "@/components/ui/Textarea";
import { cn } from "@/lib/cn";
import type { AssistantProposal } from "@/lib/aiProposals";

import { ASSISTANT_ERROR_MESSAGES, AssistantServiceError } from "./errors";
import { useConversations, useMessages, useSendMessage } from "./hooks";
import { ProposalModal } from "./ProposalModal";

const MAX_MESSAGE_CHARS = 4000;

const EMPTY_TITLE = "Ask about your week, or ask for a plan.";
const EMPTY_DESCRIPTION =
  "Nothing changes until you review and confirm a proposal. Start a conversation and the assistant will suggest next steps for you to approve.";

const EXAMPLE_PROMPTS = [
  "I want to become a frontend developer in 6 months.",
  "I am sick and cannot work normally this week.",
  "Why am I not making progress?",
] as const;

function errorMessage(error: unknown): { code: string | null; text: string } {
  if (error instanceof AssistantServiceError) {
    return { code: error.code, text: error.message };
  }
  return { code: null, text: ASSISTANT_ERROR_MESSAGES.unknown };
}

function ConversationSkeleton() {
  return (
    <div role="status" aria-label="Loading conversations">
      <span className="sr-only">Loading conversations…</span>
      <div className="space-y-3 motion-safe:animate-pulse" aria-hidden="true">
        <div className="h-11 w-full rounded-control bg-surface-muted" />
        <div className="h-11 w-full rounded-control bg-surface-muted" />
      </div>
    </div>
  );
}

function MessagesSkeleton() {
  return (
    <div role="status" aria-label="Loading messages">
      <span className="sr-only">Loading messages…</span>
      <div className="space-y-3 motion-safe:animate-pulse" aria-hidden="true">
        <div className="h-14 w-full rounded-control bg-surface-muted" />
        <div className="h-14 w-full rounded-control bg-surface-muted" />
      </div>
    </div>
  );
}

export function ChatPanel() {
  const conversationsQuery = useConversations();
  const [selectedId, setSelectedId] = useState<string | null | undefined>(undefined);
  const [draft, setDraft] = useState("");
  const conversations = conversationsQuery.data ?? [];
  // No effect: the first dialog is the default until the user picks another
  // one (`undefined` = not chosen yet, `null` = explicit new conversation).
  const effectiveId = selectedId === undefined ? (conversations[0]?.id ?? null) : selectedId;
  const messagesQuery = useMessages(effectiveId ?? undefined);
  const sendMutation = useSendMessage();
  const [lastProposal, setLastProposal] = useState<{
    proposalId: string;
    proposal: AssistantProposal;
    conversationId: string;
  } | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [decisionNotice, setDecisionNotice] = useState<string | null>(null);
  const userTimeZone =
    typeof Intl !== "undefined"
      ? (Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC")
      : "UTC";

  const trimmed = draft.trim();
  const tooLong = draft.length > MAX_MESSAGE_CHARS;
  const sendDisabled = trimmed.length === 0 || tooLong || sendMutation.isPending;

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
      setDecisionNotice(null);
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

  const sendError = sendMutation.error ? errorMessage(sendMutation.error) : null;

  return (
    <>
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <Card className="space-y-3 lg:w-72 lg:shrink-0">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-ui font-medium text-content">Conversations</h2>
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
            New
          </Button>
        </div>
        {conversationsQuery.isLoading ? (
          <ConversationSkeleton />
        ) : conversationsQuery.isError ? (
          <div role="alert" className="space-y-2">
            <p className="text-ui text-content">{errorMessage(conversationsQuery.error).text}</p>
            <Button
              variant="secondary"
              size="lg"
              onClick={() => void conversationsQuery.refetch()}
            >
              Retry
            </Button>
          </div>
        ) : conversations.length === 0 ? (
          <p className="text-ui text-muted">No conversations yet. Start one below.</p>
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
          <h2 className="text-heading text-content">Chat</h2>
          <p className="text-ui text-muted">
            The assistant only proposes. Nothing changes until you review and confirm.
          </p>
        </div>

        {effectiveId === null || (messagesQuery.isSuccess && (messagesQuery.data ?? []).length === 0) ? (
          <EmptyState
            icon={MessageSquare}
            title={EMPTY_TITLE}
            description={EMPTY_DESCRIPTION}
            action={
              <div className="flex flex-col gap-2">
                {EXAMPLE_PROMPTS.map((example) => (
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
            <p className="text-ui font-medium text-content">Could not load messages</p>
            <p className="text-ui text-muted">{errorMessage(messagesQuery.error).text}</p>
            <Button variant="secondary" size="lg" onClick={() => void messagesQuery.refetch()}>
              Retry
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
                  {message.role === "user" ? "You" : "Assistant"}
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
              {lastProposal.proposal.actions.length === 1
                ? "1 proposed action. Review it before anything changes."
                : `${lastProposal.proposal.actions.length} proposed actions. Review them before anything changes.`}
            </p>
            <Button size="lg" onClick={() => setReviewOpen(true)}>
              Review proposal
            </Button>
          </div>
        ) : null}

        {decisionNotice ? (
          <p role="status" className="text-ui text-muted">
            {decisionNotice}
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
            Message
          </label>
          <Textarea
            id="assistant-composer"
            rows={3}
            value={draft}
            disabled={sendMutation.isPending}
            placeholder="Ask about your week, or ask for a plan."
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
              Send
            </Button>
          </div>
          <p className="text-micro text-muted">Ctrl+Enter or Cmd+Enter sends the message.</p>
          {tooLong ? (
            <p role="alert" className="text-ui text-danger">
              Your message is too long. Please keep it under {MAX_MESSAGE_CHARS} characters.
            </p>
          ) : null}
          {sendError ? (
            <div role="alert" className="space-y-2">
              <p className="text-ui font-medium text-content">Could not send the message</p>
              <p className="text-ui text-muted">{sendError.text}</p>
              {sendError.code === "rate_limited" ? (
                <p className="text-ui text-muted">
                  The daily limit is 50 messages. Your count resets tomorrow.
                </p>
              ) : null}
              <Button variant="secondary" size="lg" onClick={() => void handleSubmit()}>
                Retry
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
            setDecisionNotice(`Applied ${outcome.applied} of ${outcome.total} actions.`);
          } else {
            setDecisionNotice("Rejected. Nothing was changed.");
          }
          setLastProposal(null);
          setReviewOpen(false);
        }}
      />
    ) : null}
    </>
  );
}
