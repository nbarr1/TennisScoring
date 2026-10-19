# Shared web UI

Components and tokens every page in `apps/web/app` should build on. They
implement DESIGN.md, so pages get the Clubhouse look, 44px+ targets, focus
handling, and pending/error states without hand-rolling them.

```ts
import { Button, Dialog, InlineAlert, useAsyncAction, color, space } from "../shared/ui";
```

`ui.ts` re-exports everything below. A server component that only needs
tokens should import from `./tokens` directly.

## Tokens (`tokens.ts`, `globals.css`)

`globals.css` declares every DESIGN.md token on `:root`
(`--clubhouse-green`, `--text-muted`, `--radius-md`, `--space-lg`,
`--shadow-card`, `--focus-ring-color`, ...). `tokens.ts` carries the same
values for inline styles:

| Export | What it holds |
|---|---|
| `color.*` | `var(--…)` references: `clubhouseGreen`, `courtGreen`, `greenSoft`, `ballYellow`, `canvas`, `surface`, `surfaceMuted`, `ink`, `textMuted`, `textSubtle`, `border`, `borderStrong`, `disabled`, `destructive`, `destructiveSoft`, `warningText`, `warningSoft`, `info`, `infoSoft`, `liveGreen`, `liveText`, `proposedPurple`, `unassignedSoft`, `unassignedText`, scoreboard colors |
| `palette.*` | the same colors as raw hex, for canvas or third-party options |
| `radius` | `sm 6`, `md 10`, `card 14`, `lg 16`, `xl 24`, `pill 999` |
| `space` | `xxs 2`, `xs 4`, `sm 8`, `md 12`, `lg 16`, `xl 24`, `xxl 32`, `xxxl 48` |
| `type` | spreadable roles: `display`, `headline`, `title`, `body`, `bodySmall`, `label`, `caption` |
| `shadow` | `card`, `raised`, `live` |
| `target` | `min 44` (any tap target), `control 48` (buttons, inputs) |
| `width` | `dialog 500`, `reading 720`, `list 960`, `wide 1200` |
| `cardStyle`, `inputStyle`, `fieldLabelStyle` | ready-made style objects |

Contrast rules: use `textMuted` for any secondary text (4.67:1 or better on
every clubhouse surface). `textSubtle` is about 3:1, so it is for icons and
dividers only. Live Green, Warning Orange, and `success` fail as small text:
use `liveText`, `warningText`, and `courtGreen` for text. Ball Yellow never
carries text on light surfaces. Input borders use `borderStrong` (3:1).

The old variable names (`--green-dark`, `--muted`, `--bg`, `--gold`, ...)
still work as aliases.

```tsx
<section style={{ ...cardStyle, marginBottom: space.lg }}>
  <h2 style={{ ...type.headline, color: color.clubhouseGreen }}>Upcoming</h2>
</section>
```

## Button (`Button.tsx`)

| Prop | Type | Notes |
|---|---|---|
| `variant` | `"primary" \| "secondary" \| "danger" \| "quiet" \| "quiet-danger"` | default `primary` (one per screen) |
| `size` | `"md" \| "sm"` | 48px or 44px tall |
| `pending` | `boolean` | spinner, `aria-busy`, clicks and submits ignored, stays focusable |
| `pendingLabel` | `ReactNode` | label while pending, e.g. `"Saving…"` |
| `icon` | `ReactNode` | leading icon, give it `aria-hidden` |
| `fullWidth` | `boolean` | |
| `type` | | defaults to `"button"`; pass `"submit"` explicitly |
| ...rest | button attributes | `ref` is forwarded |

`buttonStyle(variant, { size, fullWidth, disabled })` and
`buttonClassName(variant)` style a `<Link>` or `<label>` as a button.
`<Spinner label="Loading…" />` is a standalone spinner.

```tsx
<Button pending={save.pending} pendingLabel="Saving…" onClick={() => void save.run()}>
  Save availability
</Button>
<Link href="/matches" className={buttonClassName("secondary")} style={buttonStyle("secondary")}>Back to matches</Link>
```

Label every button with its verb and object ("Accept proposal", "Confirm
score"), never "OK" or "Submit".

## useAsyncAction (`useAsyncAction.ts`)

`useAsyncAction(fn, options?)` returns `{ run, pending, error, setError, reset }`.
`run(...args)` is ignored while a previous run is pending, catches errors into
`error` (a user-facing sentence), and announces `successMessage` on success.

| Option | Notes |
|---|---|
| `successMessage` | `string \| (result) => string`; announced to screen readers and shown as a toast |
| `toastSuccess` | default `true`; `false` announces without the visible toast |
| `errorMessage` | fallback sentence when the error has no usable message |
| `mapError` | `(error) => string`, replaces `describeError` |
| `onSuccess`, `onError` | callbacks |

```tsx
const accept = useAsyncAction(() => acceptMatchProposal(match.id), { successMessage: "Proposal accepted" });
<Button pending={accept.pending} pendingLabel="Accepting…" onClick={() => void accept.run()}>Accept proposal</Button>
{accept.error && <InlineAlert tone="error">{accept.error}</InlineAlert>}
```

`describeError(error, fallback?)` maps Firebase codes (`unavailable`,
`permission-denied`, `unauthenticated`, ...) to sentences that name the
recovery, and keeps the server's message for callable errors.

## Dialog (`Dialog.tsx`)

Modal with `role="dialog"`, `aria-modal`, labelled by `title`. Focus moves in
on open (`initialFocusRef`, else the first `[data-autofocus]`, else the first
field or button) and is trapped; Escape closes; focus returns to the opener;
body scroll is locked; overlay click closes. Under 600px it is a full-width
bottom sheet with stacked footer buttons.

| Prop | Type | Notes |
|---|---|---|
| `open`, `onClose` | `boolean`, `() => void` | required |
| `title` | `ReactNode` | required, the accessible name |
| `description` | `ReactNode` | line under the title, `aria-describedby` |
| `footer` | `ReactNode` | action row pinned below the scrolling body |
| `dirty` | `boolean` | every dismissal first asks "Discard your changes?" in the dialog |
| `dismissible` | `boolean` | set `false` while saving so it cannot close mid-write |
| `size` | `"sm" \| "md" \| "lg"` | 440 / 560 / 720px |
| `initialFocusRef`, `hideCloseButton`, `closeLabel`, `role`, `panelStyle` | | |

Inside the dialog, `useDialogClose()` returns `requestClose()`. Use it for
your own Cancel button so Cancel also respects `dirty`.

```tsx
<Dialog open={open} onClose={() => setOpen(false)} title="Propose a match" dirty={formTouched} dismissible={!submit.pending}
  footer={<><CancelButton /><Button type="submit" form="propose" pending={submit.pending}>Send proposal</Button></>}>
  <form id="propose" onSubmit={...}>...</form>
</Dialog>
// function CancelButton() { const close = useDialogClose(); return <Button variant="secondary" onClick={close}>Cancel</Button>; }
```

## ConfirmDialog and useConfirm (`ConfirmDialog.tsx`)

For destructive or consequential actions. Focus starts on Cancel when
`tone="danger"`.

| Prop | Type | Notes |
|---|---|---|
| `open` | `boolean` | |
| `title` | `ReactNode` | a question: "Decline Ann's proposal?" |
| `message` | `ReactNode` | what happens, and whether it can be undone |
| `confirmLabel` | `string` | required verb: "Decline proposal" |
| `pendingLabel`, `cancelLabel` | `string` | cancel defaults to "Cancel" |
| `tone` | `"danger" \| "primary"` | default `danger` |
| `onConfirm` | `() => void \| Promise` | async: pending state, error shown in the dialog on rejection |
| `onCancel` | `() => void` | |

The dialog never closes itself; set `open` false when `onConfirm` succeeds.

```tsx
<ConfirmDialog open={declining} title="Decline Ann's proposal?" message="Ann will be told you declined."
  confirmLabel="Decline proposal" pendingLabel="Declining…"
  onConfirm={async () => { await declineMatchProposal(id); setDeclining(false); announce("Proposal declined"); }} onCancel={() => setDeclining(false)} />
```

`useConfirm()` replaces `window.confirm` with a promise:

```tsx
const { confirm, confirmDialog } = useConfirm();
if (await confirm({ title: "Remove Ann from the roster?", confirmLabel: "Remove player" })) await remove();
return <>{page}{confirmDialog}</>;
```

## InlineAlert and FieldError (`InlineAlert.tsx`)

Tinted message with a 4px tone edge and icon (DESIGN.md "Inline alerts").

| Prop | Type | Notes |
|---|---|---|
| `tone` | `"error" \| "success" \| "info" \| "warning"` | default `info` |
| `title`, `children` | `ReactNode` | label-weight title over a small body |
| `action` | `ReactNode` | e.g. a Try again button |
| `onDismiss`, `dismissLabel` | | adds a 44px close button |
| `role` | `"alert" \| "status" \| null` | defaults to `alert` for errors, `status` otherwise; `null` for static text |

```tsx
<InlineAlert tone="error" title="Couldn't send the proposal." action={<Button size="sm" variant="secondary" onClick={retry}>Try again</Button>}>
  {error}
</InlineAlert>
```

`<FieldError id="score-error">{fieldError}</FieldError>` goes under a field
that has `aria-invalid` and `aria-describedby="score-error"`.

## Announcer and useAnnounce (`Announcer.tsx`)

`AnnouncerProvider` is mounted once in `layout.tsx`. `useAnnounce()` returns
`announce(message, { politeness?, toast?, duration? })`. Messages go to a
polite (or `"assertive"`) live region; `toast: true` also shows a short
visible confirmation at the bottom of the screen.

```tsx
const announce = useAnnounce();
await acceptMatchProposal(id);
announce("Proposal accepted. The match is now scheduled.", { toast: true });
```

## EmptyState, ErrorState, DataState, LoadingBlock (`States.tsx`, `motion.tsx`)

| Component | Props |
|---|---|
| `EmptyState` | `title` (required), `description`, `icon`, `action`, `compact`, `style` |
| `ErrorState` | `title` ("Couldn't load this."), `error` or `message`, `onRetry`, `retryLabel`, `retrying`, `compact`, `style` |
| `DataState` | `loading`, `error`, `isEmpty`, `loadingLabel`, `loadingRows`, `errorTitle`, `onRetry`, `empty`, `children` |
| `LoadingBlock` | `label` (announced), `rows`, `rowHeight`, `style` |

`DataState` checks error, then loading, then empty, so a failed query never
reads as "No matches yet".

```tsx
<DataState loading={loading} error={error} isEmpty={matches.length === 0} loadingLabel="Loading matches"
  errorTitle="Couldn't load your matches." onRetry={reload} empty={<EmptyState title="No matches yet" description="Propose one to get your season going." />}>
  {matches.map((m) => <MatchCard key={m.id} match={m} />)}
</DataState>
```

## Existing components

- `AppNav` (`active`) and `appNavStyles.page`: unchanged API. At 1080px and
  below the links, view switch, and Sign out collapse behind a Menu button;
  the current page carries `aria-current="page"`.
- `StatusBadge` (`status`, `style`): glyph + label in a contrast-safe shade of
  the status color.
- `PlayerSlotPicker`: unchanged props; 48px field, 44px results and Change
  button, focus follows selection, and a failed search says so with Try again.
- `ViewModeToggle`, `AnimatedDiv`, `celebrateConfirmedScore`, `useViewMode`:
  unchanged.
- `SkipLink` is mounted in `layout.tsx`; it focuses the page's first `<main>`.

## Global behavior from `globals.css`

- Every `a`, `button`, field, `summary`, and `[tabindex]` gets a 3px Ball
  Yellow focus ring with a Clubhouse Green inner edge on `:focus-visible`.
  Don't set `outline: none` inline.
- `prefers-reduced-motion` stops animations and transitions; spinners freeze
  but stay visible next to their label.
- Placeholders use `--text-muted`; tables use tabular numerals; text
  selection uses Light Green.
