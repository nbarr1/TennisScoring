import { SymbolView, type SymbolViewProps } from "expo-symbols";
import {
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";

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
export const ICON_COLOR = {
  active: "#1A472A",
  inactive: "#767676",
  inverse: "#FFFFFF",
  destructive: "#B42318",
  warning: "#9A6700",
  success: "#1A6B3C",
} as const;

type AppIconProps = {
  name: SymbolViewProps["name"];
  size?: (typeof ICON_SIZE)[keyof typeof ICON_SIZE];
  color?: string;
  emphasized?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Product icons are decorative by default; adjacent labels provide their meaning. */
export function AppIcon({
  name,
  size = ICON_SIZE.action,
  color = ICON_COLOR.inactive,
  emphasized = false,
  style,
}: AppIconProps) {
  return (
    <SymbolView
      name={name}
      size={size}
      tintColor={color}
      weight={emphasized ? ICON_WEIGHT.emphasized : ICON_WEIGHT.regular}
      style={style}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

export function IconLabel({
  name,
  children,
  color = ICON_COLOR.active,
  textStyle,
}: {
  name: SymbolViewProps["name"];
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
      }}
    >
      <AppIcon name={name} size={ICON_SIZE.small} color={color} />
      <Text style={textStyle}>{children}</Text>
    </View>
  );
}
