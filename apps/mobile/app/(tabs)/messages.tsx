import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
  TextInput,
  Linking,
  Modal,
  ActivityIndicator,
  Alert,
  BackHandler,
  Platform,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getDoc } from "firebase/firestore";
import {
  useChannels,
  useMessages,
  sendMessage,
  getOrCreateDM,
  searchDivisionPlayers,
  reportMessage,
  blockUser,
  profileDoc,
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
import {
  AppIcon,
  IconLabel,
  ICON_COLOR,
  ICON_SIZE,
} from "../../components/AppIcon";
import { FormField } from "../../components/FormField";
import {
  Button,
  Chip,
  EmptyState,
  ErrorState,
  InlineAlert,
  LoadingState,
  MIN_TOUCH_TARGET,
  colors,
  confirmDestructive,
  describeError,
  elevations,
  hitSlopFor,
  radii,
  spacing,
  typography,
  useAsyncAction,
} from "../../theme";

const REPORT_REASONS: { value: MessageReportReason; label: string }[] = [
  { value: "harassment", label: "Harassment" },
  { value: "spam", label: "Spam" },
  { value: "inappropriate", label: "Inappropriate" },
  { value: "other", label: "Other" },
];

const CONTACT_SHARE_EXPLAINED_KEY = "messages.contactShareExplained";

/**
 * Display names for the other person in unnamed direct conversations, read
 * from their public profile. Falls back to "Direct message" when unreadable.
 */
function useDirectChannelNames(channels: Channel[], myId: string | undefined) {
  const [names, setNames] = useState<Record<string, string>>({});
  const wanted = channels
    .filter((c) => c.type !== "division" && !c.name)
    .map((c) => c.participantIds.find((id) => id !== myId))
    .filter((id): id is string => !!id);
  const key = Array.from(new Set(wanted)).sort().join(",");

  useEffect(() => {
    const ids = key ? key.split(",") : [];
    const missing = ids.filter((id) => !(id in names));
    if (missing.length === 0) return;
    let cancelled = false;
    Promise.all(
      missing.map((id) =>
        getDoc(profileDoc(id))
          .then((snap) =>
            snap.exists()
              ? ((snap.data() as { displayName?: string }).displayName ?? "")
              : "",
          )
          .catch(() => ""),
      ),
    ).then((results) => {
      if (cancelled) return;
      setNames((current) => {
        const next = { ...current };
        missing.forEach((id, i) => {
          next[id] = results[i];
        });
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
    // `names` is read only to skip ids already fetched.
  }, [key]);

  return (channel: Channel) => {
    if (channel.name) return channel.name;
    if (channel.type === "division") return "Division chat";
    const otherId = channel.participantIds.find((id) => id !== myId);
    return (otherId && names[otherId]) || "Direct message";
  };
}

function MessageBubble({
  message,
  isMe,
  onOpenActions,
}: {
  message: Message;
  isMe: boolean;
  onOpenActions?: () => void;
}) {
  const sender = isMe ? "You" : message.senderName;
  return (
    <View style={[styles.bubbleRow, isMe && styles.bubbleRowMe]}>
      <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
        <Pressable
          disabled={isMe || !onOpenActions}
          onLongPress={onOpenActions}
          delayLongPress={350}
          accessible
          accessibilityLabel={`${sender}: ${message.content}`}
          accessibilityHint={
            !isMe && onOpenActions
              ? "Long press, or use the report button, to report or block"
              : undefined
          }
        >
          {!isMe && <Text style={styles.senderName}>{message.senderName}</Text>}
          <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>
            {message.content}
          </Text>
        </Pressable>

        {/* Shared contact quick-actions */}
        {message.sharedContact && (
          <View style={styles.contactActions}>
            {message.sharedContact.phone && (
              <Pressable
                onPress={() =>
                  Linking.openURL(`tel:${message.sharedContact!.phone}`)
                }
                hitSlop={hitSlopFor(MIN_TOUCH_TARGET, 24)}
                accessibilityRole="button"
                accessibilityLabel={`Call ${message.senderName}`}
                accessibilityHint="Opens the phone app"
                style={styles.contactLinkTarget}
              >
                <IconLabel
                  name="phone"
                  color={isMe ? colors.onPrimary : colors.primary}
                  textStyle={[styles.contactLink, isMe && styles.contactLinkMe]}
                >
                  Call
                </IconLabel>
              </Pressable>
            )}
            {message.sharedContact.email && (
              <Pressable
                onPress={() =>
                  Linking.openURL(`mailto:${message.sharedContact!.email}`)
                }
                hitSlop={hitSlopFor(MIN_TOUCH_TARGET, 24)}
                accessibilityRole="button"
                accessibilityLabel={`Email ${message.senderName}`}
                accessibilityHint="Opens the email app"
                style={styles.contactLinkTarget}
              >
                <IconLabel
                  name="envelope"
                  color={isMe ? colors.onPrimary : colors.primary}
                  textStyle={[styles.contactLink, isMe && styles.contactLinkMe]}
                >
                  Email
                </IconLabel>
              </Pressable>
            )}
          </View>
        )}
      </View>

      {!isMe && onOpenActions && (
        <Pressable
          style={styles.messageActionsBtn}
          onPress={onOpenActions}
          android_ripple={{ color: colors.surfaceMuted, borderless: true }}
          accessibilityRole="button"
          accessibilityLabel={`Report or block ${message.senderName}`}
          accessibilityHint="Opens report and block actions for this message"
        >
          <AppIcon
            name="flag"
            size={ICON_SIZE.small}
            color={colors.textMuted}
          />
        </Pressable>
      )}
    </View>
  );
}

function ChannelView({ channel }: { channel: Channel }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const user = useAppStore((state) => state.user);
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
  const [notice, setNotice] = useState<string | null>(null);
  const [failed, setFailed] = useState<"text" | "contact" | null>(null);

  const blockedIds = new Set(user?.blockedUserIds ?? []);
  const messages = allMessages.filter(
    (m) => m.senderId === user?.id || !blockedIds.has(m.senderId),
  );

  const send = useAsyncAction(
    async (content: string) => {
      if (!user) return;
      await sendMessage({
        channelId: channel.id,
        senderId: user.id,
        senderName: user.displayName ?? "Unknown",
        content,
      });
      setText((draft) => (draft.trim() === content ? "" : draft));
    },
    {
      errorMessage: "Message not sent. Your draft is still here.",
      onSuccess: () => setFailed(null),
      onError: () => setFailed("text"),
    },
  );

  const shareContact = useAsyncAction(
    async (sharedContact: { phone?: string; email?: string }) => {
      if (!user) return;
      await sendMessage({
        channelId: channel.id,
        senderId: user.id,
        senderName: user.displayName ?? "Unknown",
        content: "Shared contact information",
        sharedContact,
      });
    },
    {
      successMessage: "Contact details shared",
      errorMessage: "Contact details not sent.",
      onSuccess: () => setFailed(null),
      onError: () => setFailed("contact"),
    },
  );

  const block = useAsyncAction(
    async (senderId: string, senderName: string) => {
      if (!user) return senderName;
      await blockUser(user.id, senderId);
      return senderName;
    },
    {
      successMessage: (name) => `${name} blocked`,
      errorMessage: (err) =>
        describeError(
          err,
          "Couldn't block this player. Check your connection and try again.",
        ),
      onSuccess: (name) =>
        setNotice(
          `You blocked ${name}. Their messages are hidden and won't notify you. Unblock them from your Profile.`,
        ),
    },
  );

  const report = useAsyncAction(
    async () => {
      if (!user || !reportMessageTarget) return;
      await reportMessage({
        channelId: channel.id,
        message: reportMessageTarget,
        reportedBy: user.id,
        reason: reportReason,
        note: reportNote,
        divisionId: user.divisionId,
      });
    },
    {
      successMessage: "Report sent",
      errorMessage: (err) =>
        describeError(
          err,
          "Couldn't send the report. Check your connection and try again.",
        ),
      onSuccess: () => {
        setReportMessageTarget(null);
        setNotice(
          "Report sent. A division leader will review the message. To stop seeing this player's messages, block them too.",
        );
      },
    },
  );

  const sending = send.pending || shareContact.pending;
  const sendError = send.error ?? shareContact.error;

  async function handleBlockSender() {
    if (!user || !actionMessage) return;
    const senderId = actionMessage.senderId;
    const senderName = actionMessage.senderName;
    setActionMessage(null);
    const ok = await confirmDestructive({
      title: `Block ${senderName}?`,
      message:
        "You won't see their messages or get notifications from them. They aren't told. You can unblock them from your Profile.",
      confirmLabel: "Block",
    });
    if (ok) void block.run(senderId, senderName);
  }

  function handleOpenReport() {
    if (!actionMessage) return;
    setReportMessageTarget(actionMessage);
    setReportReason("harassment");
    setReportNote("");
    report.reset();
    setActionMessage(null);
  }

  function closeReport() {
    if (report.pending) return;
    setReportMessageTarget(null);
    report.reset();
  }

  function handleSend() {
    const content = text.trim();
    if (!content || !user || sending) return;
    shareContact.reset();
    void send.run(content);
  }

  function sendContact() {
    if (!user) return;
    const sharedContact = {
      phone: user.contactPreferences?.allowSMS ? user.phone : undefined,
      email: user.contactPreferences?.allowEmail ? user.email : undefined,
    };
    if (!sharedContact.phone && !sharedContact.email) {
      Alert.alert(
        "Nothing to share yet",
        "Turn on email or phone sharing under Contact preferences in your Profile, then try again.",
      );
      return;
    }
    send.reset();
    void shareContact.run(sharedContact);
  }

  function retryFailed() {
    if (failed === "contact") sendContact();
    else handleSend();
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
        "Share your contact details?",
        "This sends the email and phone number you chose to share in your Profile. Everyone in this conversation can see them.",
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
              sendContact();
            },
          },
        ],
      );
      return;
    }
    sendContact();
  }

  const canSend = !!text.trim() && !sending;

  return (
    <KeyboardSafeView>
      {notice && (
        <InlineAlert
          tone="success"
          message={notice}
          actionLabel="Dismiss"
          onAction={() => setNotice(null)}
          style={styles.notice}
        />
      )}
      {block.error && (
        <InlineAlert
          tone="error"
          title="Couldn't block"
          message={block.error}
          actionLabel="Dismiss"
          onAction={block.reset}
          style={styles.notice}
        />
      )}
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
              onOpenActions={isMe ? undefined : () => setActionMessage(item)}
            />
          );
        }}
        contentContainerStyle={[
          styles.messageList,
          messages.length === 0 && styles.messageListEmpty,
        ]}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          loading ? (
            <LoadingState label="Loading messages" />
          ) : error ? (
            <ErrorState
              title="Couldn't load messages"
              message="Check your connection, then try again."
              onRetry={retry}
            />
          ) : (
            <EmptyState
              icon="bubble.left"
              title="No messages yet"
              message={
                channel.type === "division"
                  ? "Everyone in your division can read this chat. Say hello or find someone to play."
                  : "Send a message to set up a match."
              }
            />
          )
        }
        onContentSizeChange={() =>
          listRef.current?.scrollToEnd({ animated: false })
        }
      />
      {!!sendError && (
        <InlineAlert
          tone="error"
          message={sendError}
          actionLabel="Try again"
          onAction={retryFailed}
          style={styles.sendError}
        />
      )}
      <View
        style={[
          styles.inputRow,
          width < 360 && styles.inputRowCompact,
          { paddingBottom: Math.max(insets.bottom, spacing.sm) },
        ]}
      >
        <Pressable
          onPress={handleShareContact}
          style={styles.shareContactBtn}
          disabled={sending}
          android_ripple={{ color: colors.primarySoft, borderless: true }}
          accessibilityRole="button"
          accessibilityLabel="Share contact details"
          accessibilityHint="Sends the email and phone number you chose to share in your Profile"
          accessibilityState={{ disabled: sending, busy: shareContact.pending }}
        >
          {shareContact.pending ? (
            <ActivityIndicator color={colors.primary} size="small" />
          ) : (
            <AppIcon
              name="person.crop.rectangle.stack"
              size={ICON_SIZE.tab}
              color={ICON_COLOR.active}
            />
          )}
        </Pressable>
        <TextInput
          style={styles.textInput}
          value={text}
          onChangeText={setText}
          maxLength={2000}
          placeholder="Message"
          placeholderTextColor={colors.placeholder}
          accessibilityLabel="Message"
          multiline
        />
        <Pressable
          style={({ pressed }) => [
            styles.sendBtn,
            !canSend && styles.sendBtnDisabled,
            pressed && canSend && styles.sendBtnPressed,
          ]}
          onPress={handleSend}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel="Send message"
          accessibilityState={{
            disabled: !canSend,
            busy: send.pending,
          }}
        >
          {send.pending ? (
            <ActivityIndicator color={colors.onPrimary} size="small" />
          ) : (
            <Text style={styles.sendText}>Send</Text>
          )}
        </Pressable>
      </View>

      <Modal
        visible={!!actionMessage}
        transparent
        animationType="fade"
        onRequestClose={() => setActionMessage(null)}
      >
        <View style={styles.actionSheetOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setActionMessage(null)}
            accessibilityRole="button"
            accessibilityLabel="Close message actions"
          />
          <View
            style={[
              styles.actionSheetCard,
              { paddingBottom: Math.max(insets.bottom, spacing.lg) },
            ]}
            accessibilityViewIsModal
          >
            <Text style={styles.actionSheetTitle} accessibilityRole="header">
              Message from {actionMessage?.senderName}
            </Text>
            <Text style={styles.actionSheetPreview} numberOfLines={3}>
              {actionMessage?.content}
            </Text>
            <Pressable
              style={styles.actionSheetOption}
              onPress={handleOpenReport}
              android_ripple={{ color: colors.surfaceMuted }}
              accessibilityRole="button"
              accessibilityLabel="Report message"
              accessibilityHint="Sends this message to a division leader for review"
            >
              <IconLabel name="flag" textStyle={styles.actionSheetOptionText}>
                Report message
              </IconLabel>
            </Pressable>
            <Pressable
              style={styles.actionSheetOption}
              onPress={() => void handleBlockSender()}
              android_ripple={{ color: colors.surfaceMuted }}
              accessibilityRole="button"
              accessibilityLabel={`Block ${actionMessage?.senderName ?? "sender"}`}
              accessibilityHint="Hides their messages and notifications"
            >
              <IconLabel
                name="person.crop.circle.badge.xmark"
                color={ICON_COLOR.destructive}
                textStyle={styles.actionSheetOptionTextDestructive}
              >
                Block {actionMessage?.senderName}
              </IconLabel>
            </Pressable>
            <Pressable
              style={styles.actionSheetOption}
              onPress={() => setActionMessage(null)}
              android_ripple={{ color: colors.surfaceMuted }}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={styles.actionSheetOptionText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!reportMessageTarget}
        transparent
        animationType="slide"
        onRequestClose={closeReport}
      >
        <KeyboardAwareBottomSheet style={styles.modalOverlay}>
          <View
            style={[
              styles.modalCard,
              { paddingBottom: Math.max(insets.bottom, spacing.xl) },
            ]}
            accessibilityViewIsModal
          >
            <Text style={styles.modalTitle} accessibilityRole="header">
              Report message
            </Text>
            <Text style={styles.modalSubtitle}>
              A division leader will review it and can remove it.
            </Text>
            <Text style={styles.reportPreview} numberOfLines={4}>
              {reportMessageTarget?.senderName}: “{reportMessageTarget?.content}”
            </Text>
            <Text
              style={styles.groupLabel}
              accessibilityElementsHidden
              importantForAccessibility="no"
            >
              Reason
            </Text>
            <View
              style={styles.chipRow}
              accessibilityRole="radiogroup"
              accessibilityLabel="Reason"
            >
              {REPORT_REASONS.map((r) => (
                <Chip
                  key={r.value}
                  label={r.label}
                  selected={reportReason === r.value}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: reportReason === r.value }}
                  onPress={() => setReportReason(r.value)}
                />
              ))}
            </View>
            <FormField
              label="Details (optional)"
              value={reportNote}
              maxLength={1000}
              onChangeText={setReportNote}
              placeholder="What should the leader know?"
              multiline
              inputStyle={styles.reportNote}
            />
            {report.error && (
              <InlineAlert
                tone="error"
                title="Report not sent"
                message={report.error}
                style={styles.modalAlert}
              />
            )}
            <View style={styles.modalActions}>
              <Button
                label="Send report"
                pending={report.pending}
                pendingLabel="Sending…"
                fullWidth
                onPress={() => void report.run()}
              />
              <Button
                label="Cancel"
                accessibilityLabel="Cancel report"
                variant="quiet"
                disabled={report.pending}
                onPress={closeReport}
              />
            </View>
          </View>
        </KeyboardAwareBottomSheet>
      </Modal>
    </KeyboardSafeView>
  );
}

export default function MessagesScreen() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const user = useAppStore((state) => state.user);
  const divisionId = useAppStore((state) => state.divisionId);
  const { channels, loading, error, retry } = useChannels(user?.id ?? null);
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [showNewDM, setShowNewDM] = useState(false);
  const [dmSearch, setDmSearch] = useState("");
  const [dmResults, setDmResults] = useState<PublicProfile[]>([]);
  const [dmSearching, setDmSearching] = useState(false);
  const [dmSearchError, setDmSearchError] = useState(false);
  const searchSeq = useRef(0);
  const channelName = useDirectChannelNames(channels, user?.id);
  const blockedIds = new Set(user?.blockedUserIds ?? []);

  // System Back leaves the conversation instead of the tab.
  useEffect(() => {
    if (!activeChannel) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      setActiveChannel(null);
      return true;
    });
    return () => sub.remove();
  }, [activeChannel]);

  async function handleSearchDM(text: string) {
    setDmSearch(text);
    setDmSearchError(false);
    const seq = ++searchSeq.current;
    if (!divisionId || !text.trim()) {
      setDmResults([]);
      setDmSearching(false);
      return;
    }
    setDmSearching(true);
    try {
      // A direct conversation needs a shared active division, which roster-only players lack.
      const results = await searchDivisionPlayers(divisionId, text, {
        profilesOnly: true,
      });
      if (seq !== searchSeq.current) return;
      setDmResults(
        results.filter((u) => u.id !== user?.id && !blockedIds.has(u.id)),
      );
    } catch {
      if (seq !== searchSeq.current) return;
      setDmResults([]);
      setDmSearchError(true);
    } finally {
      if (seq === searchSeq.current) setDmSearching(false);
    }
  }

  const startDM = useAsyncAction(
    async (other: PublicProfile) => {
      if (!user) return null;
      return getOrCreateDM(user.id, other.id);
    },
    {
      errorMessage: (err) =>
        describeError(
          err,
          "Couldn't open the conversation. Check your connection and try again.",
        ),
      onError: (err) => console.error("Failed to create DM channel", err),
      onSuccess: (channel) => {
        if (!channel) return;
        closeNewDM();
        setActiveChannel(channel);
      },
    },
  );

  function closeNewDM() {
    setShowNewDM(false);
    setDmSearch("");
    setDmResults([]);
    setDmSearchError(false);
    searchSeq.current += 1;
    startDM.reset();
  }

  if (activeChannel) {
    const title = channelName(activeChannel);
    return (
      <View style={styles.flex}>
        <View
          style={[
            styles.channelHeader,
            { paddingTop: Math.max(insets.top, spacing.md) },
          ]}
        >
          <Pressable
            style={styles.backButtonTarget}
            onPress={() => setActiveChannel(null)}
            android_ripple={{
              color: "rgba(255,255,255,0.2)",
              borderless: true,
            }}
            accessibilityRole="button"
            accessibilityLabel="Back to conversations"
          >
            <Text style={styles.backBtn}>Back</Text>
          </Pressable>
          <Text
            style={styles.channelTitle}
            numberOfLines={2}
            accessibilityRole="header"
          >
            {title}
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
        renderItem={({ item }) => {
          const name = channelName(item);
          const last = item.lastMessage;
          const lastHidden = !!last && blockedIds.has(last.senderId);
          const preview = last
            ? lastHidden
              ? "Message from a blocked player"
              : `${last.senderId === user?.id ? "You" : last.senderName}: ${last.content}`
            : item.type === "division"
              ? "Your division's group chat"
              : "No messages yet";
          return (
            <Pressable
              style={({ pressed }) => [
                styles.channelCard,
                pressed && Platform.OS === "ios" && styles.channelCardPressed,
              ]}
              android_ripple={{ color: colors.surfaceMuted, foreground: true }}
              onPress={() => setActiveChannel(item)}
              accessibilityRole="button"
              accessibilityLabel={`${name}. ${preview}`}
              accessibilityHint="Opens this conversation"
            >
              <AppIcon
                name={
                  item.type === "division"
                    ? "person.crop.rectangle.stack"
                    : "bubble.left"
                }
                size={ICON_SIZE.tab}
                color={colors.primary}
              />
              <View style={styles.flex}>
                <Text style={styles.channelName} numberOfLines={1}>
                  {name}
                </Text>
                <Text
                  style={[styles.lastMessage, lastHidden && styles.lastHidden]}
                  numberOfLines={2}
                >
                  {preview}
                </Text>
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          loading ? (
            <LoadingState label="Loading conversations" />
          ) : error ? (
            <ErrorState
              title="Couldn't load conversations"
              message="Check your connection, then try again."
              onRetry={retry}
            />
          ) : (
            <EmptyState
              icon="bubble.left"
              title="No conversations yet"
              message="Message a player in your division to set up a match."
            />
          )
        }
        contentContainerStyle={[
          styles.channelList,
          channels.length === 0 && styles.channelListEmpty,
        ]}
      />

      <View
        style={[
          styles.newMessageBar,
          { paddingBottom: Math.max(insets.bottom, spacing.md) },
        ]}
      >
        <Button
          label="New message"
          icon="plus"
          accessibilityHint="Search for a player in your division to message"
          fullWidth={width < 360}
          style={styles.fab}
          onPress={() => setShowNewDM(true)}
        />
      </View>

      <Modal
        visible={showNewDM}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!startDM.pending) closeNewDM();
        }}
      >
        <KeyboardAwareBottomSheet style={styles.modalOverlay}>
          <View
            style={[
              styles.modalCard,
              { paddingBottom: Math.max(insets.bottom, spacing.xl) },
            ]}
            accessibilityViewIsModal
          >
            <Text style={styles.modalTitle} accessibilityRole="header">
              New message
            </Text>
            {!divisionId ? (
              <InlineAlert
                tone="info"
                message="Choose an active division on your Profile to message its players."
              />
            ) : (
              <FormField
                label="Find a player"
                helperText="Players in your active division."
                value={dmSearch}
                onChangeText={handleSearchDM}
                placeholder="Search by name"
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                returnKeyType="search"
              />
            )}
            {dmSearching && (
              <LoadingState inline showLabel label="Searching players" />
            )}
            {dmSearchError && (
              <InlineAlert
                tone="error"
                message="Couldn't search players. Check your connection and try again."
                actionLabel="Try again"
                onAction={() => void handleSearchDM(dmSearch)}
                style={styles.modalAlert}
              />
            )}
            {startDM.error && (
              <InlineAlert
                tone="error"
                message={startDM.error}
                style={styles.modalAlert}
              />
            )}
            <FlatList
              data={dmResults}
              keyExtractor={(u) => u.id}
              style={styles.resultList}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <Pressable
                  style={styles.resultRow}
                  onPress={() => void startDM.run(item)}
                  disabled={startDM.pending}
                  android_ripple={{ color: colors.surfaceMuted }}
                  accessibilityRole="button"
                  accessibilityLabel={`Message ${item.displayName}`}
                  accessibilityState={{
                    disabled: startDM.pending,
                    busy: startDM.pending,
                  }}
                >
                  <Text style={styles.resultName}>{item.displayName}</Text>
                  {startDM.pending ? (
                    <ActivityIndicator color={colors.primary} size="small" />
                  ) : (
                    <AppIcon
                      name="bubble.left"
                      size={ICON_SIZE.small}
                      color={colors.textMuted}
                    />
                  )}
                </Pressable>
              )}
              ListEmptyComponent={
                dmSearch.trim().length > 0 &&
                !dmSearching &&
                !dmSearchError ? (
                  <Text style={styles.noResults}>
                    No players match “{dmSearch.trim()}”. Check the spelling,
                    or try a first name.
                  </Text>
                ) : null
              }
            />
            <Button
              label="Cancel"
              accessibilityLabel="Cancel new message"
              variant="quiet"
              disabled={startDM.pending}
              onPress={closeNewDM}
            />
          </View>
        </KeyboardAwareBottomSheet>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: colors.canvas },
  channelList: { padding: spacing.lg, gap: spacing.sm },
  channelListEmpty: { flexGrow: 1 },
  channelCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.lg,
    minHeight: 64,
    overflow: Platform.OS === "android" ? "hidden" : "visible",
    ...elevations.low,
  },
  channelCardPressed: { backgroundColor: colors.surfaceMuted },
  channelName: {
    ...typography.subheading,
    color: colors.text,
    marginBottom: spacing.xxs,
  },
  lastMessage: { ...typography.bodySmall, color: colors.textMuted },
  lastHidden: { fontStyle: "italic" },
  channelHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
  },
  backBtn: { ...typography.label, fontSize: 16, color: colors.onPrimary },
  channelTitle: {
    ...typography.subheading,
    color: colors.onPrimary,
    flex: 1,
  },
  notice: { margin: spacing.md, marginBottom: 0 },
  messageList: { padding: spacing.lg, paddingBottom: spacing.sm },
  messageListEmpty: { flexGrow: 1, justifyContent: "center" },
  bubbleRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginBottom: spacing.sm,
    maxWidth: "88%",
    alignSelf: "flex-start",
  },
  bubbleRowMe: { alignSelf: "flex-end" },
  bubble: {
    flexShrink: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radii.lg,
  },
  bubbleMe: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: spacing.xs,
  },
  bubbleThem: {
    backgroundColor: colors.surface,
    borderBottomLeftRadius: spacing.xs,
    ...elevations.low,
  },
  messageActionsBtn: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
  },
  bubbleText: { ...typography.body, fontSize: 15, lineHeight: 21, color: colors.text },
  bubbleTextMe: { color: colors.onPrimary },
  senderName: {
    ...typography.caption,
    fontWeight: "600",
    color: colors.textMuted,
    marginBottom: spacing.xxs,
  },
  contactActions: {
    flexDirection: "row",
    gap: spacing.lg,
    marginTop: spacing.sm,
  },
  contactLinkTarget: { minHeight: 24, justifyContent: "center" },
  contactLink: { ...typography.label, color: colors.primary },
  contactLinkMe: { color: colors.onPrimary },
  sendError: { marginHorizontal: spacing.md, marginBottom: spacing.sm },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  inputRowCompact: { flexWrap: "wrap" },
  shareContactBtn: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    paddingHorizontal: spacing.lg - 2,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    ...typography.body,
    fontSize: 15,
    lineHeight: 20,
    color: colors.text,
    maxHeight: 120,
    minHeight: MIN_TOUCH_TARGET,
  },
  sendBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg + 2,
    borderRadius: radii.xl,
    minHeight: MIN_TOUCH_TARGET,
    minWidth: 72,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: { backgroundColor: colors.disabled },
  sendBtnPressed: { backgroundColor: colors.primaryPressed },
  sendText: { ...typography.label, fontSize: 15, color: colors.onPrimary },
  backButtonTarget: {
    minWidth: MIN_TOUCH_TARGET + spacing.lg,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  newMessageBar: {
    alignItems: "flex-end",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    backgroundColor: colors.canvas,
  },
  fab: { borderRadius: radii.pill, ...elevations.medium },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: spacing.xl,
    width: "100%",
    gap: spacing.sm,
  },
  modalTitle: { ...typography.heading, color: colors.primary },
  modalSubtitle: { ...typography.bodySmall, color: colors.textMuted },
  modalAlert: { marginTop: spacing.xs },
  modalActions: { gap: spacing.xs, marginTop: spacing.sm },
  groupLabel: { ...typography.label, color: colors.text, marginTop: spacing.xs },
  resultList: { maxHeight: 280 },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: MIN_TOUCH_TARGET + spacing.sm,
    paddingHorizontal: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  resultName: { ...typography.body, fontWeight: "600", color: colors.text },
  noResults: {
    ...typography.bodySmall,
    color: colors.textMuted,
    textAlign: "center",
    marginVertical: spacing.md,
  },
  actionSheetOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: "flex-end",
  },
  actionSheetCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  actionSheetTitle: {
    ...typography.label,
    textAlign: "center",
    color: colors.textMuted,
  },
  actionSheetPreview: {
    ...typography.bodySmall,
    textAlign: "center",
    color: colors.text,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.md,
  },
  actionSheetOption: {
    minHeight: 56,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  actionSheetOptionText: {
    ...typography.body,
    fontWeight: "500",
    color: colors.text,
  },
  actionSheetOptionTextDestructive: {
    ...typography.body,
    fontWeight: "600",
    color: colors.destructive,
  },
  reportPreview: {
    ...typography.bodySmall,
    color: colors.text,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    padding: spacing.md,
    fontStyle: "italic",
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  reportNote: { minHeight: 72 },
});
