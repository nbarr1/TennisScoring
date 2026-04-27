import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Switch,
  ScrollView, Alert, Linking
} from 'react-native';
import { signOut } from 'firebase/auth';
import { auth } from '@tennis/firebase-client';
import { useAuthUser, useUserProfile, updateUserProfile } from '@tennis/firebase-client';
import { DAYS_OF_WEEK, DAY_LABELS, type AvailabilitySlot, type DayOfWeek } from '@tennis/shared';
import { useAppStore } from '../../store/appStore';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

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
  const [availabilitySlots, setAvailabilitySlots] = useState<AvailabilitySlot[]>([]);
  const [availabilityNote, setAvailabilityNote] = useState('');

  useEffect(() => {
    if (!profile) return;
    setPhone(profile.phone ?? '');
    setAllowEmail(profile.contactPreferences?.allowEmail ?? true);
    setAllowSMS(profile.contactPreferences?.allowSMS ?? false);
    setAllowInApp(profile.contactPreferences?.allowInApp ?? true);
    setTipsEnabled(profile.tipsEnabled ?? true);
    setAvailabilitySlots(profile.availability?.slots ?? []);
    setAvailabilityNote(profile.availability?.note ?? '');
  }, [profile]);

  function addSlot() {
    setAvailabilitySlots((s) => [...s, { day: 'mon', from: '18:00', to: '21:00' }]);
  }
  function updateSlot(idx: number, patch: Partial<AvailabilitySlot>) {
    setAvailabilitySlots((slots) => slots.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }
  function removeSlot(idx: number) {
    setAvailabilitySlots((slots) => slots.filter((_, i) => i !== idx));
  }
  function cycleDay(idx: number) {
    setAvailabilitySlots((slots) => slots.map((s, i) => {
      if (i !== idx) return s;
      const next = DAYS_OF_WEEK[(DAYS_OF_WEEK.indexOf(s.day) + 1) % DAYS_OF_WEEK.length];
      return { ...s, day: next };
    }));
  }

  async function handleSave() {
    if (!firebaseUser) return;
    for (const slot of availabilitySlots) {
      if (!TIME_RE.test(slot.from) || !TIME_RE.test(slot.to)) {
        Alert.alert('Invalid time', 'Times must be in HH:MM 24-hour format.');
        return;
      }
      if (slot.from >= slot.to) {
        Alert.alert('Invalid slot', 'Each slot must end after it starts.');
        return;
      }
    }
    await updateUserProfile(firebaseUser.uid, {
      phone: phone.trim() || undefined,
      contactPreferences: { allowEmail, allowSMS, allowInApp },
      tipsEnabled,
      availability: {
        slots: availabilitySlots,
        ...(availabilityNote.trim() && { note: availabilityNote.trim() }),
      },
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
        <Text style={styles.sectionTitle}>Preferred Play Times</Text>
        <Text style={styles.sectionSubtitle}>Weekly windows when you&apos;re typically free</Text>

        {availabilitySlots.length === 0 && !editing && (
          <Text style={styles.emptyHint}>No availability set yet.</Text>
        )}
        {availabilitySlots.map((slot, idx) => (
          <View key={idx} style={styles.slotRow}>
            <TouchableOpacity
              style={[styles.slotDay, !editing && styles.slotDisabled]}
              disabled={!editing}
              onPress={() => cycleDay(idx)}
            >
              <Text style={styles.slotDayText}>{DAY_LABELS[slot.day]}</Text>
            </TouchableOpacity>
            <TextInput
              style={[styles.slotTime, !editing && styles.slotDisabled]}
              value={slot.from}
              onChangeText={(t) => updateSlot(idx, { from: t })}
              editable={editing}
              placeholder="HH:MM"
              maxLength={5}
            />
            <Text style={styles.slotDash}>–</Text>
            <TextInput
              style={[styles.slotTime, !editing && styles.slotDisabled]}
              value={slot.to}
              onChangeText={(t) => updateSlot(idx, { to: t })}
              editable={editing}
              placeholder="HH:MM"
              maxLength={5}
            />
            {editing && (
              <TouchableOpacity onPress={() => removeSlot(idx)} style={styles.slotRemove}>
                <Text style={styles.slotRemoveText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
        {editing && (
          <TouchableOpacity style={styles.addSlotBtn} onPress={addSlot}>
            <Text style={styles.addSlotBtnText}>+ Add slot</Text>
          </TouchableOpacity>
        )}

        {editing ? (
          <TextInput
            style={[styles.input, { marginTop: 12, minHeight: 56 }]}
            value={availabilityNote}
            onChangeText={setAvailabilityNote}
            placeholder="Optional note, e.g. Flexible weekends"
            multiline
          />
        ) : (
          availabilityNote ? (
            <Text style={styles.noteText}>{availabilityNote}</Text>
          ) : null
        )}
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
  slotRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  slotDay: { backgroundColor: '#1a472a', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, minWidth: 56, alignItems: 'center' },
  slotDayText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  slotTime: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 14, width: 70, textAlign: 'center' },
  slotDash: { color: '#888', fontSize: 14 },
  slotDisabled: { opacity: 0.6 },
  slotRemove: { padding: 6 },
  slotRemoveText: { color: '#c0392b', fontSize: 16, fontWeight: '700' },
  addSlotBtn: { borderWidth: 1, borderStyle: 'dashed', borderColor: '#1a472a', borderRadius: 8, padding: 10, alignItems: 'center', marginTop: 4 },
  addSlotBtnText: { color: '#1a472a', fontWeight: '700', fontSize: 13 },
  emptyHint: { color: '#999', fontSize: 13, paddingVertical: 4 },
  noteText: { color: '#444', fontSize: 13, marginTop: 8, fontStyle: 'italic' },
});
