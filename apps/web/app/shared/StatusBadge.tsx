import { getMatchStatusMetadata } from "@tennis/shared";
import type { CSSProperties } from "react";
import type { Match } from "@tennis/shared";

export function StatusBadge({
  status,
  style,
}: {
  status: Match["status"];
  style?: CSSProperties;
}) {
  const metadata = getMatchStatusMetadata(status);

  return (
    <span
      aria-label={metadata.accessibilityLabel}
      style={{ ...styles.badge, ...style, color: metadata.color }}
    >
      <span aria-hidden="true">{metadata.icon}</span> {metadata.label}
    </span>
  );
}

const styles = {
  badge: { fontWeight: 700, fontSize: 13 },
} satisfies Record<string, CSSProperties>;
