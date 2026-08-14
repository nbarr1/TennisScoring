import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Switch,
  Alert,
  Modal,
  ActivityIndicator,
} from "react-native";
import {
  signOut,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from "firebase/auth";
import { useRouter } from "expo-router";
import { getDoc } from "firebase/firestore";
import {
  auth,
  useAuthUser,
  usePrivateUser,
  updateUserProfile,
  useDivisionOptions,
  deleteAccountCallable,
  unblockUser,
  profileDoc,
} from "@tennis/firebase-client";
import {
  DAY_LABELS,
  addAvailabilitySlot,
  buildUserProfileUpdates,
  cycleAvailabilitySlotDay,
  removeAvailabilitySlot,
  updateAvailabilitySlot,
  validateAvailabilitySlots,
  type AvailabilitySlot,
  type PublicProfile,
} from "@tennis/shared";
import { useAppStore } from "../../store/appStore";
import { KeyboardAwareScrollView } from "../../components/KeyboardSafeView";

export default function ProfileScreen() {
  const { firebaseUser } = useAuthUser();
  const { user, loading } = usePrivateUser(firebaseUser?.uid ?? null);
  const { setUser } = useAppStore();
  const router = useRouter();

  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [allowEmail, setAllowEmail] = useState(true);
  const [allowSMS, setAllowSMS] = useState(false);
  const [allowInApp, setAllowInApp] = useState(true);
  const [tipsEnabled, setTipsEnabled] = useState(true);
  const [availabilitySlots, setAvailabilitySlots] = useState<
    AvailabilitySlot[]
  >([]);
  const [availabilityNote, setAvailabilityNote] = useState("");
  const divisionOptions = useDivisionOptions(
    firebaseUser?.uid,
    user?.divisionId,
  );
  const [selectedDivisionId, setSelectedDivisionId] = useState("");
  const [saving, setSaving] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [blockedProfiles, setBlockedProfiles] = useState<PublicProfile[]>([]);

  useEffect(() => {
    if (!user) return;
    setDisplayName(user.displayName ?? "");
    setEmail(user.email ?? "");
    setPhone(user.phone ?? "");
    setAllowEmail(user.contactPreferences?.allowEmail ?? true);
    setAllowSMS(user.contactPreferences?.allowSMS ?? false);
    setAllowInApp(user.contactPreferences?.allowInApp ?? true);
    setTipsEnabled(user.tipsEnabled ?? true);
    setAvailabilitySlots(user.availability?.slots ?? []);
    setAvailabilityNote(user.availability?.note ?? "");
    setSelectedDivisionId(user.divisionId ?? "");
  }, [user]);

  useEffect(() => {
    const ids = user?.blockedUserIds ?? [];
    if (ids.length === 0) {
      setBlockedProfiles([]);
      return;
    }
    let cancelled = false;
    Promise.all(ids.map((id) => getDoc(profileDoc(id)).catch(() => null))).then(
      (snaps) => {
        if (cancelled) return;
        setBlockedProfiles(
          snaps
            .filter((snap): snap is NonNullable<typeof snap> => !!snap?.exists())
            .map((snap) => ({
              ...(snap.data() as Omit<PublicProfile, "id">),
              id: snap.id,
            })),
        );
      },
    );
    return () => {
      cancelled = true;
    };
  }, [user?.blockedUserIds]);

  async function handleUnblock(blockedUserId: string) {
    if (!firebaseUser) return;
    try {
      await unblockUser(firebaseUser.uid, blockedUserId);
    } catch {
      Alert.alert("Could not unblock user", "Please try again.");
    }
  }

  function addSlot() {
    setAvailabilitySlots(addAvailabilitySlot);
  }
  function updateSlot(idx: number, patch: Partial<AvailabilitySlot>) {
    setAvailabilitySlots((slots) => updateAvailabilitySlot(slots, idx, patch));
  }
  function removeSlot(idx: number) {
    setAvailabilitySlots((slots) => removeAvailabilitySlot(slots, idx));
  }
  function cycleDay(idx: number) {
    setAvailabilitySlots((slots) => cycleAvailabilitySlotDay(slots, idx));
  }

  async function handleSave() {
    if (!firebaseUser) return;
    const validation = validateAvailabilitySlots(availabilitySlots);
    if (!validation.valid) {
      Alert.alert(
        validation.reason === "invalid_time" ? "Invalid time" : "Invalid slot",
        validation.message,
      );
      return;
    }
    setSaving(true);
    try {
      await updateUserProfile(
        firebaseUser.uid,
        buildUserProfileUpdates({
          displayName,
          email,
          phone,
          allowEmail,
          allowSMS,
          allowInApp,
          tipsEnabled,
          availabilitySlots,
          availabilityNote,
          selectedDivisionId,
        }),
      );
      setEditing(false);
    } catch (e) {
      Alert.alert(
        "Could not save profile",
        (e as { message?: string }).message || "Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  function handleFeedback() {
    router.push({ pathname: "/feedback", params: { from: "/(tabs)/profile" } });
  }

  async function handleSignOut() {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          await signOut(auth);
          setUser(null);
        },
      },
    ]);
  }

  function handleDeleteAccountPress() {
    Alert.alert(
      "Delete Account",
      "This permanently deletes your account and removes your personal data. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          style: "destructive",
          onPress: () => setShowDeleteModal(true),
        },
      ],
    );
  }

  async function confirmDeleteAccount() {
    if (!firebaseUser?.email || !deletePassword) return;
    setDeleting(true);
    try {
      const credential = EmailAuthProvider.credential(
        firebaseUser.email,
        deletePassword,
      );
      await reauthenticateWithCredential(firebaseUser, credential);
      await deleteAccountCallable();
      setShowDeleteModal(false);
      setDeletePassword("");
      setUser(null);
      router.replace("/(auth)/login");
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (
        code === "auth/wrong-password" ||
        code === "auth/invalid-credential"
      ) {
        Alert.alert(
          "Incorrect password",
          "Please re-enter your password to confirm.",
        );
      } else if (code === "functions/failed-precondition") {
        Alert.alert(
          "Can't delete account",
          "Transfer division leadership to another player before deleting your account.",
        );
      } else {
        Alert.alert(
          "Could not delete account",
          (e as { message?: string }).message || "Please try again.",
        );
      }
    } finally {
      setDeleting(false);
    }
  }

  if (loading || !user) {
    return (
      <View style={styles.center}>
        <Text>Loading profile…</Text>
      </View>
    );
  }

  return (
    <KeyboardAwareScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>
          {(user.displayName ||
            firebaseUser?.displayName ||
            "?")[0].toUpperCase()}
        </Text>
      </View>
      <Text style={styles.name}>
        {user.displayName || firebaseUser?.displayName || "Unknown"}
      </Text>
      <Text style={styles.email}>
        {user.email || firebaseUser?.email || ""}
      </Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Contact Information</Text>

        {editing ? (
          <>
            <TextInput
              style={styles.input}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Display name"
              autoCapitalize="words"
            />
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="Email address"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="Phone number (optional)"
              keyboardType="phone-pad"
            />
          </>
        ) : (
          <>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Display name</Text>
              <Text style={styles.rowValue}>
                {user.displayName ?? "Not set"}
              </Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Email</Text>
              <Text style={styles.rowValue}>{user.email ?? "Not set"}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Phone</Text>
              <Text style={styles.rowValue}>{user.phone ?? "Not set"}</Text>
            </View>
          </>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Division</Text>
        <Text style={styles.sectionSubtitle}>
          Choose the division to use across rankings, matches, and admin tools
        </Text>
        {editing ? (
          <View style={styles.divisionList}>
            <TouchableOpacity
              style={[
                styles.divisionOption,
                selectedDivisionId === "" && styles.divisionOptionActive,
              ]}
              onPress={() => setSelectedDivisionId("")}
            >
              <Text
                style={[
                  styles.divisionOptionText,
                  selectedDivisionId === "" && styles.divisionOptionTextActive,
                ]}
              >
                No division
              </Text>
            </TouchableOpacity>
            {divisionOptions.map((division) => (
              <TouchableOpacity
                key={division.id}
                style={[
                  styles.divisionOption,
                  selectedDivisionId === division.id &&
                    styles.divisionOptionActive,
                ]}
                onPress={() => setSelectedDivisionId(division.id)}
              >
                <Text
                  style={[
                    styles.divisionOptionText,
                    selectedDivisionId === division.id &&
                      styles.divisionOptionTextActive,
                  ]}
                >
                  {division.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <Text style={styles.rowValue}>
            {divisionOptions.find(
              (division) => division.id === user.divisionId,
            )?.name ??
              user.divisionId ??
              "No division"}
          </Text>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Contact Preferences</Text>
        <Text style={styles.sectionSubtitle}>
          Choose how others can contact you
        </Text>

        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Share email with teammates</Text>
          <Switch
            value={allowEmail}
            onValueChange={setAllowEmail}
            disabled={!editing}
            trackColor={{ true: "#1a472a", false: "#ccc" }}
          />
        </View>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Share phone for SMS</Text>
          <Switch
            value={allowSMS}
            onValueChange={setAllowSMS}
            disabled={!editing}
            trackColor={{ true: "#1a472a", false: "#ccc" }}
          />
        </View>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Allow in-app messages</Text>
          <Switch
            value={allowInApp}
            onValueChange={setAllowInApp}
            disabled={!editing}
            trackColor={{ true: "#1a472a", false: "#ccc" }}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Preferred Play Times</Text>
        <Text style={styles.sectionSubtitle}>
          Weekly windows when you&apos;re typically free
        </Text>

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
              <TouchableOpacity
                onPress={() => removeSlot(idx)}
                style={styles.slotRemove}
              >
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
        ) : availabilityNote ? (
          <Text style={styles.noteText}>{availabilityNote}</Text>
        ) : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Match Settings</Text>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Live tips during matches</Text>
          <Switch
            value={tipsEnabled}
            onValueChange={setTipsEnabled}
            disabled={!editing}
            trackColor={{ true: "#1a472a", false: "#ccc" }}
          />
        </View>
      </View>

      {blockedProfiles.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Blocked Users</Text>
          {blockedProfiles.map((p) => (
            <View key={p.id} style={styles.row}>
              <Text style={styles.rowValue}>{p.displayName}</Text>
              <TouchableOpacity onPress={() => handleUnblock(p.id)}>
                <Text style={styles.unblockText}>Unblock</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      <View style={styles.actions}>
        {editing ? (
          <>
            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.btnDisabled]}
              onPress={handleSave}
              disabled={saving}
            >
              <Text style={styles.saveBtnText}>
                {saving ? "Saving…" : "Save Changes"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => setEditing(false)}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity
            style={styles.editBtn}
            onPress={() => setEditing(true)}
          >
            <Text style={styles.editBtnText}>Edit Profile</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.feedbackBtn} onPress={handleFeedback}>
          <Text style={styles.feedbackBtnText}>Provide feedback</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.feedbackBtn}
          onPress={() => router.push("/privacy-policy")}
        >
          <Text style={styles.feedbackBtnText}>Privacy Policy</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
          <Text style={styles.signOutBtnText}>Sign Out</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.deleteAccountBtn}
          onPress={handleDeleteAccountPress}
        >
          <Text style={styles.deleteAccountBtnText}>Delete Account</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={showDeleteModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Confirm Account Deletion</Text>
            <Text style={styles.modalSubtitle}>
              Enter your password to permanently delete your account. This
              cannot be undone.
            </Text>
            <TextInput
              style={styles.input}
              value={deletePassword}
              onChangeText={setDeletePassword}
              placeholder="Password"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={[
                styles.deleteAccountBtnSolid,
                (!deletePassword || deleting) && styles.btnDisabled,
              ]}
              onPress={confirmDeleteAccount}
              disabled={!deletePassword || deleting}
            >
              {deleting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.deleteAccountBtnSolidText}>
                  Permanently Delete Account
                </Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => {
                setShowDeleteModal(false);
                setDeletePassword("");
              }}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f5f0" },
  content: { padding: 24 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#1a472a",
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "center",
    marginBottom: 12,
  },
  avatarText: { color: "#fff", fontSize: 32, fontWeight: "700" },
  name: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1a1a1a",
    textAlign: "center",
  },
  email: { fontSize: 14, color: "#888", textAlign: "center", marginBottom: 32 },
  section: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1a472a",
    marginBottom: 4,
  },
  sectionSubtitle: { fontSize: 12, color: "#999", marginBottom: 12 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  rowLabel: { color: "#666", fontSize: 14 },
  rowValue: { color: "#333", fontSize: 14, fontWeight: "500" },
  unblockText: { color: "#1a472a", fontSize: 13, fontWeight: "700" },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  toggleLabel: { color: "#444", fontSize: 14, flex: 1, marginRight: 16 },
  actions: { gap: 12 },
  editBtn: {
    backgroundColor: "#1a472a",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  editBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  saveBtn: {
    backgroundColor: "#1a472a",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  cancelBtn: {
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ddd",
  },
  cancelBtnText: { color: "#555", fontWeight: "600", fontSize: 15 },
  feedbackBtn: {
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#1a472a",
    backgroundColor: "#fff",
  },
  feedbackBtnText: { color: "#1a472a", fontWeight: "700", fontSize: 15 },
  signOutBtn: { padding: 16, borderRadius: 12, alignItems: "center" },
  signOutBtnText: { color: "#c0392b", fontWeight: "600", fontSize: 15 },
  deleteAccountBtn: { padding: 16, borderRadius: 12, alignItems: "center" },
  deleteAccountBtnText: { color: "#999", fontWeight: "500", fontSize: 13 },
  deleteAccountBtnSolid: {
    backgroundColor: "#c0392b",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 12,
  },
  deleteAccountBtnSolidText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: { backgroundColor: "#fff", borderRadius: 16, padding: 20 },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#c0392b",
    marginBottom: 8,
  },
  modalSubtitle: { fontSize: 13, color: "#666", marginBottom: 16 },
  btnDisabled: { opacity: 0.5 },
  divisionList: { gap: 8 },
  divisionOption: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  divisionOptionActive: { borderColor: "#1a472a", backgroundColor: "#e8f5e9" },
  divisionOptionText: { color: "#444", fontSize: 14, fontWeight: "600" },
  divisionOptionTextActive: { color: "#1a472a" },
  slotRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  slotDay: {
    backgroundColor: "#1a472a",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 56,
    alignItems: "center",
  },
  slotDayText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  slotTime: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 14,
    width: 70,
    textAlign: "center",
  },
  slotDash: { color: "#888", fontSize: 14 },
  slotDisabled: { opacity: 0.6 },
  slotRemove: { padding: 6 },
  slotRemoveText: { color: "#c0392b", fontSize: 16, fontWeight: "700" },
  addSlotBtn: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#1a472a",
    borderRadius: 8,
    padding: 10,
    alignItems: "center",
    marginTop: 4,
  },
  addSlotBtnText: { color: "#1a472a", fontWeight: "700", fontSize: 13 },
  emptyHint: { color: "#999", fontSize: 13, paddingVertical: 4 },
  noteText: { color: "#444", fontSize: 13, marginTop: 8, fontStyle: "italic" },
});
