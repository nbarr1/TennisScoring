import { getMatchStatusMetadata } from "@tennis/shared";
import type { CSSProperties } from "react";
import type { Match, MatchStatusMetadata } from "@tennis/shared";
import { color } from "./tokens";

/**
 * Text colors per status tone. The shared metadata colors are the status
 * hues; several of them (Live Green, Warning Orange, the cancelled gray) are
 * under 4.5:1 as 13px text on white, so the badge uses each tone's
 * contrast-safe text shade instead. Hue and meaning are unchanged.
 */
const TONE_TEXT: Partial<Record<MatchStatusMetadata["tone"], string>> = {
  accent: color.proposedPurple,
  primary: color.clubhouseGreen,
  success: color.liveText,
  warning: color.warningText,
  danger: color.destructive,
  neutral: color.textMuted,
};

/**
 * Match status: glyph + label in the status color, announced through its
 * accessibility label, so color is never the only cue.
 */
export function StatusBadge({
  status,
  style,
}: {
  status: Match["status"];
  style?: CSSProperties;
}) {
  const metadata = getMatchStatusMetadata(status);
  const textColor = TONE_TEXT[metadata.tone] ?? metadata.color;

  return (
    <span
      role="img"
      aria-label={metadata.accessibilityLabel}
      style={{ ...styles.badge, ...style, color: textColor }}
    >
      <span aria-hidden="true">{metadata.icon}</span><span aria-hidden="true">{metadata.label}</span>
    </span>
  );
}

const styles = {
  badge: { display: "inline-flex", alignItems: "baseline", gap: 4, fontWeight: 700, fontSize: 13, whiteSpace: "nowrap" },
} satisfies Record<string, CSSProperties>;
