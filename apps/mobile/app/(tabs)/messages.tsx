import React, { useState, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Linking,
  Modal,
  ActivityIndicator,
  Alert,
} from "react-native";
import {
  useChannels,
  useMessages,
  sendMessage,
  getOrCreateDM,
  searchDivisionPlayers,
  reportMessage,
  blockUser,
} from "@tennis/firebase-client";
import { useAppStore } from "../../store/appStore";
import type {
  Message,
  Channel,
  PublicProfile,
  MessageReportReason,
} from "@tennis/shared";
import {
  KeyboardAwareBottomSheet,
  KeyboardSafeView,
} from "../../components/KeyboardSafeView";

const REPORT_REASONS: { value: MessageReportReason; label: string }[] = [
  { value: "harassment", label: "Harassment" },
  { value: "spam", label: "Spam" },
  { value: "inappropriate", label: "Inappropriate" },
  { value: "other", label: "Other" },
];

const CONTACT_SHARE_EXPLAINED_KEY = "messages.contactShareExplained";

function MessageBubble({
  message,
  isMe,
  onLongPress,
  onOpenActions,
}: {
  message: Message;
  isMe: boolean;
  onLongPress?: () => void;
  onOpenActions?: () => void;
}) {
  return (
    <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
      <TouchableOpacity
        activeOpacity={isMe ? 1 : 0.7}
        disabled={isMe || !onLongPress}
        onLongPress={onLongPress}
        delayLongPress={350}
        accessibilityRole="text"
        accessibilityLabel={`${isMe ? "You" : message.senderName}: ${message.content}`}
        accessibilityHint={
          !isMe ? "Long press for report and block actions" : undefined
        }
      >
        {!isMe && <Text style={styles.senderName}>{message.senderName}</Text>}
        <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>
          {message.content}
        </Text>
      </TouchableOpacity>

      {!isMe && onOpenActions && (
        <TouchableOpacity
          style={styles.messageActionsBtn}
          onPress={onOpenActions}
          accessibilityRole="button"
          accessibilityLabel={`More actions for message from ${message.senderName}`}
          accessibilityHint="Opens report and block actions"
        >
          <Text style={styles.messageActionsText}>•••</Text>
        </TouchableOpacity>
      )}

      {/* Shared contact quick-actions */}
      {message.sharedContact && (
        <View style={styles.contactActions}>
          {message.sharedContact.phone && (
            <TouchableOpacity
              onPress={() =>
                Linking.openURL(`tel:${message.sharedContact!.phone}`)
              }
              accessibilityRole="button"
              accessibilityLabel={`Call ${message.senderName}`}
              accessibilityHint="Opens the phone app"
              accessibilityState={{ disabled: false }}
            >
              <Text style={styles.contactLink}>Call</Text>
            </TouchableOpacity>
          )}
          {message.sharedContact.email && (
            <TouchableOpacity
              onPress={() =>
                Linking.openURL(`mailto:${message.sharedContact!.email}`)
              }
              accessibilityRole="button"
              accessibilityLabel={`Email ${message.senderName}`}
              accessibilityHint="Opens the email app"
              accessibilityState={{ disabled: false }}
            >
              <Text style={styles.contactLink}>Email</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

function ChannelView({ channel }: { channel: Channel }) {
  const { user } = useAppStore();
  const {
    messages: allMessages,
    loading,
    error,
    retry,
  } = useMessages(channel.id);
  const [text, setText] = useState("");
  const listRef = useRef<FlatList>(null);
  const [actionMessage, setActionMessage] = useState<Message | null>(null);
  const [reportMessageTarget, setReportMessageTarget] =
    useState<Message | null>(null);
  const [reportReason, setReportReason] =
    useState<MessageReportReason>("harassment");
  const [reportNote, setReportNote] = useState("");
  const [reporting, setReporting] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const blockedIds = new Set(user?.blockedUserIds ?? []);
  const messages = allMessages.filter(
    (m) => m.senderId === user?.id || !blockedIds.has(m.senderId),
  );

  function handleLongPressMessage(message: Message) {
    setActionMessage(message);
  }

  async function handleBlockSender() {
    if (!user || !actionMessage) return;
    const senderId = actionMessage.senderId;
    const senderName = actionMessage.senderName;
    setActionMessage(null);
    Alert.alert(
      "Block " + senderName + "?",
      "You won't see messages from this person anymore. You can unblock them later from your profile.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Block",
          style: "destructive",
          onPress: async () => {
            try {
              await blockUser(user.id, senderId);
            } catch {
              Alert.alert("Could not block user", "Please try again.");
            }
          },
        },
      ],
    );
  }

  function handleOpenReport() {
    if (!actionMessage) return;
    setReportMessageTarget(actionMessage);
    setReportReason("harassment");
    setReportNote("");
    setActionMessage(null);
  }

  async function handleSubmitReport() {
    if (!user || !reportMessageTarget) return;
    setReporting(true);
    try {
      await reportMessage({
        channelId: channel.id,
        message: reportMessageTarget,
        reportedBy: user.id,
        reason: reportReason,
        note: reportNote,
        divisionId: user.divisionId,
      });
      setReportMessageTarget(null);
      Alert.alert(
        "Message reported",
        "Thanks — a division leader will review it.",
      );
    } catch {
      Alert.alert("Could not submit report", "Please try again.");
    } finally {
      setReporting(false);
    }
  }

  async function handleSend() {
    if (!text.trim() || !user || sending) return;
    const content = text.trim();
    setSending(true);
    setSendError(null);
    try {
      await sendMessage({
        channelId: channel.id,
        senderId: user.id,
        senderName: user.displayName ?? "Unknown",
        content,
      });
      setText((draft) => (draft.trim() === content ? "" : draft));
    } catch {
      setSendError("Message not sent. Your draft is still here.");
    } finally {
      setSending(false);
    }
  }

  async function sendContact() {
    if (!user) return;
    const sharedContact = {
      phone: user.contactPreferences?.allowSMS ? user.phone : undefined,
      email: user.contactPreferences?.allowEmail ? user.email : undefined,
    };
    if (!sharedContact.phone && !sharedContact.email) {
      Alert.alert(
        "No contact info to share",
        "Enable email or SMS contact sharing in your profile first.",
      );
      return;
    }
    setSending(true);
    setSendError(null);
    try {
      await sendMessage({
        channelId: channel.id,
        senderId: user.id,
        senderName: user.displayName ?? "Unknown",
        content: "Shared contact information",
        sharedContact,
      });
    } catch {
      setSendError("Contact details not sent. Please try again.");
    } finally {
      setSending(false);
    }
  }

  async function handleShareContact() {
    if (sending) return;
    let explained: string | null = null;
    try {
      explained = await AsyncStorage.getItem(CONTACT_SHARE_EXPLAINED_KEY);
    } catch {
      // The explanation should never prevent contact sharing if storage fails.
    }
    if (!explained) {
      Alert.alert(
        "Share contact details",
        "Share the contact details enabled in your profile.",
        [
          {
            text: "Not now",
            style: "cancel",
            onPress: () =>
              AsyncStorage.setItem(CONTACT_SHARE_EXPLAINED_KEY, "true").catch(
                () => undefined,
              ),
          },
          {
            text: "Share",
            onPress: () => {
              void AsyncStorage.setItem(
                CONTACT_SHARE_EXPLAINED_KEY,
                "true",
              ).catch(() => undefined);
              void sendContact();
            },
          },
        ],
      );
      return;
    }
    await sendContact();
  }

  return (
    <KeyboardSafeView>
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => {
          const isMe = item.senderId === user?.id;
          return (
            <MessageBubble
              message={item}
              isMe={isMe}
              onLongPress={
                isMe ? undefined : () => handleLongPressMessage(item)
              }
              onOpenActions={
                isMe ? undefined : () => handleLongPressMessage(item)
              }
            />
          );
        }}
        contentContainerStyle={styles.messageList}
        ListEmptyComponent={
          loading ? (
            <View style={styles.stateContainer}>
              <ActivityIndicator color="#1a472a" />
              <Text style={styles.stateText}>Loading messages…</Text>
            </View>
          ) : error ? (
            <View style={styles.stateContainer}>
              <Text style={styles.stateTitle}>Couldn’t load messages</Text>
              <TouchableOpacity
                style={styles.retryBtn}
                onPress={retry}
                accessibilityRole="button"
                accessibilityLabel="Retry loading messages"
                accessibilityHint="Attempts to load this conversation again"
              >
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.stateContainer}>
              <Text style={styles.stateTitle}>No messages yet</Text>
              <Text style={styles.stateText}>
                Send a message to start the conversation.
              </Text>
            </View>
          )
        }
        onContentSizeChange={() =>
          listRef.current?.scrollToEnd({ animated: false })
        }
      />
      <View style={styles.inputRow}>
        <TouchableOpacity
          onPress={handleShareContact}
          style={styles.shareContactBtn}
          disabled={sending}
          accessibilityRole="button"
          accessibilityLabel="Share contact details"
          accessibilityHint="Shares the contact details enabled in your profile"
          accessibilityState={{ disabled: sending }}
        >
          <View style={styles.shareContactIcon} accessible={false}>
            <View style={styles.contactIconHead} />
            <View style={styles.contactIconBody} />
          </View>
          <Text style={styles.shareContactText}>Contact</Text>
        </TouchableOpacity>
        <TextInput
          style={styles.textInput}
          value={text}
          onChangeText={setText}
          maxLength={2000}
          placeholder="Message…"
          multiline
        />
        <TouchableOpacity
          style={[styles.sendBtn, !text.trim() && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!text.trim() || sending}
          accessibilityRole="button"
          accessibilityLabel={
            sendError ? "Retry sending message" : "Send message"
          }
          accessibilityHint="Sends the current message"
          accessibilityState={{
            disabled: !text.trim() || sending,
            busy: sending,
          }}
        >
          {sending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.sendText}>{sendError ? "Retry" : "Send"}</Text>
          )}
        </TouchableOpacity>
      </View>
      {!!sendError && (
        <View style={styles.sendError} accessibilityRole="alert">
          <Text style={styles.sendErrorText}>{sendError}</Text>
          <Text style={styles.sendErrorHint}>
            {text.trim()
              ? "Tap Retry to try again."
              : "Tap Contact to try again."}
          </Text>
        </View>
      )}

      <Modal visible={!!actionMessage} transparent animationType="fade">
        <TouchableOpacity
          style={styles.actionSheetOverlay}
          activeOpacity={1}
          onPress={() => setActionMessage(null)}
          accessibilityRole="button"
          accessibilityLabel="Close message actions"
          accessibilityHint="Closes the report and block menu"
        >
          <View style={styles.actionSheetCard}>
            <Text style={styles.actionSheetTitle}>
              {actionMessage?.senderName}
            </Text>
            <TouchableOpacity
              style={styles.actionSheetOption}
              onPress={handleOpenReport}
              accessibilityRole="button"
              accessibilityLabel="Report message"
              accessibilityHint="Opens the message report form"
            >
              <Text style={styles.actionSheetOptionText}>
                🚩 Report message
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionSheetOption}
              onPress={handleBlockSender}
              accessibilityRole="button"
              accessibilityLabel={`Block ${actionMessage?.senderName ?? "sender"}`}
              accessibilityHint="Stops messages from this person from appearing"
            >
              <Text style={styles.actionSheetOptionTextDestructive}>
                🚫 Block {actionMessage?.senderName}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionSheetOption}
              onPress={() => setActionMessage(null)}
              accessibilityRole="button"
              accessibilityLabel="Cancel message actions"
              accessibilityHint="Closes this menu"
            >
              <Text style={styles.actionSheetOptionText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={!!reportMessageTarget} transparent animationType="slide">
        <KeyboardAwareBottomSheet style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Report Message</Text>
            <Text style={styles.reportPreview} numberOfLines={2}>
              "{reportMessageTarget?.content}"
            </Text>
            <View style={styles.chipRow}>
              {REPORT_REASONS.map((r) => (
                <TouchableOpacity
                  key={r.value}
                  style={[
                    styles.chip,
                    reportReason === r.value && styles.chipActive,
                  ]}
                  onPress={() => setReportReason(r.value)}
                  accessibilityRole="radio"
                  accessibilityLabel={`${r.label} report reason`}
                  accessibilityState={{ selected: reportReason === r.value }}
                >
                  <Text
                    style={[
                      styles.chipText,
                      reportReason === r.value && styles.chipTextActive,
                    ]}
                  >
                    {r.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={[styles.input, { minHeight: 56 }]}
              value={reportNote}
              maxLength={1000}
              onChangeText={setReportNote}
              placeholder="Add details (optional)"
              multiline
            />
            <TouchableOpacity
              style={[styles.sendReportBtn, reporting && styles.btnDisabled]}
              onPress={handleSubmitReport}
              disabled={reporting}
              accessibilityRole="button"
              accessibilityLabel="Submit message report"
              accessibilityHint="Sends this report to a division leader"
              accessibilityState={{ disabled: reporting, busy: reporting }}
            >
              {reporting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.sendReportBtnText}>Submit Report</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => setReportMessageTarget(null)}
              disabled={reporting}
              accessibilityRole="button"
              accessibilityLabel="Cancel report"
              accessibilityHint="Closes the report form without submitting"
              accessibilityState={{ disabled: reporting }}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAwareBottomSheet>
      </Modal>
    </KeyboardSafeView>
  );
}

export default function MessagesScreen() {
  const { user, divisionId } = useAppStore();
  const { channels, loading, error, retry } = useChannels(user?.id ?? null);
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [showNewDM, setShowNewDM] = useState(false);
  const [dmSearch, setDmSearch] = useState("");
  const [dmResults, setDmResults] = useState<PublicProfile[]>([]);
  const [dmSearching, setDmSearching] = useState(false);
  const [dmCreating, setDmCreating] = useState(false);

  async function handleSearchDM(text: string) {
    setDmSearch(text);
    if (!divisionId || !text.trim()) {
      setDmResults([]);
      return;
    }
    setDmSearching(true);
    try {
      const results = await searchDivisionPlayers(divisionId, text);
      const blockedIds = new Set(user?.blockedUserIds ?? []);
      setDmResults(
        results.filter((u) => u.id !== user?.id && !blockedIds.has(u.id)),
      );
    } catch {
      setDmResults([]);
    } finally {
      setDmSearching(false);
    }
  }

  async function handleStartDM(other: PublicProfile) {
    if (!user) return;
    setDmCreating(true);
    try {
      const channel = await getOrCreateDM(user.id, other.id);
      setShowNewDM(false);
      setDmSearch("");
      setDmResults([]);
      setActiveChannel(channel);
    } catch (error) {
      console.error("Failed to create DM channel", error);
    } finally {
      setDmCreating(false);
    }
  }

  if (activeChannel) {
    return (
      <View style={{ flex: 1 }}>
        <View style={styles.channelHeader}>
          <TouchableOpacity
            onPress={() => setActiveChannel(null)}
            accessibilityRole="button"
            accessibilityLabel="Back to conversations"
            accessibilityHint="Returns to the conversation list"
            accessibilityState={{ disabled: false }}
          >
            <Text style={styles.backBtn}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.channelTitle}>
            {activeChannel.name ??
              (activeChannel.type === "division"
                ? "Division Chat"
                : "Direct Message")}
          </Text>
        </View>
        <ChannelView channel={activeChannel} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={channels}
        keyExtractor={(c) => c.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.channelCard}
            onPress={() => setActiveChannel(item)}
            accessibilityRole="button"
            accessibilityLabel={`${item.name ?? (item.type === "division" ? "Division chat" : "Direct message")}${item.lastMessage ? `. Last message from ${item.lastMessage.senderName}: ${item.lastMessage.content}` : ""}`}
            accessibilityHint="Opens this conversation"
            accessibilityState={{ disabled: false }}
          >
            <Text style={styles.channelName}>
              {item.name ??
                (item.type === "division"
                  ? "🎾 Division Chat"
                  : "💬 Direct Message")}
            </Text>
            {item.lastMessage && (
              <Text style={styles.lastMessage} numberOfLines={1}>
                {item.lastMessage.senderName}: {item.lastMessage.content}
              </Text>
            )}
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          loading ? (
            <View style={styles.empty}>
              <ActivityIndicator color="#1a472a" />
              <Text style={styles.emptySubText}>Loading conversations…</Text>
            </View>
          ) : error ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>Couldn’t load conversations</Text>
              <TouchableOpacity
                style={styles.retryBtn}
                onPress={retry}
                accessibilityRole="button"
                accessibilityLabel="Retry loading conversations"
                accessibilityHint="Attempts to load your conversations again"
              >
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No conversations yet.</Text>
              <Text style={styles.emptySubText}>
                Tap Message to message a teammate.
              </Text>
            </View>
          )
        }
        contentContainerStyle={styles.channelList}
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={() => setShowNewDM(true)}
        accessibilityRole="button"
        accessibilityLabel="New message"
        accessibilityHint="Opens teammate search"
      >
        <Text style={styles.fabText}>+ Message</Text>
      </TouchableOpacity>

      <Modal visible={showNewDM} transparent animationType="slide">
        <KeyboardAwareBottomSheet style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New Direct Message</Text>
            <View style={styles.searchRow}>
              <TextInput
                style={[styles.input, styles.searchInput]}
                value={dmSearch}
                onChangeText={handleSearchDM}
                placeholder="Search teammates..."
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
              />
              {dmSearching && (
                <ActivityIndicator style={{ marginLeft: 8 }} color="#1a472a" />
              )}
            </View>
            {dmCreating && (
              <ActivityIndicator
                color="#1a472a"
                style={{ marginVertical: 12 }}
              />
            )}
            <FlatList
              data={dmResults}
              keyExtractor={(u) => u.id}
              style={{ maxHeight: 280 }}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.resultRow}
                  onPress={() => handleStartDM(item)}
                  disabled={dmCreating}
                  accessibilityRole="button"
                  accessibilityLabel={`Message ${item.displayName}`}
                  accessibilityHint="Starts a direct conversation"
                  accessibilityState={{ disabled: dmCreating }}
                >
                  <Text style={styles.resultName}>{item.displayName}</Text>
                  <Text style={styles.resultEmail}>Public profile</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                dmSearch.trim().length > 0 && !dmSearching ? (
                  <Text style={styles.noResults}>No teammates found.</Text>
                ) : null
              }
            />
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => {
                setShowNewDM(false);
                setDmSearch("");
                setDmResults([]);
              }}
              disabled={dmCreating}
              accessibilityRole="button"
              accessibilityLabel="Cancel new message"
              accessibilityHint="Closes teammate search"
              accessibilityState={{ disabled: dmCreating }}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAwareBottomSheet>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f5f0" },
  channelList: { padding: 16 },
  channelCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  channelName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1a1a1a",
    marginBottom: 4,
  },
  lastMessage: { fontSize: 13, color: "#888" },
  empty: { flex: 1, padding: 40, alignItems: "center" },
  emptyText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#555",
    marginBottom: 8,
  },
  emptySubText: { fontSize: 13, color: "#999", textAlign: "center" },
  channelHeader: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1a472a",
    padding: 16,
  },
  backBtn: { color: "#fff", fontSize: 16, marginRight: 16 },
  channelTitle: { color: "#fff", fontWeight: "700", fontSize: 16 },
  messageList: { padding: 16, paddingBottom: 8 },
  bubble: { maxWidth: "80%", padding: 12, borderRadius: 16, marginBottom: 8 },
  bubbleMe: {
    backgroundColor: "#1a472a",
    alignSelf: "flex-end",
    borderBottomRightRadius: 4,
  },
  bubbleThem: {
    backgroundColor: "#fff",
    alignSelf: "flex-start",
    borderBottomLeftRadius: 4,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  messageActionsBtn: {
    alignSelf: "flex-end",
    minWidth: 44,
    minHeight: 32,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
    marginRight: -8,
    marginBottom: -8,
  },
  messageActionsText: {
    color: "#555",
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 1,
  },
  bubbleText: { fontSize: 15, color: "#333" },
  bubbleTextMe: { color: "#fff" },
  senderName: {
    fontSize: 11,
    color: "#888",
    marginBottom: 4,
    fontWeight: "600",
  },
  contactActions: { flexDirection: "row", gap: 12, marginTop: 8 },
  contactLink: { color: "#1a472a", fontWeight: "700", fontSize: 13 },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: "#eee",
    backgroundColor: "#fff",
  },
  shareContactBtn: {
    minHeight: 44,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 4,
  },
  shareContactIcon: {
    width: 20,
    height: 16,
    borderWidth: 1.5,
    borderColor: "#1a472a",
    borderRadius: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  contactIconHead: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#1a472a",
    marginBottom: 1,
  },
  contactIconBody: {
    width: 10,
    height: 4,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
    backgroundColor: "#1a472a",
  },
  shareContactText: { color: "#1a472a", fontSize: 10, fontWeight: "700" },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 15,
    maxHeight: 100,
    marginRight: 8,
  },
  sendBtn: {
    backgroundColor: "#1a472a",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendText: { color: "#fff", fontWeight: "700" },
  sendError: {
    backgroundColor: "#fff3f1",
    borderTopWidth: 1,
    borderTopColor: "#f2c5bf",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  sendErrorText: { color: "#9f2d20", fontSize: 13, fontWeight: "700" },
  sendErrorHint: { color: "#9f2d20", fontSize: 12, marginTop: 2 },
  stateContainer: { padding: 32, alignItems: "center" },
  stateTitle: { color: "#555", fontSize: 16, fontWeight: "700" },
  stateText: { color: "#777", fontSize: 13, textAlign: "center", marginTop: 8 },
  retryBtn: {
    backgroundColor: "#1a472a",
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 9,
    marginTop: 12,
  },
  retryText: { color: "#fff", fontWeight: "700" },
  fab: {
    position: "absolute",
    bottom: 24,
    right: 20,
    backgroundColor: "#1a472a",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 28,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  fabText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    maxHeight: "80%",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1a472a",
    marginBottom: 16,
  },
  searchRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  searchInput: { flex: 1, marginBottom: 0 },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
  },
  resultRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  resultName: { fontSize: 15, fontWeight: "600", color: "#222" },
  resultEmail: { fontSize: 13, color: "#888", marginTop: 2 },
  noResults: {
    fontSize: 14,
    color: "#999",
    textAlign: "center",
    marginVertical: 12,
  },
  cancelBtn: { alignItems: "center", paddingVertical: 14, marginTop: 8 },
  cancelText: { color: "#888", fontSize: 15 },
  btnDisabled: { opacity: 0.5 },
  actionSheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  actionSheetCard: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 12,
    paddingBottom: 28,
  },
  actionSheetTitle: {
    textAlign: "center",
    color: "#999",
    fontSize: 12,
    fontWeight: "600",
    paddingVertical: 8,
  },
  actionSheetOption: {
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
    alignItems: "center",
  },
  actionSheetOptionText: { fontSize: 16, color: "#333", fontWeight: "500" },
  actionSheetOptionTextDestructive: {
    fontSize: 16,
    color: "#c0392b",
    fontWeight: "600",
  },
  reportPreview: {
    fontSize: 13,
    color: "#888",
    fontStyle: "italic",
    marginBottom: 16,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  chip: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipActive: { borderColor: "#1a472a", backgroundColor: "#e8f5e9" },
  chipText: { color: "#555", fontWeight: "600", fontSize: 13 },
  chipTextActive: { color: "#1a472a" },
  sendReportBtn: {
    backgroundColor: "#1a472a",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  sendReportBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
