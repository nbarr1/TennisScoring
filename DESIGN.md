---
name: Tennis League
description: Workplace tennis league scoring, scheduling, and standings, on web, phone, and watch.
colors:
  clubhouse-green: "#1A472A"
  clubhouse-green-pressed: "#12351F"
  court-green: "#2D6A4F"
  green-soft: "#E8F5E9"
  green-light: "#A8D5A2"
  ball-yellow: "#FFDC60"
  canvas: "#F5F5F0"
  surface: "#FFFFFF"
  surface-muted: "#F0F2ED"
  ink: "#1A1A1A"
  text-muted: "#666B68"
  text-subtle: "#888D8A"
  border: "#DADDD8"
  disabled: "#C8CCC9"
  disabled-text: "#777C79"
  destructive: "#C0392B"
  destructive-pressed: "#962D22"
  destructive-soft: "#FBEAEA"
  warning: "#E67E22"
  warning-text: "#7A410D"
  warning-soft: "#FFF3E0"
  success: "#278B50"
  info: "#2D6A8A"
  info-soft: "#E8F2F7"
  live-green: "#27AE60"
  proposed-purple: "#8E44AD"
  unassigned-soft: "#FFF3CD"
  unassigned-text: "#856404"
  scoreboard-black: "#000000"
  scoreboard-row: "#0A0A0A"
  scoreboard-panel: "#141414"
  scoreboard-control: "#1C1C1C"
  scoreboard-line: "#262626"
  scoreboard-text: "#FFFFFF"
  scoreboard-muted: "#B3B3B3"
  scoreboard-yellow: "#FFD60A"
  player-blue: "#3D8BFF"
  player-orange: "#FF9F1C"
  match-point-pink: "#FF6B81"
  confirmed-green: "#3DDC84"
typography:
  display:
    fontFamily: "Barlow Condensed, Arial Narrow, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "0.01em"
  scoreboard:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontWeight: 800
    lineHeight: 1
  headline:
    fontFamily: "Barlow Condensed, Arial Narrow, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.15
  title:
    fontSize: "20px"
    fontWeight: 700
    lineHeight: "26px"
  body:
    fontFamily: "Inter Variable, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  body-small:
    fontFamily: "Inter Variable, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "20px"
  label:
    fontSize: "14px"
    fontWeight: 600
    lineHeight: "18px"
  caption:
    fontSize: "12px"
    fontWeight: 500
    lineHeight: "16px"
rounded:
  sm: "6px"
  md: "10px"
  card: "14px"
  lg: "16px"
  xl: "24px"
  pill: "999px"
spacing:
  xxs: "2px"
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  xxl: "32px"
  xxxl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.clubhouse-green}"
    textColor: "{colors.surface}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
    height: "48px"
  button-primary-pressed:
    backgroundColor: "{colors.clubhouse-green-pressed}"
    textColor: "{colors.surface}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.clubhouse-green}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
    height: "48px"
  button-secondary-pressed:
    backgroundColor: "{colors.green-soft}"
    textColor: "{colors.clubhouse-green}"
  button-destructive:
    backgroundColor: "{colors.destructive}"
    textColor: "{colors.surface}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
    height: "48px"
  button-destructive-pressed:
    backgroundColor: "{colors.destructive-pressed}"
    textColor: "{colors.surface}"
  button-text:
    textColor: "{colors.clubhouse-green}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    height: "48px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "48px"
  chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-muted}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 12px"
    height: "44px"
  chip-selected:
    backgroundColor: "{colors.green-soft}"
    textColor: "{colors.clubhouse-green}"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
    padding: "20px"
  nav-bar:
    backgroundColor: "{colors.clubhouse-green}"
    textColor: "{colors.surface}"
    padding: "16px 32px"
  unassigned-badge:
    backgroundColor: "{colors.unassigned-soft}"
    textColor: "{colors.unassigned-text}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
  scoreboard-row:
    backgroundColor: "{colors.scoreboard-row}"
    textColor: "{colors.scoreboard-text}"
    typography: "{typography.scoreboard}"
  moment-band-advantage:
    backgroundColor: "{colors.scoreboard-yellow}"
    textColor: "{colors.scoreboard-black}"
    typography: "{typography.scoreboard}"
---

# Design System: Tennis League

## Overview

**Creative North Star: "The Clubhouse Scoreboard"**

The app has two connected settings. Everything that happens off court, like standings, scheduling, messages, profiles, and admin work, takes place in the clubhouse: a warm off-white room with deep Clubhouse Green framing it and Ball Yellow kept for the few things that need attention. Live scoring moves out to the court, where the room becomes a black, high-contrast scoreboard built for sunlight, glare, and a glance between points. Barlow Condensed headings connect the two settings, so the clubhouse reads like the scoreboard's off-duty version.

The mood is calm and dependable. Screens are mostly quiet, and color and motion are kept for status: a live match's pulsing dot, a match-point band, or the confetti burst when a score is confirmed. Density is moderate: comfortable 48px touch targets, softly rounded corners, and white cards that rest on the canvas with almost no lift. Components are solid and tappable, with plain fills, clear press feedback, and labels that say what the button does.

**Key Characteristics:**

- Two settings: a light clubhouse for everything off court, and a black scoreboard for live play.
- One brand color (Clubhouse Green) and one accent (Ball Yellow). Any other color carries a meaning.
- Condensed headings and scoreboard numerals, with a neutral sans for body text.
- Mostly flat surfaces, a 48px touch floor, and gently rounded corners.
- Motion is short and functional, and turns off under reduced-motion settings.

## Colors

A deep grass-green and warm-paper palette with a single tennis-ball accent, plus a separate black scoreboard palette for live play.

### Primary

- **Clubhouse Green** (`clubhouse-green`): the brand. Used for the web navigation bar and mobile header, primary buttons, section titles, the selected chip border, active tab icons, and the app icon's background. Press states darken it to Clubhouse Green Pressed (`clubhouse-green-pressed`).
- **Court Green** (`court-green`): the positive-outcome green. Used for the confirm-score button, "Saved" and "Copied" confirmations, set-winner marks, positive game differentials, and the large outline icons on the sign-in and verify-email screens.
- **Soft Green** (`green-soft`): the tint behind selected chips, pressed secondary buttons, success alerts, and the confirmed-score badge. **Light Green** (`green-light`) is for text on Clubhouse Green surfaces, such as the in-game score and "Confirmed" text, and appears in the confetti.

### Secondary

- **Ball Yellow** (`ball-yellow`): the accent. It carries the 3px keyboard focus ring on web, the active-tab underline in the web nav, the ball in the brand mark, and confetti. It's never used for body text on light surfaces, because its contrast against white is too low.

### Tertiary

These status colors each carry one meaning:

- **Live Green** (`live-green`): an in-progress match. Used for its pulsing dot, its card's left border, and its tinted shadow.
- **Proposed Purple** (`proposed-purple`): the proposed match status.
- **Warning Orange** (`warning`, text `warning-text`, tint `warning-soft`): pending-report status and warning alerts.
- **Destructive Red** (`destructive`, pressed `destructive-pressed`, tint `destructive-soft`): disputed status, errors, and destructive buttons.
- **Info Blue** (`info`, tint `info-soft`): informational alerts.
- **Unassigned Amber** (`unassigned-soft` background, `unassigned-text` text): only for unassigned players on the admin roster. It reuses the leader-badge tint.

### Neutral

- **Paper Canvas** (`canvas`): the background of every clubhouse screen on web and mobile.
- **Surface White** (`surface`): cards, inputs, chips, and dialogs. **Muted Surface** (`surface-muted`) is used for pressed chips and quiet wells.
- **Ink** (`ink`): primary text. **Muted** (`text-muted`) and **Subtle** (`text-subtle`) are used for secondary text, captions, and placeholders.
- **Hairline** (`border`): input, chip, and divider strokes. Web inputs use a slightly lighter gray stroke.
- **Disabled** (`disabled`, `disabled-text`): inactive fills and labels. Inactive controls also drop to about 50% opacity.

### Scoreboard

The live-scoring screen uses its own palette, `SB` in `apps/mobile/components/live-scoring/scoreboardTheme.ts`. Its background is pure black (`scoreboard-black`), it uses near-black rows and panels for structure, and its text is white or light gray, with every text pairing at 9:1 or better. The two players are told apart by Player Blue (`player-blue`) and Player Orange (`player-orange`) stripes, which stay distinguishable with red-green color blindness, and every row also shows a name. The band showing the match's current moment uses Scoreboard Yellow (`scoreboard-yellow`) for advantage, set point, and tiebreak, white for deuce, orange for break point, Match Point Pink (`match-point-pink`) for match point, and Confirmed Green (`confirmed-green`) for a confirmed result. Each band has black text at 7:1 or better.

### Named Rules

**The One Accent Rule.** Ball Yellow is the only accent. It marks focus, the current location, or a celebration, and never decoration. Any other non-neutral color must name a status.

**The Status Means Something Rule.** Status colors come only from `MATCH_STATUS_METADATA` and the alert tones. Every status pairs its color with an icon glyph and a text label, so color is never the only cue.

**The No New State Color Rule.** Reuse an existing status or tint pair before adding a color. The unassigned-player amber exists because it reuses the leader-badge tint.

## Typography

**Display Font:** Barlow Condensed at 600 and 700 on web, plus 800 on the mobile scoreboard (with Arial Narrow, then the system sans as fallbacks)
**Body Font:** Inter Variable on web; the platform system font on mobile (San Francisco on iOS, Roboto on Android)

**Character:** A tall, narrow scoreboard face for headings and numbers, paired with a plain, highly legible sans for everything people read. The condensed face brings the energy, and the sans keeps it dependable.

### Hierarchy

- **Display** (Barlow Condensed 700, 28px, 1.15 line height, 0.01em tracking): page titles on web. All web `h1`-`h3` elements use the display face.
- **Scoreboard** (Barlow Condensed 800, sized per layout, 1.0 line height): live-score numerals and player names on the scoreboard. Sizes are computed for each layout, and the setup screen's heading reaches 40px.
- **Headline** (Barlow Condensed 700, 24px): section headings and dialog titles.
- **Title** (700, 20px/26px): card titles and mobile section headers (in Clubhouse Green).
- **Body** (400, 16px, 1.5 line height): reading text. Web forms and lists often use 15px.
- **Body Small** (400, 14px/20px): secondary text, empty-state messages, and alert bodies.
- **Label** (600, 14px/18px): button labels, chip labels, and form labels.
- **Caption** (500, 12px/16px): metadata, timestamps, field errors, and section subtitles.

### Named Rules

**The Three Weights Rule.** Barlow Condensed ships only the weights in use: 600 and 700 on web, plus 800 on mobile. Each mobile weight is loaded by file path through `font(loaded, weight)`, so text falls back to a system weight until the font loads. Never import the package index, which pulls in all eighteen font files.

**The Condensed Is for Headings Rule.** Barlow Condensed sets headings, numerals, and the brand name. Body copy, form text, and anything longer than a line stays in the sans.

## Layout

Clubhouse screens are a single centered column on the Paper Canvas. Web page content is capped by purpose: about 420-500px for sign-in, invite, and dialog cards, 720px for reading and form pages, 960px for wider lists, and 1200px for the rankings dashboard and admin page. Content has 24px side padding and 40px top padding. The web nav is a full-width green bar (16px by 32px padding) that wraps its links on narrow screens instead of collapsing them into a menu.

Spacing follows a 4px base scale (`spacing`), with 16px for card padding and most gaps, 12px between a section header and its content, 24px between nav links and major blocks, and 32px around empty states. On mobile, every pressable control has a 44px minimum height, and most have 48px.

The live-scoring screen hides the stack header, draws its own top bar, and splits the screen into two full-width player rows that are themselves the tap targets, with the status band between them.

## Elevation & Depth

The system is mostly flat. White cards rest on the Paper Canvas with one faint ambient shadow, and the change in tone does most of the separating. Stronger shadows appear only for things above the page, like modals and the sign-in card, and for a live match's tinted glow. The scoreboard uses no shadows: depth comes only from stepped near-black tones.

### Shadow Vocabulary

- **Resting card** (mobile `elevations.low`; web cards use about 0 2px 10px at 6% black): the default for any card.
- **Raised** (mobile `elevations.medium`; web about 0 4px 24px at 8% black): modal sheets and centered auth cards.
- **Live glow** (0 4px 16px at 15% Live Green): only on a live match card, alongside its 4px Live Green left border.

### Named Rules

**The Flat-By-Default Rule.** A surface gets a shadow only when it sits above the page or represents a live event. Hover lift on web cards (2px translate) is the only motion-based depth.

## Shapes

Corners are gently rounded and consistent: 6px for small elements and the inner corners of alerts, 10px for buttons and inputs, 14px for web list cards, 16px for dialogs and sections, 24px for the message input and send button, and pill-shaped for chips, badges, and the web sign-out button. The app icon uses a matching rounded square. Alerts are distinguished by a 4px left border in their tone color, and live match cards use the same treatment in Live Green. Scoreboard elements use tighter 6px corners.

## Components

### Buttons

Solid and tappable.

- **Shape:** gently rounded (`rounded.md`, 10px), at least 48px tall, with the label centered next to an optional icon and an 8px gap.
- **Primary:** Clubhouse Green fill and a white label in label type. Pressing darkens it to Clubhouse Green Pressed on mobile. On web, hovering brightens it by 10%, pressing moves it down 1px, and keyboard focus draws a 3px Ball Yellow ring offset by 2px.
- **Secondary:** a white fill with a 1px Clubhouse Green border and a green label. Pressing fills it with Soft Green.
- **Destructive:** a Destructive Red fill and a white label. Pressing darkens it to Destructive Pressed. Used for delete and remove actions, which are confirmed first.
- **Text:** no fill and a green label, with a Soft Green fill when pressed. Used for low-priority and inline actions, and for icon buttons (48px square).
- **Loading and disabled:** a spinner replaces the label. A disabled button drops to about 52% opacity on mobile and 50-60% on web, and shows a not-allowed cursor on web.

### Chips

- **Style:** a pill on a white fill with a 1px Hairline border and a muted label, at least 44px tall.
- **State:** selected chips change to a Soft Green fill with a Clubhouse Green border and label. Pressing shows the Muted Surface fill. Used for roster filters and selections.

### Cards / Containers

- **Corner Style:** 10px on mobile and 14px on web list cards. Dialogs and sections use 16px.
- **Background:** Surface White on the Paper Canvas.
- **Shadow Strategy:** the resting card shadow (see Elevation & Depth).
- **Border:** none, except the 4px Live Green left border on a live match.
- **Internal Padding:** 16px on mobile and 20-28px on web.

### Inputs / Fields

- **Style:** a white fill, a 1px Hairline border, 10px corners, at least 48px tall, with 12-14px of horizontal padding and body-size text. The label sits above in label type, 4px away.
- **Focus:** on web, the 3px Ball Yellow focus ring.
- **Error:** the border turns Destructive Red, and a caption-size error message appears below in the same red.

### Navigation

- **Web:** a full-width Clubhouse Green bar with the brand (a Ball Yellow ball icon and "Tennis League" in Barlow Condensed 700 at 22px) on the left, and links in 15px weight-500 white text at 75% opacity. The current page shows full white with a 2px Ball Yellow underline. The bar wraps on narrow screens.
- **Mobile:** a Clubhouse Green stack header with white tint, and a bottom tab bar whose icons are Clubhouse Green when active and gray when inactive. Icons use the platform's own symbol set (SF Symbols or Material Symbols) through `expo-symbols`. Web icons come from Tabler and sit on the text baseline.

### Inline alerts

A tinted fill with a 4px left border in the tone color (info, success, warning, or destructive), 6px corners, and 12px padding, with a label-weight title above a small body message. The text uses the tone's dark shade, and warning text uses a darker brown for contrast.

### Match status badge

A bold 13px label with a leading glyph (○ proposed, ● scheduled or live, ◐ pending report, ✓ completed, ⚠ disputed, × cancelled), colored by `MATCH_STATUS_METADATA` and announced with an accessibility label.

### Split scoreboard

The signature component, and the court half of the north star. Each player's full-width row is the tap target to score a point, marked by its blue or orange stripe and the player's name, with large Barlow Condensed 800 numerals in white on near-black. A winning row tints slightly warm. Between the rows, the moment band names the current moment (deuce, advantage, set, break, or match point, tiebreak, or changeover) in black on its tone color. The scoreboard is read-only for spectators and before or after the match.

## Do's and Don'ts

### Do:

- **Do** put every clubhouse screen on the Paper Canvas, with content on Surface White cards.
- **Do** use Clubhouse Green for the one primary action on a screen, and secondary or text buttons for the rest.
- **Do** keep every touch target at least 44px tall, and 48px for buttons and inputs.
- **Do** pair every status color with a glyph and a text label.
- **Do** set headings and numerals in Barlow Condensed, and everything else in the sans.
- **Do** keep the live-scoring screen on the black scoreboard palette, with text contrast of at least 9:1 and band text at 7:1 or better.
- **Do** keep motion short (150ms for hover and press, 220ms for the page-enter fade) and turn it off under reduced-motion settings.

### Don't:

- **Don't** use Ball Yellow for body text or decoration on light surfaces.
- **Don't** add a new state color when an existing status or tint pair fits. Unassigned players use the existing amber pair.
- **Don't** bring the clubhouse palette, shadows, or soft tints onto the scoreboard, or the scoreboard's black onto clubhouse screens.
- **Don't** tell the two players apart by color alone. Always show their names.
- **Don't** use any company's logos, colors, or trademarks. The brand is the neutral "Tennis League."
- **Don't** import the full Barlow Condensed package, or set `fontFamily` on mobile without the `font()` fallback.
