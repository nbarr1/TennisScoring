"use client";

import type { CSSProperties, ReactNode } from "react";
import { IconAlertCircle, IconAlertTriangle, IconCircleCheck, IconInfoCircle, IconX } from "@tabler/icons-react";
import { color, radius, space, type } from "./tokens";

export type AlertTone = "error" | "success" | "info" | "warning";

const TONES: Record<AlertTone, { fill: string; edge: string; text: string; Icon: typeof IconInfoCircle }> = {
  error: { fill: color.destructiveSoft, edge: color.destructive, text: color.destructivePressed, Icon: IconAlertCircle },
  success: { fill: color.greenSoft, edge: color.courtGreen, text: color.clubhouseGreen, Icon: IconCircleCheck },
  info: { fill: color.infoSoft, edge: color.info, text: color.info, Icon: IconInfoCircle },
  warning: { fill: color.warningSoft, edge: color.warning, text: color.warningText, Icon: IconAlertTriangle },
};

/**
 * A tinted message with a 4px tone-colored left edge (DESIGN.md "Inline
 * alerts"), an icon so the tone is never color-only, an optional title, and
 * an optional action (e.g. a Try again button) or dismiss control.
 *
 * Errors render with role="alert" so they are announced as soon as they
 * appear; the other tones use role="status". Pass `role={null}` for a static
 * alert that is part of the page from the start and should not be announced.
 */
export function InlineAlert({
  tone = "info",
  title,
  children,
  action,
  onDismiss,
  dismissLabel = "Dismiss",
  role,
  id,
  style,
}: {
  tone?: AlertTone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  onDismiss?: () => void;
  dismissLabel?: string;
  role?: "alert" | "status" | null;
  id?: string;
  style?: CSSProperties;
}): React.JSX.Element {
  const t = TONES[tone];
  const resolvedRole = role === null ? undefined : role ?? (tone === "error" ? "alert" : "status");

  return (
    <div
      id={id}
      role={resolvedRole}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: space.sm,
        padding: space.md,
        background: t.fill,
        borderLeft: `4px solid ${t.edge}`,
        borderRadius: radius.sm,
        color: t.text,
        ...style,
      }}
    >
      <t.Icon size={20} aria-hidden="true" style={{ marginTop: 1, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>
        {title && <div style={{ ...type.label }}>{title}</div>}
        {children && <div style={{ ...type.bodySmall, marginTop: title ? 2 : 0 }}>{children}</div>}
        {action && <div style={{ marginTop: space.sm, display: "flex", flexWrap: "wrap", gap: space.sm }}>{action}</div>}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={dismissLabel}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 44,
            height: 44,
            margin: -10,
            marginLeft: 0,
            background: "transparent",
            border: "none",
            borderRadius: radius.sm,
            color: "inherit",
            flexShrink: 0,
          }}
        >
          <IconX size={18} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/**
 * A caption-size error line under a form field. Give the field
 * `aria-invalid` and `aria-describedby={id}`.
 */
export function FieldError({ id, children }: { id: string; children?: ReactNode }): React.JSX.Element | null {
  if (!children) return null;
  return (
    <div id={id} style={{ ...type.caption, color: color.destructivePressed, marginTop: space.xs }}>
      {children}
    </div>
  );
}
