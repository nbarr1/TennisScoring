import { Platform, type TextStyle, type ViewStyle } from "react-native";
import type { MatchStatus } from "@tennis/shared";

/**
 * Clubhouse palette from DESIGN.md, light scheme. Every text pairing listed in
 * the comments was measured against Surface White and Paper Canvas.
 *
 * Text rule of thumb: `text` for body copy, `textMuted` for anything
 * secondary (captions, helper text, metadata, placeholders). `textSubtle`
 * measures 3.4:1 on white, below the 4.5:1 floor for normal-size text, so it
 * is for hairline glyphs, dividers, and large (>= 18pt bold) text only.
 *
 * Screens never import a palette directly: they read the one for the device's
 * color scheme through `useColors()` or `makeStyles()` (theme/scheme.ts).
 */
export const lightColors = {
  canvas: "#F5F5F0",
  surface: "#FFFFFF",
  surfaceMuted: "#F0F2ED",
  /** Clubhouse Green. 10.6:1 on white. */
  primary: "#1A472A",
  primaryPressed: "#12351F",
  primarySoft: "#E8F5E9",
  /** Light Green, for text on Clubhouse Green (`brand`) surfaces only. */
  primaryLight: "#A8D5A2",
  /**
   * Clubhouse Green in both schemes: headers, the brand mark, the tutorial.
   * `primary` lightens in the dark scheme so it can be read as text; `brand`
   * never does, so `onBrand` text is always white.
   */
  brand: "#1A472A",
  /** Text and icons on `brand`. 10.6:1. */
  onBrand: "#FFFFFF",
  /** Court Green, the positive-outcome green. 6.4:1 on white. */
  courtGreen: "#2D6A4F",
  /** Ball Yellow. Focus, current location, celebration. Never text on light surfaces. */
  accent: "#FFDC60",
  text: "#1A1A1A",
  /** Secondary text. 5.4:1 on white, 5.0:1 on canvas. */
  textMuted: "#666B68",
  /** 3.4:1 on white: decorative or large text only (see note above). */
  textSubtle: "#888D8A",
  /** Placeholder text inside inputs. 5.0:1 on white. */
  placeholder: "#6B706D",
  /** Hairline: dividers and chip strokes. 1.4:1, too faint to outline a field. */
  border: "#DADDD8",
  /** Strong Hairline: text field and other control edges. 3.3:1 on white. */
  borderStrong: "#8A8F8C",
  destructive: "#C0392B",
  destructivePressed: "#962D22",
  destructiveSoft: "#FBEAEA",
  onDestructive: "#FFFFFF",
  /** Warning Orange: fills, borders, and icons only (2.9:1 on white). */
  warning: "#E67E22",
  /** Warning text. 8.1:1 on white, 7.4:1 on its soft tint. */
  warningText: "#7A410D",
  warningSoft: "#FFF3E0",
  /** Success fill/icon. 4.3:1 on white, so use `successText` for text. */
  success: "#278B50",
  /** Success text (Court Green). 5.7:1 on the success tint. */
  successText: "#2D6A4F",
  successSoft: "#E8F5E9",
  info: "#2D6A8A",
  infoSoft: "#E8F2F7",
  /** Live Green: the in-progress dot and live card border, never text. */
  live: "#27AE60",
  /** Text that names a live match. 5.4:1 on white. */
  liveText: "#1E7B45",
  /** Proposed Purple. 5.9:1 on white. */
  proposed: "#8E44AD",
  /** Unassigned Amber pair: admin roster only (reuses the leader-badge tint). */
  unassignedSoft: "#FFF3CD",
  unassignedText: "#856404",
  disabled: "#C8CCC9",
  disabledText: "#777C79",
  overlay: "rgba(11, 17, 20, 0.55)",
  onPrimary: "#FFFFFF",
  /** Secondary text on a `primary` fill (the sender's own message time). */
  onPrimaryMuted: "rgba(255, 255, 255, 0.85)",
  /** Android ripple on surfaces and quiet controls. */
  ripple: "rgba(26, 71, 42, 0.12)",
  /** Android ripple on chips, outlined and quiet buttons. */
  rippleStrong: "rgba(26, 71, 42, 0.16)",
  /** Android ripple on `primary` and `destructive` fills. */
  rippleOnFill: "rgba(255, 255, 255, 0.24)",
  /** Icon tints (non-text graphics, 3:1 floor). 4.5:1 on white. */
  iconInactive: "#767676",
  /** 6.6:1 on white. */
  iconDestructive: "#B42318",
  /** 4.8:1 on white. */
  iconWarning: "#9A6700",
  /** 6.7:1 on white. */
  iconSuccess: "#1A6B3C",
  /** Android Switch thumb while off. */
  switchThumbOff: "#FFFFFF",
  transparent: "transparent",
} as const;

export type ThemeColors = { readonly [K in keyof typeof lightColors]: string };

/**
 * Clubhouse palette, dark scheme. The same keys as `lightColors`, so a screen
 * never branches on the scheme. Deep Clubhouse Green stays as `brand` (headers
 * and the brand mark, white text 10.6:1); `primary` becomes a light Clubhouse
 * Green so the same token reads as text, tint, and fill (with dark
 * `onPrimary` text). Ball Yellow is unchanged.
 *
 * Ratios were computed with the WCAG 2 formula against Night Canvas
 * (#0F1411), Night Surface (#1A211D), and Night Surface Muted (#242C27).
 * Normal text clears 4.5:1, control borders and icons 3:1.
 */
export const darkColors: ThemeColors = {
  canvas: "#0F1411",
  surface: "#1A211D",
  surfaceMuted: "#242C27",
  /** Light Clubhouse Green. 8.9:1 on surface, 10.1:1 on canvas, 6.7:1 on primarySoft. */
  primary: "#86CF98",
  primaryPressed: "#A3DCB1",
  /** Selected-chip tint. Body text 10.4:1 on it. */
  primarySoft: "#1E3A28",
  /** 6.4:1 on `brand`. */
  primaryLight: "#A8D5A2",
  brand: "#1A472A",
  /** 10.6:1 on `brand`. */
  onBrand: "#FFFFFF",
  /** 7.9:1 on surface. */
  courtGreen: "#74C493",
  /** 7.9:1 on `brand`. */
  accent: "#FFDC60",
  /** 13.8:1 on surface, 15.6:1 on canvas, 12.0:1 on surfaceMuted. */
  text: "#E8ECE9",
  /** 7.4:1 on surface, 8.4:1 on canvas, 6.5:1 on surfaceMuted. */
  textMuted: "#A8B0AB",
  /** 4.3:1 on surface: decorative or large text only, as in light. */
  textSubtle: "#7C847F",
  /** 6.3:1 on surface. */
  placeholder: "#9AA29D",
  /** Hairline: dividers only. */
  border: "#2E3732",
  /** Control edges. 4.1:1 on surface, 4.7:1 on canvas. */
  borderStrong: "#78827C",
  /** 7.2:1 on surface, 8.2:1 on canvas, 6.6:1 on destructiveSoft. */
  destructive: "#FF8A80",
  destructivePressed: "#FFA9A1",
  destructiveSoft: "#3B1E1C",
  /** Dark text on the light destructive fill. 8.0:1, 10.0:1 pressed. */
  onDestructive: "#2B0A06",
  /** Fills, borders, and icons. 8.1:1 on surface. */
  warning: "#F2A65A",
  /** 10.6:1 on surface, 8.9:1 on warningSoft. */
  warningText: "#FFC58A",
  warningSoft: "#3A2A17",
  /** 7.6:1 on surface. */
  success: "#5CC487",
  /** 9.9:1 on surface, 8.1:1 on successSoft. */
  successText: "#8FD9A8",
  successSoft: "#183424",
  /** 8.7:1 on surface, 7.5:1 on infoSoft. */
  info: "#8CC4E2",
  infoSoft: "#152E3B",
  /** 8.6:1 on surface. */
  live: "#4CD483",
  /** 9.9:1 on surface, 11.2:1 on canvas. */
  liveText: "#74DE9E",
  /** 8.4:1 on surface, 9.5:1 on canvas. */
  proposed: "#D5A8F0",
  unassignedSoft: "#3A3115",
  /** 8.7:1 on unassignedSoft, 11.1:1 on surface. */
  unassignedText: "#F2D272",
  disabled: "#3A433E",
  /** 3.3:1 on disabled (inactive controls are exempt; kept legible). */
  disabledText: "#8C958F",
  overlay: "rgba(0, 0, 0, 0.65)",
  /** Dark Clubhouse Green text on the light `primary` fill. 8.9:1, 10.5:1 pressed. */
  onPrimary: "#0B2414",
  /** 5.7:1 on `primary` (blends to #24462E). */
  onPrimaryMuted: "rgba(11, 36, 20, 0.8)",
  ripple: "rgba(134, 207, 152, 0.16)",
  rippleStrong: "rgba(134, 207, 152, 0.22)",
  rippleOnFill: "rgba(11, 36, 20, 0.2)",
  /** 6.3:1 on surface, 7.1:1 on canvas. */
  iconInactive: "#9AA29D",
  /** 7.2:1 on surface. */
  iconDestructive: "#FF8A80",
  /** 9.0:1 on surface. */
  iconWarning: "#F2B45A",
  /** 7.6:1 on surface. */
  iconSuccess: "#5CC487",
  /** 6.5:1 on the off track (`disabled`), so the thumb stays visible. */
  switchThumbOff: "#C9D0CC",
  transparent: "transparent",
};

export type ThemeScheme = "light" | "dark";

export const palettes: Record<ThemeScheme, ThemeColors> = {
  light: lightColors,
  dark: darkColors,
};

/**
 * Contrast-safe text color per match status, derived from a palette.
 * `MATCH_STATUS_METADATA.color` in @tennis/shared carries the brand status
 * color, but Live Green and Warning Orange read below 3:1 as text on white,
 * so status text on mobile uses these instead. Pair them with the metadata
 * glyph and label, never color alone. In the dark scheme each value clears
 * 4.5:1 on surface and canvas (see `darkColors`).
 */
export function statusTextColorsFor(
  c: ThemeColors,
): Record<MatchStatus, string> {
  return {
    proposed: c.proposed,
    scheduled: c.primary,
    in_progress: c.liveText,
    pending_report: c.warningText,
    completed: c.text,
    disputed: c.destructive,
    cancelled: c.textMuted,
  };
}

export const statusTextColorsByScheme: Record<
  ThemeScheme,
  Record<MatchStatus, string>
> = {
  light: statusTextColorsFor(lightColors),
  dark: statusTextColorsFor(darkColors),
};

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
  /** Mobile cards share the button/input corner. */
  card: 10,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

/**
 * Type scale. Sizes are density-independent and scale with the system font
 * size (Dynamic Type / Android font scale), so never pair them with a fixed
 * `height`; use `minHeight`.
 *
 * Mapping to DESIGN.md: `title` = headline (24), `heading` = title (20),
 * `subheading` = 16 bold, then body, bodySmall, label, caption.
 */
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

/**
 * The platform's minimum touch target: 48dp on Android (Material), 44pt on
 * iOS (HIG). Every pressable control must reach this, either by its own size
 * or through `hitSlop` (see `hitSlopFor`).
 */
export const MIN_TOUCH_TARGET: number = Platform.OS === "android" ? 48 : 44;

export const touchTargets = {
  /** 44: the cross-platform floor. Prefer `platform` for new controls. */
  minimum: 44,
  /** 48: buttons and inputs (DESIGN.md). */
  comfortable: 48,
  /** 48 on Android, 44 on iOS. */
  platform: MIN_TOUCH_TARGET,
} as const;

/** Short, functional motion. Turn it off when `useReduceMotion()` is true. */
export const motion = {
  press: 150,
  enter: 220,
} as const;

export const theme = {
  spacing,
  radii,
  typography,
  elevations,
  touchTargets,
  motion,
} as const;

export type AppTheme = typeof theme;
