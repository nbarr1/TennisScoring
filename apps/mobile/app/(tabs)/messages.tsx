import React, { useState, useRef } from "react";
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
} from "@tennis/firebase-client";
import { useAppStore } from "../../store/appStore";
import type { Message, Channel, User } from "@tennis/shared";
import { KeyboardSafeView } from "../../components/KeyboardSafeView";

function MessageBubble({ message, isMe }: { message: Message; isMe: boolean }) {
  return (
    <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
      {!isMe && <Text style={styles.senderName}>{message.senderName}</Text>}
      <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>
        {message.content}
      </Text>

      {/* Shared contact quick-actions */}
      {message.sharedContact && (
        <View style={styles.contactActions}>
          {message.sharedContact.phone && (
            <TouchableOpacity
              onPress={() =>
                Linking.openURL(`tel:${message.sharedContact!.phone}`)
              }
            >
              <Text style={styles.contactLink}>📞 Call</Text>
            </TouchableOpacity>
          )}
          {message.sharedContact.email && (
            <TouchableOpacity
              onPress={() =>
                Linking.openURL(`mailto:${message.sharedContact!.email}`)
              }
            >
              <Text style={styles.contactLink}>✉️ Email</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

function ChannelView({ channel }: { channel: Channel }) {
  const { user } = useAppStore();
  const { messages } = useMessages(channel.id);
  const [text, setText] = useState("");
  const listRef = useRef<FlatList>(null);

  async function handleSend() {
    if (!text.trim() || !user) return;
    const content = text.trim();
    setText("");
    await sendMessage({
      channelId: channel.id,
      senderId: user.id,
      senderName: user.displayName ?? "Unknown",
      content,
    });
  }

  async function handleShareContact() {
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
    await sendMessage({
      channelId: channel.id,
      senderId: user.id,
      senderName: user.displayName ?? "Unknown",
      content: "Shared contact information",
      sharedContact,
    });
  }

  return (
    <KeyboardSafeView>
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => (
          <MessageBubble message={item} isMe={item.senderId === user?.id} />
        )}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={() =>
          listRef.current?.scrollToEnd({ animated: false })
        }
      />
      <View style={styles.inputRow}>
        <TouchableOpacity
          onPress={handleShareContact}
          style={styles.shareContactBtn}
        >
          <Text style={styles.shareContactText}>📇</Text>
        </TouchableOpacity>
        <TextInput
          style={styles.textInput}
          value={text}
          onChangeText={setText}
          placeholder="Message…"
          multiline
        />
        <TouchableOpacity
          style={[styles.sendBtn, !text.trim() && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!text.trim()}
        >
          <Text style={styles.sendText}>Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardSafeView>
  );
}

export default function MessagesScreen() {
  const { user, divisionId } = useAppStore();
  const { channels } = useChannels(user?.id ?? null);
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [showNewDM, setShowNewDM] = useState(false);
  const [dmSearch, setDmSearch] = useState("");
  const [dmResults, setDmResults] = useState<User[]>([]);
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
      setDmResults(results.filter((u) => u.id !== user?.id));
    } catch {
      setDmResults([]);
    } finally {
      setDmSearching(false);
    }
  }

  async function handleStartDM(other: User) {
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
          <TouchableOpacity onPress={() => setActiveChannel(null)}>
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
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No conversations yet.</Text>
            <Text style={styles.emptySubText}>
              Tap + to message a teammate.
            </Text>
          </View>
        }
        contentContainerStyle={styles.channelList}
      />

      <TouchableOpacity style={styles.fab} onPress={() => setShowNewDM(true)}>
        <Text style={styles.fabText}>+ Message</Text>
      </TouchableOpacity>

      <Modal visible={showNewDM} transparent animationType="slide">
        <KeyboardSafeView style={styles.modalKeyboardView}>
          <View style={styles.modalOverlay}>
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
                  <ActivityIndicator
                    style={{ marginLeft: 8 }}
                    color="#1a472a"
                  />
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
                  >
                    <Text style={styles.resultName}>{item.displayName}</Text>
                    <Text style={styles.resultEmail}>{item.email}</Text>
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
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardSafeView>
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
  shareContactBtn: { paddingHorizontal: 8, paddingBottom: 10 },
  shareContactText: { fontSize: 22 },
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
  modalKeyboardView: { flex: 1 },
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
});
