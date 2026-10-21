/**
 * Design tokens for the web app, mirroring the DESIGN.md frontmatter.
 *
 * This file is the single source of the token values: the root layout
 * declares each one as a CSS custom property on `:root` (`rootTokenCss`, at
 * the end), and inline style objects use `color.*`, which resolve to those
 * variables, so one edit here restyles every page and every class in
 * globals.css. Use `palette` itself only where a variable cannot go (canvas
 * drawing, contrast maths, the theme-color meta, third-party options).
 *
 * Contrast notes (WCAG AA, 4.5:1 for text under 18.66px bold / 24px):
 * - `textMuted` passes on every clubhouse surface and tint (4.67:1 or better).
 * - `textSubtle` is about 3:1. Use it only for icons, dividers, and large text,
 *   never for body copy, captions, or placeholders; use `textMuted` there.
 * - `success` and `liveGreen` fail as small text on white. Use `courtGreen`
 *   for positive text ("Saved") and `liveText` for the "Live" label.
 * - `warning` fails as text. Use `warningText` for warning copy.
 * - Ball Yellow never carries text on light surfaces.
 *
 * Fills and text are separate tokens where dark mode needs them to differ:
 * `clubhouseGreen`, `courtGreen`, and `destructive` are the text and stroke
 * shades, and `brandFill`, `courtGreenFill`, and `destructiveFill` are the
 * solid fills that carry `onBrand` (white) text. `clubhouseGreenPressed` and
 * `destructiveFillPressed` are the pressed fills. In light mode each pair is
 * the same color; `darkPalette` below lightens the text shades and keeps the
 * fills deep. `onAccent` is the text on Ball Yellow and Light Green.
 */

export const palette = {
  clubhouseGreen: "#1A472A",
  /** Pressed shade of `brandFill`. */
  clubhouseGreenPressed: "#12351F",
  /** Solid brand fill (nav, primary button, toasts) under `onBrand` text: 10.6:1. */
  brandFill: "#1A472A",
  courtGreen: "#2D6A4F",
  /** Court Green as a button fill under `onBrand` text: 6.4:1. */
  courtGreenFill: "#2D6A4F",
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
  destructive: "#C0392B",
  destructivePressed: "#962D22",
  destructiveSoft: "#FBEAEA",
  /** Danger button fill under `onBrand` text: 5.4:1; pressed 7.8:1. */
  destructiveFill: "#C0392B",
  destructiveFillPressed: "#962D22",
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
  /** Text and icons on the brand, court, and destructive fills. */
  onBrand: "#FFFFFF",
  /** Text on Ball Yellow (7.9:1) and Light Green (6.4:1). */
  onAccent: "#1A472A",
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

/**
 * The dark set, written under `prefers-color-scheme: dark` by `rootTokenCss`.
 * Only tokens that differ are listed; the scoreboard colors, Ball Yellow,
 * Light Green, and the on-fill text colors are shared. Ratios (WCAG 2.x) are
 * against canvas / surface / surface-muted unless noted.
 *
 * - `ink` 15.6 / 13.8 / 12.0; `textMuted` 8.4 / 7.4 / 6.5, and 5.6 on `greenSoft`.
 * - `textSubtle` 4.8 on canvas, 4.3 on surface (icons and dividers only, as in light).
 * - `borderStrong` 4.7 / 4.1 / 3.6: control strokes clear 3:1.
 * - `clubhouseGreen` (headings, links, secondary buttons) 10.5 / 9.2 / 8.1, and 7.0 on `greenSoft`.
 * - `courtGreen` 9.1 / 8.0 / 7.0; `liveText` 9.9 / 8.8 / 7.6.
 * - `destructive` 6.8 / 6.0 / 5.3; `destructivePressed` (error text) 9.4 / 8.3 / 7.2, 7.6 on `destructiveSoft`.
 * - `warningText` 10.6 / 9.4 / 8.2, 7.9 on `warningSoft`; `info` 9.1 / 8.1 / 7.0, 6.8 on `infoSoft`.
 * - `proposedPurple` 8.2 / 7.2 / 6.3; `unassignedText` 12.7 / 11.2 / 9.8, 8.8 on `unassignedSoft`.
 * - `onBrand` on `brandFill` 8.6, `clubhouseGreenPressed` 11.2, `courtGreenFill` 6.4,
 *   `destructiveFill` 6.0, `destructiveFillPressed` 8.4. Light Green on `brandFill` 5.2,
 *   Ball Yellow on `brandFill` 6.4.
 * - `ink` on every soft tint 10.4 or better.
 */
export const darkPalette = {
  clubhouseGreen: "#8ED1A6",
  clubhouseGreenPressed: "#17432A",
  brandFill: "#1F5634",
  courtGreen: "#6CC791",
  greenSoft: "#1D3A2A",
  canvas: "#0F1411",
  surface: "#1A211D",
  surfaceMuted: "#242C27",
  ink: "#E8ECE9",
  textMuted: "#A8B0AB",
  textSubtle: "#7C847F",
  border: "#2E3732",
  borderStrong: "#78827C",
  destructive: "#F07A6C",
  destructivePressed: "#FF9E92",
  destructiveSoft: "#3A1F1C",
  destructiveFill: "#B3362A",
  destructiveFillPressed: "#8E2A20",
  warning: "#F0A050",
  warningText: "#F5B878",
  warningSoft: "#3A2A16",
  success: "#3FCB7A",
  info: "#7DBEE0",
  infoSoft: "#18303D",
  liveGreen: "#3FCB7A",
  liveText: "#5FD38E",
  proposedPurple: "#C99BE0",
  unassignedSoft: "#3A3115",
  unassignedText: "#F2D27A",
} as const satisfies Partial<Record<ColorToken, string>>;

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
  card: "var(--shadow-card)",
  raised: "var(--shadow-raised)",
  live: "var(--shadow-live)",
} as const;

/** Shadow values; light shadows vanish on dark surfaces, so the dark set is deeper. */
const shadowValues = {
  card: "0 2px 10px rgba(0, 0, 0, 0.06)",
  raised: "0 4px 24px rgba(0, 0, 0, 0.08)",
  live: "0 4px 16px rgba(39, 174, 96, 0.15)",
} as const satisfies Record<keyof typeof shadow, string>;

const darkShadowValues = {
  card: "0 2px 10px rgba(0, 0, 0, 0.4)",
  raised: "0 4px 24px rgba(0, 0, 0, 0.55)",
  live: "0 4px 16px rgba(63, 203, 122, 0.18)",
} as const satisfies Record<keyof typeof shadow, string>;

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

/**
 * Every token above as CSS custom properties in one `:root` rule
 * (`--clubhouse-green:#1A472A;--radius-md:10px;--space-lg:16px;...`), then
 * the dark colors and shadows in a `prefers-color-scheme: dark` block. The
 * root layout writes it into the document head, so this file is the only
 * place a token value is defined: the classes in globals.css and the inline
 * `color.*` references both read these variables.
 */
export const rootTokenCss = `:root{${[
  ...Object.entries(palette).map(([key, value]) => `--${kebab(key)}:${value}`),
  ...Object.entries(radius).map(([key, value]) => `--radius-${key}:${value}px`),
  ...Object.entries(space).map(([key, value]) => `--space-${key}:${value}px`),
  ...Object.entries(type).map(([key, role]) => `--font-size-${kebab(key)}:${role.fontSize}px`),
  ...Object.entries(shadowValues).map(([key, value]) => `--shadow-${key}:${value}`),
  ...Object.entries(target).map(([key, value]) => `--target-${key}:${value}px`),
  `--duration-fast:${motion.fast}`,
  `--duration-page:${motion.page}`,
  `--ease-out:${motion.easeOut}`,
].join(";")}}@media (prefers-color-scheme:dark){:root{${[
  ...Object.entries(darkPalette).map(([key, value]) => `--${kebab(key)}:${value}`),
  ...Object.entries(darkShadowValues).map(([key, value]) => `--shadow-${key}:${value}`),
].join(";")}}}`;

export const tokens = { palette, darkPalette, color, radius, space, font, type, shadow, target, motion, width } as const;
