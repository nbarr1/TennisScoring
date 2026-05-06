'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  useAuthUser,
  useUserProfile,
  updateUserProfile,
  divisionDoc,
  divisionsCol,
} from '@tennis/firebase-client';
import { getDoc, getDocs, query, where } from 'firebase/firestore';
import {
  DAYS_OF_WEEK,
  DAY_LABELS,
  type AvailabilitySlot,
  type DayOfWeek,
} from '@tennis/shared';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export default function ProfilePage(): React.JSX.Element {
  const { firebaseUser, loading: authLoading } = useAuthUser();
  const { profile, loading: profileLoading } = useUserProfile(
    firebaseUser?.uid ?? null,
  );

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [allowEmail, setAllowEmail] = useState(true);
  const [allowSMS, setAllowSMS] = useState(true);
  const [allowInApp, setAllowInApp] = useState(true);
  const [tipsEnabled, setTipsEnabled] = useState(true);
  const [availabilitySlots, setAvailabilitySlots] = useState<
    AvailabilitySlot[]
  >([]);
  const [availabilityNote, setAvailabilityNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [divisionOptions, setDivisionOptions] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [selectedDivisionId, setSelectedDivisionId] = useState('');

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.displayName ?? '');
    setEmail(profile.email ?? '');
    setPhone(profile.phone ?? '');
    setAllowEmail(profile.contactPreferences?.allowEmail ?? true);
    setAllowSMS(profile.contactPreferences?.allowSMS ?? true);
    setAllowInApp(profile.contactPreferences?.allowInApp ?? true);
    setTipsEnabled(profile.tipsEnabled ?? true);
    setAvailabilitySlots(profile.availability?.slots ?? []);
    setAvailabilityNote(profile.availability?.note ?? '');
    setSelectedDivisionId(profile.divisionId ?? '');
  }, [profile]);

  useEffect(() => {
    async function loadDivisionOptions() {
      const userId = firebaseUser?.uid;
      if (!userId) {
        setDivisionOptions([]);
        return;
      }

      const divisionById = new Map<string, { id: string; name: string }>();
      const addDivisionOption = (id: string, name?: string) => {
        const trimmedName = name?.trim();
        divisionById.set(id, { id, name: trimmedName || id });
      };

      const [playerSnap, leaderSnap, currentDivisionSnap] = await Promise.all([
        getDocs(
          query(divisionsCol(), where('playerIds', 'array-contains', userId)),
        ),
        getDocs(
          query(divisionsCol(), where('leaderIds', 'array-contains', userId)),
        ),
        profile?.divisionId ? getDoc(divisionDoc(profile.divisionId)) : null,
      ]);

      for (const docSnap of [...playerSnap.docs, ...leaderSnap.docs]) {
        addDivisionOption(
          docSnap.id,
          docSnap.data().name as string | undefined,
        );
      }

      if (profile?.divisionId) {
        addDivisionOption(
          profile.divisionId,
          currentDivisionSnap?.data()?.name as string | undefined,
        );
      }

      setDivisionOptions(Array.from(divisionById.values()));
    }
    void loadDivisionOptions();
  }, [firebaseUser?.uid, profile?.divisionId]);

  function addSlot() {
    setAvailabilitySlots((s) => [
      ...s,
      { day: 'mon', from: '18:00', to: '21:00' },
    ]);
  }
  function updateSlot(idx: number, patch: Partial<AvailabilitySlot>) {
    setAvailabilitySlots((slots) =>
      slots.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    );
  }
  function removeSlot(idx: number) {
    setAvailabilitySlots((slots) => slots.filter((_, i) => i !== idx));
  }

  async function handleSave() {
    if (!firebaseUser || !profile) return;
    for (const slot of availabilitySlots) {
      if (!TIME_RE.test(slot.from) || !TIME_RE.test(slot.to)) {
        setError('Times must be in HH:MM 24-hour format.');
        return;
      }
      if (slot.from >= slot.to) {
        setError('Each slot must end after it starts.');
        return;
      }
    }
    setSaving(true);
    setError('');
    try {
      await updateUserProfile(firebaseUser.uid, {
        displayName: displayName.trim(),
        email: email.trim().toLowerCase() || undefined,
        phone: phone.trim() || undefined,
        contactPreferences: { allowEmail, allowSMS, allowInApp },
        tipsEnabled,
        availability: {
          slots: availabilitySlots,
          ...(availabilityNote.trim() && { note: availabilityNote.trim() }),
        },
        divisionId: selectedDivisionId || undefined,
      });
      setSavedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save profile.');
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
      <nav style={styles.nav}>
        <span style={styles.navBrand}>🎾 Tennis League</span>
        <div style={styles.navLinks}>
          <Link href="/dashboard" style={styles.navLink}>
            Rankings
          </Link>
          <Link href="/matches" style={styles.navLink}>
            Matches
          </Link>
          <Link href="/messages" style={styles.navLink}>
            Messages
          </Link>
          <Link
            href="/profile"
            style={{ ...styles.navLink, ...styles.navLinkActive }}
          >
            Profile
          </Link>
          <Link href="/admin" style={styles.navLink}>
            Admin
          </Link>
        </div>
      </nav>

      <main style={styles.main}>
        <h1 style={styles.pageTitle}>Profile</h1>

        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Account</h2>
          <Field label="Display name">
            <input
              style={styles.input}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </Field>
          <Field label="Email">
            <input
              style={styles.input}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Phone">
            <input
              style={styles.input}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Optional, e.g. +1 555-0100"
            />
          </Field>
          <Field label="Division">
            <select
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
                style={styles.slotTime}
                type="time"
                value={slot.from}
                onChange={(e) => updateSlot(idx, { from: e.target.value })}
              />
              <span style={styles.slotDash}>–</span>
              <input
                style={styles.slotTime}
                type="time"
                value={slot.to}
                onChange={(e) => updateSlot(idx, { to: e.target.value })}
              />
              <button
                type="button"
                style={styles.slotRemove}
                onClick={() => removeSlot(idx)}
              >
                ✕
              </button>
            </div>
          ))}
          <button type="button" style={styles.addSlotBtn} onClick={addSlot}>
            + Add slot
          </button>
          <Field label="Note">
            <textarea
              style={{ ...styles.input, minHeight: 64, resize: 'vertical' }}
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
        </div>

        {error && <div style={styles.error}>{error}</div>}

        <div style={styles.actions}>
          <button style={styles.saveBtn} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
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
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={styles.field}>
      <label style={styles.label}>{label}</label>
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
  page: { minHeight: '100vh', background: 'var(--bg)' },
  nav: {
    background: 'var(--green-dark)',
    padding: '16px 32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    flexWrap: 'wrap',
  },
  navBrand: { color: '#fff', fontWeight: 700, fontSize: 20 },
  navLinks: { display: 'flex', gap: 24, flexWrap: 'wrap' },
  navLink: { color: 'rgba(255,255,255,0.75)', fontWeight: 500, fontSize: 15 },
  navLinkActive: {
    color: '#fff',
    borderBottom: '2px solid #ffdc60',
    paddingBottom: 2,
  },
  main: { maxWidth: 720, margin: '0 auto', padding: '40px 24px' },
  pageTitle: {
    fontSize: 28,
    fontWeight: 800,
    color: 'var(--green-dark)',
    marginBottom: 24,
  },
  card: {
    background: '#fff',
    borderRadius: 14,
    padding: 28,
    marginBottom: 20,
    boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: 'var(--green-dark)',
    marginBottom: 16,
  },
  field: { marginBottom: 16 },
  label: {
    display: 'block',
    fontSize: 13,
    fontWeight: 600,
    color: '#444',
    marginBottom: 6,
  },
  input: {
    width: '100%',
    border: '1px solid #ddd',
    borderRadius: 10,
    padding: '10px 14px',
    fontSize: 14,
    boxSizing: 'border-box',
    outline: 'none',
  },
  helper: { fontSize: 12, color: '#888', marginTop: 6 },
  checkboxRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 0',
    cursor: 'pointer',
    fontSize: 14,
    color: '#333',
  },
  checkbox: { width: 16, height: 16, accentColor: '#1a472a' },
  actions: { display: 'flex', alignItems: 'center', gap: 16, marginTop: 8 },
  saveBtn: {
    background: 'var(--green-dark)',
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    padding: '12px 24px',
    fontWeight: 700,
    fontSize: 14,
    cursor: 'pointer',
  },
  saved: { color: '#2d6a4f', fontSize: 13, fontWeight: 600 },
  error: { color: '#c0392b', fontSize: 13, marginBottom: 12 },
  placeholder: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '50vh',
    color: '#888',
  },
  slotRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  slotDay: {
    border: '1px solid #ddd',
    borderRadius: 8,
    padding: '8px 10px',
    fontSize: 14,
    background: '#fff',
  },
  slotTime: {
    border: '1px solid #ddd',
    borderRadius: 8,
    padding: '8px 10px',
    fontSize: 14,
    width: 110,
  },
  slotDash: { color: '#888' },
  slotRemove: {
    border: 'none',
    background: 'transparent',
    color: '#c0392b',
    cursor: 'pointer',
    fontSize: 16,
    padding: '4px 8px',
  },
  addSlotBtn: {
    background: 'transparent',
    color: 'var(--green-dark)',
    border: '1px dashed var(--green-dark)',
    borderRadius: 8,
    padding: '8px 14px',
    fontWeight: 600,
    fontSize: 13,
    cursor: 'pointer',
    marginBottom: 12,
  },
};
