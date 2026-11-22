import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Copy, MessageSquare, Plus, Search, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { cn } from "@/lib/cn";
import type { AssistantProposal } from "@/lib/aiProposals";
import type { AiConversation, AiMessage } from "@/types/domain";
import { pluralCategory, tmpl } from "@/lib/i18n/format";
import { useLocale, useMessages } from "@/lib/i18n/I18nContext";

import { translateAssistantError, AssistantServiceError, type AssistantErrorCode } from "./errors";
import {
  useConversations,
  useDeleteConversation,
  useMessages as useAssistantMessages,
  useSendMessage,
} from "./hooks";
import { assistant } from "./queryKeys";
import { ProposalModal } from "./ProposalModal";

const MAX_MESSAGE_CHARS = 4000;
const MOBILE_QUERY = "(max-width: 1023px)";

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia(MOBILE_QUERY).matches,
  );

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(MOBILE_QUERY);
    const update = (): void => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return isMobile;
}

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
      <div className="space-y-3" aria-hidden="true">
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
      <div className="space-y-3" aria-hidden="true">
        <div className="h-14 w-full rounded-control bg-surface-muted" />
        <div className="h-14 w-full rounded-control bg-surface-muted" />
      </div>
    </div>
  );
}

type PendingPhase = "thinking" | "typing" | "error";

interface PendingTurn {
  id: string;
  conversationId: string | null;
  userText: string;
  assistantText: string;
  typedLength: number;
  phase: PendingPhase;
  proposalId: string | null;
  proposal: AssistantProposal | null;
  userMessageId: string | null;
  assistantMessageId: string | null;
}

function TypingDots() {
  return (
    <span aria-hidden="true" className="inline-flex items-center gap-1">
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="size-1.5 animate-pulse rounded-full bg-muted"
          style={{ animationDelay: `${index * 140}ms` }}
        />
      ))}
    </span>
  );
}

export function ChatPanel() {
  const m = useMessages();
  const t = m.assistant;
  const locale = useLocale();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const conversationsQuery = useConversations();
  const [selectedId, setSelectedId] = useState<string | null | undefined>(undefined);
  const [draft, setDraft] = useState("");
  const conversations = conversationsQuery.data ?? [];
  // No effect: the first dialog is the default until the user picks another
  // one (`undefined` = not chosen yet, `null` = explicit new conversation).
  const effectiveId = selectedId === undefined ? (conversations[0]?.id ?? null) : selectedId;
  const messagesQuery = useAssistantMessages(effectiveId ?? undefined);
  const sendMutation = useSendMessage({ invalidateMessages: false });
  const deleteMutation = useDeleteConversation();
  const [conversationSearch, setConversationSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<AiConversation | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [pendingTurn, setPendingTurn] = useState<PendingTurn | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const forceScrollRef = useRef(true);
  const programmaticScrollRef = useRef(false);
  const scrollConversationRef = useRef<string | null | undefined>(undefined);
  const messageCountRef = useRef(0);
  const turnActiveRef = useRef(false);
  const [lastProposal, setLastProposal] = useState<{
    proposalId: string;
    proposal: AssistantProposal;
    conversationId: string;
  } | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [decision, setDecision] = useState<
    { kind: "approved"; applied: number; total: number } | { kind: "rejected" } | null
  >(null);
  const userTimeZone =
    typeof Intl !== "undefined"
      ? (Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC")
      : "UTC";

  const trimmed = draft.trim();
  const tooLong = draft.length > MAX_MESSAGE_CHARS;
  const isTurnActive = pendingTurn?.phase === "thinking" || pendingTurn?.phase === "typing";
  const sendDisabled = trimmed.length === 0 || tooLong || isTurnActive || sendMutation.isPending;

  const examplePrompts = [t.exampleFrontend, t.exampleSick, t.exampleStuck];

  const filteredConversations = conversations.filter((conversation) =>
    conversation.title
      .toLocaleLowerCase(locale)
      .includes(conversationSearch.trim().toLocaleLowerCase(locale)),
  );

  const dateKeyOf = (iso: string): string => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  };
  const todayDate = new Date();
  const yesterdayDate = new Date(todayDate);
  yesterdayDate.setDate(todayDate.getDate() - 1);
  const todayDateKey = dateKeyOf(todayDate.toISOString());
  const yesterdayDateKey = dateKeyOf(yesterdayDate.toISOString());
  const conversationGroups = [
    {
      label: m.common.today,
      items: filteredConversations.filter(
        (conversation) => dateKeyOf(conversation.createdAt) === todayDateKey,
      ),
    },
    {
      label: t.yesterday,
      items: filteredConversations.filter(
        (conversation) => dateKeyOf(conversation.createdAt) === yesterdayDateKey,
      ),
    },
    {
      label: t.earlier,
      items: filteredConversations.filter((conversation) => {
        const key = dateKeyOf(conversation.createdAt);
        return key !== todayDateKey && key !== yesterdayDateKey;
      }),
    },
  ].filter((group) => group.items.length > 0);

  useLayoutEffect(() => {
    const composer = composerRef.current;
    if (!composer) return;
    composer.style.height = "auto";
    composer.style.height = `${Math.min(composer.scrollHeight, 160)}px`;
  }, [draft]);

  useEffect(() => {
    const list = messageListRef.current;
    if (!list) return;
    if (scrollConversationRef.current !== effectiveId) {
      scrollConversationRef.current = effectiveId;
      messageCountRef.current = 0;
      forceScrollRef.current = true;
    }
    const messageCount = messagesQuery.data?.length ?? 0;
    if (messageCount > messageCountRef.current && stickToBottomRef.current) {
      forceScrollRef.current = true;
    }
    messageCountRef.current = messageCount;
    if (!forceScrollRef.current && !stickToBottomRef.current) return;
    programmaticScrollRef.current = true;
    list.scrollTop = list.scrollHeight;
    stickToBottomRef.current = true;
    forceScrollRef.current = false;
    window.requestAnimationFrame(() => {
      programmaticScrollRef.current = false;
    });
  }, [
    effectiveId,
    messagesQuery.data,
    pendingTurn?.phase,
    pendingTurn?.typedLength,
    sendMutation.isPending,
  ]);

  const handleMessageScroll = (): void => {
    if (programmaticScrollRef.current) return;
    const list = messageListRef.current;
    if (!list) return;
    stickToBottomRef.current = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
  };

  const sendPrompt = async (raw: string): Promise<void> => {
    const text = raw.trim();
    if (!text || text.length > MAX_MESSAGE_CHARS || turnActiveRef.current) return;
    if (sendMutation.isPending) return;

    // Freeze the current dialog before the new title invalidates the list, so
    // a brand-new conversation cannot switch under the pending answer.
    setSelectedId(effectiveId);
    setDraft("");
    setDecision(null);
    setLastProposal(null);
    turnActiveRef.current = true;
    stickToBottomRef.current = true;
    forceScrollRef.current = true;
    sendMutation.reset();

    const turnId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setPendingTurn({
      id: turnId,
      conversationId: effectiveId,
      userText: text,
      assistantText: "",
      typedLength: 0,
      phase: "thinking",
      proposalId: null,
      proposal: null,
      userMessageId: null,
      assistantMessageId: null,
    });

    try {
      const result = await sendMutation.mutateAsync({
        message: text,
        conversationId: effectiveId,
      });
      setPendingTurn((current) =>
        current?.id === turnId
          ? {
              ...current,
              conversationId: result.conversationId,
              assistantText: result.proposal.summary,
              typedLength:
                typeof window !== "undefined" &&
                window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
                  ? result.proposal.summary.length
                  : 0,
              phase: "typing",
              proposalId: result.proposalId,
              proposal: result.proposal,
              userMessageId: result.userMessageId,
              assistantMessageId: result.assistantMessageId,
            }
          : current,
      );
    } catch {
      turnActiveRef.current = false;
      setPendingTurn((current) =>
        current?.id === turnId ? { ...current, phase: "error" } : current,
      );
    }
  };

  const handleSubmit = (): void => {
    if (sendDisabled) return;
    void sendPrompt(draft);
  };

  useEffect(() => {
    if (pendingTurn?.phase !== "typing") return;
    const full = pendingTurn.assistantText;
    if (pendingTurn.typedLength >= full.length) {
      const turn = pendingTurn;
      // Defer the commit out of the effect body: React warns about synchronous
      // cascading renders, and the extra tick is invisible at typing speed.
      const timer = window.setTimeout(() => {
        if (
          !turn.proposal ||
          !turn.conversationId ||
          !turn.userMessageId ||
          !turn.assistantMessageId
        ) {
          turnActiveRef.current = false;
          setPendingTurn(null);
          return;
        }
        const conversationId = turn.conversationId;
        const userId = "";
        const createdAt = new Date().toISOString();
        const cached =
          queryClient.getQueryData<AiMessage[]>(assistant.messages(conversationId)) ?? [];
        const withoutTurn = cached.filter(
          (message) => message.id !== turn.userMessageId && message.id !== turn.assistantMessageId,
        );
        const userMessage: AiMessage = {
          id: turn.userMessageId,
          conversationId,
          userId,
          role: "user",
          content: turn.userText,
          metadata: {},
          createdAt,
        };
        const assistantMessage: AiMessage = {
          id: turn.assistantMessageId,
          conversationId,
          userId,
          role: "assistant",
          content: turn.assistantText,
          metadata: {},
          createdAt,
        };
        queryClient.setQueryData<AiMessage[]>(assistant.messages(conversationId), [
          ...withoutTurn,
          userMessage,
          assistantMessage,
        ]);
        setSelectedId(conversationId);
        setLastProposal(
          turn.proposal.actions.length > 0
            ? {
                proposalId: turn.proposalId ?? "",
                proposal: turn.proposal,
                conversationId,
              }
            : null,
        );
        setPendingTurn(null);
        turnActiveRef.current = false;
        void queryClient.invalidateQueries({
          queryKey: assistant.messages(conversationId),
        });
      }, 0);
      return () => window.clearTimeout(timer);
    }
    const step = Math.max(2, Math.ceil(full.length / 90));
    const timer = window.setTimeout(() => {
      setPendingTurn((current) =>
        current?.id === pendingTurn.id && current.phase === "typing"
          ? {
              ...current,
              typedLength: Math.min(full.length, current.typedLength + step),
            }
          : current,
      );
    }, 24);
    return () => window.clearTimeout(timer);
  }, [pendingTurn, queryClient]);

  const confirmDelete = async (): Promise<void> => {
    if (!deleteTarget || deleteMutation.isPending) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      const remaining = conversations.filter((conversation) => conversation.id !== deleteTarget.id);
      if (effectiveId === deleteTarget.id) {
        setSelectedId(remaining[0]?.id ?? null);
        setPendingTurn(null);
        setDecision(null);
        setLastProposal(null);
        setReviewOpen(false);
        turnActiveRef.current = false;
      }
      setDeleteTarget(null);
    } catch {
      // The dialog stays open and renders the mutation error.
    }
  };

  const copyMessage = async (messageId: string, content: string): Promise<void> => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(content);
      } else if (!fallbackCopy(content)) {
        return;
      }
      setCopiedMessageId(messageId);
      window.setTimeout(() => setCopiedMessageId(null), 1600);
    } catch {
      if (fallbackCopy(content)) {
        setCopiedMessageId(messageId);
        window.setTimeout(() => setCopiedMessageId(null), 1600);
      }
    }
  };

  const showReview = lastProposal !== null && lastProposal.conversationId === effectiveId;

  const sendErrorCode = sendMutation.error ? errorCode(sendMutation.error) : null;

  const proposedCount = lastProposal?.proposal.actions.length ?? 0;
  const proposedCat = pluralCategory(locale, proposedCount);
  const currentConversation =
    effectiveId === null
      ? null
      : (conversations.find((conversation) => conversation.id === effectiveId) ?? null);

  const openConversation = (id: string | null): void => {
    setSelectedId(id);
    setPendingTurn(null);
    setDecision(null);
    setLastProposal(null);
    setReviewOpen(false);
    turnActiveRef.current = false;
    forceScrollRef.current = true;
    sendMutation.reset();
  };

  const startNewConversation = (): void => {
    setDraft("");
    openConversation(null);
  };

  const fallbackCopy = (text: string): boolean => {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand("copy");
    area.remove();
    return copied;
  };

  return (
    <>
      {isMobile ? (
        <div className="flex items-center gap-2">
          {conversationsQuery.isLoading ? (
            <div className="flex h-11 min-w-0 flex-1 items-center rounded-control bg-surface-muted px-3 text-caption text-muted">
              {t.loadingConversations}
            </div>
          ) : conversationsQuery.isError ? (
            <div className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-control bg-surface-muted px-3 text-caption text-muted">
              <span className="truncate">{errorText(conversationsQuery.error, m)}</span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void conversationsQuery.refetch()}
              >
                {m.common.retry}
              </Button>
            </div>
          ) : (
            <>
              <label htmlFor="assistant-conversation" className="sr-only">
                {t.conversations}
              </label>
              <select
                id="assistant-conversation"
                value={effectiveId ?? ""}
                disabled={isTurnActive}
                onChange={(event) => {
                  const id = event.target.value;
                  if (id === "") startNewConversation();
                  else openConversation(id);
                }}
                className="h-11 min-w-0 flex-1 rounded-control border border-line bg-surface px-3 text-ui text-content disabled:opacity-60"
              >
                <option value="">{t.newChat}</option>
                {conversations.map((conversation) => (
                  <option key={conversation.id} value={conversation.id}>
                    {conversation.title}
                  </option>
                ))}
              </select>
            </>
          )}

          <Button
            variant="secondary"
            size="lg"
            className="min-h-11 shrink-0 px-3"
            aria-label={t.newChat}
            title={t.newChat}
            disabled={isTurnActive}
            onClick={startNewConversation}
          >
            <Plus className="size-4" aria-hidden="true" />
          </Button>
          {currentConversation ? (
            <Button
              variant="secondary"
              size="lg"
              className="min-h-11 shrink-0 px-3 text-muted"
              aria-label={`${t.deleteConversation}: ${currentConversation.title}`}
              title={t.deleteConversation}
              disabled={isTurnActive}
              onClick={() => {
                deleteMutation.reset();
                setDeleteTarget(currentConversation);
              }}
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="grid min-w-0 gap-4 lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-start">
        <Card className="hidden min-w-0 space-y-4 p-4 sm:p-5 lg:flex lg:h-[calc(100dvh-13rem)] lg:min-h-[34rem] lg:flex-col lg:overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-[15px] font-medium text-content">{t.conversations}</h2>
            <Button
              variant="secondary"
              size="lg"
              className="min-h-11 max-w-full"
              disabled={isTurnActive}
              onClick={startNewConversation}
            >
              <Plus className="size-4" aria-hidden="true" />
              {t.newChat}
            </Button>
          </div>
          <div className="relative hidden lg:block">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={conversationSearch}
              onChange={(event) => setConversationSearch(event.target.value)}
              placeholder={t.searchConversations}
              aria-label={t.searchConversations}
              className="h-9 border-transparent bg-surface-muted pl-9"
            />
          </div>
          {conversationsQuery.isLoading ? (
            <ConversationSkeleton />
          ) : conversationsQuery.isError ? (
            <div role="alert" className="space-y-2">
              <p className="text-ui text-content">{errorText(conversationsQuery.error, m)}</p>
              <Button
                variant="secondary"
                size="lg"
                className="min-h-11"
                onClick={() => void conversationsQuery.refetch()}
              >
                {m.common.retry}
              </Button>
            </div>
          ) : conversations.length === 0 ? (
            <p className="text-ui text-muted">{t.noConversations}</p>
          ) : filteredConversations.length === 0 ? (
            <p className="text-ui text-muted">{t.noSearchResults}</p>
          ) : (
            <ul className="scrollbar-neutral flex gap-2 overflow-x-auto pb-1 lg:block lg:min-h-0 lg:flex-1 lg:space-y-1 lg:overflow-x-visible lg:overflow-y-auto lg:pb-0">
              {conversationGroups.map((group) => (
                <Fragment key={group.label}>
                  <li className="hidden pl-3 text-micro text-muted lg:block lg:pt-2">
                    {group.label}
                  </li>
                  {group.items.map((conversation) => {
                    const active = conversation.id === effectiveId;
                    return (
                      <li
                        key={conversation.id}
                        className="group relative w-auto max-w-64 shrink-0 lg:w-full lg:max-w-none"
                      >
                        <button
                          type="button"
                          disabled={isTurnActive}
                          onClick={() => openConversation(conversation.id)}
                          aria-current={active ? "true" : undefined}
                          title={conversation.title}
                          className={cn(
                            "flex min-h-11 w-full min-w-0 items-center gap-2 rounded-pill py-1.5 pr-10 pl-3 text-left text-ui transition-[color,background-color] duration-fast ease-standard",
                            active
                              ? "bg-surface-muted font-medium text-content"
                              : "text-muted hover:bg-surface-muted hover:text-content",
                          )}
                        >
                          <MessageSquare className="size-4 shrink-0" aria-hidden="true" />
                          <span className="min-w-0 flex-1 truncate">{conversation.title}</span>
                        </button>
                        <button
                          type="button"
                          disabled={isTurnActive}
                          aria-label={`${t.deleteConversation}: ${conversation.title}`}
                          title={t.deleteConversation}
                          onClick={() => {
                            deleteMutation.reset();
                            setDeleteTarget(conversation);
                          }}
                          className="absolute top-1/2 right-1 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-muted transition-[color,background-color,opacity] duration-fast ease-standard hover:bg-surface hover:text-danger focus-visible:opacity-100 disabled:pointer-events-none disabled:opacity-0 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100"
                        >
                          <Trash2 className="size-3.5" aria-hidden="true" />
                        </button>
                      </li>
                    );
                  })}
                </Fragment>
              ))}
            </ul>
          )}{" "}
        </Card>

        <Card className="flex min-w-0 flex-col gap-5 p-4 sm:p-6 lg:h-[calc(100dvh-13rem)] lg:min-h-[34rem] lg:overflow-hidden">
          <div className="hidden space-y-1 lg:block">
            <h2 className="text-[15px] font-medium text-content">{t.chat}</h2>
            <p className="text-caption text-muted text-pretty">{t.proposalsOnly}</p>
          </div>

          <div
            ref={messageListRef}
            onScroll={handleMessageScroll}
            className="scrollbar-neutral min-h-0 flex-1 space-y-5 overflow-y-auto pr-1 lg:pr-2"
          >
            {!pendingTurn &&
            (effectiveId === null ||
              (messagesQuery.isSuccess && (messagesQuery.data ?? []).length === 0)) ? (
              <EmptyState
                icon={MessageSquare}
                title={t.askPlaceholder}
                description={t.askHint}
                action={
                  <div className="flex w-full min-w-0 flex-col gap-2">
                    {examplePrompts.map((example) => (
                      <button
                        key={example}
                        type="button"
                        onClick={() => setDraft(example)}
                        className="min-h-11 w-full rounded-control bg-surface-muted px-4 py-3 text-left text-ui break-words text-content transition-[color,background-color] duration-fast ease-standard hover:bg-surface-raised"
                      >
                        {example}
                      </button>
                    ))}
                  </div>
                }
              />
            ) : messagesQuery.isLoading && !pendingTurn ? (
              <MessagesSkeleton />
            ) : messagesQuery.isError && !pendingTurn ? (
              <div role="alert" className="space-y-2">
                <p className="text-ui font-medium text-content">{t.loadMessagesError}</p>
                <p className="text-ui text-muted">{errorText(messagesQuery.error, m)}</p>
                <Button
                  variant="secondary"
                  size="lg"
                  className="min-h-11"
                  onClick={() => void messagesQuery.refetch()}
                >
                  {m.common.retry}
                </Button>
              </div>
            ) : (
              <ol className="space-y-2">
                {(messagesQuery.data ?? []).map((message) => (
                  <li
                    key={message.id}
                    className={cn(
                      "group relative min-w-0 rounded-control p-4",
                      message.role === "user" ? "bg-surface-muted" : "bg-canvas",
                    )}
                  >
                    <p className="text-micro font-medium text-muted">
                      {message.role === "user" ? t.you : t.assistantName}
                    </p>
                    <p className="mt-1 pr-10 text-body break-words text-content text-pretty">
                      {message.content}
                    </p>
                    <button
                      type="button"
                      aria-label={copiedMessageId === message.id ? t.copied : t.copyMessage}
                      title={copiedMessageId === message.id ? t.copied : t.copyMessage}
                      onClick={() => void copyMessage(message.id, message.content)}
                      className="absolute top-2 right-2 flex size-9 items-center justify-center rounded-full text-muted opacity-60 transition-[color,background-color,opacity] duration-fast ease-standard hover:bg-surface-raised hover:text-content hover:opacity-100 focus-visible:opacity-100"
                    >
                      {copiedMessageId === message.id ? (
                        <Check className="size-3.5" aria-hidden="true" />
                      ) : (
                        <Copy className="size-3.5" aria-hidden="true" />
                      )}
                    </button>
                  </li>
                ))}
                {pendingTurn ? (
                  <Fragment key={pendingTurn.id}>
                    <li className="relative min-w-0 rounded-control bg-surface-muted p-4">
                      <p className="text-micro font-medium text-muted">{t.you}</p>
                      <p className="mt-1 text-body break-words text-content text-pretty">
                        {pendingTurn.userText}
                      </p>
                    </li>
                    {pendingTurn.phase === "thinking" ? (
                      <li className="min-w-0 rounded-control bg-canvas p-4">
                        <p className="text-micro font-medium text-muted">{t.assistantName}</p>
                        <div
                          role="status"
                          className="mt-2 flex items-center gap-2 text-body text-muted"
                        >
                          <TypingDots />
                          <span>{m.assistant.thinking}</span>
                        </div>
                      </li>
                    ) : pendingTurn.phase === "typing" ? (
                      <li className="min-w-0 rounded-control bg-canvas p-4">
                        <p className="text-micro font-medium text-muted">{t.assistantName}</p>
                        <p className="mt-1 text-body break-words text-content text-pretty">
                          {pendingTurn.assistantText.slice(0, pendingTurn.typedLength)}
                          <span
                            aria-hidden="true"
                            className="ml-0.5 inline-block h-4 w-[2px] animate-pulse rounded-full bg-content align-middle"
                          />
                          <span className="sr-only">{m.assistant.typing}</span>
                        </p>
                      </li>
                    ) : (
                      <li className="min-w-0 rounded-control bg-canvas p-4">
                        <p className="text-micro font-medium text-muted">{t.assistantName}</p>
                        <div role="alert" className="mt-2 space-y-2">
                          <p className="text-ui font-medium text-content">{t.sendMessageError}</p>
                          <p className="text-ui text-muted">
                            {sendErrorCode
                              ? translateAssistantError(sendErrorCode, m)
                              : t.sendMessageError}
                          </p>
                          {sendErrorCode === "rate_limited" ? (
                            <p className="text-ui text-muted">{t.dailyLimit}</p>
                          ) : null}
                          <Button
                            variant="secondary"
                            size="lg"
                            className="min-h-11"
                            onClick={() => {
                              sendMutation.reset();
                              void sendPrompt(pendingTurn.userText);
                            }}
                          >
                            {m.common.retry}
                          </Button>
                        </div>
                      </li>
                    )}
                  </Fragment>
                ) : null}
              </ol>
            )}

            {showReview && lastProposal ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-control bg-surface-muted p-4">
                <div className="min-w-0 space-y-1">
                  <p className="text-ui font-medium text-content">
                    {proposedCat === "one"
                      ? t.proposedActionsOne
                      : tmpl(t.proposedActionsMany, { count: proposedCount })}
                  </p>
                  <p className="text-caption text-muted text-pretty">{t.reviewPrompt}</p>
                </div>
                <Button size="lg" className="min-h-11" onClick={() => setReviewOpen(true)}>
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
          </div>

          <form
            className="mt-auto min-w-0 space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              void handleSubmit();
            }}
          >
            <label htmlFor="assistant-composer" className="text-ui font-medium text-content">
              {t.messageLabel}
            </label>
            <Textarea
              ref={composerRef}
              id="assistant-composer"
              rows={1}
              value={draft}
              disabled={sendMutation.isPending || isTurnActive}
              placeholder={t.messagePlaceholder}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
                if (event.ctrlKey || event.metaKey || !event.shiftKey) {
                  event.preventDefault();
                  void handleSubmit();
                }
              }}
              invalid={tooLong}
              aria-describedby="assistant-composer-count"
              className="min-h-[5.5rem] max-h-40 resize-none"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p
                id="assistant-composer-count"
                className={cn("text-micro tabular-nums", tooLong ? "text-danger" : "text-muted")}
              >
                {draft.length} / {MAX_MESSAGE_CHARS}
              </p>
              <Button
                type="submit"
                size="lg"
                className="min-h-11"
                disabled={sendDisabled}
                loading={sendMutation.isPending || pendingTurn?.phase === "thinking"}
              >
                {t.send}
              </Button>
            </div>
            <p className="text-micro text-muted">{t.sendHint}</p>
            {tooLong ? (
              <p role="alert" className="text-ui text-danger">
                {t.messageTooLong}
              </p>
            ) : null}
            {sendErrorCode && pendingTurn?.phase !== "error" ? (
              <div role="alert" className="space-y-2">
                <p className="text-ui font-medium text-content">{t.sendMessageError}</p>
                <p className="text-ui text-muted">{translateAssistantError(sendErrorCode, m)}</p>
                {sendErrorCode === "rate_limited" ? (
                  <p className="text-ui text-muted">{t.dailyLimit}</p>
                ) : null}
                <Button
                  variant="secondary"
                  size="lg"
                  className="min-h-11"
                  onClick={() => {
                    sendMutation.reset();
                    void sendPrompt(pendingTurn?.userText ?? draft);
                  }}
                >
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
      {deleteTarget ? (
        <Dialog
          open
          onClose={() => {
            if (!deleteMutation.isPending) setDeleteTarget(null);
          }}
          title={t.deleteConversationTitle}
          description={tmpl(t.deleteConversationBody, { title: deleteTarget.title })}
        >
          <div className="space-y-4">
            {deleteMutation.error ? (
              <p role="alert" className="text-ui text-danger">
                {errorText(deleteMutation.error, m)}
              </p>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="secondary"
                size="lg"
                disabled={deleteMutation.isPending}
                onClick={() => setDeleteTarget(null)}
              >
                {m.common.cancel}
              </Button>
              <Button
                variant="danger"
                size="lg"
                loading={deleteMutation.isPending}
                onClick={() => void confirmDelete()}
              >
                {deleteMutation.isPending ? t.deletingConversation : t.deleteConversationConfirm}
              </Button>
            </div>
          </div>
        </Dialog>
      ) : null}
    </>
  );
}
