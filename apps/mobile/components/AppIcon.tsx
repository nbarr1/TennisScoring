import { SymbolView, type SymbolViewProps } from "expo-symbols";
import {
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
// Import tokens directly (not the theme index): theme/primitives imports this
// file, and going through the index would make a require cycle.
import { colors } from "../theme/tokens";

/** Shared sizes, stroke weights, and semantic colors for product iconography. */
export const ICON_SIZE = {
  small: 16,
  action: 20,
  tab: 24,
  feature: 32,
  brand: 48,
} as const;
export const ICON_WEIGHT = {
  regular: "regular",
  emphasized: "semibold",
} as const;
/**
 * Icon tints. Icons are non-text graphics (3:1 floor); every value here clears
 * 4:1 on white and Paper Canvas.
 */
export const ICON_COLOR = {
  active: colors.primary,
  inactive: "#767676",
  inverse: "#FFFFFF",
  destructive: "#B42318",
  warning: "#9A6700",
  success: "#1A6B3C",
} as const;

type SymbolName = SymbolViewProps["name"];
type AndroidSymbol = Exclude<
  Extract<SymbolName, object>["android"],
  undefined
>;

/**
 * SF Symbol → Material Symbol, so Android draws its own icon set. expo-symbols
 * renders nothing on Android for a bare SF Symbol name, so an SF name missing
 * from this table shows no icon there: add it here when you use a new one.
 * Material Symbols has no separate fill variant in the bundled font, so
 * `.fill` names map to the same glyph.
 */
const ANDROID_SYMBOLS: Record<string, AndroidSymbol> = {
  applewatch: "watch",
  "arrow.clockwise": "refresh",
  "arrow.up.arrow.down": "swap_vert",
  "arrow.uturn.backward": "undo",
  "bubble.left": "chat_bubble",
  "bubble.left.fill": "chat_bubble",
  calendar: "calendar_month",
  "calendar.badge.plus": "calendar_add_on",
  checkmark: "check",
  "checkmark.circle": "check_circle",
  "checkmark.circle.fill": "check_circle",
  "doc.text": "description",
  envelope: "mail",
  "exclamationmark.circle": "error",
  "exclamationmark.circle.fill": "error",
  "exclamationmark.triangle": "warning",
  "exclamationmark.triangle.fill": "warning",
  "figure.tennis": "sports_tennis",
  flag: "flag",
  gearshape: "settings",
  "gearshape.fill": "settings",
  hourglass: "hourglass_empty",
  "info.circle": "info",
  "info.circle.fill": "info",
  link: "link",
  magnifyingglass: "search",
  pencil: "edit",
  "person.crop.circle": "account_circle",
  "person.crop.circle.fill": "account_circle",
  "person.crop.circle.badge.plus": "person_add",
  "person.crop.circle.badge.xmark": "person_remove",
  "person.crop.rectangle.stack": "contacts",
  phone: "call",
  plus: "add",
  "square.and.arrow.up": "share",
  tray: "inbox",
  trash: "delete",
  trophy: "trophy",
  "trophy.fill": "trophy",
  xmark: "close",
  "xmark.circle": "cancel",
  "xmark.circle.fill": "cancel",
};

function platformName(name: SymbolName): SymbolName {
  if (typeof name !== "string") return name;
  const android = ANDROID_SYMBOLS[name];
  return android ? { ios: name, android } : name;
}

type AppIconProps = {
  name: SymbolName;
  size?: (typeof ICON_SIZE)[keyof typeof ICON_SIZE];
  color?: string;
  emphasized?: boolean;
  style?: StyleProp<ViewStyle>;
  /**
   * Only for an icon that stands alone and carries meaning (no adjacent text).
   * Without it the icon is hidden from VoiceOver/TalkBack. Icons inside a
   * labelled button should stay unlabelled: the button carries the label.
   */
  accessibilityLabel?: string;
};

/** Product icons are decorative by default; adjacent labels provide their meaning. */
export function AppIcon({
  name,
  size = ICON_SIZE.action,
  color = ICON_COLOR.inactive,
  emphasized = false,
  style,
  accessibilityLabel,
}: AppIconProps) {
  const labelled = !!accessibilityLabel;
  // The wrapper carries the accessibility props: on Android expo-symbols draws
  // the glyph as a font ligature in a plain Text, which ignores them and would
  // otherwise be read aloud as a stray character.
  return (
    <View
      style={style}
      accessible={labelled}
      accessibilityRole={labelled ? "image" : undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityElementsHidden={!labelled}
      importantForAccessibility={labelled ? "yes" : "no-hide-descendants"}
    >
      <SymbolView
        name={platformName(name)}
        size={size}
        tintColor={color}
        weight={emphasized ? ICON_WEIGHT.emphasized : ICON_WEIGHT.regular}
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
    </View>
  );
}

export function IconLabel({
  name,
  children,
  color = ICON_COLOR.active,
  textStyle,
}: {
  name: SymbolName;
  children: React.ReactNode;
  color?: string;
  textStyle?: StyleProp<TextStyle>;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        maxWidth: "100%",
      }}
    >
      <AppIcon name={name} size={ICON_SIZE.small} color={color} />
      <Text style={[{ flexShrink: 1 }, textStyle]}>{children}</Text>
    </View>
  );
}
