"use client";

import type { CSSProperties, ReactNode } from "react";
import { Button, useDialogClose, color, fieldLabelStyle, radius, space, type } from "../shared/ui";

export const DIVISION_ACCESS_HINTS = [
  "You are signed in to Firebase Auth with the expected account.",
  "Your users/{uid}.role is admin or app_developer, OR your users/{uid}.divisionId matches this division.",
  "Your uid is listed in this division's leaderIds or playerIds roster.",
];

/** Troubleshooting detail shown under a permission-denied load error. */
export function PermissionHints({
  hints,
  authDebug,
}: {
  hints: string[] | null;
  authDebug: { uid: string; email: string; roleClaim?: unknown } | null;
}): React.JSX.Element | null {
  if (!hints) return null;
  // The checks name database fields, which mean nothing to most leaders. They stay one click
  // away for whoever is asked to help, rather than leading the message.
  return (
    <details style={{ marginTop: space.sm }}>
      <summary
        style={{
          ...type.label,
          cursor: "pointer",
          minHeight: 44,
          display: "flex",
          alignItems: "center",
        }}
      >
        Troubleshooting details
      </summary>
      <p style={{ margin: `${space.xs}px 0 0` }}>Check that:</p>
      <ul style={{ margin: `${space.xs}px 0 0 18px`, padding: 0, display: "grid", gap: space.xs }}>
        {hints.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      {authDebug ? (
        <p style={{ margin: `${space.sm}px 0 0`, ...type.caption }}>
          Signed in as uid <code>{authDebug.uid}</code>, email <code>{authDebug.email}</code>
          {authDebug.roleClaim !== undefined ? (
            <>
              , token role claim <code>{String(authDebug.roleClaim)}</code>
            </>
          ) : null}
        </p>
      ) : null}
    </details>
  );
}

/** Cancel inside a shared Dialog: goes through requestClose so a dirty form asks first. */
export function DialogCancelButton({
  label = "Cancel",
  disabled,
}: {
  label?: string;
  disabled?: boolean;
}): React.JSX.Element {
  const requestClose = useDialogClose();
  return (
    <Button variant="secondary" onClick={requestClose} disabled={disabled}>
      {label}
    </Button>
  );
}

/** A labelled form field with an optional hint line under the label. */
export function Field({
  id,
  label,
  hint,
  children,
  style,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
}): React.JSX.Element {
  return (
    <div style={{ display: "grid", alignContent: "start", minWidth: 0, ...style }}>
      <label htmlFor={id} style={fieldLabelStyle}>
        {label}
      </label>
      {hint ? (
        <p id={`${id}-hint`} style={{ ...type.caption, color: color.textMuted, margin: `0 0 ${space.xs}px` }}>
          {hint}
        </p>
      ) : null}
      {children}
    </div>
  );
}

/** A checkbox with its label as one 44px-tall target. */
export function CheckboxRow({
  checked,
  onChange,
  children,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}): React.JSX.Element {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: space.md,
        minHeight: 44,
        padding: `${space.md}px 0`,
        cursor: disabled ? "not-allowed" : "pointer",
        ...type.bodySmall,
        color: color.ink,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        style={{ width: 20, height: 20, margin: 0, flexShrink: 0, accentColor: color.clubhouseGreen }}
      />
      <span style={{ display: "grid", gap: 2 }}>
        <span style={{ fontWeight: 600 }}>{children}</span>
        {description ? <span style={{ color: color.textMuted }}>{description}</span> : null}
      </span>
    </label>
  );
}

/** A small count pill, e.g. on a tab. The number is spelled out for screen readers by the caller. */
export function CountPill({
  count,
  tone = "warning",
}: {
  count: number;
  tone?: "warning" | "unassigned";
}): React.JSX.Element {
  const fill = tone === "unassigned" ? color.unassignedSoft : color.warningSoft;
  const text = tone === "unassigned" ? color.unassignedText : color.warningText;
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 22,
        height: 22,
        padding: "0 6px",
        borderRadius: radius.pill,
        background: fill,
        color: text,
        ...type.caption,
        fontWeight: 700,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {count}
    </span>
  );
}

export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}
