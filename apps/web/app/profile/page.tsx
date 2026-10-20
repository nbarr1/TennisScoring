"use client";

export const dynamic = "force-dynamic";

import { AppNav, appNavStyles } from "../shared/AppNav";
import { IconBellRinging, IconPlus, IconTrash } from "@tabler/icons-react";
import { cloneElement, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteField, getDoc } from "firebase/firestore";
import { EmailAuthProvider, reauthenticateWithCredential } from "firebase/auth";
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
  DAYS_OF_WEEK,
  DAY_LABELS,
  addAvailabilitySlot,
  isAdminRole,
  buildUserProfileUpdates,
  removeAvailabilitySlot,
  updateAvailabilitySlot,
  validateAvailabilitySlots,
  type AvailabilitySlot,
  type DayOfWeek,
  type User,
} from "@tennis/shared";
import {
  Button,
  Dialog,
  EmptyState,
  ErrorState,
  FieldError,
  InlineAlert,
  LoadingBlock,
  cardStyle,
  color,
  describeError,
  fieldLabelStyle,
  inputStyle,
  radius,
  space,
  target,
  type,
  useAnnounce,
  useAsyncAction,
  width,
} from "../shared/ui";

const NOTIFICATION_OPT_IN_KEY = "tennis-notifications-opt-in";

type BlockedEntry = { id: string; displayName: string | null };
type NotificationState = "unsupported" | "default" | "granted" | "denied";

function readNotificationState(): NotificationState {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  const permission = Notification.permission as NotificationState;
  if (permission !== "granted") return permission;
  // FcmProvider only registers this device once the player has opted in here.
  try {
    return window.localStorage.getItem(NOTIFICATION_OPT_IN_KEY) === "true" ? "granted" : "default";
  } catch {
    return "default";
  }
}

/**
 * The fields of `buildUserProfileUpdates()` that this account may actually
 * write, in a form Firestore accepts.
 *
 * - The builder turns an empty phone, contact email, or division into
 *   `undefined`, and `WriteBatch.update` rejects any `undefined` field, so a
 *   player with no phone number could never save. Undefined fields are
 *   dropped; a phone number the player cleared is deleted.
 * - The security rules let a player change neither `email` nor `divisionId`
 *   on their own user document (only an app administrator can), so sending
 *   either, even an unchanged email that differs only in case, failed the
 *   whole save. They are sent only for administrators, and only when changed.
 */
function writableProfileUpdates(updates: Partial<User>, user: User): Partial<User> {
  const canEditRestricted = isAdminRole(user.role);
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(updates)) {
    if (key === "email" || key === "divisionId") {
      if (!canEditRestricted) continue;
      const before = (user as unknown as Record<string, unknown>)[key];
      if (value === before || (value === undefined && !before)) continue;
      result[key] = value === undefined ? deleteField() : value;
      continue;
    }
    if (value === undefined) {
      if (key === "phone" && user.phone) result[key] = deleteField();
      continue;
    }
    result[key] = value;
  }
  return result as Partial<User>;
}

export default function ProfilePage(): React.JSX.Element {
  const router = useRouter();
  const announce = useAnnounce();
  const { firebaseUser, loading: authLoading } = useAuthUser();
  const [reloadKey, setReloadKey] = useState(0);
  const { user, loading: userLoading } = usePrivateUser(firebaseUser?.uid ?? null, reloadKey);

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [allowEmail, setAllowEmail] = useState(true);
  const [allowSMS, setAllowSMS] = useState(true);
  const [allowInApp, setAllowInApp] = useState(true);
  const [tipsEnabled, setTipsEnabled] = useState(true);
  const [availabilitySlots, setAvailabilitySlots] = useState<AvailabilitySlot[]>([]);
  const [availabilityNote, setAvailabilityNote] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const divisionOptions = useDivisionOptions(firebaseUser?.uid, user?.divisionId);
  const [selectedDivisionId, setSelectedDivisionId] = useState("");
  const [blocked, setBlocked] = useState<BlockedEntry[]>([]);
  const [blockedLoading, setBlockedLoading] = useState(false);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);
  const [unblockError, setUnblockError] = useState("");
  const [notificationState, setNotificationState] = useState<NotificationState>("default");
  const [notificationError, setNotificationError] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const deletePasswordRef = useRef<HTMLInputElement>(null);
  const slotDayRefs = useRef<Array<HTMLSelectElement | null>>([]);
  const focusSlotRef = useRef<number | null>(null);

  // The values the form started from, to tell the player when they have unsaved edits.
  const initial = useMemo(
    () =>
      user
        ? JSON.stringify({
            displayName: user.displayName ?? "",
            email: user.email ?? "",
            phone: user.phone ?? "",
            allowEmail: user.contactPreferences?.allowEmail ?? true,
            allowSMS: user.contactPreferences?.allowSMS ?? true,
            allowInApp: user.contactPreferences?.allowInApp ?? true,
            tipsEnabled: user.tipsEnabled ?? true,
            availabilitySlots: user.availability?.slots ?? [],
            availabilityNote: user.availability?.note ?? "",
            selectedDivisionId: user.divisionId ?? "",
          })
        : "",
    [user],
  );
  const current = JSON.stringify({
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
  const dirty = !!user && initial !== current;

  // The form values the fields were last seeded from, and the latest form
  // values, so a later snapshot of the user document re-seeds the form only
  // when the player has no unsaved edits. Cloud Functions write to this
  // document on every confirmed result in the division (rankingSummary), and
  // re-seeding on each of those wiped half-entered play times.
  const seededFrom = useRef<string | null>(null);
  const latestForm = useRef(current);
  latestForm.current = current;

  useEffect(() => {
    if (!user) return;
    const untouched = seededFrom.current === null || latestForm.current === seededFrom.current;
    if (!untouched && latestForm.current !== initial) return;
    seededFrom.current = initial;
    setDisplayName(user.displayName ?? "");
    setEmail(user.email ?? "");
    setPhone(user.phone ?? "");
    setAllowEmail(user.contactPreferences?.allowEmail ?? true);
    setAllowSMS(user.contactPreferences?.allowSMS ?? true);
    setAllowInApp(user.contactPreferences?.allowInApp ?? true);
    setTipsEnabled(user.tipsEnabled ?? true);
    setAvailabilitySlots(user.availability?.slots ?? []);
    setAvailabilityNote(user.availability?.note ?? "");
    setSelectedDivisionId(user.divisionId ?? "");
  }, [user, initial]);

  // Leaving the page (reload, close, typed address) with unsaved edits asks first.
  useEffect(() => {
    if (!dirty) return undefined;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    setNotificationState(readNotificationState());
  }, []);

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
      ids.map(async (id): Promise<BlockedEntry> => {
        try {
          const snap = await getDoc(profileDoc(id));
          return { id, displayName: snap.exists() ? snap.data()?.displayName || null : null };
        } catch {
          // Still listed, so a player whose profile can't be read can be unblocked.
          return { id, displayName: null };
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      setBlocked(entries);
      setBlockedLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.blockedUserIds]);

  // Move focus to a newly added slot so keyboard users land on it.
  useEffect(() => {
    const index = focusSlotRef.current;
    if (index === null) return;
    focusSlotRef.current = null;
    slotDayRefs.current[index]?.focus();
  }, [availabilitySlots.length]);

  const slotErrors = availabilitySlots.map((slot) => {
    const result = validateAvailabilitySlots([slot]);
    return result.valid ? null : result.message;
  });
  const nameError = displayName.trim() ? null : "Enter the name other players will see.";
  const emailError =
    email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? "Enter an email address like name@example.com." : null;

  const save = useAsyncAction(
    async () => {
      if (!firebaseUser || !user) return;
      await updateUserProfile(
        firebaseUser.uid,
        writableProfileUpdates(buildUserProfileUpdates({
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
        }), user),
      );
      setSavedAt(Date.now());
    },
    { successMessage: "Profile saved", errorMessage: "Couldn't save your profile. Please try again." },
  );

  const canEditRestrictedFields = isAdminRole(user?.role);

  function handleSave() {
    const validation = validateAvailabilitySlots(availabilitySlots);
    const blockingEmailError = canEditRestrictedFields ? emailError : null;
    if (nameError || blockingEmailError || !validation.valid) {
      setShowErrors(true);
      save.setError(
        nameError ??
          blockingEmailError ??
          (!validation.valid ? `Check your preferred play times. ${validation.message}` : null),
      );
      return;
    }
    setShowErrors(false);
    void save.run();
  }

  async function handleUnblock(entry: BlockedEntry) {
    if (!firebaseUser || unblockingId) return;
    setUnblockingId(entry.id);
    setUnblockError("");
    try {
      await unblockUser(firebaseUser.uid, entry.id);
      announce(`${entry.displayName ?? "Player"} unblocked. Their messages will show again.`, { toast: true });
    } catch (e) {
      setUnblockError(describeError(e, "Couldn't unblock this player. Please try again."));
    } finally {
      setUnblockingId(null);
    }
  }

  function addSlot() {
    focusSlotRef.current = availabilitySlots.length;
    setAvailabilitySlots(addAvailabilitySlot);
  }
  function updateSlot(idx: number, patch: Partial<AvailabilitySlot>) {
    setAvailabilitySlots((slots) => updateAvailabilitySlot(slots, idx, patch));
  }
  function removeSlot(idx: number) {
    const slot = availabilitySlots[idx];
    setAvailabilitySlots((slots) => removeAvailabilitySlot(slots, idx));
    if (slot) announce(`Removed ${DAY_LABELS[slot.day]} ${slot.from} to ${slot.to}. Save changes to keep this.`);
  }

  async function handleEnableNotifications() {
    setNotificationError("");
    if (!("Notification" in window)) {
      setNotificationState("unsupported");
      return;
    }
    const permission = await Notification.requestPermission();
    setNotificationState(permission as NotificationState);
    if (permission !== "granted") {
      setNotificationError(
        "Notifications weren't turned on. Allow notifications for this site in your browser's settings, then try again.",
      );
      return;
    }
    try {
      window.localStorage.setItem(NOTIFICATION_OPT_IN_KEY, "true");
    } catch {
      // Storage can be blocked; FcmProvider still registers on this event.
    }
    window.dispatchEvent(new Event("tennis-notifications-opt-in"));
    announce("Browser notifications are on for this device.", { toast: true });
  }

  function openDeleteDialog() {
    setDeleteError("");
    setDeletePassword("");
    setShowDeleteModal(true);
  }

  async function confirmDeleteAccount(e?: React.FormEvent) {
    e?.preventDefault();
    if (deleting) return;
    if (!firebaseUser?.email) {
      setDeleteError("Couldn't confirm your sign-in. Sign out, sign back in, and try again.");
      return;
    }
    if (!deletePassword) {
      setDeleteError("Enter your password to confirm.");
      deletePasswordRef.current?.focus();
      return;
    }
    setDeleting(true);
    setDeleteError("");
    let deleted = false;
    try {
      const credential = EmailAuthProvider.credential(firebaseUser.email, deletePassword);
      await reauthenticateWithCredential(firebaseUser, credential);
      await deleteAccountCallable();
      deleted = true;
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
        setDeleteError("That password is incorrect. Re-enter it to confirm.");
        deletePasswordRef.current?.select();
      } else if (code === "functions/failed-precondition") {
        setDeleteError(
          "You lead a division. Transfer division leadership to another player, then delete your account.",
        );
      } else if (code === "auth/too-many-requests") {
        setDeleteError("Too many attempts. Wait a few minutes and try again.");
      } else {
        setDeleteError(describeError(err, "Couldn't delete your account. Please try again."));
      }
    } finally {
      if (!deleted) setDeleting(false);
    }
    if (!deleted) return;
    // The account is gone: always end on the sign-in page, even if clearing
    // the session fails part-way.
    try {
      await signOutReleasingPushToken();
    } catch {
      // Ignore; the Auth user no longer exists.
    }
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Ignore; the session cookie no longer maps to an account.
    }
    router.replace("/login");
  }

  if (authLoading || userLoading) {
    return (
      <div style={styles.page}>
        <AppNav active="profile" />
        <main style={styles.main}>
          <h1 style={styles.pageTitle}>Profile</h1>
          <LoadingBlock label="Loading your profile…" rows={6} rowHeight={40} />
        </main>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={styles.page}>
        <AppNav active="profile" />
        <main style={styles.main}>
          <h1 style={styles.pageTitle}>Profile</h1>
          <ErrorState
            title="Couldn't load your profile."
            message="Check your connection and try again. If this keeps happening, sign out and sign back in."
            onRetry={() => setReloadKey((k) => k + 1)}
          />
        </main>
      </div>
    );
  }

  const notificationsOn = notificationState === "granted";
  // Only an app administrator may change these two on their own account
  // (firestore.rules); for everyone else the save would be refused.
  const canEditRestricted = isAdminRole(user.role);
  const activeDivisionName =
    divisionOptions.find((d) => d.id === user.divisionId)?.name ?? (user.divisionId ? "Your division" : "No division yet");

  return (
    <div style={styles.page}>
      <AppNav active="profile" />

      <main style={styles.main}>
        <h1 style={styles.pageTitle}>Profile</h1>

        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            handleSave();
          }}
        >
          <section style={styles.card} aria-labelledby="profile-account">
            <h2 id="profile-account" style={styles.sectionTitle}>
              Account
            </h2>
            <Field
              label="Display name"
              id="profile-display-name"
              error={showErrors ? nameError : null}
              hint="Shown to other players on matches, standings, and messages."
            >
              <input
                id="profile-display-name"
                style={inputFieldStyle(showErrors && !!nameError)}
                value={displayName}
                autoComplete="name"
                maxLength={80}
                aria-invalid={showErrors && !!nameError}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </Field>
            <Field
              label="Contact email"
              id="profile-email"
              error={canEditRestricted && showErrors ? emailError : null}
              hint={
                canEditRestricted
                  ? firebaseUser?.email
                    ? `Changing this doesn't change the email you sign in with (${firebaseUser.email}).`
                    : "Changing this doesn't change the email you sign in with."
                  : "Shown on your contact card when you share it. To change it, ask an app administrator."
              }
            >
              <input
                id="profile-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                readOnly={!canEditRestricted}
                style={canEditRestricted ? inputFieldStyle(showErrors && !!emailError) : styles.readOnlyInput}
                value={email}
                aria-invalid={canEditRestricted && showErrors && !!emailError}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field label="Phone (optional)" id="profile-phone" hint="For example +1 555-0100.">
              <input
                id="profile-phone"
                type="tel"
                autoComplete="tel"
                style={inputFieldStyle(false)}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </Field>
            {canEditRestricted ? (
              <Field
                label="Active division"
                id="profile-division"
                hint="Your dashboard, matches, and division chat show this division."
              >
                <select
                  id="profile-division"
                  style={inputFieldStyle(false)}
                  value={selectedDivisionId}
                  onChange={(e) => setSelectedDivisionId(e.target.value)}
                >
                  {/* A division can't be cleared by saving, so "No division" is offered only while none is set. */}
                  {!user.divisionId && <option value="">No division</option>}
                  {divisionOptions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <Field
                label="Active division"
                id="profile-division"
                hint={
                  divisionOptions.length > 1
                    ? "Your dashboard, matches, and division chat show this division. To make another of your divisions the active one, ask an app administrator."
                    : "Your dashboard, matches, and division chat show this division."
                }
              >
                <input id="profile-division" readOnly value={activeDivisionName} style={styles.readOnlyInput} />
              </Field>
            )}
          </section>

          <section style={styles.card}>
            <fieldset style={styles.fieldset}>
              <legend style={styles.legend}>Contact preferences</legend>
              <p style={styles.helper}>
                When you share your contact card in a chat, it only includes the ways you allow here.
              </p>
              <CheckboxRow checked={allowEmail} onChange={setAllowEmail} label="Email" />
              <CheckboxRow checked={allowSMS} onChange={setAllowSMS} label="Text message or phone call" />
              <CheckboxRow checked={allowInApp} onChange={setAllowInApp} label="In-app messages" />
            </fieldset>
          </section>

          <section style={styles.card} aria-labelledby="profile-availability">
            <h2 id="profile-availability" style={styles.sectionTitle}>
              Preferred play times
            </h2>
            <p style={styles.helper}>
              Weekly windows when you&apos;re usually free. Opponents see these when they propose a match.
            </p>
            {availabilitySlots.length === 0 ? (
              <p style={styles.emptySlots}>No play times yet. Add one so opponents know when to propose.</p>
            ) : (
              <ul style={styles.slotList}>
                {availabilitySlots.map((slot, idx) => {
                  const slotError = slotErrors[idx];
                  const errorId = `slot-${idx}-error`;
                  const label = `Play time ${idx + 1}`;
                  return (
                    <li key={idx} style={styles.slotItem}>
                      <div role="group" aria-label={label} style={styles.slotRow}>
                        <label style={styles.slotField}>
                          <span style={styles.slotLabel}>Day</span>
                          <select
                            ref={(el) => {
                              slotDayRefs.current[idx] = el;
                            }}
                            style={inputFieldStyle(false)}
                            value={slot.day}
                            onChange={(e) => updateSlot(idx, { day: e.target.value as DayOfWeek })}
                          >
                            {DAYS_OF_WEEK.map((d) => (
                              <option key={d} value={d}>
                                {DAY_LABELS[d]}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label style={styles.slotField}>
                          <span style={styles.slotLabel}>From</span>
                          <input
                            style={inputFieldStyle(!!slotError)}
                            type="time"
                            value={slot.from}
                            aria-invalid={!!slotError}
                            aria-describedby={slotError ? errorId : undefined}
                            onChange={(e) => updateSlot(idx, { from: e.target.value })}
                          />
                        </label>
                        <label style={styles.slotField}>
                          <span style={styles.slotLabel}>To</span>
                          <input
                            style={inputFieldStyle(!!slotError)}
                            type="time"
                            value={slot.to}
                            aria-invalid={!!slotError}
                            aria-describedby={slotError ? errorId : undefined}
                            onChange={(e) => updateSlot(idx, { to: e.target.value })}
                          />
                        </label>
                        <Button
                          variant="quiet-danger"
                          size="sm"
                          aria-label={`Remove ${label}, ${DAY_LABELS[slot.day]} ${slot.from} to ${slot.to}`}
                          icon={<IconTrash size={18} aria-hidden="true" />}
                          onClick={() => removeSlot(idx)}
                          style={styles.slotRemove}
                        >
                          Remove
                        </Button>
                      </div>
                      {slotError && <FieldError id={errorId}>{slotError}</FieldError>}
                    </li>
                  );
                })}
              </ul>
            )}
            <Button
              variant="secondary"
              size="sm"
              icon={<IconPlus size={18} aria-hidden="true" />}
              onClick={addSlot}
              style={{ marginBottom: space.lg }}
            >
              Add a play time
            </Button>
            <Field label="Note (optional)" id="profile-availability-note" hint="For example: Flexible weekends; usually busy Tuesdays.">
              <textarea
                id="profile-availability-note"
                style={{ ...inputFieldStyle(false), minHeight: 88, padding: "10px 12px", resize: "vertical" }}
                value={availabilityNote}
                maxLength={500}
                onChange={(e) => setAvailabilityNote(e.target.value)}
              />
            </Field>
          </section>

          <section style={styles.card} aria-labelledby="profile-app">
            <h2 id="profile-app" style={styles.sectionTitle}>
              App preferences
            </h2>
            <CheckboxRow
              checked={tipsEnabled}
              onChange={setTipsEnabled}
              label="Show in-match tips during live scoring"
            />
          </section>

          <div style={styles.saveBar}>
            {save.error && (
              <InlineAlert tone="error" style={{ width: "100%" }}>
                {save.error}
              </InlineAlert>
            )}
            <Button type="submit" pending={save.pending} pendingLabel="Saving…">
              Save changes
            </Button>
            <span role="status" style={dirty ? styles.unsaved : styles.saved}>
              {dirty
                ? "You have unsaved changes."
                : savedAt
                  ? `Saved at ${new Date(savedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
                  : ""}
            </span>
          </div>
        </form>

        <section style={styles.card} aria-labelledby="profile-notifications">
          <h2 id="profile-notifications" style={styles.sectionTitle}>
            Notifications on this device
          </h2>
          {notificationState === "unsupported" ? (
            <p style={styles.helper}>This browser doesn&apos;t support notifications. Use the mobile app to get them.</p>
          ) : notificationsOn ? (
            <InlineAlert tone="success" role={null}>
              Browser notifications are on. You&apos;ll get match proposals, reports, and messages on this device.
            </InlineAlert>
          ) : (
            <>
              <p style={styles.helper}>
                Get match proposals, reports to confirm, and new messages on this device. This takes effect
                right away; you don&apos;t need to save.
              </p>
              <Button
                variant="secondary"
                icon={<IconBellRinging size={18} aria-hidden="true" />}
                onClick={() => void handleEnableNotifications()}
              >
                Turn on browser notifications
              </Button>
            </>
          )}
          {notificationError && (
            <InlineAlert tone="warning" style={{ marginTop: space.md }}>
              {notificationError}
            </InlineAlert>
          )}
        </section>

        <section style={styles.card} aria-labelledby="profile-blocked">
          <h2 id="profile-blocked" style={styles.sectionTitle}>
            Blocked players
          </h2>
          <p style={styles.helper}>
            You don&apos;t see messages from players you block, and they can&apos;t notify you. Unblocking takes effect
            right away.
          </p>
          {unblockError && (
            <InlineAlert tone="error" style={{ marginBottom: space.md }}>
              {unblockError}
            </InlineAlert>
          )}
          {blockedLoading ? (
            <LoadingBlock label="Loading blocked players…" rows={2} rowHeight={44} />
          ) : blocked.length === 0 ? (
            <EmptyState compact title="You haven't blocked anyone." description="Block a player from the menu on any of their messages." style={{ padding: space.lg }} />
          ) : (
            <ul style={styles.blockedList}>
              {blocked.map((entry) => {
                const name = entry.displayName ?? "Unknown player";
                return (
                  <li key={entry.id} style={styles.blockedRow}>
                    <span style={styles.blockedName}>{name}</span>
                    <Button
                      variant="secondary"
                      size="sm"
                      pending={unblockingId === entry.id}
                      pendingLabel="Unblocking…"
                      disabled={unblockingId !== null && unblockingId !== entry.id}
                      aria-label={`Unblock ${name}`}
                      onClick={() => void handleUnblock(entry)}
                    >
                      Unblock
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section style={styles.dangerCard} aria-labelledby="profile-delete">
          <h2 id="profile-delete" style={{ ...styles.sectionTitle, color: color.destructivePressed }}>
            Delete account
          </h2>
          <p style={styles.helperInk}>
            Permanently deletes your account and personal details. This can&apos;t be undone. If you lead a division,
            transfer leadership to another player first.
          </p>
          <Button variant="danger" onClick={openDeleteDialog}>
            Delete account…
          </Button>
        </section>
      </main>

      <Dialog
        open={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete your account?"
        role="alertdialog"
        size="sm"
        dismissible={!deleting}
        initialFocusRef={deletePasswordRef}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowDeleteModal(false)} disabled={deleting}>
              Keep my account
            </Button>
            <Button type="submit" form="delete-account-form" variant="danger" pending={deleting} pendingLabel="Deleting…">
              Delete my account
            </Button>
          </>
        }
      >
        <form id="delete-account-form" onSubmit={(e) => void confirmDeleteAccount(e)} noValidate>
          <p style={styles.dialogText}>This can&apos;t be undone. When you delete your account:</p>
          <ul style={styles.consequences}>
            <li>Your name, email, phone, play times, and notification settings are erased.</li>
            <li>
              Your profile shows as &ldquo;Deleted User&rdquo;. Your past match results stay, so other players&apos;
              standings stay accurate.
            </li>
            <li>You leave every division and division chat. Direct conversations stay with the other player.</li>
            <li>You&apos;re signed out on this device.</li>
          </ul>
          <label htmlFor="delete-password" style={fieldLabelStyle}>
            Enter your password to confirm
          </label>
          <input
            id="delete-password"
            ref={deletePasswordRef}
            type="password"
            style={inputFieldStyle(!!deleteError)}
            value={deletePassword}
            aria-invalid={!!deleteError}
            aria-describedby={deleteError ? "delete-password-error" : undefined}
            onChange={(e) => setDeletePassword(e.target.value)}
            autoComplete="current-password"
          />
          {deleteError && <FieldError id="delete-password-error">{deleteError}</FieldError>}
        </form>
      </Dialog>
    </div>
  );
}

function inputFieldStyle(invalid: boolean): React.CSSProperties {
  return invalid ? { ...inputStyle, borderColor: color.destructive } : inputStyle;
}

function Field({
  label,
  id,
  hint,
  error,
  children,
}: {
  label: string;
  id: string;
  hint?: string;
  error?: string | null;
  children: React.ReactElement<{ "aria-describedby"?: string }>;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div style={styles.field}>
      <label htmlFor={id} style={fieldLabelStyle}>
        {label}
      </label>
      {cloneElement(children, { "aria-describedby": describedBy })}
      {hint && (
        <p id={hintId} style={styles.hint}>
          {hint}
        </p>
      )}
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </div>
  );
}

function CheckboxRow({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label style={styles.checkboxRow}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={styles.checkbox} />
      <span>{label}</span>
    </label>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: appNavStyles.page,
  main: { maxWidth: width.reading, margin: "0 auto", padding: "40px 24px" },
  pageTitle: { ...type.display, color: color.clubhouseGreen, marginBottom: space.xl },
  card: { ...cardStyle, padding: space.xl, marginBottom: space.xl },
  sectionTitle: { ...type.headline, color: color.clubhouseGreen, marginBottom: space.md },
  fieldset: { border: "none", margin: 0, padding: 0, minWidth: 0 },
  legend: { ...type.headline, color: color.clubhouseGreen, marginBottom: space.md, padding: 0 },
  field: { marginBottom: space.lg },
  hint: { ...type.caption, color: color.textMuted, marginTop: space.xs },
  helper: { ...type.bodySmall, color: color.textMuted, marginBottom: space.md, maxWidth: "65ch" },
  helperInk: { ...type.bodySmall, color: color.ink, marginBottom: space.md, maxWidth: "65ch" },
  checkboxRow: {
    display: "flex",
    alignItems: "center",
    gap: space.md,
    minHeight: target.min,
    cursor: "pointer",
    ...type.body,
    color: color.ink,
  },
  checkbox: { width: 20, height: 20, accentColor: "var(--clubhouse-green)", flexShrink: 0 },
  saveBar: {
    position: "sticky",
    bottom: 0,
    zIndex: 5,
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: space.md,
    padding: `${space.md}px ${space.lg}px`,
    margin: `0 -${space.lg}px ${space.xl}px`,
    background: color.canvas,
    borderTop: `1px solid ${color.border}`,
  },
  saved: { ...type.label, color: color.courtGreen },
  readOnlyInput: { ...inputStyle, background: color.surfaceMuted, borderColor: color.border, color: color.ink },
  unsaved: { ...type.label, color: color.warningText },
  emptySlots: { ...type.bodySmall, color: color.textMuted, marginBottom: space.md },
  slotList: { listStyle: "none", margin: 0, padding: 0, display: "grid", gap: space.md, marginBottom: space.md },
  slotItem: {
    padding: space.md,
    borderRadius: radius.md,
    background: color.surfaceMuted,
  },
  slotRow: {
    display: "flex",
    alignItems: "flex-end",
    gap: space.sm,
    flexWrap: "wrap",
  },
  slotField: { display: "grid", gap: space.xs, flex: "1 1 120px", minWidth: 0 },
  slotLabel: { ...type.caption, fontWeight: 600, color: color.ink },
  slotRemove: { minHeight: target.control },
  blockedList: { listStyle: "none", margin: 0, padding: 0 },
  blockedRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
    padding: `${space.sm}px 0`,
    borderBottom: `1px solid ${color.border}`,
  },
  blockedName: { ...type.body, color: color.ink, overflowWrap: "anywhere", minWidth: 0 },
  dangerCard: {
    background: color.destructiveSoft,
    borderRadius: radius.card,
    padding: space.xl,
    marginBottom: space.xl,
  },
  dialogText: { ...type.body, color: color.ink, marginBottom: space.sm },
  consequences: {
    ...type.bodySmall,
    color: color.ink,
    paddingLeft: 20,
    margin: `0 0 ${space.lg}px`,
    display: "grid",
    gap: space.xs,
  },
};
