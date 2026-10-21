import { Platform, type TextStyle, type ViewStyle } from "react-native";
import type { MatchStatus } from "@tennis/shared";

/**
 * Clubhouse palette from DESIGN.md. Every text pairing listed in the comments
 * was measured against Surface White and Paper Canvas.
 *
 * Text rule of thumb: `text` for body copy, `textMuted` for anything
 * secondary (captions, helper text, metadata, placeholders). `textSubtle`
 * measures 3.4:1 on white, below the 4.5:1 floor for normal-size text, so it
 * is for hairline glyphs, dividers, and large (>= 18pt bold) text only.
 */
export const colors = {
  canvas: "#F5F5F0",
  surface: "#FFFFFF",
  surfaceMuted: "#F0F2ED",
  /** Clubhouse Green. 10.6:1 on white. */
  primary: "#1A472A",
  primaryPressed: "#12351F",
  primarySoft: "#E8F5E9",
  /** Light Green, for text on Clubhouse Green surfaces only. */
  primaryLight: "#A8D5A2",
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
  transparent: "transparent",
} as const;

/**
 * Contrast-safe text color per match status, for light (clubhouse) surfaces.
 * `MATCH_STATUS_METADATA.color` in @tennis/shared carries the brand status
 * color, but Live Green and Warning Orange read below 3:1 as text on white,
 * so status text on mobile uses these instead. Pair them with the metadata
 * glyph and label, never color alone.
 */
export const statusTextColors: Record<MatchStatus, string> = {
  proposed: colors.proposed,
  scheduled: colors.primary,
  in_progress: colors.liveText,
  pending_report: colors.warningText,
  completed: colors.text,
  disputed: colors.destructive,
  cancelled: colors.textMuted,
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
  colors,
  statusTextColors,
  spacing,
  radii,
  typography,
  elevations,
  touchTargets,
  motion,
} as const;

export type AppTheme = typeof theme;
