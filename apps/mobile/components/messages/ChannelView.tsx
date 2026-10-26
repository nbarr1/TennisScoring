import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "expo-router/react-navigation";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getDoc } from "firebase/firestore";
import {
  blockUser,
  profileDoc,
  reportMessage,
  sendMessage,
  useMessages,
} from "@tennis/firebase-client";
import type { Channel, Message, MessageReportReason } from "@tennis/shared";
import { useAppStore } from "../../store/appStore";
import { KeyboardSafeView } from "../KeyboardSafeView";
import { BottomSheetModal } from "../BottomSheetModal";
import { AppIcon, IconLabel, ICON_SIZE } from "../AppIcon";
import { FormField } from "../FormField";
import {
  Button,
  Chip,
  EmptyState,
  ErrorState,
  InlineAlert,
  LoadingState,
  MIN_TOUCH_TARGET,
  SHOWS_PRESSED_FILL,
  confirmDestructive,
  describeError,
  elevations,
  hitSlopFor,
  radii,
  spacing,
  typography,
  useAsyncAction,
  useColors,
  makeStyles,
  type ThemeColors,
  useContentWidth,
  useIsNarrowWindow,
} from "../../theme";

const REPORT_REASONS: { value: MessageReportReason; label: string }[] = [
  { value: "harassment", label: "Harassment" },
  { value: "spam", label: "Spam" },
  { value: "inappropriate", label: "Inappropriate" },
  { value: "other", label: "Other" },
];

const CONTACT_SHARE_EXPLAINED_KEY = "messages.contactShareExplained";

/**
 * Opens a shared phone number or email address. iPads and Wi-Fi tablets have
 * no phone app, and a device can lack a mail app, so a link that can't open
 * shows the number or address instead of failing silently.
 */
function openContactLink(kind: "phone" | "email", value: string) {
  const url = kind === "phone" ? `tel:${value}` : `mailto:${value}`;
  Linking.openURL(url).catch(() => {
    Alert.alert(
      kind === "phone" ? "Can't place a call here" : "Can't open an email app",
      kind === "phone"
        ? `This device can't make phone calls. The number is ${value}.`
        : `No email app is set up on this device. The address is ${value}.`,
    );
  });
}

/** "4:05 PM" today, "Tue 4:05 PM" this week, "Oct 12" before that. */
export function formatMessageTime(timestamp: number | undefined): string {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const now = new Date();
  const time = date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  if (date.toDateString() === now.toDateString()) return time;
  const days = (now.getTime() - date.getTime()) / 86400000;
  if (days < 6) {
    return `${date.toLocaleDateString(undefined, { weekday: "short" })} ${time}`;
  }
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  });
}

/**
 * Display names for the other person in unnamed direct conversations, read
 * from their public profile. Falls back to "Direct message" when unreadable.
 */
export function useDirectChannelNames(
  channels: Channel[],
  myId: string | undefined,
) {
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

/**
 * Memoized, and `onOpenActions` is stable and takes the message, so typing in
 * the composer or a new message arriving re-renders no other bubble.
 */
const MessageBubble = React.memo(function MessageBubble({
  message,
  isMe,
  onOpenActions,
}: {
  message: Message;
  isMe: boolean;
  onOpenActions?: (message: Message) => void;
}) {
  const colors = useColors();
  const styles = useStyles();
  const sender = isMe ? "You" : message.senderName;
  const sentAt = formatMessageTime(message.createdAt);
  const openActions =
    !isMe && onOpenActions ? () => onOpenActions(message) : undefined;
  return (
    <View style={[styles.bubbleRow, isMe && styles.bubbleRowMe]}>
      <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
        <Pressable
          disabled={!openActions}
          onLongPress={openActions}
          delayLongPress={350}
          accessible
          accessibilityLabel={`${sender}: ${message.content}${sentAt ? `. ${sentAt}` : ""}`}
          accessibilityHint={
            openActions
              ? "Long press, or use the report button, to report or block"
              : undefined
          }
        >
          {!isMe && <Text style={styles.senderName}>{message.senderName}</Text>}
          <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>
            {message.content}
          </Text>
          {sentAt ? (
            <Text style={[styles.bubbleTime, isMe && styles.bubbleTimeMe]}>
              {sentAt}
            </Text>
          ) : null}
        </Pressable>

        {/* Shared contact quick-actions */}
        {message.sharedContact && (
          <View style={styles.contactActions}>
            {message.sharedContact.phone && (
              <Pressable
                onPress={() =>
                  openContactLink("phone", message.sharedContact!.phone!)
                }
                hitSlop={hitSlopFor(MIN_TOUCH_TARGET, 24)}
                accessibilityRole="button"
                accessibilityLabel={`Call ${message.senderName}`}
                accessibilityHint="Opens the phone app"
                android_ripple={{
                  color: isMe ? colors.rippleOnFill : colors.ripple,
                  borderless: true,
                }}
                style={({ pressed }) => [
                  styles.contactLinkTarget,
                  SHOWS_PRESSED_FILL && pressed && styles.contactLinkPressed,
                ]}
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
                  openContactLink("email", message.sharedContact!.email!)
                }
                hitSlop={hitSlopFor(MIN_TOUCH_TARGET, 24)}
                accessibilityRole="button"
                accessibilityLabel={`Email ${message.senderName}`}
                accessibilityHint="Opens the email app"
                android_ripple={{
                  color: isMe ? colors.rippleOnFill : colors.ripple,
                  borderless: true,
                }}
                style={({ pressed }) => [
                  styles.contactLinkTarget,
                  SHOWS_PRESSED_FILL && pressed && styles.contactLinkPressed,
                ]}
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

      {openActions && (
        <Pressable
          style={styles.messageActionsBtn}
          onPress={openActions}
          android_ripple={{ color: colors.ripple, borderless: true }}
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
});

/**
 * One conversation: the message list, the composer, and the report and block
 * actions. It is the body of the `conversation/[channelId]` route, so the
 * stack owns the header, the back gesture, and the push transition.
 */
export function ChannelView({
  channelId,
  channelType,
}: {
  channelId: string;
  /** Picks the empty-state copy; unknown until the channel list loads. */
  channelType?: Channel["type"];
}) {
  const colors = useColors();
  const styles = useStyles();
  // The whole conversation (list and composer) centers at the form width on
  // a tablet. Undefined on phones.
  const contentWidth = useContentWidth();
  // Wraps the composer onto two lines on a narrow window or at large text.
  const narrow = useIsNarrowWindow(360);
  const insets = useSafeAreaInsets();
  // The stack header sits above this view, and iOS keyboard avoidance
  // measures from the view's own top, so the header height is the offset.
  // Android resizes the window for the keyboard itself (edge-to-edge), so the
  // existing height behavior there is left as it was.
  const headerHeight = useHeaderHeight();
  const keyboardOffset = Platform.OS === "ios" ? headerHeight : 0;
  const user = useAppStore((state) => state.user);
  const userId = user?.id;
  const {
    messages: allMessages,
    loading,
    error,
    retry,
    hasOlder,
    loadingOlder,
    loadOlder,
  } = useMessages(channelId);
  const [text, setText] = useState("");
  const listRef = useRef<FlatList<Message>>(null);
  const [actionMessage, setActionMessage] = useState<Message | null>(null);
  const [reportMessageTarget, setReportMessageTarget] =
    useState<Message | null>(null);
  const [reportReason, setReportReason] =
    useState<MessageReportReason>("harassment");
  const [reportNote, setReportNote] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [failed, setFailed] = useState<"text" | "contact" | null>(null);

  const blockedKey = (user?.blockedUserIds ?? []).join(",");
  const messages = useMemo(() => {
    const blockedIds = new Set(blockedKey ? blockedKey.split(",") : []);
    return allMessages.filter(
      (m) => m.senderId === userId || !blockedIds.has(m.senderId),
    );
  }, [allMessages, blockedKey, userId]);

  const send = useAsyncAction(
    async (content: string) => {
      if (!user) return;
      await sendMessage({
        channelId,
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
        channelId,
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
        channelId,
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

  async function blockSender(target: Message) {
    if (!user) return;
    const ok = await confirmDestructive({
      title: `Block ${target.senderName}?`,
      message:
        "You won't see their messages or get notifications from them. They aren't told. You can unblock them from your Profile.",
      confirmLabel: "Block",
    });
    if (ok) void block.run(target.senderId, target.senderName);
  }

  function openReport(target: Message) {
    setReportMessageTarget(target);
    setReportReason("harassment");
    setReportNote("");
    report.reset();
  }

  function handleBlockSender() {
    const target = actionMessage;
    setActionMessage(null);
    if (target) void blockSender(target);
  }

  function handleOpenReport() {
    const target = actionMessage;
    setActionMessage(null);
    if (target) openReport(target);
  }

  // iOS shows the system action sheet; Android shows a Material-style
  // bottom sheet (below). Both offer the same two actions.
  const openActionsRef = useRef<(message: Message) => void>(() => undefined);
  openActionsRef.current = (message: Message) => {
    if (Platform.OS !== "ios") {
      setActionMessage(message);
      return;
    }
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: `Message from ${message.senderName}`,
        message: message.content.slice(0, 200),
        options: ["Report message", `Block ${message.senderName}`, "Cancel"],
        destructiveButtonIndex: 1,
        cancelButtonIndex: 2,
      },
      (index) => {
        if (index === 0) openReport(message);
        else if (index === 1) void blockSender(message);
      },
    );
  };
  const onOpenActions = useCallback(
    (message: Message) => openActionsRef.current(message),
    [],
  );

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

  const renderItem = useCallback(
    ({ item }: { item: Message }) => (
      <MessageBubble
        message={item}
        isMe={item.senderId === userId}
        onOpenActions={onOpenActions}
      />
    ),
    [userId, onOpenActions],
  );
  // Follow the conversation's end only when its last message changes (or on
  // first load). Older messages arrive above the reader, and following the end
  // then would throw them past what they asked to read.
  const lastMessageId = messages[messages.length - 1]?.id;
  const followedId = useRef<string | undefined>(undefined);
  const scrollToEnd = useCallback(() => {
    if (followedId.current !== undefined && followedId.current === lastMessageId) return;
    followedId.current = lastMessageId;
    listRef.current?.scrollToEnd({ animated: false });
  }, [lastMessageId]);
  const listHeader = useMemo(
    () =>
      hasOlder ? (
        <Button
          label="Load older messages"
          variant="secondary"
          size="compact"
          pending={loadingOlder}
          pendingLabel="Loading…"
          onPress={loadOlder}
          style={styles.olderButton}
        />
      ) : null,
    [hasOlder, loadingOlder, loadOlder, styles],
  );
  const isEmpty = messages.length === 0;
  const listContentStyle = useMemo(
    () => [styles.messageList, isEmpty && styles.messageListEmpty],
    [styles, isEmpty],
  );
  const listEmpty = useMemo(
    () =>
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
            channelType === "division"
              ? "Everyone in your division can read this chat. Say hello or find someone to play."
              : "Send a message to set up a match."
          }
        />
      ),
    [loading, error, retry, channelType],
  );

  return (
    <KeyboardSafeView
      style={[styles.container, contentWidth]}
      keyboardVerticalOffset={keyboardOffset}
    >
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
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        contentContainerStyle={listContentStyle}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={listEmpty}
        ListHeaderComponent={listHeader}
        // Keeps the message the reader was on in place as older ones are
        // added above it.
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        onContentSizeChange={scrollToEnd}
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
          narrow && styles.inputRowCompact,
          { paddingBottom: Math.max(insets.bottom, spacing.sm) },
        ]}
      >
        <Pressable
          onPress={handleShareContact}
          style={styles.shareContactBtn}
          disabled={sending}
          android_ripple={{ color: colors.ripple, borderless: true }}
          accessibilityRole="button"
          accessibilityLabel="Share contact details"
          accessibilityHint="Sends the email and phone number you chose to share in your Profile"
          accessibilityState={{ disabled: sending, busy: shareContact.pending }}
        >
          {shareContact.pending ? (
            <ActivityIndicator color={colors.primary} size="small" />
          ) : (
            <AppIcon
              name="person.crop.circle"
              size={ICON_SIZE.tab}
              color={colors.primary}
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
            !canSend && !send.pending && styles.sendBtnDisabled,
            SHOWS_PRESSED_FILL && pressed && canSend && styles.sendBtnPressed,
          ]}
          android_ripple={canSend ? { color: colors.rippleOnFill, foreground: true } : undefined}
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

      {/* Android: a Material-style bottom sheet of actions. iOS uses
          ActionSheetIOS (above) and never opens this. */}
      <BottomSheetModal
        visible={!!actionMessage}
        onRequestClose={() => setActionMessage(null)}
        backdropLabel="Close message actions"
        keyboardAware={false}
        cardStyle={[
          styles.actionSheetCard,
          { paddingBottom: Math.max(insets.bottom, spacing.lg) },
        ]}
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
          android_ripple={{ color: colors.ripple }}
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
          onPress={handleBlockSender}
          android_ripple={{ color: colors.ripple }}
          accessibilityRole="button"
          accessibilityLabel={`Block ${actionMessage?.senderName ?? "sender"}`}
          accessibilityHint="Hides their messages and notifications"
        >
          <IconLabel
            name="person.crop.circle.badge.xmark"
            color={colors.iconDestructive}
            textStyle={styles.actionSheetOptionTextDestructive}
          >
            Block {actionMessage?.senderName}
          </IconLabel>
        </Pressable>
      </BottomSheetModal>

      <BottomSheetModal
        visible={!!reportMessageTarget}
        onRequestClose={closeReport}
        cardStyle={styles.modalCard}
      >
        <Text style={styles.modalTitle} accessibilityRole="header">
          Report message
        </Text>
        <Text style={styles.modalSubtitle}>
          A division leader will review it and can remove it.
        </Text>
        <Text style={styles.reportPreview} numberOfLines={4}>
          {reportMessageTarget?.senderName}: "{reportMessageTarget?.content}"
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
      </BottomSheetModal>
    </KeyboardSafeView>
  );
}

function keyExtractor(message: Message) {
  return message.id;
}

/** The sheet card shared by the Messages screens. */
function sheetCardStyleFor(colors: ThemeColors) {
  return {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: spacing.xl,
    width: "100%",
    gap: spacing.sm,
  } as const;
}

/** `sheetCardStyle` for the current color scheme. */
export const useSheetCardStyle = makeStyles(sheetCardStyleFor);

const useStyles = makeStyles((colors) =>
  StyleSheet.create({
    container: { backgroundColor: colors.canvas },
    bubbleTime: {
      ...typography.caption,
      color: colors.textMuted,
      marginTop: spacing.xxs,
      alignSelf: "flex-end",
    },
    // White at 85% on Clubhouse Green stays above 8:1; the dark scheme's
    // dark green at 80% on light Clubhouse Green measures 5.7:1.
    bubbleTimeMe: { color: colors.onPrimaryMuted },
    notice: { margin: spacing.md, marginBottom: 0 },
    messageList: { padding: spacing.lg, paddingBottom: spacing.sm },
    messageListEmpty: { flexGrow: 1, justifyContent: "center" },
    olderButton: { alignSelf: "center", marginBottom: spacing.md },
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
      // The tail corner follows the reading direction.
      borderBottomEndRadius: spacing.xs,
    },
    bubbleThem: {
      backgroundColor: colors.surface,
      borderBottomStartRadius: spacing.xs,
      ...elevations.low,
    },
    messageActionsBtn: {
      width: MIN_TOUCH_TARGET,
      height: MIN_TOUCH_TARGET,
      alignItems: "center",
      justifyContent: "center",
    },
    bubbleText: {
      ...typography.body,
      fontSize: 15,
      lineHeight: 21,
      color: colors.text,
    },
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
    contactLinkPressed: { opacity: 0.6 },
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
      borderColor: colors.borderStrong,
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
      overflow: "hidden",
      minHeight: MIN_TOUCH_TARGET,
      minWidth: 72,
      alignItems: "center",
      justifyContent: "center",
    },
    // The same faded green as a disabled Button. A gray fill under the white
    // label measured 1.6:1, which read as no label at all.
    sendBtnDisabled: { opacity: 0.52 },
    sendBtnPressed: { backgroundColor: colors.primaryPressed },
    sendText: { ...typography.label, fontSize: 15, color: colors.onPrimary },
    modalCard: sheetCardStyleFor(colors),
    modalTitle: { ...typography.heading, color: colors.primary },
    modalSubtitle: { ...typography.bodySmall, color: colors.textMuted },
    modalAlert: { marginTop: spacing.xs },
    modalActions: { gap: spacing.xs, marginTop: spacing.sm },
    groupLabel: { ...typography.label, color: colors.text, marginTop: spacing.xs },
    // Material bottom sheet: start-aligned rows under a short heading.
    actionSheetCard: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radii.xl,
      borderTopRightRadius: radii.xl,
      paddingHorizontal: spacing.sm,
    },
    actionSheetTitle: {
      ...typography.label,
      color: colors.textMuted,
      paddingHorizontal: spacing.lg,
    },
    actionSheetPreview: {
      ...typography.bodySmall,
      color: colors.text,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.xs,
      paddingBottom: spacing.sm,
    },
    actionSheetOption: {
      minHeight: 56,
      paddingHorizontal: spacing.lg,
      justifyContent: "center",
      borderRadius: radii.md,
      overflow: "hidden",
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
  }),
);
