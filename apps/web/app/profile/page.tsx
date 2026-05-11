"use client";

export const dynamic = "force-dynamic";

import { AppNav, appNavStyles } from "../shared/AppNav";
import { useEffect, useState } from "react";
import {
  useAuthUser,
  useUserProfile,
  updateUserProfile,
  useDivisionOptions,
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
} from "@tennis/shared";
const NOTIFICATION_OPT_IN_KEY = "tennis-notifications-opt-in";

export default function ProfilePage(): React.JSX.Element {
  const { firebaseUser, loading: authLoading } = useAuthUser();
  const { profile, loading: profileLoading } = useUserProfile(
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
    profile?.divisionId,
  );
  const [selectedDivisionId, setSelectedDivisionId] = useState("");

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.displayName ?? "");
    setEmail(profile.email ?? "");
    setPhone(profile.phone ?? "");
    setAllowEmail(profile.contactPreferences?.allowEmail ?? true);
    setAllowSMS(profile.contactPreferences?.allowSMS ?? true);
    setAllowInApp(profile.contactPreferences?.allowInApp ?? true);
    setTipsEnabled(profile.tipsEnabled ?? true);
    setAvailabilitySlots(profile.availability?.slots ?? []);
    setAvailabilityNote(profile.availability?.note ?? "");
    setSelectedDivisionId(profile.divisionId ?? "");
  }, [profile]);

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
    if (!firebaseUser || !profile) return;
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

  if (authLoading || profileLoading) {
    return <div style={styles.placeholder}>Loading profile…</div>;
  }

  if (!profile) {
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

        {error && <div style={styles.error}>{error}</div>}

        <div style={styles.actions}>
          <button style={styles.saveBtn} onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </button>
          {savedAt && (
            <span style={styles.saved}>
              Saved · {new Date(savedAt).toLocaleTimeString()}
            </span>
          )}
        </div>
      </main>
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
};
