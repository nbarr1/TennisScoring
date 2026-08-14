"use client";

export const dynamic = "force-dynamic";

import { AppNav, appNavStyles } from "../shared/AppNav";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getDoc } from "firebase/firestore";
import { EmailAuthProvider, reauthenticateWithCredential, signOut } from "firebase/auth";
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
  DAYS_OF_WEEK,
  DAY_LABELS,
  addAvailabilitySlot,
  buildUserProfileUpdates,
  removeAvailabilitySlot,
  updateAvailabilitySlot,
  validateAvailabilitySlots,
  type AvailabilitySlot,
  type DayOfWeek,
  type PublicProfile,
} from "@tennis/shared";
const NOTIFICATION_OPT_IN_KEY = "tennis-notifications-opt-in";

export default function ProfilePage(): React.JSX.Element {
  const router = useRouter();
  const { firebaseUser, loading: authLoading } = useAuthUser();
  const { user, loading: userLoading } = usePrivateUser(
    firebaseUser?.uid ?? null,
  );

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [allowEmail, setAllowEmail] = useState(true);
  const [allowSMS, setAllowSMS] = useState(true);
  const [allowInApp, setAllowInApp] = useState(true);
  const [tipsEnabled, setTipsEnabled] = useState(true);
  const [availabilitySlots, setAvailabilitySlots] = useState<
    AvailabilitySlot[]
  >([]);
  const [availabilityNote, setAvailabilityNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState("");
  const divisionOptions = useDivisionOptions(
    firebaseUser?.uid,
    user?.divisionId,
  );
  const [selectedDivisionId, setSelectedDivisionId] = useState("");
  const [blockedProfiles, setBlockedProfiles] = useState<PublicProfile[]>([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    if (!user) return;
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
      setError("Could not unblock user. Please try again.");
    }
  }

  function handleDeleteAccountPress() {
    setDeleteError("");
    setDeletePassword("");
    setShowDeleteModal(true);
  }

  async function confirmDeleteAccount() {
    if (!firebaseUser?.email || !deletePassword) return;
    setDeleting(true);
    setDeleteError("");
    try {
      const credential = EmailAuthProvider.credential(
        firebaseUser.email,
        deletePassword,
      );
      await reauthenticateWithCredential(firebaseUser, credential);
      await deleteAccountCallable();
      setShowDeleteModal(false);
      setDeletePassword("");
      await signOut(auth);
      await fetch("/api/auth/logout", { method: "POST" });
      router.replace("/login");
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
        setDeleteError("Incorrect password. Please re-enter your password to confirm.");
      } else if (code === "functions/failed-precondition") {
        setDeleteError(
          "Transfer division leadership to another player before deleting your account.",
        );
      } else {
        setDeleteError(
          (e as { message?: string }).message || "Could not delete account. Please try again.",
        );
      }
    } finally {
      setDeleting(false);
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

  async function handleEnableNotifications() {
    setError("");
    if (!("Notification" in window)) {
      setError("Browser notifications are not supported on this device.");
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setError(
        "Notifications were not enabled. You can retry from browser settings.",
      );
      return;
    }
    window.localStorage.setItem(NOTIFICATION_OPT_IN_KEY, "true");
    window.dispatchEvent(new Event("tennis-notifications-opt-in"));
    setSavedAt(Date.now());
  }

  async function handleSave() {
    if (!firebaseUser || !user) return;
    const validation = validateAvailabilitySlots(availabilitySlots);
    if (!validation.valid) {
      setError(validation.message);
      return;
    }
    setSaving(true);
    setError("");
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
      setSavedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save profile.");
    } finally {
      setSaving(false);
    }
  }

  if (authLoading || userLoading) {
    return <div style={styles.placeholder}>Loading profile…</div>;
  }

  if (!user) {
    return (
      <div style={styles.placeholder}>
        No profile found. Try signing out and back in.
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <AppNav active="profile" />

      <main style={styles.main}>
        <h1 style={styles.pageTitle}>Profile</h1>

        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Account</h2>
          <Field label="Display name" id="profile-display-name">
            <input
              id="profile-display-name"
              style={styles.input}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </Field>
          <Field label="Email" id="profile-email">
            <input
              id="profile-email"
              style={styles.input}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Phone" id="profile-phone">
            <input
              id="profile-phone"
              style={styles.input}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Optional, e.g. +1 555-0100"
            />
          </Field>
          <Field label="Division" id="profile-division">
            <select
              id="profile-division"
              style={styles.input}
              value={selectedDivisionId}
              onChange={(e) => setSelectedDivisionId(e.target.value)}
            >
              <option value="">No division</option>
              {divisionOptions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Contact preferences</h2>
          <p style={styles.helper}>
            Control how teammates can reach you when sharing your contact card
            in chat.
          </p>
          <CheckboxRow
            checked={allowEmail}
            onChange={setAllowEmail}
            label="Allow email contact"
          />
          <CheckboxRow
            checked={allowSMS}
            onChange={setAllowSMS}
            label="Allow SMS / phone contact"
          />
          <CheckboxRow
            checked={allowInApp}
            onChange={setAllowInApp}
            label="Allow in-app messages"
          />
        </div>

        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Preferred play times</h2>
          <p style={styles.helper}>
            Add weekly windows when you&apos;re typically free. Opponents see
            this when proposing a match.
          </p>
          {availabilitySlots.length === 0 && (
            <p style={styles.helper}>No availability set yet.</p>
          )}
          {availabilitySlots.map((slot, idx) => (
            <div key={idx} style={styles.slotRow}>
              <select
                aria-label={`Availability slot ${idx + 1} day`}
                style={styles.slotDay}
                value={slot.day}
                onChange={(e) =>
                  updateSlot(idx, { day: e.target.value as DayOfWeek })
                }
              >
                {DAYS_OF_WEEK.map((d) => (
                  <option key={d} value={d}>
                    {DAY_LABELS[d]}
                  </option>
                ))}
              </select>
              <input
                aria-label={`Availability slot ${idx + 1} start time`}
                style={styles.slotTime}
                type="time"
                value={slot.from}
                onChange={(e) => updateSlot(idx, { from: e.target.value })}
              />
              <span style={styles.slotDash}>–</span>
              <input
                aria-label={`Availability slot ${idx + 1} end time`}
                style={styles.slotTime}
                type="time"
                value={slot.to}
                onChange={(e) => updateSlot(idx, { to: e.target.value })}
              />
              <button
                type="button"
                style={styles.slotRemove}
                aria-label={`Remove availability slot ${idx + 1}`}
                onClick={() => removeSlot(idx)}
              >
                ✕
              </button>
            </div>
          ))}
          <button type="button" style={styles.addSlotBtn} onClick={addSlot}>
            + Add slot
          </button>
          <Field label="Note" id="profile-availability-note">
            <textarea
              id="profile-availability-note"
              style={{ ...styles.input, minHeight: 64, resize: "vertical" }}
              value={availabilityNote}
              onChange={(e) => setAvailabilityNote(e.target.value)}
              placeholder="Optional, e.g. Flexible weekends; usually busy Tues."
            />
          </Field>
        </div>

        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>App preferences</h2>
          <CheckboxRow
            checked={tipsEnabled}
            onChange={setTipsEnabled}
            label="Show in-match tips during live scoring"
          />
          <p style={styles.helper}>
            Enable browser notifications to receive match proposals, reports,
            and messages on this device.
          </p>
          <button
            type="button"
            style={styles.secondaryBtn}
            onClick={handleEnableNotifications}
          >
            Enable browser notifications
          </button>
        </div>

        {blockedProfiles.length > 0 && (
          <div style={styles.card}>
            <h2 style={styles.sectionTitle}>Blocked users</h2>
            {blockedProfiles.map((p) => (
              <div key={p.id} style={styles.blockedRow}>
                <span>{p.displayName}</span>
                <button
                  type="button"
                  style={styles.unblockBtn}
                  onClick={() => handleUnblock(p.id)}
                >
                  Unblock
                </button>
              </div>
            ))}
          </div>
        )}

        {error && <div role="alert" style={styles.error}>{error}</div>}

        <div style={styles.actions}>
          <button style={styles.saveBtn} onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </button>
          {savedAt && (
            <span role="status" aria-live="polite" style={styles.saved}>
              Saved · {new Date(savedAt).toLocaleTimeString()}
            </span>
          )}
        </div>

        <div style={styles.dangerCard}>
          <h2 style={styles.sectionTitle}>Delete account</h2>
          <p style={styles.helper}>
            Permanently deletes your account and removes your personal data. This cannot be undone.
            Division leaders must transfer leadership first.
          </p>
          <button
            type="button"
            style={styles.dangerBtn}
            onClick={handleDeleteAccountPress}
          >
            Delete account
          </button>
        </div>
      </main>

      {showDeleteModal && (
        <div style={styles.modalOverlay} onClick={() => setShowDeleteModal(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-account-title"
            style={styles.modalCard}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="delete-account-title" style={styles.modalTitle}>Confirm account deletion</h3>
            <p style={styles.helper}>
              Enter your password to permanently delete your account. This cannot be undone.
            </p>
            <label htmlFor="delete-password" style={styles.label}>Password</label>
            <input
              id="delete-password"
              type="password"
              style={styles.input}
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              autoComplete="current-password"
            />
            {deleteError && <div role="alert" style={styles.error}>{deleteError}</div>}
            <div style={styles.modalBtns}>
              <button
                type="button"
                style={styles.modalCancel}
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                style={styles.dangerBtn}
                onClick={confirmDeleteAccount}
                disabled={!deletePassword || deleting}
              >
                {deleting ? "Deleting…" : "Permanently delete account"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  id,
  children,
}: {
  label: string;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <div style={styles.field}>
      <label htmlFor={id} style={styles.label}>{label}</label>
      {children}
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
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={styles.checkbox}
      />
      <span>{label}</span>
    </label>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: appNavStyles.page,
  main: { maxWidth: 720, margin: "0 auto", padding: "40px 24px" },
  pageTitle: {
    fontSize: 28,
    fontWeight: 800,
    color: "var(--green-dark)",
    marginBottom: 24,
  },
  card: {
    background: "#fff",
    borderRadius: 14,
    padding: 28,
    marginBottom: 20,
    boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: "var(--green-dark)",
    marginBottom: 16,
  },
  field: { marginBottom: 16 },
  label: {
    display: "block",
    fontSize: 13,
    fontWeight: 600,
    color: "#444",
    marginBottom: 6,
  },
  input: {
    width: "100%",
    border: "1px solid #ddd",
    borderRadius: 10,
    padding: "10px 14px",
    fontSize: 14,
    boxSizing: "border-box",
  },
  helper: { fontSize: 12, color: "#888", marginTop: 6 },
  checkboxRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 0",
    cursor: "pointer",
    fontSize: 14,
    color: "#333",
  },
  checkbox: { width: 16, height: 16, accentColor: "#1a472a" },
  actions: { display: "flex", alignItems: "center", gap: 16, marginTop: 8 },
  secondaryBtn: {
    background: "#f0f5ef",
    color: "var(--green-dark)",
    border: "none",
    borderRadius: 10,
    padding: "12px 18px",
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
    marginTop: 12,
  },
  saveBtn: {
    background: "var(--green-dark)",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    padding: "12px 24px",
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
  },
  saved: { color: "#2d6a4f", fontSize: 13, fontWeight: 600 },
  error: { color: "#c0392b", fontSize: 13, marginBottom: 12 },
  placeholder: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "50vh",
    color: "#888",
  },
  slotRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
    flexWrap: "wrap",
  },
  slotDay: {
    border: "1px solid #ddd",
    borderRadius: 8,
    padding: "8px 10px",
    fontSize: 14,
    background: "#fff",
  },
  slotTime: {
    border: "1px solid #ddd",
    borderRadius: 8,
    padding: "8px 10px",
    fontSize: 14,
    width: 110,
  },
  slotDash: { color: "#888" },
  slotRemove: {
    border: "none",
    background: "transparent",
    color: "#c0392b",
    cursor: "pointer",
    fontSize: 16,
    padding: "4px 8px",
  },
  addSlotBtn: {
    background: "transparent",
    color: "var(--green-dark)",
    border: "1px dashed var(--green-dark)",
    borderRadius: 8,
    padding: "8px 14px",
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
    marginBottom: 12,
  },
  blockedRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 0",
    borderBottom: "1px solid #f0f0f0",
    fontSize: 14,
    color: "#333",
  },
  unblockBtn: {
    background: "transparent",
    color: "var(--green-dark)",
    border: "1px solid var(--green-dark)",
    borderRadius: 8,
    padding: "6px 12px",
    fontWeight: 600,
    fontSize: 12,
    cursor: "pointer",
  },
  dangerCard: {
    background: "#fff4f4",
    border: "1px solid #f3c9c4",
    borderRadius: 14,
    padding: 28,
    marginBottom: 20,
  },
  dangerBtn: {
    background: "#c0392b",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    padding: "12px 20px",
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
  },
  modalOverlay: {
    position: "fixed" as const,
    inset: 0,
    background: "rgba(0,0,0,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
    padding: 16,
  },
  modalCard: {
    background: "#fff",
    borderRadius: 16,
    padding: 28,
    maxWidth: 420,
    width: "100%",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: "#1a1a1a",
    marginBottom: 12,
  },
  modalBtns: {
    display: "flex",
    gap: 12,
    justifyContent: "flex-end",
    marginTop: 16,
  },
  modalCancel: {
    background: "#f0f0f0",
    color: "#333",
    border: "none",
    borderRadius: 8,
    padding: "10px 20px",
    fontWeight: 600,
    fontSize: 14,
    cursor: "pointer",
  },
};
