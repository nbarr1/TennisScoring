/**
 * Design tokens for the web app, mirroring the DESIGN.md frontmatter.
 *
 * The same values are declared as CSS custom properties on `:root` in
 * globals.css. Inline style objects should use `color.*`, which resolve to
 * those variables, so one edit in globals.css restyles every page. `palette`
 * holds the raw hex values for the few places a variable cannot go (canvas
 * drawing, contrast maths, third-party options).
 *
 * Contrast notes (WCAG AA, 4.5:1 for text under 18.66px bold / 24px):
 * - `textMuted` passes on every clubhouse surface and tint (4.67:1 or better).
 * - `textSubtle` is about 3:1. Use it only for icons, dividers, and large text,
 *   never for body copy, captions, or placeholders; use `textMuted` there.
 * - `success` and `liveGreen` fail as small text on white. Use `courtGreen`
 *   for positive text ("Saved") and `liveText` for the "Live" label.
 * - `warning` fails as text. Use `warningText` for warning copy.
 * - Ball Yellow never carries text on light surfaces.
 */

export const palette = {
  clubhouseGreen: "#1A472A",
  clubhouseGreenPressed: "#12351F",
  courtGreen: "#2D6A4F",
  greenSoft: "#E8F5E9",
  greenLight: "#A8D5A2",
  ballYellow: "#FFDC60",
  canvas: "#F5F5F0",
  surface: "#FFFFFF",
  surfaceMuted: "#F0F2ED",
  ink: "#1A1A1A",
  textMuted: "#666B68",
  textSubtle: "#888D8A",
  border: "#DADDD8",
  /** Input and control strokes: 3:1 against white so the field edge is visible. */
  borderStrong: "#8A8F8C",
  disabled: "#C8CCC9",
  disabledText: "#777C79",
  destructive: "#C0392B",
  destructivePressed: "#962D22",
  destructiveSoft: "#FBEAEA",
  warning: "#E67E22",
  warningText: "#7A410D",
  warningSoft: "#FFF3E0",
  success: "#278B50",
  info: "#2D6A8A",
  infoSoft: "#E8F2F7",
  liveGreen: "#27AE60",
  /** Text shade of Live Green: 4.5:1 or better on every clubhouse surface. */
  liveText: "#1E7B45",
  proposedPurple: "#8E44AD",
  unassignedSoft: "#FFF3CD",
  unassignedText: "#856404",
  scoreboardBlack: "#000000",
  scoreboardRow: "#0A0A0A",
  scoreboardPanel: "#141414",
  scoreboardControl: "#1C1C1C",
  scoreboardLine: "#262626",
  scoreboardText: "#FFFFFF",
  scoreboardMuted: "#B3B3B3",
  scoreboardYellow: "#FFD60A",
  playerBlue: "#3D8BFF",
  playerOrange: "#FF9F1C",
  matchPointPink: "#FF6B81",
  confirmedGreen: "#3DDC84",
} as const;

export type ColorToken = keyof typeof palette;

function kebab(name: string): string {
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/** `var(--token-name)` references for inline styles, keyed like `palette`. */
export const color = Object.fromEntries(
  Object.keys(palette).map((key) => [key, `var(--${kebab(key)})`]),
) as { readonly [K in ColorToken]: string };

/** Corner radii (DESIGN.md `rounded`). */
export const radius = {
  sm: 6,
  md: 10,
  card: 14,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

/** 4px-based spacing scale (DESIGN.md `spacing`). */
export const space = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const font = {
  body: "var(--font-body)",
  display: "var(--font-display)",
} as const;

/** Type roles (DESIGN.md `typography`). Spread into a style object. */
export const type = {
  display: { fontFamily: font.display, fontSize: 28, fontWeight: 700, lineHeight: 1.15, letterSpacing: "0.01em" },
  headline: { fontFamily: font.display, fontSize: 24, fontWeight: 700, lineHeight: 1.15 },
  title: { fontSize: 20, fontWeight: 700, lineHeight: "26px" },
  body: { fontSize: 16, fontWeight: 400, lineHeight: 1.5 },
  bodySmall: { fontSize: 14, fontWeight: 400, lineHeight: "20px" },
  label: { fontSize: 14, fontWeight: 600, lineHeight: "18px" },
  caption: { fontSize: 12, fontWeight: 500, lineHeight: "16px" },
} as const satisfies Record<string, React.CSSProperties>;

export const shadow = {
  card: "0 2px 10px rgba(0, 0, 0, 0.06)",
  raised: "0 4px 24px rgba(0, 0, 0, 0.08)",
  live: "0 4px 16px rgba(39, 174, 96, 0.15)",
} as const;

/** Minimum interactive sizes in px. */
export const target = {
  /** Floor for any tappable control. */
  min: 44,
  /** Buttons and inputs. */
  control: 48,
} as const;

export const motion = {
  fast: "150ms",
  page: "220ms",
  easeOut: "cubic-bezier(0.22, 1, 0.36, 1)",
} as const;

/** Readable widths for page content (DESIGN.md Layout). */
export const width = {
  dialog: 500,
  reading: 720,
  list: 960,
  wide: 1200,
} as const;

/** Card surface used across clubhouse pages. */
export const cardStyle: React.CSSProperties = {
  background: color.surface,
  borderRadius: radius.card,
  boxShadow: shadow.card,
  padding: 20,
};

/** Text input / select / textarea base style (48px, Hairline-strong stroke, 16px text). */
export const inputStyle: React.CSSProperties = {
  width: "100%",
  minHeight: target.control,
  padding: "0 12px",
  borderRadius: radius.md,
  border: `1px solid ${color.borderStrong}`,
  background: color.surface,
  color: color.ink,
  fontSize: 16,
  lineHeight: 1.5,
};

/** Form label above a field. */
export const fieldLabelStyle: React.CSSProperties = {
  display: "block",
  ...type.label,
  color: color.ink,
  marginBottom: space.xs,
};

export const tokens = { palette, color, radius, space, font, type, shadow, target, motion, width } as const;
