# UI/UX Review — TennisScoring

_Date reviewed: 2026-05-11_

## Executive Summary

TennisScoring has a clear product shape and several strong user-flow foundations: core states are represented, the web app reuses a top navigation component, and the mobile live-scoring experience has received dedicated design attention. The biggest UI/UX risk is not visual polish in one screen, but systemic inconsistency: colors, spacing, radii, typography, buttons, inputs, modals, and status treatments are largely authored as per-screen inline styles or per-screen `StyleSheet` objects rather than through shared design-system primitives. Accessibility is the most urgent user-impact area, especially unlabeled/semantically weak controls, removed focus outlines, non-semantic modal overlays, small icon-only controls, and mobile touchables without explicit accessibility roles/labels. Responsiveness is generally serviceable for simple pages, but several dense scoring/admin/profile flows use fixed widths and compact controls that need real-device verification and targeted responsive patterns.

## Discovery Notes

### Tech stack and architecture

- Monorepo using pnpm/Turborepo with Next.js web, Expo React Native mobile, Firebase client/functions, shared TypeScript domain logic, and wearable companions. Evidence: `README.md:21-29`, root `package.json` scripts/dependencies, `apps/web/package.json`, and `apps/mobile/package.json`.
- Web routes are implemented with the Next.js App Router under `apps/web/app`, including: `/dashboard`, `/matches`, `/matches/[id]`, `/messages`, `/feedback`, `/profile`, `/admin`, `/login`, `/invite/accept`, and `/onboarding/tutorial`.
- Mobile routes are implemented with Expo Router under `apps/mobile/app`, including auth, onboarding, tabbed screens, feedback, and match detail/live scoring.

### Design tokens / styling system

- Web has a very small CSS variable set for global color/radius primitives in `apps/web/app/globals.css:3-13`, but most component styling is still inline or local to route files.
- Web navigation has a shared `AppNav` component and exported style object in `apps/web/app/shared/AppNav.tsx:24-69`.
- Mobile has no shared theme module discovered in `apps/mobile/app`; screens define local `StyleSheet.create(...)` objects.
- A standalone design preview exists for the mobile live-scoring layout with its own token set in `design/live-scoring-layout-preview.html:8-22` and README guidance in `README.md:97-99`.

### Tests, Storybook, and design documentation

- No Storybook stories or component-level visual/a11y tests were found.
- Tests discovered are domain/unit tests in `packages/shared/src/profile/__tests__` and `packages/shared/src/scoring/__tests__`.
- Design documentation is limited to the standalone live-scoring preview referenced above.

## Findings

### 1. Shared design tokens exist only at the web global level and are not used consistently

- **Severity**: High
- **Category**: Visual Consistency / Design System
- **Location**: `apps/web/app/globals.css:3-13`, `apps/web/app/matches/page.tsx:27-35`, `apps/web/app/matches/page.tsx:1008-1026`, `apps/mobile/app/(tabs)/index.tsx:102-121`, `apps/mobile/app/feedback.tsx:165-207`
- **Description**: The web global file defines a small token set (`--green-dark`, `--gold`, `--radius`, etc.), but screen files continue to hardcode many raw colors, font sizes, spacing values, and radii. For example, match status colors are local constants in the web matches route, modal buttons use raw `#1a472a`, `#fff`, `#888`, etc., and mobile ranking/feedback screens repeat the same raw brand colors in local styles. A quick static scan found 48 unique hex colors in `apps/web/app` and 62 unique hex colors in `apps/mobile/app`, which is high for an app with one dominant brand palette.
- **Why it matters**: Ad-hoc values make brand changes expensive, introduce near-duplicate states, and increase contrast/regression risk because every screen has to be audited separately.
- **Recommendation**: Create shared tokens for each platform and map component styles to semantic roles (`color.background.canvas`, `color.text.muted`, `space.4`, `radius.md`, `status.live`, etc.). Start with the existing web variables and the design preview tokens, then replace per-screen raw values incrementally.

```ts
// Example: packages/design-tokens/src/tokens.ts
export const colors = {
  brand: { court: '#1a472a', courtLight: '#2d6a4f', accent: '#ffdc60' },
  text: { primary: '#1a1a1a', muted: '#666', inverse: '#fff' },
  status: { live: '#27ae60', warning: '#e67e22', danger: '#c0392b' },
};

export const radii = { sm: 8, md: 12, lg: 16, pill: 999 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
```

---

### 2. Buttons and inputs are duplicated across screens instead of centralized as components

- **Severity**: High
- **Category**: Component Architecture / Consistency
- **Location**: `apps/web/app/login/page.tsx:139-152`, `apps/web/app/profile/page.tsx:372-380`, `apps/web/app/profile/page.tsx:393-413`, `apps/web/app/matches/page.tsx:1016-1026`, `apps/web/app/matches/page.tsx:1119-1135`, `apps/mobile/app/(tabs)/index.tsx:117-121`, `apps/mobile/app/feedback.tsx:180-207`
- **Description**: Primary buttons, secondary buttons, segmented controls, form inputs, and disabled/loading states are redefined independently. The same visual concepts use different border radii, padding, font sizes, color tokens, and disabled affordances depending on the screen.
- **Why it matters**: Users learn interaction patterns by repetition. When buttons/forms vary screen-to-screen, users spend more effort parsing the UI and engineers spend more effort fixing bugs in multiple implementations.
- **Recommendation**: Introduce cross-screen primitives first (`Button`, `TextField`, `SelectField`, `Card`, `Modal`, `SegmentedControl`) with size/variant/state props. Keep platform-specific implementations, but align names and token values.

```tsx
<Button variant="primary" size="md" isLoading={saving} onPress={handleSave}>
  Save changes
</Button>
<TextField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" />
```

---

### 3. Web focus outlines are removed from inputs without replacement

- **Severity**: High
- **Category**: Accessibility / Keyboard Navigation
- **Location**: `apps/web/app/login/page.tsx:148`, `apps/web/app/profile/page.tsx:372-380`
- **Description**: Inputs explicitly set `outline: 'none'`, and the global CSS does not define a replacement `:focus-visible` style. This can make keyboard focus invisible in login and profile flows.
- **Why it matters**: Keyboard-only users and low-vision users need a clear focus indicator to complete authentication and profile editing. WCAG 2.4.7 requires visible focus.
- **Recommendation**: Do not suppress native focus unless replacing it with a highly visible tokenized focus ring. Because inline style objects cannot express `:focus-visible`, prefer CSS classes or component-level styling.

```css
:root { --focus-ring: #ffdc60; }
:where(a, button, input, select, textarea):focus-visible {
  outline: 3px solid var(--focus-ring);
  outline-offset: 2px;
}
```

---

### 4. Several web form controls are not programmatically associated with labels

- **Severity**: High
- **Category**: Accessibility / Forms
- **Location**: `apps/web/app/profile/page.tsx:148-183`, `apps/web/app/profile/page.tsx:218-245`, `apps/web/app/profile/page.tsx:258-264`, `apps/web/app/profile/page.tsx:305-317`, `apps/web/app/matches/page.tsx:583-590`, `apps/web/app/matches/page.tsx:916-921`
- **Description**: The reusable `Field` component renders a `<label>` without `htmlFor` and inputs do not receive corresponding `id` attributes. Availability selects/time inputs are rendered with no visible or accessible labels, and match modals use placeholder-only search/guest inputs.
- **Why it matters**: Screen readers may announce fields as unlabeled or only by placeholder text. Placeholder-only labels disappear after entry and are not a substitute for programmatic labels.
- **Recommendation**: Update form primitives to generate stable IDs with `useId()` and pass them to children, or wrap the actual input inside the label. Add visible or visually hidden labels for compact availability and search fields.

```tsx
function Field({ label, children }: { label: string; children: (id: string) => React.ReactNode }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      {children(id)}
    </div>
  );
}
```

---

### 5. Web modals are custom overlays without dialog semantics or focus management

- **Severity**: High
- **Category**: Accessibility / User Flow
- **Location**: `apps/web/app/matches/page.tsx:887-921`, `apps/web/app/matches/page.tsx:990-1007`, `apps/web/app/matches/[id]/page.tsx:266-285`, `apps/web/app/matches/[id]/page.tsx:369-370`, `apps/web/app/messages/page.tsx:361-396`
- **Description**: Modal overlays are rendered as fixed-position `<div>` structures and closed by overlay click, but there is no `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, focus trap, initial focus, Escape handling, or focus restoration visible in the code.
- **Why it matters**: Screen reader and keyboard users can navigate behind the modal or miss that a blocking layer appeared. This is especially risky in match proposal, scoring, message, and manage-match workflows.
- **Recommendation**: Centralize a `Dialog` component using native `<dialog>` where practical or a proven accessible dialog implementation. The component should set `role="dialog"`, `aria-modal`, manage focus, support Escape, and restore focus to the trigger.

---

### 6. Match status uses color/emojis heavily; not all states have semantic text or robust contrast verification

- **Severity**: Medium
- **Category**: Accessibility / Status Communication
- **Location**: `apps/web/app/matches/page.tsx:27-45`, `apps/web/app/matches/page.tsx:71-76`, `apps/web/app/matches/[id]/page.tsx:53-57`, `apps/web/app/matches/[id]/page.tsx:122`, `apps/mobile/app/(tabs)/matches.tsx:55-68`, `apps/mobile/app/(tabs)/matches.tsx:99`
- **Description**: Status mapping uses color plus symbolic prefixes such as `● LIVE` and `⚠ Disputed`. This is better than color alone, but the visual distinction still depends heavily on raw status colors and small text. Exact contrast ratios need runtime verification because backgrounds differ across cards, badges, and dark match-detail surfaces.
- **Why it matters**: Color-only or low-contrast statuses are difficult for color-blind and low-vision users, and match state is critical for deciding what action is available.
- **Recommendation**: Convert status display to a shared `StatusBadge` with text, icon, shape, and semantic color tokens. Verify WCAG AA contrast at runtime for every status/background pair. Add screen-reader-only details when emoji/icon meaning is not obvious.

---

### 7. Mobile touchables generally omit explicit accessibility roles and labels

- **Severity**: High
- **Category**: Accessibility / Mobile Screen Readers
- **Location**: `apps/mobile/app/(auth)/login.tsx:160-185`, `apps/mobile/app/feedback.tsx:149-159`, `apps/mobile/app/(tabs)/index.tsx:58-70`, `apps/mobile/app/(tabs)/matches.tsx:164-176`, `apps/mobile/app/(onboarding)/tutorial.tsx:135-144`
- **Description**: Many interactive `TouchableOpacity` controls do not specify `accessibilityRole="button"`, `accessibilityLabel`, `accessibilityHint`, or `accessibilityState` for disabled/loading states. Some controls have text children, which helps, but icon-only or stateful controls still need explicit semantics. The live scoring screen is a positive exception for key scoring actions, where `Pressable` controls include `accessibilityRole` and labels in `apps/mobile/app/match/[id].tsx:963-1007`.
- **Why it matters**: TalkBack/VoiceOver users need reliable roles and state announcements to understand whether a control submits, navigates, toggles, or is disabled.
- **Recommendation**: Wrap `TouchableOpacity` in a shared `AppButton` / `IconButton` that sets role, label, hint, and disabled state by default.

```tsx
<TouchableOpacity
  accessibilityRole="button"
  accessibilityLabel="Send feedback"
  accessibilityState={{ disabled: submitting, busy: submitting }}
  disabled={submitting}
>
  <Text>Send Feedback</Text>
</TouchableOpacity>
```

---

### 8. Mobile TextInput labels are visual only, not accessibility-associated

- **Severity**: Medium
- **Category**: Accessibility / Forms
- **Location**: `apps/mobile/app/(auth)/login.tsx:120-157`, `apps/mobile/app/feedback.tsx:115-134`, `apps/mobile/app/(tabs)/profile.tsx:170-186`, `apps/mobile/app/(tabs)/profile.tsx:323-357`
- **Description**: Mobile forms render a `Text` label above each `TextInput`, but the `TextInput` controls generally lack `accessibilityLabel` and `accessibilityHint`. React Native does not automatically associate adjacent `Text` nodes as labels in the same way that web `label/htmlFor` works.
- **Why it matters**: Screen reader users may hear only placeholder/value or control type, especially after the placeholder disappears.
- **Recommendation**: Build a `FormTextInput` component that takes `label`, applies it visually, and passes `accessibilityLabel={label}` to the `TextInput`. Include error text and set `accessibilityHint` / `accessibilityState` when validation fails.

---

### 9. Small icon-only destructive controls may miss recommended touch target sizes and labels

- **Severity**: Medium
- **Category**: Accessibility / Touch Targets
- **Location**: `apps/web/app/profile/page.tsx:246-252`, `apps/web/app/profile/page.tsx:445-452`, `apps/web/app/matches/page.tsx:704-710`, `apps/web/app/matches/page.tsx:1101-1108`, `apps/mobile/app/(tabs)/profile.tsx:341-346`, `apps/mobile/app/(tabs)/profile.tsx:551-552`, `apps/mobile/app/(tabs)/matches.tsx:670`, `apps/mobile/app/(tabs)/matches.tsx:1090`
- **Description**: Remove/delete affordances often display only `✕` or similar with minimal padding. Some web controls have no accessible label (`aria-label="Remove availability slot"`), and several mobile remove controls are styled with small padding rather than a guaranteed 44×44 target.
- **Why it matters**: Small destructive controls are easy to mis-tap and hard to identify for assistive technologies, particularly on mobile.
- **Recommendation**: Use an `IconButton` component with minimum 44×44 size on mobile and a clear accessible label on both platforms. For destructive actions, include nearby confirmation or undo where data loss is possible.

---

### 10. Web destructive and high-impact match actions use native `confirm()` instead of accessible, contextual confirmation UI

- **Severity**: Medium
- **Category**: User Flow / Accessibility
- **Location**: `apps/web/app/matches/[id]/page.tsx:81-104`, `apps/web/app/matches/[id]/page.tsx:266-285`
- **Description**: Cancel, postpone, and delete flows rely on browser-native `confirm()`. Native confirms are minimally styled, not integrated with the app's focus management or copy hierarchy, and do not provide rich context such as affected rankings, opponent notification, or irreversible consequences beyond one short string.
- **Why it matters**: These actions can alter or delete match records. Users need a clear, consistent confirmation pattern with primary/destructive button hierarchy and enough information to avoid mistakes.
- **Recommendation**: Replace `confirm()` calls with the shared accessible `Dialog` component. Use explicit button labels such as “Keep match” and “Delete match permanently,” and include contextual details.

---

### 11. Responsive behavior is mostly implicit; dense layouts need breakpoint-specific treatment

- **Severity**: Medium
- **Category**: Responsiveness / Layout
- **Location**: `apps/web/app/dashboard/page.tsx:142-161`, `apps/web/app/admin/page.tsx:716-778`, `apps/web/app/matches/[id]/page.tsx:355`, `apps/web/app/matches/page.tsx:1280`, `apps/web/app/profile/page.tsx:423-443`
- **Description**: Some data-heavy areas use horizontal scrolling (`overflowX`) or fixed grid widths, which is acceptable for tables but should be deliberately designed. Match stats use a fixed `1fr 100px 100px` grid, profile time slots use fixed 110px time inputs, and admin tables use a `minWidth: 760` table. There are no web media queries in `apps/web/app`, so smaller screens rely mostly on wrapping and overflow.
- **Why it matters**: Tennis scoring/scheduling is likely used on phones at or near the court. Dense forms and stats must remain readable, tappable, and not require awkward horizontal scrolling unless intentionally table-like.
- **Recommendation**: Add responsive component patterns: card-stacked tables below small breakpoints, full-width form controls, and explicit empty/error/loading containers. Runtime verification on common mobile widths is needed before changing layouts.

---

### 12. Loading and empty states are present, but skeleton/error state patterns are inconsistent

- **Severity**: Low
- **Category**: User Flow / State Feedback
- **Location**: `apps/mobile/app/(tabs)/index.tsx:44-60`, `apps/web/app/profile/page.tsx:128-138`, `apps/web/app/profile/page.tsx:288-297`, `apps/web/app/matches/page.tsx:756-775`, `apps/mobile/app/feedback.tsx:49-91`
- **Description**: The codebase generally handles loading, empty, and error states, which is a win. However, state presentation varies: some screens use centered placeholders, others use alerts, inline strings, or button text changes. Errors are not consistently announced to assistive technologies (`role="alert"` / `aria-live` on web; screen reader announcements on mobile).
- **Why it matters**: Inconsistent feedback makes the app feel unpredictable, and silent errors can block assistive-tech users.
- **Recommendation**: Standardize `EmptyState`, `InlineAlert`, `Toast/Alert`, and `LoadingState` primitives. On web, use `role="alert"` or `aria-live="polite"` for async form errors/success; on mobile, use accessible announcements for critical async state changes.

---

### 13. Navigation has visible active state but lacks explicit accessibility metadata

- **Severity**: Low
- **Category**: Accessibility / Navigation
- **Location**: `apps/web/app/shared/AppNav.tsx:30-46`, `apps/web/app/shared/AppNav.tsx:61-68`, `apps/mobile/app/(tabs)/_layout.tsx:14-21`, `apps/mobile/app/(tabs)/_layout.tsx:23-57`
- **Description**: Web navigation visually marks the active link with color and an underline, but it does not set `aria-current="page"` on the active route or provide an `aria-label` for the nav landmark. Mobile tabs use standard Expo/React Navigation tab semantics, which is good, but the emoji tab icons are plain `Text` and should be verified with screen readers.
- **Why it matters**: Assistive-tech users benefit from explicit “current page” and navigation labels. Emoji icons can be announced inconsistently by screen readers.
- **Recommendation**: Add `aria-label="Primary"` to web nav and `aria-current={active === item.section ? 'page' : undefined}` to active links. For mobile tab icons, mark decorative emoji as hidden if the tab label already communicates the destination.

---

### 14. Performance signals are mostly acceptable, but long route components combine data, state, and UI rendering

- **Severity**: Low
- **Category**: Performance / Maintainability
- **Location**: `apps/web/app/matches/page.tsx:1-1364`, `apps/mobile/app/(tabs)/matches.tsx:1-1213`, `apps/mobile/app/match/[id].tsx:1-1987`, `apps/web/app/messages/page.tsx:1-543`
- **Description**: No large image assets or custom web font loading were found in the main user-facing UI, and mobile rankings use `FlatList`. However, several route files are very large and combine API state, modals, validation, list rendering, and styles. This makes it harder to isolate expensive re-renders, apply memoization, or test individual UI states.
- **Why it matters**: Long, monolithic screens tend to accumulate regressions. Performance issues often emerge later when datasets grow or real-time subscriptions update frequently.
- **Recommendation**: Extract list rows, modals, status badges, scoring panels, and form sections into memoizable/testable components. Add basic render/performance checks for live scoring and message lists once usage data grows.

## Wins

1. **Clear cross-platform product architecture**: The repository separates web, mobile, Firebase, and shared domain logic, and the README clearly documents the architecture and reuse expectations in `README.md:21-29` and `README.md:49-62`.
2. **Reusable web navigation exists**: `AppNav` centralizes the top-level web nav labels, destinations, and active styling in `apps/web/app/shared/AppNav.tsx:11-22` and `apps/web/app/shared/AppNav.tsx:24-69`.
3. **Core user states are not ignored**: Examples include loading and empty ranking states in `apps/mobile/app/(tabs)/index.tsx:44-60`, profile loading/error states in `apps/web/app/profile/page.tsx:128-138`, and inline modal errors/submitting states in `apps/web/app/matches/page.tsx:756-775`.
4. **The live-scoring mobile UI has dedicated accessibility work**: Key scoring `Pressable` controls include explicit accessibility roles and labels in `apps/mobile/app/match/[id].tsx:963-1007`.
5. **A design preview exists for the most important mobile live-scoring surface**: The preview defines a focused visual system in `design/live-scoring-layout-preview.html:8-22` and is referenced from `README.md:97-99`.

## Quick Wins

1. **Add global web focus styles and remove `outline: none` from form fields.** Start with `apps/web/app/globals.css` and the login/profile input styles cited above.
2. **Add `aria-current="page"` and `aria-label="Primary"` to `AppNav`.** This is low effort and improves navigation clarity immediately.
3. **Add labels to icon-only remove/delete controls.** Use `aria-label` on web and `accessibilityLabel` on mobile, especially for `✕` controls.
4. **Add `accessibilityRole`, `accessibilityLabel`, and `accessibilityState` to shared/mobile button patterns.** Begin with login, feedback, rankings, and onboarding buttons.
5. **Introduce a minimal `StatusBadge` component.** Centralize status colors/labels/icons for web and mobile before they diverge further.
6. **Replace placeholder-only search fields with visible or visually hidden labels.** Prioritize match proposal and record-past-match modals.

## Recommended Refactors

1. **Create a shared design-token package** consumed by web and mobile. Include semantic color roles, status roles, spacing, radii, typography scale, elevation, and focus tokens.
2. **Build platform-specific UI primitive libraries** (`Button`, `IconButton`, `TextField`, `SelectField`, `Card`, `Dialog`, `StatusBadge`, `EmptyState`, `InlineAlert`) that map to the same token names and variant APIs.
3. **Extract route-level monoliths into reusable components.** Prioritize `apps/web/app/matches/page.tsx`, `apps/mobile/app/(tabs)/matches.tsx`, `apps/mobile/app/match/[id].tsx`, and `apps/web/app/messages/page.tsx`.
4. **Adopt accessible modal/dialog infrastructure.** Replace all custom fixed overlays and native `confirm()` flows with one tested dialog component per platform.
5. **Add UI-state coverage.** Use Storybook or lightweight component fixtures for buttons, form fields, status badges, match cards, empty states, and modal states; add automated a11y checks for web components.
6. **Plan a responsive audit pass on real devices.** Verify match scheduling, live scoring, admin tables, messages, and profile availability at common phone widths and with large text enabled.

## Runtime Verification Needed

- Exact WCAG contrast ratios for every status badge, muted text, disabled button, and dark live-scoring surface.
- Screen reader behavior for emoji tab icons, status emojis, and mobile touchable announcements.
- Keyboard focus order and trapping inside web modals.
- Real-device layout/touch target verification for profile availability rows, score entry controls, admin tables, and match-detail stats.
