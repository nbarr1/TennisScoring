import React, { useState, useRef } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, Linking
} from 'react-native';
import { useChannels, useMessages, sendMessage } from '@tennis/firebase-client';
import { useAppStore } from '../../store/appStore';
import type { Message, Channel } from '@tennis/shared';

function MessageBubble({ message, isMe }: { message: Message; isMe: boolean }) {
  return (
    <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
      {!isMe && <Text style={styles.senderName}>{message.senderName}</Text>}
      <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>{message.content}</Text>

      {/* Shared contact quick-actions */}
      {message.sharedContact && (
        <View style={styles.contactActions}>
          {message.sharedContact.phone && (
            <TouchableOpacity onPress={() => Linking.openURL(`tel:${message.sharedContact!.phone}`)}>
              <Text style={styles.contactLink}>📞 Call</Text>
            </TouchableOpacity>
          )}
          {message.sharedContact.email && (
            <TouchableOpacity onPress={() => Linking.openURL(`mailto:${message.sharedContact!.email}`)}>
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
  const [text, setText] = useState('');
  const listRef = useRef<FlatList>(null);

  async function handleSend() {
    if (!text.trim() || !user) return;
    const content = text.trim();
    setText('');
    await sendMessage({
      channelId: channel.id,
      senderId: user.id,
      senderName: user.displayName,
      content,
    });
  }

  async function handleShareContact() {
    if (!user) return;
    await sendMessage({
      channelId: channel.id,
      senderId: user.id,
      senderName: user.displayName,
      content: 'Shared contact information',
      sharedContact: {
        phone: user.contactPreferences.allowSMS ? user.phone : undefined,
        email: user.contactPreferences.allowEmail ? user.email : undefined,
      },
    });
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => (
          <MessageBubble message={item} isMe={item.senderId === user?.id} />
        )}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
      />
      <View style={styles.inputRow}>
        <TouchableOpacity onPress={handleShareContact} style={styles.shareContactBtn}>
          <Text style={styles.shareContactText}>📇</Text>
        </TouchableOpacity>
        <TextInput
          style={styles.textInput}
          value={text}
          onChangeText={setText}
          placeholder="Message…"
          multiline
        />
        <TouchableOpacity style={[styles.sendBtn, !text.trim() && styles.sendBtnDisabled]} onPress={handleSend} disabled={!text.trim()}>
          <Text style={styles.sendText}>Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

export default function MessagesScreen() {
  const { user } = useAppStore();
  const { channels } = useChannels(user?.id ?? null);
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);

  if (activeChannel) {
    return (
      <View style={{ flex: 1 }}>
        <View style={styles.channelHeader}>
          <TouchableOpacity onPress={() => setActiveChannel(null)}>
            <Text style={styles.backBtn}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.channelTitle}>
            {activeChannel.name ?? (activeChannel.type === 'division' ? 'Division Chat' : 'Direct Message')}
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
          <TouchableOpacity style={styles.channelCard} onPress={() => setActiveChannel(item)}>
            <Text style={styles.channelName}>
              {item.name ?? (item.type === 'division' ? '🎾 Division Chat' : '💬 Direct Message')}
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
            <Text style={styles.emptySubText}>Channels are created when you join a division.</Text>
          </View>
        }
        contentContainerStyle={styles.channelList}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f0' },
  channelList: { padding: 16 },
  channelCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  channelName: { fontSize: 16, fontWeight: '700', color: '#1a1a1a', marginBottom: 4 },
  lastMessage: { fontSize: 13, color: '#888' },
  empty: { flex: 1, padding: 40, alignItems: 'center' },
  emptyText: { fontSize: 16, fontWeight: '600', color: '#555', marginBottom: 8 },
  emptySubText: { fontSize: 13, color: '#999', textAlign: 'center' },
  channelHeader: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a472a', padding: 16 },
  backBtn: { color: '#fff', fontSize: 16, marginRight: 16 },
  channelTitle: { color: '#fff', fontWeight: '700', fontSize: 16 },
  messageList: { padding: 16, paddingBottom: 8 },
  bubble: { maxWidth: '80%', padding: 12, borderRadius: 16, marginBottom: 8 },
  bubbleMe: { backgroundColor: '#1a472a', alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  bubbleThem: { backgroundColor: '#fff', alignSelf: 'flex-start', borderBottomLeftRadius: 4, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 3, elevation: 1 },
  bubbleText: { fontSize: 15, color: '#333' },
  bubbleTextMe: { color: '#fff' },
  senderName: { fontSize: 11, color: '#888', marginBottom: 4, fontWeight: '600' },
  contactActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  contactLink: { color: '#1a472a', fontWeight: '700', fontSize: 13 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', padding: 10, borderTopWidth: 1, borderTopColor: '#eee', backgroundColor: '#fff' },
  shareContactBtn: { paddingHorizontal: 8, paddingBottom: 10 },
  shareContactText: { fontSize: 22 },
  textInput: { flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, fontSize: 15, maxHeight: 100, marginRight: 8 },
  sendBtn: { backgroundColor: '#1a472a', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 },
  sendBtnDisabled: { opacity: 0.4 },
  sendText: { color: '#fff', fontWeight: '700' },
});
