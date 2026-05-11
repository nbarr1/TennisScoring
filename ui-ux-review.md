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

## Remediation Plan: Impact/Effort Sequencing

This plan sequences the recommendations with a combined impact/effort model so the team can improve accessibility and consistency without destabilizing scoring, scheduling, messaging, or admin workflows. Each work item includes targeted verification to run immediately after that change, plus a broader regression check for the affected app.

### Prioritization model

| Score | Impact | Effort | Use when |
| --- | --- | --- | --- |
| P0 | Critical user access or data-loss risk | Low/Medium | Blocks keyboard/screen-reader users or affects destructive match actions. |
| P1 | High user-facing consistency/accessibility gain | Low/Medium | Improves repeated controls, navigation, forms, or status comprehension. |
| P2 | High strategic value | Medium/High | Establishes tokens/primitives needed for many future fixes. |
| P3 | Important but lower urgency | Medium/High | Requires runtime/device validation, fixtures, or larger extraction work. |

### Phase 0 — Baseline safety net before UI changes

- **Priority**: P0
- **Effort**: Small
- **Impact**: High, because later visual/a11y changes should not break scoring/profile/match behavior.
- **Scope**:
  - Capture current passing state for web, mobile, and shared packages.
  - Decide which checks are required for every PR versus heavier checks reserved for larger refactors.
  - Add a checklist item to PR templates or review notes if one exists in the future.
- **Recommended tests after this change**:
  - `pnpm --filter @tennis/shared test -- --runInBand`
  - `pnpm --filter @tennis/web typecheck`
  - `pnpm --filter @tennis/mobile typecheck`
  - `pnpm --filter @tennis/web lint`
  - `pnpm --filter @tennis/mobile lint`
- **Manual verification**:
  - Smoke-test login, rankings, match list, match detail, messages, profile save, feedback, and admin access in local/dev environments.

### Phase 1 — Restore keyboard-visible focus and navigation semantics

- **Priority**: P0
- **Effort**: Small
- **Impact**: Very high for keyboard and low-vision users.
- **Scope**:
  - Add a global `:focus-visible` style in `apps/web/app/globals.css`.
  - Remove `outline: none` from web input styles unless a replacement focus ring is applied.
  - Add `aria-label="Primary"` to the shared web navigation landmark.
  - Add `aria-current="page"` to the active web nav link.
- **Recommended tests after this change**:
  - `pnpm --filter @tennis/web typecheck`
  - `pnpm --filter @tennis/web lint`
  - Add or update a component/unit test if a web component test harness is introduced.
- **Manual verification**:
  - Use only the keyboard to tab through `/login`, `/dashboard`, `/matches`, `/profile`, and `/admin`.
  - Confirm focus is visible on links, buttons, inputs, selects, and textareas.
  - Confirm the active nav item is announced as the current page by a screen reader.

### Phase 2 — Fix form labeling and icon-only control names

- **Priority**: P0/P1
- **Effort**: Small to Medium
- **Impact**: High for screen-reader users and mobile users interacting with dense forms.
- **Scope**:
  - Update web profile fields so labels are associated with controls via `htmlFor`/`id` or an accessible field primitive.
  - Add labels for profile availability day/time controls.
  - Replace placeholder-only labels in match proposal and record-past-match modals with visible or visually hidden labels.
  - Add `aria-label` to web icon-only remove controls.
  - Add `accessibilityRole`, `accessibilityLabel`, and `accessibilityState` to mobile touchables, starting with auth, feedback, rankings, matches, profile, and onboarding.
  - Add `accessibilityLabel` to mobile `TextInput` controls that currently rely only on adjacent visual `Text` labels.
- **Recommended tests after this change**:
  - `pnpm --filter @tennis/web typecheck`
  - `pnpm --filter @tennis/mobile typecheck`
  - `pnpm --filter @tennis/web lint`
  - `pnpm --filter @tennis/mobile lint`
- **Manual verification**:
  - Run VoiceOver/TalkBack through mobile login, feedback, rankings, profile, match proposal, and onboarding flows.
  - Run a screen reader through web login, profile, match proposal, and record-past-match modals.
  - Confirm every icon-only remove action has a meaningful announced name, such as “Remove availability slot” or “Remove set 2.”

### Phase 3 — Introduce shared status badges before broad visual refactors

- **Priority**: P1
- **Effort**: Medium
- **Impact**: High because match status drives action availability and user confidence.
- **Scope**:
  - Create a web `StatusBadge` and a mobile `StatusBadge` with the same status API.
  - Centralize status label, icon, color, and accessibility text for `in_progress`, `pending_report`, `completed`, `disputed`, `scheduled`, `proposed`, and `cancelled`.
  - Replace duplicated status constants in web and mobile match lists/details.
  - Ensure statuses communicate via text + icon/shape, not color alone.
- **Recommended tests after this change**:
  - `pnpm --filter @tennis/web typecheck`
  - `pnpm --filter @tennis/mobile typecheck`
  - `pnpm --filter @tennis/web lint`
  - `pnpm --filter @tennis/mobile lint`
  - Add unit tests for status-to-label/icon/color mapping if a test harness is available.
- **Manual verification**:
  - Verify all match states in web `/matches`, web `/matches/[id]`, mobile Matches tab, and mobile match detail.
  - Check WCAG AA contrast for each status badge in light and dark contexts.

### Phase 4 — Establish design tokens and migrate the highest-reuse styles

- **Priority**: P2
- **Effort**: Medium
- **Impact**: High strategic impact; enables safer consistency fixes across both apps.
- **Scope**:
  - Create a shared token source for color, spacing, radius, typography, elevation, status colors, and focus rings.
  - Export platform-friendly forms: CSS variables for web and TypeScript objects for mobile.
  - Migrate `globals.css`, `AppNav`, login, profile cards/forms, match cards, and feedback screens first.
  - Keep initial token migration intentionally narrow to avoid large visual regressions.
- **Recommended tests after this change**:
  - `pnpm --filter @tennis/web typecheck`
  - `pnpm --filter @tennis/mobile typecheck`
  - `pnpm --filter @tennis/web lint`
  - `pnpm --filter @tennis/mobile lint`
  - `pnpm --filter @tennis/shared test -- --runInBand` if tokens are placed in or consumed by shared packages.
- **Manual verification**:
  - Compare before/after screenshots for login, dashboard, matches, profile, feedback, and mobile rankings/feedback.
  - Verify brand colors, text contrast, disabled states, and dark live-scoring surfaces.

### Phase 5 — Build UI primitives and migrate repeated controls

- **Priority**: P2
- **Effort**: Medium to Large
- **Impact**: High; reduces duplicate styling and accessibility drift.
- **Scope**:
  - Build platform-specific primitives with aligned APIs: `Button`, `IconButton`, `TextField`, `SelectField`, `Checkbox`, `Card`, `InlineAlert`, `EmptyState`, and `LoadingState`.
  - Enforce minimum touch target sizes in `Button` and `IconButton`.
  - Add built-in disabled/loading/accessibility state handling.
  - Migrate one vertical slice first, ideally Profile or Feedback, then expand to Matches and Admin.
- **Recommended tests after this change**:
  - `pnpm --filter @tennis/web typecheck`
  - `pnpm --filter @tennis/mobile typecheck`
  - `pnpm --filter @tennis/web lint`
  - `pnpm --filter @tennis/mobile lint`
  - Add component tests or fixture snapshots for primitive variants once the test harness exists.
- **Manual verification**:
  - Confirm touch targets are at least 44×44 CSS/device-independent pixels where applicable.
  - Validate keyboard and screen-reader behavior for every primitive variant.

### Phase 6 — Replace modal overlays and native confirms with accessible dialogs

- **Priority**: P1/P2
- **Effort**: Medium to Large
- **Impact**: Very high for destructive actions and keyboard/screen-reader users.
- **Scope**:
  - Build or adopt an accessible web `Dialog` with `role="dialog"`, `aria-modal`, labeling, initial focus, Escape close, focus trap, and focus restoration.
  - Build a consistent mobile confirmation/sheet pattern for destructive and high-impact actions.
  - Replace custom overlays in matches/messages and native `confirm()` flows in match detail.
  - Prioritize cancel, postpone, delete, dispute, proposal, and new-message flows.
- **Recommended tests after this change**:
  - `pnpm --filter @tennis/web typecheck`
  - `pnpm --filter @tennis/mobile typecheck`
  - `pnpm --filter @tennis/web lint`
  - `pnpm --filter @tennis/mobile lint`
  - Add focused tests for dialog open/close, Escape handling, and destructive-action callbacks if a web test harness is available.
- **Manual verification**:
  - Keyboard-test opening, tabbing within, Escape closing, overlay closing, and focus restoration for every dialog.
  - Screen-reader-test dialog title, body, and action buttons.
  - Confirm destructive actions require explicit confirmation and have clear primary/destructive hierarchy.

### Phase 7 — Standardize loading, empty, success, and error states

- **Priority**: P2
- **Effort**: Medium
- **Impact**: Medium to High; improves perceived reliability and comprehension.
- **Scope**:
  - Introduce shared `LoadingState`, `EmptyState`, and `InlineAlert` primitives.
  - Use web `role="alert"` or `aria-live` for async errors/success messages.
  - Use mobile accessibility announcements for critical async outcomes where appropriate.
  - Migrate rankings, profile save, feedback submit, match proposal/report modals, messages, and admin operations.
- **Recommended tests after this change**:
  - `pnpm --filter @tennis/web typecheck`
  - `pnpm --filter @tennis/mobile typecheck`
  - `pnpm --filter @tennis/web lint`
  - `pnpm --filter @tennis/mobile lint`
- **Manual verification**:
  - Trigger loading, empty, success, and error states for each migrated flow.
  - Confirm async errors are announced or visibly connected to the triggering form/action.

### Phase 8 — Responsive and large-text audit with targeted layout fixes

- **Priority**: P3
- **Effort**: Medium to Large
- **Impact**: High for real-world court-side mobile use and desktop admin usability.
- **Scope**:
  - Audit web at common widths: 320, 375, 390, 768, 1024, and desktop.
  - Audit mobile with system font scaling / dynamic type enabled.
  - Convert dense tables to stacked cards where horizontal scrolling is not essential.
  - Rework profile availability rows, match stats, admin tables, score-entry controls, and messages for small screens.
- **Recommended tests after this change**:
  - `pnpm --filter @tennis/web typecheck`
  - `pnpm --filter @tennis/mobile typecheck`
  - `pnpm --filter @tennis/web lint`
  - `pnpm --filter @tennis/mobile lint`
  - Add visual regression checks if the project adopts Storybook/fixtures.
- **Manual verification**:
  - Capture screenshots before/after for key breakpoints and mobile devices.
  - Confirm no critical action falls below minimum touch target size.
  - Confirm no text is clipped at larger text settings.

### Phase 9 — Component extraction and UI-state coverage

- **Priority**: P3
- **Effort**: Large
- **Impact**: High long-term maintainability and safer future UI work.
- **Scope**:
  - Extract route-level monoliths into smaller components, starting with match cards, match modals, message threads, admin tables, scoring panels, and profile form sections.
  - Add Storybook or lightweight component fixtures for key UI states.
  - Add automated a11y checks for web fixtures when feasible.
  - Add regression coverage for status badges, dialogs, buttons, form fields, empty states, and match cards.
- **Recommended tests after this change**:
  - `pnpm --filter @tennis/web typecheck`
  - `pnpm --filter @tennis/mobile typecheck`
  - `pnpm --filter @tennis/web lint`
  - `pnpm --filter @tennis/mobile lint`
  - `pnpm --filter @tennis/shared test -- --runInBand`
  - Run Storybook/fixture build and a11y checks once introduced.
- **Manual verification**:
  - Smoke-test all extracted flows after each extraction, not only after the full phase.
  - Compare route behavior before/after extraction to ensure no data or action regressions.

### Suggested first three PRs

1. **PR 1: Web focus and navigation semantics**
   - Implement Phase 1 only.
   - Run web typecheck/lint and keyboard smoke tests.
2. **PR 2: Form labels and icon-only control names**
   - Implement Phase 2 for web first, then mobile in the same PR only if scope remains small.
   - Run web/mobile typecheck/lint and screen-reader spot checks.
3. **PR 3: Shared status badge**
   - Implement Phase 3 for web and mobile match status displays.
   - Run web/mobile typecheck/lint and contrast verification.

### Definition of done for each remediation PR

- The PR states which phase and finding(s) it addresses.
- Related automated checks have been run and results are documented.
- Keyboard-only verification is documented for web interactive changes.
- Screen-reader verification is documented for accessibility changes, or explicitly marked as needing device/runtime verification.
- Visual changes include before/after screenshots when they affect a runnable screen.
- No unrelated UI cleanup is bundled with the change.
