import { Text, type StyleProp, type TextStyle } from 'react-native';
import { getMatchStatusMetadata } from '@tennis/shared';
import type { Match } from '@tennis/shared';

export function StatusBadge({
  status,
  style,
}: {
  status: Match['status'];
  style?: StyleProp<TextStyle>;
}) {
  const metadata = getMatchStatusMetadata(status);

  return (
    <Text
      accessibilityLabel={metadata.accessibilityLabel}
      style={[styles.badge, style, { color: metadata.color }]}
    >
      {metadata.icon} {metadata.label}
    </Text>
  );
}

const styles = {
  badge: { fontWeight: '700', fontSize: 13 },
} satisfies Record<string, TextStyle>;
