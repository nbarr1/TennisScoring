import React, { useRef, useState } from "react";
import { useRouter } from "expo-router";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
} from "react-native";
import {
  useChannels,
  getOrCreateDM,
  searchDivisionPlayers,
} from "@tennis/firebase-client";
import { useAppStore } from "../../store/appStore";
import type { Channel, PublicProfile } from "@tennis/shared";
import { BottomSheetModal } from "../../components/BottomSheetModal";
import {
  formatMessageTime,
  useSheetCardStyle,
  useDirectChannelNames,
} from "../../components/messages/ChannelView";
import { AppIcon, ICON_SIZE } from "../../components/AppIcon";
import { FormField } from "../../components/FormField";
import {
  Button,
  EmptyState,
  ErrorState,
  InlineAlert,
  LoadingState,
  MIN_TOUCH_TARGET,
  describeError,
  elevations,
  radii,
  spacing,
  typography,
  useAsyncAction,
  useColors,
  makeStyles,
  useContentWidth,
} from "../../theme";

export default function MessagesScreen() {
  const colors = useColors();
  const styles = useStyles();
  const sheetCardStyle = useSheetCardStyle();
  const contentWidth = useContentWidth();
  const { width } = useWindowDimensions();
  const router = useRouter();
  const user = useAppStore((state) => state.user);
  const divisionId = useAppStore((state) => state.divisionId);
  const { channels, loading, error, retry } = useChannels(user?.id ?? null);
  const [showNewDM, setShowNewDM] = useState(false);
  const [dmSearch, setDmSearch] = useState("");
  const [dmResults, setDmResults] = useState<PublicProfile[]>([]);
  const [dmSearching, setDmSearching] = useState(false);
  const [dmSearchError, setDmSearchError] = useState(false);
  const searchSeq = useRef(0);
  const channelName = useDirectChannelNames(channels, user?.id);
  const blockedIds = new Set(user?.blockedUserIds ?? []);

  // A conversation is its own stack route, so iOS edge-swipe back, Android
  // predictive Back, and the push transition all come from the navigator.
  function openChannel(channel: Channel, title = channelName(channel)) {
    router.push({
      pathname: "/conversation/[channelId]",
      params: { channelId: channel.id, title },
    });
  }

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
        openChannel(channel);
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

  return (
    <View style={styles.container}>
      <FlatList
        data={channels}
        keyExtractor={(c) => c.id}
        renderItem={({ item }) => {
          const name = channelName(item);
          const last = item.lastMessage;
          const lastHidden = !!last && blockedIds.has(last.senderId);
          const lastAt = last ? formatMessageTime(last.timestamp) : "";
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
              onPress={() => openChannel(item, name)}
              accessibilityRole="button"
              accessibilityLabel={`${name}. ${preview}${lastAt ? `. ${lastAt}` : ""}`}
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
                <View style={styles.channelNameRow}>
                  <Text style={styles.channelName} numberOfLines={1}>
                    {name}
                  </Text>
                  {lastAt ? (
                    <Text style={styles.channelTime}>{lastAt}</Text>
                  ) : null}
                </View>
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
          contentWidth,
        ]}
      />

      {/* The tab bar below already owns the home-indicator inset. */}
      <View style={[styles.newMessageBar, contentWidth]}>
        <Button
          label="New message"
          icon="plus"
          accessibilityHint="Search for a player in your division to message"
          fullWidth={width < 360}
          style={styles.fab}
          onPress={() => setShowNewDM(true)}
        />
      </View>

      <BottomSheetModal
        visible={showNewDM}
        onRequestClose={() => {
          if (!startDM.pending) closeNewDM();
        }}
        cardStyle={sheetCardStyle}
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
        {/* The sheet already scrolls and a division search returns a short
            list, so the rows render directly rather than in a nested
            virtualized list (the link-opponent sheet does the same). */}
        <View>
          {dmResults.map((item) => (
            <Pressable
              key={item.id}
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
          ))}
          {dmResults.length === 0 &&
          dmSearch.trim().length > 0 &&
          !dmSearching &&
          !dmSearchError ? (
            <Text style={styles.noResults}>
              No players match “{dmSearch.trim()}”. Check the spelling, or
              try a first name.
            </Text>
          ) : null}
        </View>
        <Button
          label="Cancel"
          accessibilityLabel="Cancel new message"
          variant="quiet"
          disabled={startDM.pending}
          onPress={closeNewDM}
        />
      </BottomSheetModal>
    </View>
  );
}

const useStyles = makeStyles((colors) =>
  StyleSheet.create({
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
    channelNameRow: {
      flexDirection: "row",
      alignItems: "baseline",
      gap: spacing.sm,
      marginBottom: spacing.xxs,
    },
    channelName: {
      ...typography.subheading,
      color: colors.text,
      flexShrink: 1,
    },
    channelTime: { ...typography.caption, color: colors.textMuted, marginLeft: "auto" },
    lastMessage: { ...typography.bodySmall, color: colors.textMuted },
    lastHidden: { fontStyle: "italic" },
    newMessageBar: {
      alignItems: "flex-end",
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.md,
      backgroundColor: colors.canvas,
    },
    fab: { borderRadius: radii.pill, ...elevations.medium },
    modalTitle: { ...typography.heading, color: colors.primary },
    modalAlert: { marginTop: spacing.xs },
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
  }),
);
