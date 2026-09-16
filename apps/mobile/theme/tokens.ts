import type { TextStyle, ViewStyle } from "react-native";

export const colors = {
  canvas: "#F5F5F0",
  surface: "#FFFFFF",
  surfaceMuted: "#F0F2ED",
  primary: "#1A472A",
  primaryPressed: "#12351F",
  primarySoft: "#E8F5E9",
  accent: "#FFDC60",
  text: "#1A1A1A",
  textMuted: "#666B68",
  textSubtle: "#888D8A",
  border: "#DADDD8",
  destructive: "#C0392B",
  destructivePressed: "#962D22",
  destructiveSoft: "#FBEAEA",
  warning: "#E67E22",
  warningSoft: "#FFF3E0",
  success: "#278B50",
  successSoft: "#E8F5E9",
  info: "#2D6A8A",
  infoSoft: "#E8F2F7",
  disabled: "#C8CCC9",
  disabledText: "#777C79",
  overlay: "rgba(11, 17, 20, 0.55)",
  onPrimary: "#FFFFFF",
  transparent: "transparent",
} as const;

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radii = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

export const typography = {
  display: { fontSize: 32, lineHeight: 38, fontWeight: "800" },
  title: { fontSize: 24, lineHeight: 30, fontWeight: "700" },
  heading: { fontSize: 20, lineHeight: 26, fontWeight: "700" },
  subheading: { fontSize: 16, lineHeight: 22, fontWeight: "700" },
  body: { fontSize: 16, lineHeight: 24, fontWeight: "400" },
  bodySmall: { fontSize: 14, lineHeight: 20, fontWeight: "400" },
  label: { fontSize: 14, lineHeight: 18, fontWeight: "600" },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: "500" },
} as const satisfies Record<string, TextStyle>;

export const elevations = {
  none: {} as ViewStyle,
  low: {
    shadowColor: "#000000",
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 5,
    elevation: 2,
  } as ViewStyle,
  medium: {
    shadowColor: "#000000",
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 5,
  } as ViewStyle,
} as const;

export const touchTargets = {
  minimum: 44,
  comfortable: 48,
} as const;

export const theme = {
  colors,
  spacing,
  radii,
  typography,
  elevations,
  touchTargets,
} as const;

export type AppTheme = typeof theme;
