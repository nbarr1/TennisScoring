# Mobile UI foundations

Shared tokens, primitives, and helpers for the Expo app. Import theme items from
`../theme` (or `../../theme`) and components from `components/<Name>`. Visual
rules come from `DESIGN.md`; this file covers the API only.

The app is adaptive. These pieces already handle the platform differences:
48dp touch targets and ripples on Android, 44pt targets and pressed fills on
iOS, Material Symbols on Android and SF Symbols on iOS, and native alert
dialogs. Use them instead of building controls by hand.

## Tokens (`theme/tokens.ts`)

| Export | What it holds |
| --- | --- |
| `lightColors`, `darkColors` | The clubhouse palette for each color scheme, with identical keys (`ThemeColors`). Never import them in a screen; read the current one through `useColors()` or `makeStyles()` (below). Text: `text`, `textMuted` (secondary, 5.4:1), `placeholder`. `textSubtle` is **3.4:1**, so use it only for decoration or large text. Status: `destructive`, `warning`/`warningText`, `success`/`successText`, `info`, `live`/`liveText`, `proposed`, `unassignedSoft`/`unassignedText`. Each has a `*Soft` tint. Edges: `border` (hairline, dividers and chips) and `borderStrong` (text fields and other control outlines; the hairline is too faint to show where a field is). `warning`, `success`, and `live` are for fills and icons only. Text uses their `*Text` pair. `primary` is light Clubhouse Green in the dark scheme so it reads as text, with dark `onPrimary` on its fill; `brand`/`onBrand` stay deep Clubhouse Green and white in both schemes, for headers, the brand mark, and the tutorial. Also `onPrimaryMuted`, `ripple`/`rippleStrong`/`rippleOnFill` (Android ripples), `icon*` tints, and `switchThumbOff`. Every dark value's contrast ratio is in a comment beside it. |
| `statusTextColorsFor(colors)` | `Record<MatchStatus, string>`: contrast-safe text color for each match status. Screens use `useStatusTextColors()`. |
| `spacing` | `xxs 2, xs 4, sm 8, md 12, lg 16, xl 24, xxl 32, xxxl 48` |
| `radii` | `sm 6, md 10, card 10, lg 16, xl 24, pill 999` |
| `typography` | `display, title (24), heading (20), subheading, body, bodySmall, label, caption`. These scale with the system font size, so use `minHeight`, never a fixed `height`. |
| `elevations` | `none, low` (resting card), `medium` (sheets) |
| `MIN_TOUCH_TARGET` | `48` on Android, `44` on iOS. Also `touchTargets.platform`. |
| `SHOWS_PRESSED_FILL` | `false` on Android, `true` on iOS. A hand-built `Pressable` gives Android an `android_ripple` (`ripple` on surfaces, `rippleOnFill` on a filled control, never a solid color like `surfaceMuted`, which hides the label under a foreground ripple) and gates its pressed fill with `SHOWS_PRESSED_FILL && pressed`, so Android never shows both. A foreground ripple on a rounded control needs `overflow: "hidden"`. The scoreboard uses `SB.ripple` and `SB.rippleOnYellow`. |
| `touchTargets` | `minimum 44, comfortable 48, platform` |
| `motion` | `press 150, enter 220` (ms). Skip animation when `useReduceMotion()` is true. |

## Color scheme (`theme/scheme.ts`)

The app follows the device's light or dark setting (`userInterfaceStyle: "automatic"`). **Screens never hold a static color**: a module-level `StyleSheet.create` that reads a palette renders light colors in dark mode, so define styles with `makeStyles` and call the hook in the component.

```tsx
const useStyles = makeStyles((colors) =>
  StyleSheet.create({ card: { backgroundColor: colors.surface } }),
);
function MatchRow() {
  const styles = useStyles();
  const colors = useColors(); // only for inline colors (icons, ripples, spinners)
  …
}
```

`makeStyles(factory)` builds each scheme's styles once and caches them; the factory also receives the scheme (`"light" | "dark"`) for the rare style that differs by more than color. `useColors()`, `useTheme()` (`{ scheme, isDark, colors, statusTextColors }`), `useStatusTextColors()`, and `useColorSchemeName()` read the current scheme. A default prop cannot read a hook, so resolve color defaults in the body (`fillColor ?? colors.surface`). Keep `styles` and `colors` in the dependency list of any `useMemo` or `useCallback` that reads them. The live scoreboard (`components/live-scoring/scoreboardTheme.ts`) is dark in both schemes and keeps its static `SB` palette.

## Wide screens (`theme/layout.tsx`)

The app runs on tablets in portrait. Content keeps a readable measure and centers instead of stretching: `CONTENT_MAX_WIDTH` is `form 720` (forms, lists, conversations, the live match), `wide 960` (the standings table), and `sheet 640` (bottom sheets). `useContentWidth(max = "form")` returns `{ width: "100%", maxWidth, alignSelf: "center" }` when the window is wider than `max`, and `undefined` otherwise, so **phone layouts are unchanged**. Add it to a scroll view's `contentContainerStyle`, or to a View that would span the window (a bottom action bar, a screen body). `ScreenContainer` is the same as a View. `BottomSheetModal` applies the sheet width itself.

`useIsNarrowWindow(threshold)` is true when the window is narrower than `threshold` points *at the current text size* (width divided by the font scale). Use it, never a bare `useWindowDimensions().width < n`, for a switch to a stacked or compact layout, so a large phone at 200 % text gets the compact layout too.

```tsx
const contentWidth = useContentWidth();
<KeyboardAwareScrollView contentContainerStyle={[styles.content, contentWidth]}>
```

## Accessibility helpers (`theme/a11y.ts`)

**`announce(message)`** speaks through VoiceOver or TalkBack without moving focus. On iOS the message is queued. Empty messages are ignored.
```tsx
await acceptMatchProposal(id);
announce("Match accepted");
```

**`hitSlopFor(width, height = width)`** returns the `hitSlop` that grows a small visual to the platform minimum target.
```tsx
<Pressable hitSlop={hitSlopFor(24)} accessibilityRole="button" accessibilityLabel="Remove">
  <AppIcon name="xmark" />
</Pressable>
```

**`useReduceMotion()`** returns `boolean`, which follows the OS Reduce Motion / Remove animations setting.

## Action helpers (`theme/actions.ts`)

**`useAsyncAction(fn, options?)`** returns `{ run, pending, error, reset }`. `run(...args)` ignores repeat calls while a run is pending, and it never rejects: it resolves to the result, or to `undefined` on failure. `error` is user-facing text. Options: `successMessage` (announced), `errorMessage` (string or `(e) => string`), `onSuccess`, `onError`, and `announceError` (default true).
```tsx
const save = useAsyncAction(() => updateProfile(uid, draft), { successMessage: "Profile saved" });
{save.error && <InlineAlert tone="error" message={save.error} />}
<Button label="Save profile" pending={save.pending} onPress={() => save.run()} />
```

**`confirmDestructive({ title, message?, confirmLabel, cancelLabel? })`** returns `Promise<boolean>`. It shows a native alert with a red destructive button on iOS. Name the action in `confirmLabel` (use "Decline" or "Delete match", never "OK"). Cancel, back, or tapping outside resolves `false`.
```tsx
const ok = await confirmDestructive({ title: "Decline this proposal?",
  message: "Ana will be told you declined.", confirmLabel: "Decline" });
if (ok) await decline.run();
```

**`confirmAction({ ..., destructive? })`** is the same dialog for actions that are not destructive.

Only one confirm dialog shows at a time: while one is open, another call resolves `false` at once, so a double tap on Delete cannot stack two alerts and run the action twice.

**`describeError(error, fallback?)`** turns a thrown value into a sentence. Bare codes such as `internal` become the fallback.

## Primitives (`theme/primitives.tsx`)

**`Button`** props: `label`, `variant: "primary" | "secondary" | "danger" | "quiet"` (the old names `destructive` and `text` still work), `pending` (or the older `loading`), `pendingLabel?`, `icon?` (an SF Symbol name), `size?: "regular" | "compact"`, `fullWidth?`, and every `Pressable` prop. `pending` shows a spinner without changing the button's width, disables it, and sets `accessibilityState.busy`. `label` doubles as the accessibility label. A labelled button still pending after 10 seconds shows "Still working…" beside the spinner and announces once that it is still working, because an offline Firestore write or a slow callable can stay pending for over a minute. A regular button is at least 48 tall. `compact` is 36 tall, and its hitSlop brings the touch target to the platform minimum. Use one `primary` per screen.
```tsx
<Button label="Propose match" pending={propose.pending} onPress={() => propose.run()} />
<Button label="Change" variant="quiet" size="compact" accessibilityLabel="Change opponent" onPress={clear} />
<Button label="Delete match" variant="danger" icon="trash" onPress={onDelete} />
```

**`IconButton`** props: `label` (required; this is the accessibility label), `icon` (an SF Symbol name or a node), and every `Button` prop. It is a 48×48 square.
```tsx
<IconButton label="Close" icon="xmark" onPress={onClose} />
```

**`InlineAlert`** props: `message`, `title?`, `tone: "info" | "success" | "warning" | "error"` (`destructive` = `error`), `actionLabel?` + `onAction?` (renders a quiet button inside the alert), and `announce?`. Errors and successes are announced when they appear or change. Each tone has its own icon, so color is never the only cue.
```tsx
<InlineAlert tone="error" title="Couldn't send report" message={error} actionLabel="Try again" onAction={retry} />
```

**`EmptyState`** props: `title`, `message`, `icon?` (an SF Symbol name or a node), `action?` (any node), and `actionLabel?` + `onAction?` (renders a primary button). The title is a header. Use the action to name the next step.
```tsx
<EmptyState icon="calendar" title="No matches yet" message="Propose a match to get your season started."
  actionLabel="Propose a match" onAction={openPropose} />
```

**`ErrorState`** props: `title?` (default "Couldn't load this"), `message?`, `onRetry?`, `retryLabel?` (default "Try again"), and `retrying?`. It is announced when it appears.
```tsx
if (error) return <ErrorState title="Couldn't load standings" onRetry={refetch} />;
```

**`LoadingState`** props: `label?` (what is loading, which is what screen readers hear), `inline?` (a compact row instead of a full-screen block), and `showLabel?`.
```tsx
if (loading) return <LoadingState label="Loading matches" />;
<LoadingState inline label="Loading players" />
```

**`ToggleSwitch`** is the clubhouse `Switch`: the platform control with the palette's track, iOS off-track, and Android thumb colors in both schemes. Takes every `Switch` prop, plus `tone: "primary" | "destructive"` for a switch that turns on a destructive side effect. The live scoreboard keeps its own yellow switches.
```tsx
<ToggleSwitch value={clearExisting} onValueChange={setClearExisting} tone="destructive"
  accessibilityLabel="Replace the previously published schedule" />
```

**Also here:** `Screen` (canvas background; `scroll` makes it a ScrollView that keeps taps while the keyboard is open), `Card`, `TextField` (a lightweight labelled input; prefer `FormField` in forms), `Chip` (`label`, `selected`; at least the platform minimum height, never wider than its row, and its label wraps rather than running off screen), and `SectionHeader` (`title` is a header, plus `subtitle?` and `action?`).

## Components (`components/`)

**`AppIcon`** props: `name` (an SF Symbol), `size?` (`ICON_SIZE.small | action | tab | feature | brand`), `color?` (a palette color, or one of `useIconColors()`: `active`, `inactive` (the default), `inverse` for icons on `brand`, `destructive`, `warning`, `success`), `emphasized?`, `style?`, and `accessibilityLabel?`. On Android the icon is drawn from Material Symbols through a lookup table in the file. **Add new SF names to `ANDROID_SYMBOLS`**, because an unmapped name renders nothing on Android. The icon is hidden from screen readers unless `accessibilityLabel` is set. Set it only for an icon that stands alone and carries meaning; icons inside labelled buttons stay unlabelled.
```tsx
<AppIcon name="trophy.fill" size={ICON_SIZE.tab} color={colors.primary} />
<AppIcon name="exclamationmark.triangle" accessibilityLabel="Disputed" />
```
`IconLabel` (`name`, `children`, `color?`, `textStyle?`) is an icon and text in one row, start-aligned. Center it from the parent when a row should be centered.

**`FormField`** props: `label` (required), `error?`, `helperText?`, `required?`, `disabled?`, `showCharacterCount?`, `containerStyle?`, `inputStyle?`, and every `TextInput` prop (it forwards a ref). Screen readers hear "Label, required" and the error or helper text as one stop. A new error is announced while the field is focused. Multiline fields are 96 tall with top-aligned text.
```tsx
<FormField label="Email" required value={email} onChangeText={setEmail}
  error={errors.email} keyboardType="email-address" autoComplete="email" />
```
`FormErrorSummary({ errors: string[] })` goes above a form's submit button. It renders nothing when `errors` is empty, and it announces "N problems to fix" when it appears.

**`StatusBadge`** props: `status` (a `MatchStatus`) and `style?`. It shows the glyph and label (for example "◐ Pending Report") in `useStatusTextColors()`, and screen readers hear "Match pending report".
```tsx
<StatusBadge status={match.status} />
```

**`PlayerSlotPicker`** props: `label`, `divisionId`, `excludeIds`, `selected`, `onSelect`, `onClear`, and `placeholder?`. It handles the debounced division search, the result count announcement, the failed-search state with "Try again", and the "Change" action (which refocuses the search).
```tsx
<PlayerSlotPicker label="Opponent 1" divisionId={divisionId} excludeIds={chosenIds}
  selected={opponent1} onSelect={setOpponent1} onClear={() => setOpponent1(null)} />
```

**`MatchTiebreakToggle`** props: `sets`, `index`, and `onChangeSets`. It renders only under the deciding set. The whole row is one accessible switch (`accessibilityRole="switch"` with a `checked` state), so tapping the label toggles it too. `withEligibleTiebreaks(rows)` clears the flag from rows that are no longer the deciding set.

**`KeyboardSafeView`**, **`KeyboardAwareScrollView`**, and **`KeyboardAwareBottomSheet`** keep inputs above the keyboard. They use padding on iOS and height on Android, and their taps keep working while the keyboard is open. Under a stack header, pass `useHeaderHeight()` (from `expo-router/react-navigation`) as `keyboardVerticalOffset` on iOS. `KeyboardAwareBottomSheet` takes `fillColor` for the home-indicator inset, so match it to the card (it defaults to the scheme's `surface`), and `sheetStyle`, which wraps the sheet and its inset so a tablet max width applies to both.

**`BottomSheetModal`** is the sheet to use instead of a hand-rolled `<Modal transparent>`. Props: `visible`, `onRequestClose` (backdrop, Android Back, and a downward drag on the handle; it may decline to close, for example to confirm discarding a form), `cardStyle`, `fillColor` (the card background, also painted into the inset), `handleColor`, `backdropLabel?` (set it to close on a backdrop tap; leave it unset on forms), `keyboardAware` (default `true`; short action sheets turn it off and pad for the inset themselves), and `overlayStyle`. It fades instead of sliding under Reduce Motion. `fillColor` and `handleColor` default to the scheme's `surface` and `borderStrong`, and on a tablet the card centers at the sheet width. The drag handle is hidden from screen readers, so every sheet still needs a visible Close or Cancel.
```tsx
<BottomSheetModal visible={open} onRequestClose={close} cardStyle={styles.sheetCard}>
  <Text accessibilityRole="header">Report message</Text>
  …
  <Button label="Cancel" variant="quiet" onPress={close} />
</BottomSheetModal>
```

**`messages/ChannelView`** is one conversation (list, composer, report and block). It renders inside the `conversation/[channelId]` route; also exports `formatMessageTime` and `useDirectChannelNames`.

## Checklist for screen code

- Every pressable control is at least `MIN_TOUCH_TARGET`, either by its own size or through `hitSlopFor`.
- Every pressable control has an `accessibilityRole` and a label that says what it does.
- Every hand-built `Pressable` shows a press: an `android_ripple` from the ripple tokens, and a pressed fill gated by `SHOWS_PRESSED_FILL`.
- Switches are `ToggleSwitch` (the scoreboard excepted).
- Async actions use `useAsyncAction` and `Button pending`. Failures show an `InlineAlert` or `ErrorState` that says how to recover.
- Destructive actions call `confirmDestructive` with a verb label.
- Secondary text uses `colors.textMuted` rather than `textSubtle`, and status text uses `useStatusTextColors()` or the `*Text` tokens.
- Colors come from `makeStyles` or `useColors()`, never a hex value or a module-level `StyleSheet` that reads a palette. Check the screen in dark mode.
- Scrolling content and full-width bars take `useContentWidth()`, so they center on a tablet.
