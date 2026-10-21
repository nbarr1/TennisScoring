import React from "react";
import { Stack, useLocalSearchParams } from "expo-router";
import { useChannels } from "@tennis/firebase-client";
import { useAppStore } from "../../store/appStore";
import {
  ChannelView,
  useDirectChannelNames,
} from "../../components/messages/ChannelView";
import { EmptyState } from "../../theme";

/**
 * One conversation, pushed onto the root stack from the Messages tab or a
 * message notification. Being a real route is what gives it the iOS
 * edge-swipe back, Android predictive Back, and the push transition.
 *
 * `title` is passed by the Messages tab so the header is right on the first
 * frame; the channel list (already subscribed by the tab) refines it.
 */
export default function ConversationScreen() {
  const params = useLocalSearchParams<{
    channelId?: string | string[];
    title?: string | string[];
  }>();
  const channelId = Array.isArray(params.channelId)
    ? params.channelId[0]
    : params.channelId;
  const passedTitle = Array.isArray(params.title)
    ? params.title[0]
    : params.title;
  const userId = useAppStore((state) => state.user?.id);
  const { channels } = useChannels(userId ?? null);
  const channelName = useDirectChannelNames(channels, userId);
  const channel = channels.find((c) => c.id === channelId);
  // A direct channel reads "Direct message" until the other player's profile
  // loads; the title the tab already resolved is better in the meantime.
  const resolved = channel ? channelName(channel) : undefined;
  const title =
    resolved && resolved !== "Direct message"
      ? resolved
      : passedTitle || resolved || "Conversation";

  if (!channelId) {
    return (
      <>
        <Stack.Screen options={{ title: "Conversation" }} />
        <EmptyState
          icon="bubble.left"
          title="Conversation not found"
          message="Go back to Messages and open it from the list."
        />
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title }} />
      <ChannelView channelId={channelId} channelType={channel?.type} />
    </>
  );
}
