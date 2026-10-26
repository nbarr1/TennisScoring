"use client";

export const dynamic = "force-dynamic";

import { AppNav } from "../shared/AppNav";
import {
  IconAlertCircle,
  IconArrowLeft,
  IconBan,
  IconDots,
  IconFlag,
  IconMail,
  IconMessageCircle,
  IconPhone,
  IconPlus,
  IconRefresh,
  IconSend,
  IconTrash,
  IconUsers,
} from "@tabler/icons-react";
import { memo, useState, useRef, useEffect, useLayoutEffect } from "react";
import {
  useAuthUser,
  useChannels,
  useMessages,
  sendMessage,
  getOrCreateDM,
  searchDivisionPlayers,
  usePrivateUser,
  profileDoc,
  deleteDirectChannel,
  reportMessage,
  blockUser,
} from "@tennis/firebase-client";
import { getDoc } from "firebase/firestore";
import type { Channel, Message, PublicProfile, MessageReportReason } from "@tennis/shared";
import {
  Button,
  DataState,
  Dialog,
  EmptyState,
  InlineAlert,
  Spinner,
  color,
  describeError,
  fieldLabelStyle,
  inputStyle,
  radius,
  shadow,
  space,
  target,
  type,
  useAnnounce,
  useConfirm,
  useDialogClose,
} from "../shared/ui";
import { useSlow } from "../shared/network";

const REPORT_REASONS: { value: MessageReportReason; label: string }[] = [
  { value: "harassment", label: "Harassment" },
  { value: "spam", label: "Spam" },
  { value: "inappropriate", label: "Inappropriate" },
  { value: "other", label: "Other" },
];

const MAX_MESSAGE_LENGTH = 2000;

/** How many messages `useMessages` loads: `channelMessagesQuery`'s default in firebase-client. */
const MESSAGE_PAGE_SIZE = 50;

// A stable empty list, so components keyed on the block list do not re-run
// their effects on every render for a player who has blocked nobody.
const NO_BLOCKED_IDS: string[] = [];

/**
 * Layout rules inline styles can't express: the two-pane split, and below
 * 760px a list-or-thread toggle so a phone shows one pane at a time.
 */
const LAYOUT_CSS = `
.msg-layout { display: grid; grid-template-columns: minmax(240px, 300px) 1fr; flex: 1; min-height: 0; }
.msg-sidebar { min-height: 0; overflow-y: auto; }
.msg-thread { min-width: 0; min-height: 0; display: flex; flex-direction: column; }
.msg-back { display: none !important; }
.msg-hide-narrow { display: inline; }
.msg-channel:hover { background: var(--surface-muted); }
@media (max-width: 760px) {
  .msg-layout { grid-template-columns: 1fr; }
  .msg-layout[data-view="thread"] .msg-sidebar { display: none; }
  .msg-layout[data-view="list"] .msg-thread { display: none; }
  .msg-back { display: inline-flex !important; }
  .msg-sidebar { border-right: none !important; }
  .msg-hide-narrow { display: none; }
}
`;

function formatTime(timestamp: number | undefined): string {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay
    ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatFullTime(timestamp: number | undefined): string {
  if (!timestamp) return "";
  return new Date(timestamp).toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function MessagesPage(): React.JSX.Element {
  const { firebaseUser } = useAuthUser();
  const { user: profile } = usePrivateUser(firebaseUser?.uid ?? null);
  const {
    channels,
    loading: channelsLoading,
    error: channelsError,
    retry: retryChannels,
  } = useChannels(firebaseUser?.uid ?? null);
  const [activeFallback, setActiveFallback] = useState<Channel | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showNewDm, setShowNewDm] = useState(false);
  const [participantNames, setParticipantNames] = useState<Record<string, string>>({});

  useEffect(() => {
    const ids = Array.from(new Set(channels.flatMap((channel) => channel.participantIds))).filter(
      (id) => id && !participantNames[id],
    );
    if (ids.length === 0) return;
    let cancelled = false;
    void Promise.all(
      ids.map(async (id) => {
        try {
          const snap = await getDoc(profileDoc(id));
          return [id, snap.data()?.displayName || "Player"] as const;
        } catch {
          return [id, "Player"] as const;
        }
      }),
    ).then((entries) => {
      if (!cancelled) {
        setParticipantNames((current) => ({ ...current, ...Object.fromEntries(entries) }));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [channels, participantNames]);

  // The live channel object when it's in the list, else the one just created.
  const active = activeId
    ? channels.find((ch) => ch.id === activeId) ?? (activeFallback?.id === activeId ? activeFallback : null)
    : null;

  const sortedChannels = [...channels].sort(
    (a, b) => (b.lastMessage?.timestamp ?? b.createdAt ?? 0) - (a.lastMessage?.timestamp ?? a.createdAt ?? 0),
  );

  function channelLabel(ch: Channel): string {
    if (ch.name) return ch.name;
    if (ch.type === "division") return "Division chat";
    if (ch.type === "direct") {
      const otherId = ch.participantIds.find((id) => id !== firebaseUser?.uid);
      return otherId ? participantNames[otherId] ?? "Direct message" : "Direct message";
    }
    return ch.type;
  }

  function openChannel(ch: Channel) {
    setActiveFallback(ch);
    setActiveId(ch.id);
  }

  const canStartDm = !!profile?.divisionId;
  const blockedUserIds = profile?.blockedUserIds ?? NO_BLOCKED_IDS;
  const blockedSenders = new Set(blockedUserIds);

  return (
    <div style={styles.page}>
      <style>{LAYOUT_CSS}</style>
      <AppNav active="messages" />

      <div className="msg-layout" data-view={active ? "thread" : "list"}>
        <nav className="msg-sidebar" aria-labelledby="conversations-heading" style={styles.sidebar}>
          <div style={styles.sidebarHeader}>
            <h1 id="conversations-heading" style={styles.sidebarTitle}>
              Messages
            </h1>
            {canStartDm && (
              <Button
                size="sm"
                variant="secondary"
                icon={<IconPlus size={18} aria-hidden="true" />}
                onClick={() => setShowNewDm(true)}
              >
                New message
              </Button>
            )}
          </div>
          <DataState
            loading={channelsLoading && channels.length === 0}
            error={channelsError}
            isEmpty={channels.length === 0}
            loadingLabel="Loading conversations…"
            loadingRows={4}
            errorTitle="Couldn't load your conversations."
            onRetry={retryChannels}
            empty={
              <EmptyState
                compact
                icon={<IconMessageCircle size={32} aria-hidden="true" />}
                title="No conversations yet"
                description={
                  canStartDm
                    ? "Message a player in your division to set up a match."
                    : "Join a division to chat with its players."
                }
                action={
                  canStartDm ? (
                    <Button size="sm" onClick={() => setShowNewDm(true)}>
                      Start a conversation
                    </Button>
                  ) : undefined
                }
              />
            }
          >
            <ul style={styles.channelList}>
              {sortedChannels.map((ch) => {
                const isActive = active?.id === ch.id;
                const label = channelLabel(ch);
                const last = ch.lastMessage;
                return (
                  <li key={ch.id}>
                    <button
                      type="button"
                      className="msg-channel"
                      aria-current={isActive ? "true" : undefined}
                      style={{ ...styles.channelBtn, ...(isActive ? styles.channelBtnActive : {}) }}
                      onClick={() => openChannel(ch)}
                    >
                      <span style={styles.channelIcon}>
                        {ch.type === "division" ? (
                          <IconUsers size={18} aria-hidden="true" />
                        ) : (
                          <IconMessageCircle size={18} aria-hidden="true" />
                        )}
                      </span>
                      <span style={styles.channelText}>
                        <span style={styles.channelTopRow}>
                          <span style={styles.channelName}>
                            {label}
                            <span className="sr-only">{ch.type === "division" ? ", division chat" : ", direct message"}</span>
                          </span>
                          {last && <span style={styles.channelTime}>{formatTime(last.timestamp)}</span>}
                        </span>
                        {last &&
                          (last.senderId !== firebaseUser?.uid && blockedSenders.has(last.senderId) ? (
                            // Blocking promises their messages are hidden everywhere, the preview included.
                            <span style={{ ...styles.preview, fontStyle: "italic" }}>Message from a blocked player</span>
                          ) : (
                            <span style={styles.preview}>
                              {last.senderId === firebaseUser?.uid ? "You: " : ""}
                              {last.content}
                            </span>
                          ))}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </DataState>
        </nav>

        <main className="msg-thread" style={styles.chatArea}>
          {active ? (
            <ChatPane
              // A new pane per channel, so a draft or a failed send can never
              // land in another conversation's composer.
              key={active.id}
              channel={active}
              currentUserId={firebaseUser?.uid ?? ""}
              currentUserName={profile?.displayName ?? firebaseUser?.displayName ?? "You"}
              divisionId={profile?.divisionId}
              blockedUserIds={blockedUserIds}
              title={channelLabel(active)}
              onBack={() => setActiveId(null)}
              onDeleted={() => setActiveId(null)}
            />
          ) : (
            <EmptyState
              icon={<IconMessageCircle size={40} aria-hidden="true" />}
              title="Pick a conversation"
              description="Choose a conversation from the list to read and reply."
              style={{ margin: "auto" }}
            />
          )}
        </main>
      </div>

      {firebaseUser && profile?.divisionId && (
        <NewDmDialog
          open={showNewDm}
          currentUserId={firebaseUser.uid}
          divisionId={profile.divisionId}
          blockedUserIds={blockedUserIds}
          onClose={() => setShowNewDm(false)}
          onCreated={(channel) => {
            openChannel(channel);
            setShowNewDm(false);
          }}
        />
      )}
    </div>
  );
}

function NewDmDialog({
  open,
  currentUserId,
  divisionId,
  blockedUserIds,
  onClose,
  onCreated,
}: {
  open: boolean;
  currentUserId: string;
  divisionId: string;
  blockedUserIds: string[];
  onClose: () => void;
  onCreated: (channel: Channel) => void;
}) {
  const [searchText, setSearchText] = useState("");
  const [results, setResults] = useState<PublicProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const [searchAttempt, setSearchAttempt] = useState(0);
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  // The text the current results answer, so "no players match" never shows
  // while the search for newer text is still waiting to run.
  const [searchedText, setSearchedText] = useState("");

  useEffect(() => {
    if (!open) {
      setSearchText("");
      setResults([]);
      setError("");
      setSearchFailed(false);
    }
  }, [open]);

  useEffect(() => {
    if (!searchText.trim()) {
      setResults([]);
      setSearchFailed(false);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setSearching(true);
      setSearchFailed(false);
      try {
        // A direct conversation needs a shared active division, which roster-only players lack.
        const r = await searchDivisionPlayers(divisionId, searchText, { profilesOnly: true });
        const blockedIds = new Set(blockedUserIds);
        if (!cancelled) {
          setResults(r.filter((u) => u.id !== currentUserId && !blockedIds.has(u.id)));
          setSearchedText(searchText.trim());
        }
      } catch {
        if (!cancelled) {
          setResults([]);
          setSearchFailed(true);
        }
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [searchText, divisionId, currentUserId, blockedUserIds, searchAttempt]);

  async function handlePick(user: PublicProfile) {
    if (creatingId) return;
    setCreatingId(user.id);
    setError("");
    try {
      const channel = await getOrCreateDM(currentUserId, user.id);
      onCreated({ ...channel, name: channel.name ?? user.displayName });
    } catch (e) {
      setError(describeError(e, "Couldn't start the conversation. Try again."));
    } finally {
      setCreatingId(null);
    }
  }

  const query = searchText.trim();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New message"
      description="Search for a player in your division."
      dismissible={!creatingId}
      footer={<DialogCancel label="Cancel" disabled={!!creatingId} />}
    >
      <label htmlFor="new-dm-search" style={fieldLabelStyle}>
        Player name
      </label>
      <input
        id="new-dm-search"
        type="search"
        style={inputStyle}
        data-autofocus
        autoComplete="off"
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        aria-describedby="new-dm-status"
      />
      <div id="new-dm-status" role="status" style={styles.searchStatus}>
        {searching ? (
          <Spinner label="Searching…" />
        ) : searchFailed ? null : query && query === searchedText && results.length === 0 ? (
          `No players in your division match "${query}".`
        ) : query && results.length > 0 ? (
          `${results.length} ${results.length === 1 ? "player" : "players"} found`
        ) : (
          ""
        )}
      </div>
      {searchFailed && (
        <InlineAlert
          tone="error"
          action={
            <Button size="sm" variant="secondary" onClick={() => setSearchAttempt((n) => n + 1)}>
              Try again
            </Button>
          }
        >
          Couldn&apos;t search players. Check your connection and try again.
        </InlineAlert>
      )}
      {results.length > 0 && (
        <ul style={styles.results}>
          {results.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                className="msg-channel"
                style={styles.resultRow}
                onClick={() => void handlePick(u)}
                disabled={!!creatingId}
                aria-busy={creatingId === u.id || undefined}
              >
                <span style={styles.resultName}>{u.displayName}</span>
                {creatingId === u.id ? (
                  <Spinner label="Opening…" />
                ) : (
                  <span style={styles.resultHint}>Message</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <InlineAlert tone="error" style={{ marginTop: space.md }}>
          {error}
        </InlineAlert>
      )}
    </Dialog>
  );
}

function DialogCancel({ label, disabled }: { label: string; disabled?: boolean }) {
  const close = useDialogClose();
  return (
    <Button variant="secondary" onClick={close} disabled={disabled}>
      {label}
    </Button>
  );
}

type OutgoingMessage = {
  localId: string;
  content: string;
  startedAt: number;
  status: "sending" | "failed";
  error?: string;
};

function ChatPane({
  channel,
  currentUserId,
  currentUserName,
  divisionId,
  blockedUserIds,
  title,
  onBack,
  onDeleted,
}: {
  channel: Channel;
  currentUserId: string;
  currentUserName: string;
  divisionId?: string;
  blockedUserIds: string[];
  title: string;
  onBack: () => void;
  onDeleted: () => void;
}) {
  const announce = useAnnounce();
  const { confirm, confirmDialog } = useConfirm();
  const { messages: allMessages, loading, error, retry } = useMessages(channel.id);
  const [text, setText] = useState("");
  const [outgoing, setOutgoing] = useState<OutgoingMessage[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [actionMessage, setActionMessage] = useState<Message | null>(null);
  const [actionError, setActionError] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const blockedIds = new Set(blockedUserIds);
  const messages = allMessages.filter((m) => m.senderId === currentUserId || !blockedIds.has(m.senderId));
  const hiddenCount = allMessages.length - messages.length;

  // A send whose message already arrived through the snapshot is not shown twice.
  const visibleOutgoing = outgoing.filter(
    (o) =>
      o.status === "failed" ||
      !messages.some((m) => m.senderId === currentUserId && m.content === o.content && m.createdAt >= o.startedAt - 1000),
  );

  // Move focus to the conversation when it opens, so a phone user who just
  // switched panes (and a screen reader) lands in the thread.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  // Follow new messages only while the reader is at the bottom; someone
  // scrolled up into history keeps their place. Sending always follows.
  const stickToBottom = useRef(true);
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages.length]);
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    stickToBottom.current = true;
    el.scrollTop = el.scrollHeight;
  }, [visibleOutgoing.length]);

  // Grow the composer with its content, up to about five lines.
  useLayoutEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [text]);

  async function deliver(localId: string, content: string) {
    try {
      await sendMessage({ channelId: channel.id, senderId: currentUserId, senderName: currentUserName, content });
      setOutgoing((list) => list.filter((o) => o.localId !== localId));
    } catch (e) {
      setOutgoing((list) =>
        list.map((o) =>
          o.localId === localId
            ? { ...o, status: "failed", error: describeError(e, "Couldn't send. Check your connection.") }
            : o,
        ),
      );
      announce("Message not sent. Use Retry to send it again.", { politeness: "assertive" });
    }
  }

  function send() {
    const content = text.trim();
    if (!content) return;
    const localId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setOutgoing((list) => [...list, { localId, content, startedAt: Date.now(), status: "sending" }]);
    setText("");
    setActionError("");
    void deliver(localId, content);
  }

  function retrySend(item: OutgoingMessage) {
    setOutgoing((list) =>
      list.map((o) => (o.localId === item.localId ? { ...o, status: "sending", error: undefined, startedAt: Date.now() } : o)),
    );
    void deliver(item.localId, item.content);
  }

  function discardSend(item: OutgoingMessage) {
    setOutgoing((list) => list.filter((o) => o.localId !== item.localId));
    // Hand the text back so nothing typed is lost, unless a new draft exists.
    setText((current) => current || item.content);
    composerRef.current?.focus();
  }

  function handleComposerKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  }

  async function handleDeleteThread() {
    if (channel.type !== "direct" || deleting) return;
    const ok = await confirm({
      title: `Delete your conversation with ${title}?`,
      message: "The conversation and all its messages are deleted for both of you. This can't be undone.",
      confirmLabel: "Delete conversation",
    });
    if (!ok) return;
    setDeleting(true);
    setActionError("");
    try {
      await deleteDirectChannel(channel.id);
      announce("Conversation deleted.", { toast: true });
      onDeleted();
    } catch (e) {
      setActionError(describeError(e, "Couldn't delete this conversation. Try again."));
      setDeleting(false);
    }
  }

  const remaining = MAX_MESSAGE_LENGTH - text.length;

  return (
    <div style={styles.chatPane}>
      <div style={styles.chatHeader}>
        <Button
          variant="quiet"
          size="sm"
          className="msg-back"
          icon={<IconArrowLeft size={18} aria-hidden="true" />}
          onClick={onBack}
        >
          Conversations
        </Button>
        <h2 ref={headingRef} tabIndex={-1} style={styles.chatTitle}>
          {title}
        </h2>
        {channel.type === "direct" && (
          <Button
            variant="quiet-danger"
            size="sm"
            icon={<IconTrash size={18} aria-hidden="true" />}
            pending={deleting}
            pendingLabel="Deleting…"
            aria-label={deleting ? undefined : "Delete conversation"}
            onClick={() => void handleDeleteThread()}
          >
            {/* Icon only on a phone, so the name keeps the header row. */}
            <span className="msg-hide-narrow">Delete conversation</span>
          </Button>
        )}
      </div>
      {actionError && (
        <InlineAlert tone="error" onDismiss={() => setActionError("")} style={styles.threadAlert}>
          {actionError}
        </InlineAlert>
      )}

      <div
        ref={listRef}
        role="log"
        aria-label={`Messages with ${title}`}
        tabIndex={0}
        style={styles.messageList}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        <DataState
          loading={loading && allMessages.length === 0}
          error={error}
          isEmpty={messages.length === 0 && visibleOutgoing.length === 0}
          loadingLabel="Loading messages…"
          loadingRows={4}
          errorTitle="Couldn't load these messages."
          onRetry={retry}
          empty={
            <EmptyState
              compact
              title={hiddenCount > 0 ? "Only messages from blocked players here" : "No messages yet"}
              description={
                hiddenCount > 0
                  ? "Messages from players you've blocked are hidden."
                  : channel.type === "division"
                    ? "Say hello to your division, or ask who's free to play this week."
                    : `Say hello to ${title} and suggest a time to play.`
              }
              style={{ margin: "auto" }}
            />
          }
        >
          {allMessages.length >= MESSAGE_PAGE_SIZE && (
            // Older messages are not loaded; say so rather than imply this is the whole conversation.
            <p style={styles.hiddenNote}>Showing the latest {MESSAGE_PAGE_SIZE} messages.</p>
          )}
          {hiddenCount > 0 && (
            <p style={styles.hiddenNote}>
              {hiddenCount} {hiddenCount === 1 ? "message" : "messages"} from blocked players hidden.
            </p>
          )}
          {messages.map((m) => (
            <MessageBubble
              key={m.id}
              message={m}
              isMe={m.senderId === currentUserId}
              onOpenActions={setActionMessage}
            />
          ))}
          {visibleOutgoing.map((o) => (
            <OutgoingBubble key={o.localId} item={o} onRetry={() => retrySend(o)} onDiscard={() => discardSend(o)} />
          ))}
        </DataState>
      </div>

      <form
        style={styles.inputRow}
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <label htmlFor="message-composer" className="sr-only">
          Message {title}
        </label>
        <textarea
          id="message-composer"
          ref={composerRef}
          rows={1}
          style={styles.input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleComposerKeyDown}
          maxLength={MAX_MESSAGE_LENGTH}
          placeholder="Write a message"
          aria-describedby="message-composer-hint"
        />
        <span id="message-composer-hint" className="sr-only">
          Press Enter to send, Shift and Enter for a new line.
          {remaining <= 100 ? ` ${remaining} characters left.` : ""}
        </span>
        <Button type="submit" icon={<IconSend size={18} aria-hidden="true" />} disabled={!text.trim()} style={styles.sendBtn}>
          Send
        </Button>
      </form>
      {remaining <= 100 && (
        <p style={styles.counter} aria-hidden="true">
          {remaining} characters left
        </p>
      )}

      <MessageActionsDialog
        message={actionMessage}
        onClose={() => setActionMessage(null)}
        onReport={async (target, reason, note) => {
          await reportMessage({
            channelId: channel.id,
            message: target,
            reportedBy: currentUserId,
            reason,
            note,
            divisionId,
          });
          setActionMessage(null);
          announce("Report sent. A division leader will review it.", { toast: true });
        }}
        onBlock={async (target) => {
          await blockUser(currentUserId, target.senderId);
          setActionMessage(null);
          announce(`${target.senderName} blocked. You can unblock them from your profile.`, { toast: true });
        }}
      />

      {confirmDialog}
    </div>
  );
}

type ActionMode = "menu" | "report" | "block";

/**
 * Report and block live in one dialog that changes step, so moving from the
 * menu to a form never stacks or chains dialogs (which would fight over focus).
 */
function MessageActionsDialog({
  message,
  onClose,
  onReport,
  onBlock,
}: {
  message: Message | null;
  onClose: () => void;
  onReport: (target: Message, reason: MessageReportReason, note: string) => Promise<void>;
  onBlock: (target: Message) => Promise<void>;
}) {
  const [mode, setMode] = useState<ActionMode>("menu");
  const [reason, setReason] = useState<MessageReportReason | null>(null);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const stepFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (message) {
      setMode("menu");
      setReason(null);
      setNote("");
      setError("");
    }
  }, [message]);

  // Each step change moves focus to the step's first control.
  const menuFirstRef = useRef<HTMLButtonElement>(null);
  const previousMode = useRef<ActionMode>("menu");
  useEffect(() => {
    if (mode !== "menu") stepFocusRef.current?.focus();
    else if (previousMode.current !== "menu") menuFirstRef.current?.focus();
    previousMode.current = mode;
  }, [mode]);

  async function run(action: () => Promise<void>, fallback: string) {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      await action();
    } catch (err) {
      setError(describeError(err, fallback));
    } finally {
      setPending(false);
    }
  }

  function submitReport(e: React.FormEvent) {
    e.preventDefault();
    if (!message) return;
    if (!reason) {
      setError("Choose a reason for the report.");
      return;
    }
    void run(() => onReport(message, reason, note), "Couldn't send the report. Try again.");
  }

  const name = message?.senderName ?? "this player";
  const title =
    mode === "report" ? "Report message" : mode === "block" ? `Block ${name}?` : `Message from ${name}`;
  const description =
    mode === "report"
      ? "A division leader reviews every report and can remove the message. The sender isn't told who reported it."
      : undefined;

  const footer =
    mode === "report" ? (
      <>
        <Button variant="secondary" onClick={() => setMode("menu")} disabled={pending}>
          Back
        </Button>
        <Button type="submit" form="report-message-form" pending={pending} pendingLabel="Sending report…">
          Send report
        </Button>
      </>
    ) : mode === "block" ? (
      <>
        <Button
          variant="secondary"
          onClick={() => setMode("menu")}
          disabled={pending}
          ref={(el) => {
            stepFocusRef.current = el;
          }}
        >
          Back
        </Button>
        <Button
          variant="danger"
          pending={pending}
          pendingLabel="Blocking…"
          onClick={() => message && void run(() => onBlock(message), `Couldn't block ${name}. Try again.`)}
        >
          Block {name}
        </Button>
      </>
    ) : undefined;

  return (
    <Dialog
      open={message !== null}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      role={mode === "block" ? "alertdialog" : "dialog"}
      dirty={mode === "report" && (!!reason || !!note.trim())}
      dismissible={!pending}
      footer={footer}
    >
      {message && (
        <>
          <p style={styles.reportPreview}>
            <span className="sr-only">Message from {message.senderName}: </span>&ldquo;{message.content}&rdquo;
          </p>

          {mode === "menu" && (
            <div style={styles.actionList}>
              <Button
                ref={menuFirstRef}
                variant="secondary"
                fullWidth
                icon={<IconFlag size={18} aria-hidden="true" />}
                onClick={() => setMode("report")}
              >
                Report message
              </Button>
              <Button
                variant="quiet-danger"
                fullWidth
                icon={<IconBan size={18} aria-hidden="true" />}
                onClick={() => setMode("block")}
              >
                Block {name}
              </Button>
            </div>
          )}

          {mode === "block" && (
            <div style={{ ...type.body, color: color.ink }}>
              <p>
                You won&apos;t see their messages in any conversation, and you won&apos;t get notifications for them.{" "}
                {name} isn&apos;t told.
              </p>
              <p style={{ marginTop: space.sm }}>You can unblock them anytime from your profile.</p>
            </div>
          )}

          {mode === "report" && (
            <form id="report-message-form" onSubmit={submitReport} noValidate>
              <fieldset style={styles.fieldset}>
                <legend style={fieldLabelStyle}>Reason</legend>
                <div style={styles.chipRow}>
                  {REPORT_REASONS.map((r, index) => {
                    const selected = reason === r.value;
                    return (
                      <label key={r.value} className="tl-tint" style={{ ...styles.chip, ...(selected ? styles.chipActive : {}) }}>
                        <input
                          type="radio"
                          name="report-reason"
                          value={r.value}
                          checked={selected}
                          ref={
                            index === 0
                              ? (el) => {
                                  stepFocusRef.current = el;
                                }
                              : undefined
                          }
                          onChange={() => {
                            setReason(r.value);
                            setError("");
                          }}
                          style={styles.radio}
                        />
                        {r.label}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              <label htmlFor="report-note" style={fieldLabelStyle}>
                Details (optional)
              </label>
              <textarea
                id="report-note"
                style={{ ...inputStyle, minHeight: 88, padding: "10px 12px", resize: "vertical" }}
                value={note}
                maxLength={1000}
                onChange={(e) => setNote(e.target.value)}
              />
            </form>
          )}

          {error && (
            <InlineAlert tone="error" style={{ marginTop: space.md }}>
              {error}
            </InlineAlert>
          )}
        </>
      )}
    </Dialog>
  );
}

function OutgoingBubble({
  item,
  onRetry,
  onDiscard,
}: {
  item: OutgoingMessage;
  onRetry: () => void;
  onDiscard: () => void;
}) {
  const failed = item.status === "failed";
  // Offline, a send neither lands nor fails: it waits for the connection.
  const slow = useSlow(!failed, 8000);
  return (
    <div style={{ ...styles.bubbleWrap, alignSelf: "flex-end", alignItems: "flex-end" }}>
      <div style={{ ...styles.bubble, ...styles.bubbleMe, ...(failed ? styles.bubbleFailed : styles.bubbleSending) }}>
        <div style={styles.bubbleText}>{item.content}</div>
      </div>
      {failed ? (
        <div style={styles.failedRow} role="alert">
          <span style={styles.failedText}>
            <IconAlertCircle size={16} aria-hidden="true" /> Not sent. {item.error}
          </span>
          <span style={styles.failedActions}>
            <Button size="sm" variant="secondary" icon={<IconRefresh size={16} aria-hidden="true" />} onClick={onRetry}>
              Retry
            </Button>
            <Button size="sm" variant="quiet" onClick={onDiscard}>
              Edit
            </Button>
          </span>
        </div>
      ) : (
        <span style={styles.metaText} role={slow ? "status" : undefined}>
          {slow ? "Still sending. It goes out when your connection is back." : "Sending…"}
        </span>
      )}
    </div>
  );
}

/**
 * Memoized, with the stable state setter as its action handler, so typing in
 * the composer re-renders the composer and not every bubble in the thread.
 */
const MessageBubble = memo(function MessageBubble({
  message,
  isMe,
  onOpenActions,
}: {
  message: Message;
  isMe: boolean;
  onOpenActions?: (message: Message) => void;
}) {
  return (
    <div
      style={{
        ...styles.bubbleWrap,
        alignSelf: isMe ? "flex-end" : "flex-start",
        alignItems: isMe ? "flex-end" : "flex-start",
      }}
    >
      <div style={{ ...styles.bubble, ...(isMe ? styles.bubbleMe : styles.bubbleThem) }}>
        {!isMe && <div style={styles.senderName}>{message.senderName}</div>}
        {isMe && <span className="sr-only">You: </span>}
        <div style={styles.bubbleText}>{message.content}</div>
        {message.sharedContact && (
          <div style={styles.contactActions}>
            {message.sharedContact.phone && (
              <a href={`tel:${message.sharedContact.phone}`} className="tl-link" style={{ ...styles.contactLink, ...(isMe ? styles.contactLinkMe : {}) }}>
                <IconPhone size={16} aria-hidden="true" /> Call {message.sharedContact.phone}
              </a>
            )}
            {message.sharedContact.email && (
              <a href={`mailto:${message.sharedContact.email}`} className="tl-link" style={{ ...styles.contactLink, ...(isMe ? styles.contactLinkMe : {}) }}>
                <IconMail size={16} aria-hidden="true" /> Email {message.sharedContact.email}
              </a>
            )}
          </div>
        )}
      </div>
      <div style={styles.metaRow}>
        <time style={styles.metaText} dateTime={new Date(message.createdAt || 0).toISOString()} title={formatFullTime(message.createdAt)}>
          {formatTime(message.createdAt)}
        </time>
        {!isMe && onOpenActions && (
          <button
            type="button"
            aria-label={`Report or block: message from ${message.senderName}`}
            className="tl-tint"
            style={styles.bubbleActionsBtn}
            onClick={() => onOpenActions(message)}
          >
            <IconDots size={20} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
});

const styles: Record<string, React.CSSProperties> = {
  page: {
    height: "100dvh",
    minHeight: 480,
    background: color.canvas,
    display: "flex",
    flexDirection: "column",
  },
  sidebar: {
    background: color.surface,
    borderRight: `1px solid ${color.border}`,
    padding: `${space.lg}px 0`,
  },
  sidebarHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: space.sm,
    padding: `0 ${space.lg}px ${space.md}px`,
  },
  sidebarTitle: { ...type.headline, color: color.clubhouseGreen },
  channelList: { listStyle: "none", margin: 0, padding: 0 },
  channelBtn: {
    display: "flex",
    alignItems: "flex-start",
    gap: space.md,
    width: "100%",
    minHeight: 64,
    textAlign: "left",
    padding: `${space.md}px ${space.lg}px`,
    border: "none",
    borderBottom: `1px solid ${color.border}`,
    background: "transparent",
    cursor: "pointer",
    color: color.ink,
  },
  channelBtnActive: { background: color.greenSoft, boxShadow: `inset 3px 0 0 ${color.clubhouseGreen}` },
  channelIcon: { color: color.clubhouseGreen, display: "flex", paddingTop: 2, flexShrink: 0 },
  channelText: { display: "grid", gap: space.xxs, minWidth: 0, flex: 1 },
  channelTopRow: { display: "flex", justifyContent: "space-between", gap: space.sm, alignItems: "baseline" },
  channelName: {
    ...type.label,
    fontSize: 15,
    color: color.ink,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  channelTime: { ...type.caption, color: color.textMuted, flexShrink: 0 },
  preview: {
    ...type.bodySmall,
    color: color.textMuted,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  chatArea: { background: color.canvas },
  chatPane: { flex: 1, display: "flex", flexDirection: "column", minHeight: 0 },
  chatHeader: {
    padding: `${space.sm}px ${space.lg}px`,
    minHeight: 60,
    borderBottom: `1px solid ${color.border}`,
    background: color.surface,
    display: "flex",
    alignItems: "center",
    gap: space.sm,
  },
  chatTitle: {
    ...type.title,
    fontSize: 18,
    fontFamily: "var(--font-body)",
    color: color.ink,
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  threadAlert: { margin: `${space.sm}px ${space.lg}px 0` },
  messageList: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    padding: `${space.lg}px ${space.lg}px`,
    display: "flex",
    flexDirection: "column",
    gap: space.md,
  },
  hiddenNote: { ...type.caption, color: color.textMuted, textAlign: "center" },
  bubbleWrap: { display: "flex", flexDirection: "column", gap: space.xxs, maxWidth: "min(75%, 560px)" },
  bubble: {
    padding: "10px 14px",
    borderRadius: radius.lg,
    ...type.body,
    fontSize: 15,
    overflowWrap: "anywhere",
  },
  bubbleMe: { background: color.brandFill, color: color.onBrand, borderBottomRightRadius: 4 },
  bubbleThem: { background: color.surface, color: color.ink, borderBottomLeftRadius: 4, boxShadow: shadow.card },
  bubbleSending: { opacity: 0.7 },
  bubbleFailed: { background: color.destructiveSoft, color: color.ink, border: `1px solid ${color.destructive}` },
  senderName: { ...type.caption, fontWeight: 700, color: color.courtGreen, marginBottom: space.xxs },
  bubbleText: { whiteSpace: "pre-wrap" },
  metaRow: { display: "flex", alignItems: "center", gap: space.xs },
  metaText: { ...type.caption, color: color.textMuted },
  bubbleActionsBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: target.min,
    height: target.min,
    margin: -10,
    marginLeft: 0,
    background: "transparent",
    border: "none",
    borderRadius: radius.md,
    color: color.textMuted,
    cursor: "pointer",
  },
  failedRow: { display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end", gap: space.sm },
  failedText: { ...type.caption, color: color.destructivePressed, display: "inline-flex", alignItems: "center", gap: space.xs },
  failedActions: { display: "inline-flex", gap: space.xs },
  contactActions: { display: "flex", flexWrap: "wrap", gap: space.md, marginTop: space.sm },
  contactLink: {
    display: "inline-flex",
    alignItems: "center",
    gap: space.xs,
    minHeight: target.min,
    color: color.clubhouseGreen,
    fontWeight: 600,
    fontSize: 14,
  },
  contactLinkMe: { color: color.onBrand },
  inputRow: {
    display: "flex",
    alignItems: "flex-end",
    gap: space.sm,
    padding: `${space.md}px ${space.lg}px`,
    borderTop: `1px solid ${color.border}`,
    background: color.surface,
  },
  input: {
    ...inputStyle,
    flex: 1,
    minHeight: target.control,
    padding: "11px 16px",
    borderRadius: radius.xl,
    resize: "none",
    overflowY: "auto",
  },
  sendBtn: { borderRadius: radius.xl, flexShrink: 0 },
  counter: {
    ...type.caption,
    color: color.textMuted,
    textAlign: "right",
    padding: `0 ${space.lg}px ${space.sm}px`,
    background: color.surface,
  },
  searchStatus: { ...type.bodySmall, color: color.textMuted, minHeight: 24, margin: `${space.sm}px 0` },
  results: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    maxHeight: 280,
    overflowY: "auto",
    border: `1px solid ${color.border}`,
    borderRadius: radius.md,
  },
  resultRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
    width: "100%",
    minHeight: target.control,
    textAlign: "left",
    padding: `0 ${space.md}px`,
    background: "transparent",
    border: "none",
    borderBottom: `1px solid ${color.border}`,
    cursor: "pointer",
    color: color.ink,
  },
  resultName: { ...type.label, fontSize: 15, overflowWrap: "anywhere" },
  resultHint: { ...type.caption, color: color.clubhouseGreen, fontWeight: 600 },
  reportPreview: {
    ...type.bodySmall,
    color: color.textMuted,
    fontStyle: "italic",
    marginBottom: space.lg,
    padding: space.md,
    borderRadius: radius.sm,
    background: color.surfaceMuted,
    overflowWrap: "anywhere",
    whiteSpace: "pre-wrap",
    // A 2,000-character message would push the report form below the fold.
    display: "-webkit-box",
    WebkitLineClamp: 6,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  actionList: { display: "grid", gap: space.sm },
  fieldset: { border: "none", margin: `0 0 ${space.lg}px`, padding: 0, minWidth: 0 },
  chipRow: { display: "flex", gap: space.sm, flexWrap: "wrap" },
  chip: {
    display: "inline-flex",
    alignItems: "center",
    gap: space.sm,
    minHeight: target.min,
    padding: "0 14px",
    border: `1px solid ${color.borderStrong}`,
    borderRadius: radius.pill,
    ...type.label,
    color: color.ink,
    background: color.surface,
    cursor: "pointer",
  },
  chipActive: { borderColor: color.clubhouseGreen, background: color.greenSoft, color: color.clubhouseGreen },
  radio: { width: 18, height: 18, margin: 0, accentColor: "var(--clubhouse-green)" },
};
