import React, { useCallback, useRef, useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Switch,
  Modal,
  Platform,
} from "react-native";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
} from "firebase/auth";
import { useRouter } from "expo-router";
import { getDoc } from "firebase/firestore";
import {
  useAuthUser,
  usePrivateUser,
  updateUserProfile,
  useDivisionOptions,
  deleteAccountCallable,
  unblockUser,
  profileDoc,
  signOutReleasingPushToken,
} from "@tennis/firebase-client";
import {
  DAY_LABELS,
  DAYS_OF_WEEK,
  addAvailabilitySlot,
  buildUserProfileUpdates,
  isAdminRole,
  removeAvailabilitySlot,
  updateAvailabilitySlot,
  validateAvailabilitySlots,
  type AvailabilitySlot,
  type DayOfWeek,
  type PublicProfile,
  type User,
} from "@tennis/shared";
import { useAppStore } from "../../store/appStore";
import {
  KeyboardAwareScrollView,
  KeyboardSafeView,
} from "../../components/KeyboardSafeView";
import { DateTimeField, formatFieldValue } from "../../components/DateTimeField";
import { FormErrorSummary, FormField } from "../../components/FormField";
import {
  Button,
  Chip,
  ErrorState,
  IconButton,
  InlineAlert,
  LoadingState,
  MIN_TOUCH_TARGET,
  announce,
  colors,
  confirmAction,
  confirmDestructive,
  describeError,
  elevations,
  radii,
  spacing,
  typography,
  useAsyncAction,
} from "../../theme";

const DAY_NAMES: Record<DayOfWeek, string> = {
  sun: "Sunday",
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
};

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

type BlockedEntry = { id: string; displayName: string | null };

function SectionTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <View style={styles.sectionHead}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {title}
      </Text>
      {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

function ToggleRow({
  label,
  description,
  value,
  onValueChange,
  disabled,
  last,
}: {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled: boolean;
  last?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={
        disabled ? "Tap Edit profile to change this setting" : description
      }
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      style={[styles.toggleRow, last && styles.toggleRowLast]}
    >
      <View style={styles.toggleText}>
        <Text style={[styles.toggleLabel, disabled && styles.toggleLabelOff]}>
          {label}
        </Text>
        {description ? (
          <Text style={styles.toggleDescription}>{description}</Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        trackColor={{ true: colors.primary, false: colors.disabled }}
        thumbColor={
          Platform.OS === "android"
            ? value
              ? colors.primarySoft
              : colors.surface
            : undefined
        }
        ios_backgroundColor={colors.disabled}
      />
    </Pressable>
  );
}

export default function ProfileScreen() {
  const { firebaseUser } = useAuthUser();
  const [reloadKey, setReloadKey] = useState(0);
  const { user, loading, error } = usePrivateUser(
    firebaseUser?.uid ?? null,
    reloadKey,
  );
  const setUser = useAppStore((state) => state.setUser);
  const router = useRouter();
  // The rules refuse a self-update that changes email or divisionId unless the
  // account is an admin, so only admins get those as editable fields.
  const canEditAccountFields = isAdminRole(user?.role);

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
  const [savedNotice, setSavedNotice] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [blocked, setBlocked] = useState<BlockedEntry[]>([]);
  const [blockedLoading, setBlockedLoading] = useState(false);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);
  const [unblockError, setUnblockError] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const displayNameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);

  const loadDraft = useCallback((source: User) => {
    setDisplayName(source.displayName ?? "");
    setEmail(source.email ?? "");
    setPhone(source.phone ?? "");
    setAllowEmail(source.contactPreferences?.allowEmail ?? true);
    setAllowSMS(source.contactPreferences?.allowSMS ?? false);
    setAllowInApp(source.contactPreferences?.allowInApp ?? true);
    setTipsEnabled(source.tipsEnabled ?? true);
    setAvailabilitySlots(source.availability?.slots ?? []);
    setAvailabilityNote(source.availability?.note ?? "");
    setSelectedDivisionId(source.divisionId ?? "");
  }, []);

  useEffect(() => {
    if (!user) return;
    loadDraft(user);
  }, [user, loadDraft]);

  useEffect(() => {
    const ids = user?.blockedUserIds ?? [];
    if (ids.length === 0) {
      setBlocked([]);
      setBlockedLoading(false);
      return;
    }
    let cancelled = false;
    setBlockedLoading(true);
    Promise.all(
      ids.map((id) => getDoc(profileDoc(id)).catch(() => null)),
    ).then((snaps) => {
      if (cancelled) return;
      // Keep ids whose profile could not be read, so they can still be
      // unblocked.
      setBlocked(
        ids.map((id, i) => {
          const snap = snaps[i];
          const data = snap?.exists()
            ? (snap.data() as Omit<PublicProfile, "id">)
            : null;
          return { id, displayName: data?.displayName ?? null };
        }),
      );
      setBlockedLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.blockedUserIds]);

  async function handleUnblock(entry: BlockedEntry) {
    if (!firebaseUser || unblockingId) return;
    setUnblockingId(entry.id);
    setUnblockError(null);
    try {
      await unblockUser(firebaseUser.uid, entry.id);
      announce(
        `${entry.displayName ?? "Player"} unblocked. Their messages will show again.`,
      );
    } catch (err) {
      const text = describeError(
        err,
        "Couldn't unblock this player. Check your connection and try again.",
      );
      setUnblockError(text);
      announce(text);
    } finally {
      setUnblockingId(null);
    }
  }

  function addSlot() {
    setAvailabilitySlots(addAvailabilitySlot);
    if (formErrors.availability)
      setFormErrors((e) => ({ ...e, availability: "" }));
  }
  function updateSlot(idx: number, patch: Partial<AvailabilitySlot>) {
    setAvailabilitySlots((slots) => updateAvailabilitySlot(slots, idx, patch));
    if (formErrors.availability)
      setFormErrors((e) => ({ ...e, availability: "" }));
  }
  function removeSlot(idx: number) {
    setAvailabilitySlots((slots) => removeAvailabilitySlot(slots, idx));
    announce("Time removed");
  }

  const save = useAsyncAction(
    async (uid: string) => {
      const updates = buildUserProfileUpdates({
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
      });
      // Send email and divisionId only when an admin actually changed them.
      // For anyone else the rules reject the whole write, and the builder
      // lowercases email, so even an untouched mixed-case address reads as a
      // change.
      if (!canEditAccountFields || updates.email === user?.email) {
        delete updates.email;
      }
      if (!canEditAccountFields || updates.divisionId === user?.divisionId) {
        delete updates.divisionId;
      }
      await updateUserProfile(uid, updates);
    },
    {
      successMessage: "Profile saved",
      errorMessage: (err) =>
        describeError(
          err,
          "Couldn't save your profile. Check your connection and try again. Your changes are still here.",
        ),
      onSuccess: () => {
        setEditing(false);
        setSavedNotice(true);
      },
    },
  );

  function startEditing() {
    setSavedNotice(false);
    save.reset();
    setFormErrors({});
    setEditing(true);
  }

  function cancelEditing() {
    // Put back what is saved, so a cancelled edit never lingers on screen.
    if (user) loadDraft(user);
    setFormErrors({});
    save.reset();
    setEditing(false);
  }

  async function handleSave() {
    if (!firebaseUser) return;
    const contactErrors = {
      displayName: displayName.trim()
        ? ""
        : "Enter your name. Other players see it in standings and messages.",
      email:
        !canEditAccountFields || EMAIL_PATTERN.test(email.trim())
          ? ""
          : "Enter an email address like name@example.com.",
    };
    const validation = validateAvailabilitySlots(availabilitySlots);
    const nextErrors = {
      ...contactErrors,
      availability: validation.valid ? "" : validation.message,
    };
    setFormErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) {
      (contactErrors.displayName
        ? displayNameRef
        : contactErrors.email
          ? emailRef
          : null
      )?.current?.focus();
      return;
    }
    // Without an active division the app returns to the join screen, which
    // only takes an invite code, so a slip here is hard to undo.
    if (canEditAccountFields && !selectedDivisionId && user?.divisionId) {
      const ok = await confirmAction({
        title: "Save with no active division?",
        message:
          "You'll leave the app's standings, matches, and messages and go to the join screen. To come back, you'll need your division's invite code.",
        confirmLabel: "Save anyway",
        cancelLabel: "Keep my division",
      });
      if (!ok) return;
    }
    void save.run(firebaseUser.uid);
  }

  function handleFeedback() {
    router.push({ pathname: "/feedback", params: { from: "/(tabs)/profile" } });
  }

  const signOut = useAsyncAction(async () => {
    try {
      await signOutReleasingPushToken();
    } finally {
      setUser(null);
    }
  });

  async function handleSignOut() {
    const ok = await confirmAction({
      title: "Sign out?",
      message:
        "You'll stop getting match and message notifications on this device until you sign back in.",
      confirmLabel: "Sign out",
    });
    if (ok) void signOut.run();
  }

  const deleteAccount = useAsyncAction(
    async (password: string) => {
      if (!firebaseUser?.email) throw new Error("No email on this account.");
      const credential = EmailAuthProvider.credential(
        firebaseUser.email,
        password,
      );
      await reauthenticateWithCredential(firebaseUser, credential);
      await deleteAccountCallable();
    },
    {
      errorMessage: (e) => {
        const code = (e as { code?: string })?.code;
        if (
          code === "auth/wrong-password" ||
          code === "auth/invalid-credential"
        )
          return "That password is incorrect. Enter the password you sign in with.";
        if (code === "auth/too-many-requests")
          return "Too many attempts. Wait a few minutes, then try again.";
        if (code === "functions/failed-precondition")
          return "You lead a division. Hand leadership to another player before deleting your account.";
        return describeError(
          e,
          "Couldn't delete your account. Check your connection and try again.",
        );
      },
      successMessage: "Account deleted",
      onSuccess: () => {
        setShowDeleteModal(false);
        setDeletePassword("");
        // The server already removed this account; sign the device out too.
        void signOutReleasingPushToken().catch(() => undefined);
        setUser(null);
        router.replace("/(auth)/login");
      },
    },
  );

  async function handleDeleteAccountPress() {
    const ok = await confirmDestructive({
      title: "Delete your account?",
      message:
        "This can't be undone. Your name becomes \"Deleted User\" on past matches and standings. Your email, phone, availability, and notifications are removed, and you leave every division and its group chats. If you lead a division, hand over leadership first.",
      confirmLabel: "Continue",
      cancelLabel: "Keep account",
    });
    if (ok) {
      deleteAccount.reset();
      setShowDeleteModal(true);
    }
  }

  function closeDeleteModal() {
    if (deleteAccount.pending) return;
    setShowDeleteModal(false);
    setDeletePassword("");
    deleteAccount.reset();
  }

  // No signed-in user means sign-out is in progress; the auth gate takes over.
  if (loading || !firebaseUser) {
    return <LoadingState label="Loading your profile" />;
  }
  if (error || !user) {
    return (
      <ErrorState
        title="Couldn't load your profile"
        message="Check your connection, then try again."
        onRetry={() => setReloadKey((key) => key + 1)}
      />
    );
  }

  const shownName = user.displayName || firebaseUser?.displayName || "";
  const activeDivisionName =
    divisionOptions.find((division) => division.id === user.divisionId)
      ?.name ?? (user.divisionId ? "Your division" : "No division selected");

  return (
    <KeyboardAwareScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <View style={styles.identity}>
        <View style={styles.avatar} accessible={false}>
          <Text style={styles.avatarText}>
            {(shownName || "?")[0].toUpperCase()}
          </Text>
        </View>
        <Text style={styles.name} accessibilityRole="header">
          {shownName || "Name not set"}
        </Text>
        <Text style={styles.email}>
          {user.email || firebaseUser?.email || ""}
        </Text>
      </View>

      {savedNotice && !editing && (
        <InlineAlert
          tone="success"
          message="Profile saved."
          style={styles.alertGap}
        />
      )}
      {editing && (
        <InlineAlert
          tone="info"
          message="You're editing your profile. Save or cancel at the bottom of the page."
          style={styles.alertGap}
          announce
        />
      )}

      <View style={styles.section}>
        <SectionTitle title="Contact information" />

        {editing ? (
          <View style={styles.fields}>
            <FormField
              ref={displayNameRef}
              label="Your name"
              required
              error={formErrors.displayName}
              value={displayName}
              onChangeText={(value) => {
                setDisplayName(value);
                if (formErrors.displayName)
                  setFormErrors((e) => ({ ...e, displayName: "" }));
              }}
              onBlur={() =>
                setFormErrors((e) => ({
                  ...e,
                  displayName: displayName.trim()
                    ? ""
                    : "Enter your name. Other players see it in standings and messages.",
                }))
              }
              autoCapitalize="words"
              autoComplete="name"
              textContentType="name"
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => emailRef.current?.focus()}
            />
            <FormField
              ref={emailRef}
              label="Email"
              required={canEditAccountFields}
              disabled={!canEditAccountFields}
              helperText={
                canEditAccountFields
                  ? undefined
                  : "This is your sign-in email. A league admin can change it."
              }
              error={formErrors.email}
              value={email}
              onChangeText={(value) => {
                setEmail(value);
                if (formErrors.email)
                  setFormErrors((e) => ({ ...e, email: "" }));
              }}
              onBlur={() =>
                setFormErrors((e) => ({
                  ...e,
                  email: EMAIL_PATTERN.test(email.trim())
                    ? ""
                    : "Enter an email address like name@example.com.",
                }))
              }
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => phoneRef.current?.focus()}
            />
            <FormField
              ref={phoneRef}
              label="Phone (optional)"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
            />
          </View>
        ) : (
          <>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Name</Text>
              <Text style={styles.rowValue}>
                {user.displayName || "Not set"}
              </Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Email</Text>
              <Text style={styles.rowValue}>{user.email || "Not set"}</Text>
            </View>
            <View style={[styles.row, styles.rowLast]}>
              <Text style={styles.rowLabel}>Phone</Text>
              <Text style={styles.rowValue}>{user.phone || "Not set"}</Text>
            </View>
          </>
        )}
      </View>

      <View style={styles.section}>
        <SectionTitle
          title="Active division"
          subtitle="Standings, matches, and messages show this division."
        />
        {editing && canEditAccountFields ? (
          <View
            style={styles.divisionList}
            accessibilityRole="radiogroup"
            accessibilityLabel="Active division"
          >
            {[{ id: "", name: "No division" }, ...divisionOptions].map(
              (division) => {
                const selected = selectedDivisionId === division.id;
                return (
                  <Pressable
                    key={division.id || "none"}
                    accessibilityRole="radio"
                    accessibilityLabel={division.name}
                    accessibilityState={{ checked: selected }}
                    android_ripple={{
                      color: colors.primarySoft,
                      foreground: true,
                    }}
                    style={[
                      styles.divisionOption,
                      selected && styles.divisionOptionActive,
                    ]}
                    onPress={() => setSelectedDivisionId(division.id)}
                  >
                    <View
                      style={[styles.radio, selected && styles.radioActive]}
                    >
                      {selected ? <View style={styles.radioDot} /> : null}
                    </View>
                    <Text
                      style={[
                        styles.divisionOptionText,
                        selected && styles.divisionOptionTextActive,
                      ]}
                    >
                      {division.name}
                    </Text>
                  </Pressable>
                );
              },
            )}
          </View>
        ) : (
          <>
            <Text style={styles.valueText}>{activeDivisionName}</Text>
            {editing ? (
              <Text style={styles.fieldNote}>
                To play in another division, join it with its invite code.
              </Text>
            ) : null}
          </>
        )}
      </View>

      <View style={styles.section}>
        <SectionTitle
          title="Contact preferences"
          subtitle="Choose how other players in your division can reach you."
        />
        <ToggleRow
          label="Share my email with players"
          value={allowEmail}
          onValueChange={setAllowEmail}
          disabled={!editing}
        />
        <ToggleRow
          label="Share my phone for texts"
          value={allowSMS}
          onValueChange={setAllowSMS}
          disabled={!editing}
        />
        <ToggleRow
          label="Allow in-app messages"
          value={allowInApp}
          onValueChange={setAllowInApp}
          disabled={!editing}
          last
        />
      </View>

      <View style={styles.section}>
        <SectionTitle
          title="Preferred play times"
          subtitle="Weekly times you're usually free. Opponents see these when they propose a match."
        />

        {availabilitySlots.length === 0 && !editing && (
          <Text style={styles.emptyHint}>
            No times set yet. Tap Edit profile to add when you can play.
          </Text>
        )}

        {!editing &&
          availabilitySlots.map((slot, idx) => (
            <Text key={idx} style={styles.slotSummary}>
              {DAY_NAMES[slot.day]},{" "}
              {formatFieldValue(slot.from, "time") ?? slot.from}–
              {formatFieldValue(slot.to, "time") ?? slot.to}
            </Text>
          ))}

        {editing &&
          availabilitySlots.map((slot, idx) => (
            <View
              key={idx}
              style={styles.slotCard}
              accessibilityLabel={`Time ${idx + 1}`}
            >
              <View style={styles.slotHeader}>
                <Text style={styles.slotHeading}>Time {idx + 1}</Text>
                <IconButton
                  label={`Remove time ${idx + 1}, ${DAY_NAMES[slot.day]} ${slot.from} to ${slot.to}`}
                  icon="trash"
                  variant="quiet"
                  onPress={() => removeSlot(idx)}
                />
              </View>
              <View
                style={styles.dayChips}
                accessibilityRole="radiogroup"
                accessibilityLabel={`Day for time ${idx + 1}`}
              >
                {DAYS_OF_WEEK.map((day) => (
                  <Chip
                    key={day}
                    label={DAY_LABELS[day]}
                    accessibilityLabel={DAY_NAMES[day]}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: slot.day === day }}
                    selected={slot.day === day}
                    style={styles.dayChip}
                    onPress={() => updateSlot(idx, { day })}
                  />
                ))}
              </View>
              <View style={styles.timeRow}>
                <DateTimeField
                  mode="time"
                  label="From"
                  accessibilityLabel={`Time ${idx + 1} start`}
                  containerStyle={styles.timeField}
                  value={slot.from}
                  onChange={(t) => updateSlot(idx, { from: t })}
                  defaultValue="18:00"
                />
                <Text style={styles.slotDash} accessible={false}>
                  –
                </Text>
                <DateTimeField
                  mode="time"
                  label="To"
                  accessibilityLabel={`Time ${idx + 1} end`}
                  containerStyle={styles.timeField}
                  value={slot.to}
                  onChange={(t) => updateSlot(idx, { to: t })}
                  defaultValue="20:00"
                />
              </View>
            </View>
          ))}

        {editing && (
          <>
            {formErrors.availability ? (
              <Text style={styles.fieldError} accessibilityLiveRegion="polite">
                {formErrors.availability}
              </Text>
            ) : null}
            <Button
              label="Add a time"
              icon="plus"
              variant="secondary"
              onPress={addSlot}
            />
          </>
        )}

        {editing ? (
          <FormField
            label="Note (optional)"
            showCharacterCount
            maxLength={300}
            containerStyle={styles.noteField}
            inputStyle={styles.noteInput}
            value={availabilityNote}
            onChangeText={setAvailabilityNote}
            placeholder="e.g. Flexible on weekends"
            multiline
          />
        ) : availabilityNote ? (
          <Text style={styles.noteText}>{availabilityNote}</Text>
        ) : null}
      </View>

      <View style={styles.section}>
        <SectionTitle title="Match settings" />
        <ToggleRow
          label="Live tips during matches"
          description="Short tips on the scoring screen, like deuce or set point."
          value={tipsEnabled}
          onValueChange={setTipsEnabled}
          disabled={!editing}
          last
        />
      </View>

      <View style={styles.actions}>
        {editing ? (
          <>
            <FormErrorSummary
              errors={Object.values(formErrors).filter(Boolean)}
            />
            {save.error && (
              <InlineAlert
                tone="error"
                title="Couldn't save your profile"
                message={save.error}
              />
            )}
            <Button
              label="Save changes"
              pending={save.pending}
              pendingLabel="Saving…"
              fullWidth
              onPress={() => void handleSave()}
            />
            <Button
              label="Cancel"
              accessibilityLabel="Cancel editing and discard changes"
              variant="secondary"
              disabled={save.pending}
              fullWidth
              onPress={cancelEditing}
            />
          </>
        ) : (
          <Button
            label="Edit profile"
            icon="pencil"
            fullWidth
            onPress={startEditing}
          />
        )}
      </View>

      {(blocked.length > 0 || blockedLoading) && (
        <View style={styles.section}>
          <SectionTitle
            title="Blocked players"
            subtitle="You don't see messages from these players, and they don't notify you."
          />
          {blockedLoading && blocked.length === 0 ? (
            <LoadingState inline label="Loading blocked players" />
          ) : null}
          {unblockError && (
            <InlineAlert
              tone="error"
              message={unblockError}
              style={styles.alertGap}
            />
          )}
          {blocked.map((entry, i) => (
            <View
              key={entry.id}
              style={[
                styles.row,
                styles.blockedRow,
                i === blocked.length - 1 && styles.rowLast,
              ]}
            >
              <Text style={[styles.rowValue, styles.blockedName]}>
                {entry.displayName ?? "Player no longer available"}
              </Text>
              <Button
                label="Unblock"
                accessibilityLabel={`Unblock ${entry.displayName ?? "this player"}`}
                variant="quiet"
                size="compact"
                pending={unblockingId === entry.id}
                disabled={!!unblockingId && unblockingId !== entry.id}
                onPress={() => void handleUnblock(entry)}
              />
            </View>
          ))}
        </View>
      )}

      <View style={styles.section}>
        <SectionTitle title="Account" />
        <View style={styles.accountActions}>
          <Button
            label="Send feedback"
            icon="bubble.left"
            variant="secondary"
            fullWidth
            onPress={handleFeedback}
          />
          <Button
            label="Privacy Policy"
            icon="doc.text"
            variant="secondary"
            fullWidth
            onPress={() => router.push("/privacy-policy")}
          />
          {signOut.error && (
            <InlineAlert
              tone="error"
              title="Couldn't sign out"
              message={signOut.error}
            />
          )}
          <Button
            label="Sign out"
            variant="secondary"
            pending={signOut.pending}
            fullWidth
            onPress={() => void handleSignOut()}
          />
        </View>
      </View>

      <View style={[styles.section, styles.dangerSection]}>
        <SectionTitle
          title="Delete account"
          subtitle="Permanently removes your personal data. Past match results stay, shown as Deleted User."
        />
        <Button
          label="Delete account"
          icon="trash"
          variant="danger"
          fullWidth
          onPress={() => void handleDeleteAccountPress()}
        />
      </View>

      <Modal
        visible={showDeleteModal}
        transparent
        animationType="fade"
        onRequestClose={closeDeleteModal}
      >
        <KeyboardSafeView style={styles.modalOverlay}>
          <View
            style={styles.modalCard}
            accessibilityViewIsModal
            accessibilityLabel="Confirm account deletion"
          >
            <Text style={styles.modalTitle} accessibilityRole="header">
              Enter your password to delete your account
            </Text>
            <Text style={styles.modalSubtitle}>
              This is the last step. Your account and personal data are deleted
              right away and can&apos;t be recovered.
            </Text>
            <FormField
              label="Password"
              required
              value={deletePassword}
              onChangeText={(value) => {
                setDeletePassword(value);
                if (deleteAccount.error) deleteAccount.reset();
              }}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="current-password"
              textContentType="password"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={() => {
                if (deletePassword) void deleteAccount.run(deletePassword);
              }}
            />
            {deleteAccount.error && (
              <InlineAlert
                tone="error"
                title="Account not deleted"
                message={deleteAccount.error}
                style={styles.modalAlert}
              />
            )}
            <View style={styles.modalActions}>
              <Button
                label="Delete my account"
                variant="danger"
                pending={deleteAccount.pending}
                pendingLabel="Deleting…"
                disabled={!deletePassword}
                fullWidth
                onPress={() => void deleteAccount.run(deletePassword)}
              />
              <Button
                label="Keep my account"
                variant="secondary"
                disabled={deleteAccount.pending}
                fullWidth
                onPress={closeDeleteModal}
              />
            </View>
          </View>
        </KeyboardSafeView>
      </Modal>
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
  },
  identity: { alignItems: "center", marginBottom: spacing.xl },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  avatarText: { color: colors.onPrimary, fontSize: 32, fontWeight: "700" },
  name: {
    ...typography.heading,
    fontSize: 22,
    color: colors.text,
    textAlign: "center",
  },
  email: {
    ...typography.bodySmall,
    color: colors.textMuted,
    textAlign: "center",
  },
  alertGap: { marginBottom: spacing.lg },
  section: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...elevations.low,
  },
  dangerSection: { borderWidth: 1, borderColor: colors.destructiveSoft },
  sectionHead: { marginBottom: spacing.md, gap: spacing.xxs },
  sectionTitle: { ...typography.subheading, color: colors.primary },
  sectionSubtitle: { ...typography.caption, color: colors.textMuted },
  fields: { gap: spacing.md },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.md,
    minHeight: MIN_TOUCH_TARGET,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowLast: { borderBottomWidth: 0 },
  rowLabel: { ...typography.bodySmall, color: colors.textMuted },
  rowValue: {
    ...typography.bodySmall,
    fontWeight: "500",
    color: colors.text,
    flexShrink: 1,
    textAlign: "right",
  },
  valueText: { ...typography.body, color: colors.text },
  fieldNote: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  blockedRow: { justifyContent: "space-between" },
  blockedName: { textAlign: "left", flex: 1 },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: MIN_TOUCH_TARGET + spacing.sm,
    paddingVertical: spacing.sm,
    gap: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  toggleRowLast: { borderBottomWidth: 0 },
  toggleText: { flex: 1, gap: spacing.xxs },
  toggleLabel: { ...typography.body, fontSize: 15, color: colors.text },
  toggleLabelOff: { color: colors.textMuted },
  toggleDescription: { ...typography.caption, color: colors.textMuted },
  actions: { gap: spacing.md, marginBottom: spacing.xl },
  accountActions: { gap: spacing.md },
  divisionList: { gap: spacing.sm },
  divisionOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: MIN_TOUCH_TARGET,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    overflow: "hidden",
  },
  divisionOptionActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.textMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  radioActive: { borderColor: colors.primary },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  divisionOptionText: { ...typography.label, color: colors.text, flex: 1 },
  divisionOptionTextActive: { color: colors.primary },
  slotSummary: {
    ...typography.body,
    color: colors.text,
    paddingVertical: spacing.xs,
  },
  slotCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  slotHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  slotHeading: { ...typography.label, color: colors.text },
  dayChips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  dayChip: { minWidth: 48, paddingHorizontal: spacing.sm },
  timeRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm },
  timeField: { flex: 1 },
  slotDash: {
    ...typography.body,
    color: colors.textMuted,
    paddingBottom: spacing.md,
  },
  fieldError: {
    ...typography.caption,
    color: colors.destructive,
    fontWeight: "600",
    marginBottom: spacing.sm,
  },
  noteField: { marginTop: spacing.md },
  noteInput: { minHeight: 72 },
  emptyHint: { ...typography.bodySmall, color: colors.textMuted },
  noteText: {
    ...typography.bodySmall,
    color: colors.text,
    marginTop: spacing.sm,
    fontStyle: "italic",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: "center",
    padding: spacing.xl,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.xl,
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
    ...elevations.medium,
  },
  modalTitle: {
    ...typography.heading,
    fontSize: 18,
    lineHeight: 24,
    color: colors.destructive,
    marginBottom: spacing.sm,
  },
  modalSubtitle: {
    ...typography.bodySmall,
    color: colors.textMuted,
    marginBottom: spacing.lg,
  },
  modalAlert: { marginTop: spacing.md },
  modalActions: { gap: spacing.md, marginTop: spacing.lg },
});
