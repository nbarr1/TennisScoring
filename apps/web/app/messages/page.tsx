'use client';

export const dynamic = 'force-dynamic';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import {
  useAuthUser, useChannels, useMessages, sendMessage,
  getOrCreateDM, searchDivisionPlayers, useUserProfile,
} from '@tennis/firebase-client';
import type { Channel, Message, User } from '@tennis/shared';

export default function MessagesPage(): React.JSX.Element {
  const { firebaseUser } = useAuthUser();
  const { profile } = useUserProfile(firebaseUser?.uid ?? null);
  const { channels } = useChannels(firebaseUser?.uid ?? null);
  const [active, setActive] = useState<Channel | null>(null);
  const [showNewDm, setShowNewDm] = useState(false);

  function channelLabel(ch: Channel): string {
    if (ch.name) return ch.name;
    if (ch.type === 'division') return '🎾 Division Chat';
    if (ch.type === 'direct') {
      const otherId = ch.participantIds.find((id) => id !== firebaseUser?.uid);
      return otherId ? `💬 ${otherId.slice(0, 6)}…` : '💬 Direct Message';
    }
    return ch.type;
  }

  return (
    <div style={styles.page}>
      <nav style={styles.nav}>
        <span style={styles.navBrand}>🎾 Tennis League</span>
        <div style={styles.navLinks}>
          <Link href="/dashboard" style={styles.navLink}>Rankings</Link>
          <Link href="/matches" style={styles.navLink}>Matches</Link>
          <Link href="/messages" style={{ ...styles.navLink, ...styles.navLinkActive }}>Messages</Link>
          <Link href="/profile" style={styles.navLink}>Profile</Link>
          <Link href="/admin" style={styles.navLink}>Admin</Link>
        </div>
      </nav>

      <div style={styles.layout}>
        {/* Sidebar */}
        <aside style={styles.sidebar}>
          <div style={styles.sidebarHeader}>
            <h2 style={styles.sidebarTitle}>Channels</h2>
            {profile?.divisionId && (
              <button style={styles.newDmBtn} onClick={() => setShowNewDm(true)} title="New direct message">+</button>
            )}
          </div>
          {channels.map((ch) => (
            <button
              key={ch.id}
              style={{ ...styles.channelBtn, ...(active?.id === ch.id ? styles.channelBtnActive : {}) }}
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
            <p style={styles.empty}>No channels yet. Join a division to start chatting.</p>
          )}
        </aside>

        {/* Chat area */}
        <main style={styles.chatArea}>
          {active ? (
            <ChatPane channel={active} currentUserId={firebaseUser?.uid ?? ''} currentUserName={profile?.displayName ?? firebaseUser?.displayName ?? 'You'} />
          ) : (
            <div style={styles.selectPrompt}>Select a channel to start messaging</div>
          )}
        </main>
      </div>

      {showNewDm && firebaseUser && profile?.divisionId && (
        <NewDmModal
          currentUserId={firebaseUser.uid}
          divisionId={profile.divisionId}
          onClose={() => setShowNewDm(false)}
          onCreated={(channel) => { setActive(channel); setShowNewDm(false); }}
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
  const [searchText, setSearchText] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

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

  async function handlePick(user: User) {
    setCreating(true);
    setError('');
    try {
      const channel = await getOrCreateDM(currentUserId, user.id);
      onCreated({ ...channel, name: channel.name ?? `💬 ${user.displayName}` });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start conversation. Please try again.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
        <h2 style={styles.modalTitle}>New Direct Message</h2>
        <p style={styles.modalHint}>Search for a player in your division to start a conversation.</p>
        <input
          style={styles.modalInput}
          autoFocus
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Search by name or email…"
        />
        {searching && <div style={styles.muted}>Searching…</div>}
        {results.length > 0 && (
          <div style={styles.results}>
            {results.map((u) => (
              <button key={u.id} style={styles.resultRow} onClick={() => handlePick(u)} disabled={creating}>
                <div style={styles.resultName}>{u.displayName}</div>
                <div style={styles.resultEmail}>{u.email}</div>
              </button>
            ))}
          </div>
        )}
        {searchText.trim().length > 0 && !searching && results.length === 0 && (
          <div style={styles.muted}>No players found.</div>
        )}
        {error && <div style={styles.error}>{error}</div>}
        <button style={styles.modalCancel} onClick={onClose} disabled={creating}>Close</button>
      </div>
    </div>
  );
}

function ChatPane({ channel, currentUserId, currentUserName }: { channel: Channel; currentUserId: string; currentUserName: string }) {
  const { messages } = useMessages(channel.id);
  const [text, setText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    const content = text.trim();
    setText('');
    await sendMessage({ channelId: channel.id, senderId: currentUserId, senderName: currentUserName, content });
  }

  return (
    <div style={styles.chatPane}>
      <div style={styles.chatHeader}>
        <span style={styles.chatTitle}>
          {channel.name ?? (channel.type === 'division' ? '🎾 Division Chat' : '💬 Direct Message')}
        </span>
      </div>

      <div style={styles.messageList}>
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} isMe={m.senderId === currentUserId} />
        ))}
        <div ref={bottomRef} />
      </div>

      <form style={styles.inputRow} onSubmit={handleSend}>
        <input
          style={styles.input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message…"
        />
        <button type="submit" style={styles.sendBtn} disabled={!text.trim()}>Send</button>
      </form>
    </div>
  );
}

function MessageBubble({ message, isMe }: { message: Message; isMe: boolean }) {
  return (
    <div style={{ ...styles.bubble, ...(isMe ? styles.bubbleMe : styles.bubbleThem) }}>
      {!isMe && <div style={styles.senderName}>{message.senderName}</div>}
      <div style={styles.bubbleText}>{message.content}</div>
      {message.sharedContact && (
        <div style={styles.contactActions}>
          {message.sharedContact.phone && (
            <a href={`tel:${message.sharedContact.phone}`} style={styles.contactLink}>📞 Call</a>
          )}
          {message.sharedContact.email && (
            <a href={`mailto:${message.sharedContact.email}`} style={styles.contactLink}>✉️ Email</a>
          )}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' },
  nav: { background: 'var(--green-dark)', padding: '16px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 },
  navBrand: { color: '#fff', fontWeight: 700, fontSize: 20 },
  navLinks: { display: 'flex', gap: 24 },
  navLink: { color: 'rgba(255,255,255,0.75)', fontWeight: 500, fontSize: 15 },
  navLinkActive: { color: '#fff', borderBottom: '2px solid #ffdc60', paddingBottom: 2 },
  layout: { display: 'flex', flex: 1, overflow: 'hidden', height: 'calc(100vh - 57px)' },
  sidebar: { width: 280, background: '#fff', borderRight: '1px solid #eee', overflowY: 'auto' as const, padding: '16px 0' },
  sidebarHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px 12px' },
  sidebarTitle: { fontSize: 13, fontWeight: 700, color: '#999', textTransform: 'uppercase' as const, letterSpacing: 1, margin: 0 },
  newDmBtn: { background: 'var(--green-dark)', color: '#fff', border: 'none', borderRadius: '50%', width: 26, height: 26, fontSize: 18, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 },
  modalOverlay: { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 },
  modalCard: { background: '#fff', borderRadius: 16, padding: 28, maxWidth: 420, width: '100%' },
  modalTitle: { fontSize: 20, fontWeight: 700, color: '#1a472a', marginBottom: 8 },
  modalHint: { fontSize: 13, color: '#666', marginBottom: 14 },
  modalInput: { width: '100%', border: '1px solid #ddd', borderRadius: 10, padding: '10px 14px', fontSize: 14, marginBottom: 12, boxSizing: 'border-box' as const, outline: 'none' },
  results: { maxHeight: 240, overflowY: 'auto' as const, border: '1px solid #eee', borderRadius: 10, marginBottom: 12 },
  resultRow: { display: 'block', width: '100%', textAlign: 'left' as const, padding: '10px 14px', background: '#fff', border: 'none', borderBottom: '1px solid #f5f5f5', cursor: 'pointer' },
  resultName: { fontSize: 14, fontWeight: 600, color: '#222' },
  resultEmail: { fontSize: 12, color: '#888', marginTop: 2 },
  muted: { color: '#999', fontSize: 13, marginBottom: 12 },
  error: { color: '#c0392b', fontSize: 13, marginBottom: 12 },
  modalCancel: { width: '100%', padding: '10px 0', background: '#f0f0f0', border: 'none', borderRadius: 10, fontWeight: 600, color: '#333', cursor: 'pointer' },
  channelBtn: { display: 'block', width: '100%', textAlign: 'left' as const, padding: '12px 16px', border: 'none', background: 'transparent', cursor: 'pointer', borderBottom: '1px solid #f5f5f5' },
  channelBtnActive: { background: '#f0f9f0', borderLeft: '3px solid var(--green-dark)' },
  channelName: { display: 'block', fontWeight: 600, color: '#222', fontSize: 14, marginBottom: 2 },
  preview: { display: 'block', fontSize: 12, color: '#aaa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  empty: { fontSize: 13, color: '#bbb', padding: '16px', textAlign: 'center' as const },
  chatArea: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  selectPrompt: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bbb', fontSize: 16 },
  chatPane: { flex: 1, display: 'flex', flexDirection: 'column', height: '100%' },
  chatHeader: { padding: '14px 24px', borderBottom: '1px solid #eee', background: '#fff' },
  chatTitle: { fontWeight: 700, fontSize: 16, color: '#222' },
  messageList: { flex: 1, overflowY: 'auto' as const, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 8 },
  bubble: { maxWidth: '65%', padding: '10px 14px', borderRadius: 16, fontSize: 14 },
  bubbleMe: { background: 'var(--green-dark)', color: '#fff', alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  bubbleThem: { background: '#fff', color: '#222', alignSelf: 'flex-start', borderBottomLeftRadius: 4, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  senderName: { fontSize: 11, fontWeight: 700, color: '#888', marginBottom: 4 },
  bubbleText: { lineHeight: 1.5 },
  contactActions: { display: 'flex', gap: 12, marginTop: 8 },
  contactLink: { color: 'var(--green-dark)', fontWeight: 700, fontSize: 12 },
  inputRow: { display: 'flex', gap: 8, padding: '12px 24px', borderTop: '1px solid #eee', background: '#fff' },
  input: { flex: 1, border: '1px solid #ddd', borderRadius: 24, padding: '10px 16px', fontSize: 14, outline: 'none' },
  sendBtn: { background: 'var(--green-dark)', color: '#fff', border: 'none', borderRadius: 24, padding: '10px 20px', fontWeight: 600, fontSize: 14, cursor: 'pointer' },
};
