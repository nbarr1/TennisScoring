"use client";

export const dynamic = "force-dynamic";

import { AppNav, appNavStyles } from "../shared/AppNav";
import { useState, useRef, useEffect } from "react";
import {
  useAuthUser,
  useChannels,
  useMessages,
  sendMessage,
  getOrCreateDM,
  searchDivisionPlayers,
  useUserProfile,
  profileDoc,
  deleteDirectChannel,
} from "@tennis/firebase-client";
import { getDoc } from "firebase/firestore";
import type { Channel, Message, User, PublicProfile } from "@tennis/shared";

export default function MessagesPage(): React.JSX.Element {
  const { firebaseUser } = useAuthUser();
  const { profile } = useUserProfile(firebaseUser?.uid ?? null);
  const { channels } = useChannels(firebaseUser?.uid ?? null);
  const [active, setActive] = useState<Channel | null>(null);
  const [showNewDm, setShowNewDm] = useState(false);
  const [participantNames, setParticipantNames] = useState<Record<string, string>>({});


  useEffect(() => {
    const ids = Array.from(
      new Set(channels.flatMap((channel) => channel.participantIds)),
    ).filter((id) => id && !participantNames[id]);
    if (ids.length === 0) return;
    let cancelled = false;
    void Promise.all(
      ids.map(async (id) => {
        const snap = await getDoc(profileDoc(id));
        const data = snap.data();
        return [id, data?.displayName || id] as const;
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

  function channelLabel(ch: Channel): string {
    if (ch.name) return ch.name;
    if (ch.type === "division") return "🎾 Division Chat";
    if (ch.type === "direct") {
      const otherId = ch.participantIds.find((id) => id !== firebaseUser?.uid);
      return otherId
        ? `💬 ${participantNames[otherId] ?? "Direct Message"}`
        : "💬 Direct Message";
    }
    return ch.type;
  }

  return (
    <div style={styles.page}>
      <AppNav active="messages" />

      <div style={styles.layout}>
        {/* Sidebar */}
        <aside style={styles.sidebar}>
          <div style={styles.sidebarHeader}>
            <h2 style={styles.sidebarTitle}>Channels</h2>
            {profile?.divisionId && (
              <button
                type="button"
                aria-label="New direct message"
                style={styles.newDmBtn}
                onClick={() => setShowNewDm(true)}
                title="New direct message"
              >
                +
              </button>
            )}
          </div>
          {channels.map((ch) => (
            <button
              key={ch.id}
              style={{
                ...styles.channelBtn,
                ...(active?.id === ch.id ? styles.channelBtnActive : {}),
              }}
              onClick={() => setActive(ch)}
            >
              <span style={styles.channelName}>{channelLabel(ch)}</span>
              {ch.lastMessage && (
                <span style={styles.preview} title={ch.lastMessage.content}>
                  {ch.lastMessage.content.slice(0, 40)}
                </span>
              )}
            </button>
          ))}
          {channels.length === 0 && (
            <p style={styles.empty}>
              No channels yet. Join a division to start chatting.
            </p>
          )}
        </aside>

        {/* Chat area */}
        <main style={styles.chatArea}>
          {active ? (
            <ChatPane
              channel={active}
              currentUserId={firebaseUser?.uid ?? ""}
              currentUserName={
                profile?.displayName ?? firebaseUser?.displayName ?? "You"
              }
              title={channelLabel(active)}
              onDeleted={() => setActive(null)}
            />
          ) : (
            <div style={styles.selectPrompt}>
              Select a channel to start messaging
            </div>
          )}
        </main>
      </div>

      {showNewDm && firebaseUser && profile?.divisionId && (
        <NewDmModal
          currentUserId={firebaseUser.uid}
          divisionId={profile.divisionId}
          onClose={() => setShowNewDm(false)}
          onCreated={(channel) => {
            setActive(channel);
            setShowNewDm(false);
          }}
        />
      )}
    </div>
  );
}

function NewDmModal({
  currentUserId,
  divisionId,
  onClose,
  onCreated,
}: {
  currentUserId: string;
  divisionId: string;
  onClose: () => void;
  onCreated: (channel: Channel) => void;
}) {
  const [searchText, setSearchText] = useState("");
  const [results, setResults] = useState<PublicProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!searchText.trim()) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await searchDivisionPlayers(divisionId, searchText);
        setResults(r.filter((u) => u.id !== currentUserId));
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [searchText, divisionId, currentUserId]);

  async function handlePick(user: PublicProfile) {
    setCreating(true);
    setError("");
    try {
      const channel = await getOrCreateDM(currentUserId, user.id);
      onCreated({ ...channel, name: channel.name ?? `💬 ${user.displayName}` });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not start conversation. Please try again.",
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-dm-title"
        style={styles.modalCard}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="new-dm-title" style={styles.modalTitle}>New Direct Message</h2>
        <p style={styles.modalHint}>
          Search for a player in your division to start a conversation.
        </p>
        <label htmlFor="new-dm-search" style={styles.label}>
          Search people
        </label>
        <input
          id="new-dm-search"
          style={styles.modalInput}
          autoFocus
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Search by name…"
        />
        {searching && <div style={styles.muted}>Searching…</div>}
        {results.length > 0 && (
          <div style={styles.results}>
            {results.map((u) => (
              <button
                key={u.id}
                type="button"
                aria-label={`Start conversation with ${u.displayName}`}
                style={styles.resultRow}
                onClick={() => handlePick(u)}
                disabled={creating}
              >
                <div style={styles.resultName}>{u.displayName}</div>
              </button>
            ))}
          </div>
        )}
        {searchText.trim().length > 0 && !searching && results.length === 0 && (
          <div style={styles.muted}>No players found.</div>
        )}
        {error && <div role="alert" style={styles.error}>{error}</div>}
        <button
          type="button"
          style={styles.modalCancel}
          onClick={onClose}
          disabled={creating}
        >
          Close
        </button>
      </div>
    </div>
  );
}

function ChatPane({
  channel,
  currentUserId,
  currentUserName,
  title,
  onDeleted,
}: {
  channel: Channel;
  currentUserId: string;
  currentUserName: string;
  title: string;
  onDeleted: () => void;
}) {
  const { messages } = useMessages(channel.id);
  const [text, setText] = useState("");
  const [deleteMessage, setDeleteMessage] = useState("");
  const [deleting, setDeleting] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    const content = text.trim();
    setText("");
    await sendMessage({
      channelId: channel.id,
      senderId: currentUserId,
      senderName: currentUserName,
      content,
    });
  }


  async function handleDeleteThread() {
    if (channel.type !== "direct") return;
    const confirmed = window.confirm(
      "Delete this chat thread for all participants? This cannot be undone.",
    );
    if (!confirmed) return;
    setDeleting(true);
    setDeleteMessage("");
    try {
      await deleteDirectChannel(channel.id);
      onDeleted();
    } catch {
      setDeleteMessage("Could not delete this chat thread. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div style={styles.chatPane}>
      <div style={styles.chatHeader}>
        <span style={styles.chatTitle}>{title}</span>
        {channel.type === "direct" && (
          <button
            type="button"
            style={styles.deleteThreadBtn}
            onClick={handleDeleteThread}
            disabled={deleting}
          >
            {deleting ? "Deleting…" : "Delete thread"}
          </button>
        )}
      </div>
      {deleteMessage && <div role="alert" style={styles.threadError}>{deleteMessage}</div>}

      <div style={styles.messageList}>
        {messages.map((m) => (
          <MessageBubble
            key={m.id}
            message={m}
            isMe={m.senderId === currentUserId}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      <form style={styles.inputRow} onSubmit={handleSend}>
        <label htmlFor="message-composer" style={styles.srOnly}>
          Message
        </label>
        <input
          id="message-composer"
          style={styles.input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message…"
        />
        <button
          type="submit"
          aria-label="Send message"
          style={styles.sendBtn}
          disabled={!text.trim()}
        >
          Send
        </button>
      </form>
    </div>
  );
}

function MessageBubble({ message, isMe }: { message: Message; isMe: boolean }) {
  return (
    <div
      style={{
        ...styles.bubble,
        ...(isMe ? styles.bubbleMe : styles.bubbleThem),
      }}
    >
      {!isMe && <div style={styles.senderName}>{message.senderName}</div>}
      <div style={styles.bubbleText}>{message.content}</div>
      {message.sharedContact && (
        <div style={styles.contactActions}>
          {message.sharedContact.phone && (
            <a
              href={`tel:${message.sharedContact.phone}`}
              style={styles.contactLink}
            >
              📞 Call
            </a>
          )}
          {message.sharedContact.email && (
            <a
              href={`mailto:${message.sharedContact.email}`}
              style={styles.contactLink}
            >
              ✉️ Email
            </a>
          )}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    ...appNavStyles.page,
    display: "flex",
    flexDirection: "column",
  },
  layout: {
    display: "flex",
    flex: 1,
    flexWrap: "wrap",
    overflow: "hidden",
    minHeight: "calc(100vh - 57px)",
  },
  sidebar: {
    width: "min(280px, 100%)",
    background: "#fff",
    borderRight: "1px solid #eee",
    overflowY: "auto" as const,
    padding: "16px 0",
  },
  sidebarHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 16px 12px",
  },
  sidebarTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: "#999",
    textTransform: "uppercase" as const,
    letterSpacing: 1,
    margin: 0,
  },
  newDmBtn: {
    background: "var(--green-dark)",
    color: "#fff",
    border: "none",
    borderRadius: "50%",
    width: 26,
    height: 26,
    fontSize: 18,
    fontWeight: 700,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    lineHeight: 1,
  },
  modalOverlay: {
    position: "fixed" as const,
    inset: 0,
    background: "rgba(0,0,0,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
    padding: 16,
  },
  modalCard: {
    background: "#fff",
    borderRadius: 16,
    padding: 28,
    maxWidth: 420,
    width: "100%",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 700,
    color: "#1a472a",
    marginBottom: 8,
  },
  modalHint: { fontSize: 13, color: "#666", marginBottom: 14 },
  label: {
    display: "block",
    fontSize: 13,
    fontWeight: 600,
    color: "#444",
    marginBottom: 6,
  },
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: "hidden",
    clip: "rect(0, 0, 0, 0)",
    whiteSpace: "nowrap",
    border: 0,
  },
  modalInput: {
    width: "100%",
    border: "1px solid #ddd",
    borderRadius: 10,
    padding: "10px 14px",
    fontSize: 14,
    marginBottom: 12,
    boxSizing: "border-box" as const,
  },
  results: {
    maxHeight: 240,
    overflowY: "auto" as const,
    border: "1px solid #eee",
    borderRadius: 10,
    marginBottom: 12,
  },
  resultRow: {
    display: "block",
    width: "100%",
    textAlign: "left" as const,
    padding: "10px 14px",
    background: "#fff",
    border: "none",
    borderBottom: "1px solid #f5f5f5",
    cursor: "pointer",
  },
  resultName: { fontSize: 14, fontWeight: 600, color: "#222" },
  resultEmail: { fontSize: 12, color: "#888", marginTop: 2 },
  muted: { color: "#999", fontSize: 13, marginBottom: 12 },
  error: { color: "#c0392b", fontSize: 13, marginBottom: 12 },
  modalCancel: {
    width: "100%",
    padding: "10px 0",
    background: "#f0f0f0",
    border: "none",
    borderRadius: 10,
    fontWeight: 600,
    color: "#333",
    cursor: "pointer",
  },
  channelBtn: {
    display: "block",
    width: "100%",
    textAlign: "left" as const,
    padding: "12px 16px",
    border: "none",
    background: "transparent",
    cursor: "pointer",
    borderBottom: "1px solid #f5f5f5",
  },
  channelBtnActive: {
    background: "#f0f9f0",
    borderLeft: "3px solid var(--green-dark)",
  },
  channelName: {
    display: "block",
    fontWeight: 600,
    color: "#222",
    fontSize: 14,
    marginBottom: 2,
  },
  preview: {
    display: "block",
    fontSize: 12,
    color: "#aaa",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  empty: {
    fontSize: 13,
    color: "#bbb",
    padding: "16px",
    textAlign: "center" as const,
  },
  chatArea: {
    flex: 1,
    minWidth: 320,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  selectPrompt: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#bbb",
    fontSize: 16,
  },
  chatPane: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    height: "100%",
  },
  chatHeader: {
    padding: "14px 24px",
    borderBottom: "1px solid #eee",
    background: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  deleteThreadBtn: {
    background: "#fff",
    border: "1px solid #c0392b",
    color: "#c0392b",
    borderRadius: 10,
    padding: "8px 12px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
  },
  threadError: {
    background: "#fff4f4",
    color: "#c0392b",
    padding: "8px 24px",
    fontSize: 13,
  },
  chatTitle: { fontWeight: 700, fontSize: 16, color: "#222" },
  messageList: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "20px 24px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  bubble: {
    maxWidth: "65%",
    padding: "10px 14px",
    borderRadius: 16,
    fontSize: 14,
  },
  bubbleMe: {
    background: "var(--green-dark)",
    color: "#fff",
    alignSelf: "flex-end",
    borderBottomRightRadius: 4,
  },
  bubbleThem: {
    background: "#fff",
    color: "#222",
    alignSelf: "flex-start",
    borderBottomLeftRadius: 4,
    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
  },
  senderName: { fontSize: 11, fontWeight: 700, color: "#888", marginBottom: 4 },
  bubbleText: { lineHeight: 1.5 },
  contactActions: { display: "flex", gap: 12, marginTop: 8 },
  contactLink: { color: "var(--green-dark)", fontWeight: 700, fontSize: 12 },
  inputRow: {
    display: "flex",
    gap: 8,
    padding: "12px 24px",
    borderTop: "1px solid #eee",
    background: "#fff",
  },
  input: {
    flex: 1,
    border: "1px solid #ddd",
    borderRadius: 24,
    padding: "10px 16px",
    fontSize: 14,
  },
  sendBtn: {
    background: "var(--green-dark)",
    color: "#fff",
    border: "none",
    borderRadius: 24,
    padding: "10px 20px",
    fontWeight: 600,
    fontSize: 14,
    cursor: "pointer",
  },
};
