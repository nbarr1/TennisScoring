# 🎾 TennisScoring

**GE Vernova Tennis League**

TennisScoring is a pnpm/Turborepo monorepo for league scoring across web, mobile, Firebase Cloud Functions, and wearable companions. The repository keeps reusable domain logic in `packages/shared` so scoring, rankings, user/profile data, and profile form utilities can be used consistently by the Next.js web app, Expo mobile app, Firebase client package, and functions.

---

## 🌟 Features

- Live, real-time tennis scoring and match tracking
- Scheduling, match proposal, historic result entry, report confirmation, dispute, cancellation, postponement, and deletion workflows
- Division rankings and statistics powered by shared ranking logic
- User profiles with contact preferences, division selection, tips settings, and reusable availability validation helpers
- Web push notification support through Firebase Cloud Messaging
- Multi-platform support: Next.js web, Expo React Native mobile, Android/Wear OS Kotlin modules, and Apple Watch Swift files
- Shared package for duplicate-free scoring, ranking, profile, type, and tip logic

---

## 🚀 Tech Stack

- **Monorepo:** pnpm workspaces and Turborepo
- **Shared domain package:** TypeScript (`packages/shared`)
- **Web app:** Next.js/React (`apps/web`)
- **Mobile app:** Expo React Native (`apps/mobile`)
- **Firebase client package:** Firestore/Auth/Functions hooks and helpers (`packages/firebase-client`)
- **Backend:** Firebase Cloud Functions, Firestore, Storage, and rules (`firebase`)
- **Wearables:** Android Wear OS Kotlin module and Apple Watch Swift files under `apps/mobile`

---

## 🏗️ Project Structure

```text
apps/
  mobile/                 Expo React Native app plus Android, Wear OS, and Apple Watch files
  web/                    Next.js web app
firebase/                 Cloud Functions source, Firebase config, Firestore rules, and Storage rules
packages/
  firebase-client/        Shared Firebase client config, collection helpers, and React hooks
  shared/                 Shared TypeScript types, scoring/ranking engines, tips, and profile utilities
scripts/                  Repository maintenance scripts
design/                   Standalone design previews
```

---

## 📦 Shared Code

The `@tennis/shared` package is the canonical location for reusable domain code. Current exports include:

- Tennis match, user, division, invite, message, and ranking types
- Scoring helpers such as `createInitialScore`, `applyPoint`, `formatScoreDisplay`, and `formatGameScore`
- Ranking helpers such as `computeRankings` and match-total extraction
- Player tip metadata
- Profile availability helpers such as `addAvailabilitySlot`, `updateAvailabilitySlot`, `removeAvailabilitySlot`, `cycleAvailabilitySlotDay`, `validateAvailabilitySlots`, and `buildUserProfileUpdates`

When adding logic used by more than one app/package, prefer adding it to `packages/shared` and importing it from `@tennis/shared` instead of duplicating it in web, mobile, or Firebase code.

The web app also has `apps/web/app/shared/AppNav.tsx` for the repeated application navigation component and styles used by top-level web pages.

---

## 🚦 Getting Started

1. **Clone this repository:**
   ```bash
   git clone https://github.com/nbarr1/TennisScoring.git
   cd TennisScoring
   ```
2. **Install dependencies:**
   ```bash
   pnpm install
   ```
3. **Run checks:**
   ```bash
   pnpm typecheck
   pnpm lint
   pnpm test
   ```
4. **Run an app locally:** see [SETUP.md](./SETUP.md) for Firebase, web, mobile, and wearable setup details.

---

## 🧪 Test and Verification Commands

```bash
pnpm --filter @tennis/shared test -- --runInBand
pnpm typecheck
pnpm lint
pnpm test
```

---

## Design Previews

- Open `design/live-scoring-layout-preview.html` in a browser to review and edit a standalone mock of the mobile live scoring layout. Use the **Copy feedback JSON** button to capture layout notes that can be applied back to `apps/mobile/app/match/[id].tsx`.

---

## 🙌 Contributions

Contributions, issues, and feature requests are welcome. Keep reusable cross-platform logic in `packages/shared` where practical, run the verification commands above, and submit a pull request.

---

**GE Vernova Tennis League — All skill levels welcome!**
