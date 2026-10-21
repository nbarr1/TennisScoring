import { Text, type StyleProp, type TextStyle } from "react-native";
import { getMatchStatusMetadata } from "@tennis/shared";
import type { Match } from "@tennis/shared";
import { typography } from "../theme/tokens";
import { useStatusTextColors } from "../theme/scheme";

/**
 * A match status as glyph + label (never color alone), e.g. "◐ Pending Report".
 * The color comes from `useStatusTextColors()`, which keeps every status at
 * 4.5:1 or better on the current scheme's surfaces. Screen readers hear the metadata's
 * accessibility label ("Match pending report"), not the glyph.
 */
export function StatusBadge({
  status,
  style,
}: {
  status: Match["status"];
  style?: StyleProp<TextStyle>;
}) {
  const metadata = getMatchStatusMetadata(status);
  const statusTextColors = useStatusTextColors();

  return (
    <Text
      accessibilityRole="text"
      accessibilityLabel={metadata.accessibilityLabel}
      style={[
        styles.badge,
        style,
        { color: statusTextColors[status] ?? metadata.color },
      ]}
    >
      {metadata.icon} {metadata.label}
    </Text>
  );
}

const styles = {
  badge: { ...typography.label, fontWeight: "700", fontSize: 13 },
} satisfies Record<string, TextStyle>;
