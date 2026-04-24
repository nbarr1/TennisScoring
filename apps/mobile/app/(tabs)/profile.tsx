import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Switch,
  ScrollView, Alert, Linking
} from 'react-native';
import { signOut } from 'firebase/auth';
import { auth } from '@tennis/firebase-client';
import { useAuthUser, useUserProfile, updateUserProfile } from '@tennis/firebase-client';
import { useAppStore } from '../../store/appStore';

export default function ProfileScreen() {
  const { firebaseUser } = useAuthUser();
  const { profile, loading } = useUserProfile(firebaseUser?.uid ?? null);
  const { setUser } = useAppStore();

  const [editing, setEditing] = useState(false);
  const [phone, setPhone] = useState('');
  const [allowEmail, setAllowEmail] = useState(true);
  const [allowSMS, setAllowSMS] = useState(false);
  const [allowInApp, setAllowInApp] = useState(true);
  const [tipsEnabled, setTipsEnabled] = useState(true);

  useEffect(() => {
    if (!profile) return;
    setPhone(profile.phone ?? '');
    setAllowEmail(profile.contactPreferences?.allowEmail ?? true);
    setAllowSMS(profile.contactPreferences?.allowSMS ?? false);
    setAllowInApp(profile.contactPreferences?.allowInApp ?? true);
    setTipsEnabled(profile.tipsEnabled ?? true);
  }, [profile]);

  async function handleSave() {
    if (!firebaseUser) return;
    await updateUserProfile(firebaseUser.uid, {
      phone: phone.trim() || undefined,
      contactPreferences: { allowEmail, allowSMS, allowInApp },
      tipsEnabled,
    });
    setEditing(false);
  }

  async function handleSignOut() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await signOut(auth);
          setUser(null);
        },
      },
    ]);
  }

  if (loading || !profile) {
    return <View style={styles.center}><Text>Loading profile…</Text></View>;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>
          {(profile.displayName || firebaseUser?.displayName || '?')[0].toUpperCase()}
        </Text>
      </View>
      <Text style={styles.name}>{profile.displayName || firebaseUser?.displayName || 'Unknown'}</Text>
      <Text style={styles.email}>{profile.email || firebaseUser?.email || ''}</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Contact Information</Text>

        {editing ? (
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="Phone number (optional)"
            keyboardType="phone-pad"
          />
        ) : (
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Phone</Text>
            <Text style={styles.rowValue}>{profile.phone ?? 'Not set'}</Text>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Contact Preferences</Text>
        <Text style={styles.sectionSubtitle}>Choose how others can contact you</Text>

        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Share email with teammates</Text>
          <Switch
            value={allowEmail}
            onValueChange={setAllowEmail}
            disabled={!editing}
            trackColor={{ true: '#1a472a', false: '#ccc' }}
          />
        </View>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Share phone for SMS</Text>
          <Switch
            value={allowSMS}
            onValueChange={setAllowSMS}
            disabled={!editing}
            trackColor={{ true: '#1a472a', false: '#ccc' }}
          />
        </View>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Allow in-app messages</Text>
          <Switch
            value={allowInApp}
            onValueChange={setAllowInApp}
            disabled={!editing}
            trackColor={{ true: '#1a472a', false: '#ccc' }}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Match Settings</Text>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Live tips during matches</Text>
          <Switch
            value={tipsEnabled}
            onValueChange={setTipsEnabled}
            disabled={!editing}
            trackColor={{ true: '#1a472a', false: '#ccc' }}
          />
        </View>
      </View>

      <View style={styles.actions}>
        {editing ? (
          <>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Text style={styles.saveBtnText}>Save Changes</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditing(false)}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity style={styles.editBtn} onPress={() => setEditing(true)}>
            <Text style={styles.editBtnText}>Edit Profile</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
          <Text style={styles.signOutBtnText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f0' },
  content: { padding: 24 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#1a472a', justifyContent: 'center', alignItems: 'center', alignSelf: 'center', marginBottom: 12 },
  avatarText: { color: '#fff', fontSize: 32, fontWeight: '700' },
  name: { fontSize: 22, fontWeight: '700', color: '#1a1a1a', textAlign: 'center' },
  email: { fontSize: 14, color: '#888', textAlign: 'center', marginBottom: 32 },
  section: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 16 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1a472a', marginBottom: 4 },
  sectionSubtitle: { fontSize: 12, color: '#999', marginBottom: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  rowLabel: { color: '#666', fontSize: 14 },
  rowValue: { color: '#333', fontSize: 14, fontWeight: '500' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, fontSize: 14 },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  toggleLabel: { color: '#444', fontSize: 14, flex: 1, marginRight: 16 },
  actions: { gap: 12 },
  editBtn: { backgroundColor: '#1a472a', padding: 16, borderRadius: 12, alignItems: 'center' },
  editBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  saveBtn: { backgroundColor: '#1a472a', padding: 16, borderRadius: 12, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  cancelBtn: { padding: 16, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#ddd' },
  cancelBtnText: { color: '#555', fontWeight: '600', fontSize: 15 },
  signOutBtn: { padding: 16, borderRadius: 12, alignItems: 'center' },
  signOutBtnText: { color: '#c0392b', fontWeight: '600', fontSize: 15 },
});
