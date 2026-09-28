# Native iOS client

A SwiftUI client for iPhone, plus a watchOS companion, written against the same Firestore documents and Cloud Functions as the Expo app. The Expo app is still what ships on iOS. This client is not released until it passes the gate in `docs/native-mobile-parity-inventory.md`.

## Layout

```text
TennisKit/                 Swift package with no Apple-framework dependencies (builds and tests on Linux too)
  Sources/TennisCore/      Port of @tennis/shared: models, score and ranking engines, match sides,
                           doubles team ids, tips, and the phone-to-watch message format
  Sources/TennisAppModel/  View models, service protocols, deep links, and DemoBackend (in-memory data)
  Tests/                   XCTest suites for both targets
TennisScoring/             iOS app target: SwiftUI views, Firebase adapters, WatchConnectivity (phone side)
TennisScoringWatch/        watchOS app target: scoreboard and point buttons
```

`TennisCore` is the only place the scoring and ranking rules exist in Swift. Its tests replay `fixtures/mobile-contract/engine-parity.json`, which `scripts/generate-mobile-contract-fixtures.mjs` records from the TypeScript engines. The Jest suite `mobileContractFixture.test.ts` replays the same file, so a TypeScript engine change fails there until you regenerate the fixture (`pnpm fixtures:mobile-contract`). The Swift suite then fails until you port the change.

## What the app does

- Signs in with Firebase email and password. A player without a division joins one with an invite code (the `joinDivisionByCode` callable).
- **Matches** tab: groups matches the same way the Expo client does. The sections are proposals to answer, live, reports, upcoming, proposals awaiting the opponent, and recent results. The tab badge counts proposals and reports waiting on the player.
- **Match screen**: shows the scoreboard, including the server and service court. From it you can accept, decline, or withdraw a proposal, start the match with a chosen server, and score points through the `scoreMatchPoint` callable, which is authoritative. You can also undo the last point, submit the result, and confirm or dispute the opponent's result. It shows the scoring tips when the player and match have them turned on.
- **Standings** tab: shows singles and doubles standings, split by season and division level, with the player's own table first.
- **Profile** tab: shows the account details and has the sign-out button.
- Opens `tennisleague://match/<id>` and `com.companytennisleague.app://match/<id>` links after sign-in.
- **Apple Watch**: shows the open match's score and sends points back. Every command carries the match id, and the phone discards commands for any match other than the one on screen. Leaving the match screen leaves the watch read-only.

Messaging, admin tools, feedback, push notifications, profile editing, proposing or recording matches, account deletion, and the tutorial are not built yet. The Expo client remains the reference for all of them.

## Build and test without Xcode

```bash
pnpm ios:test          # swift test --package-path apps/mobile/ios/TennisKit (macOS or Linux, Swift 6)
pnpm ios:typecheck     # macOS only: typechecks TennisScoring and TennisScoringWatch against the simulator SDKs
```

`ios:typecheck` emits the `TennisKit` modules for each SDK and typechecks the app and watch sources against them. `Services/FirebaseServices.swift` compiles only when the Firebase packages are linked, so this check skips it; only an Xcode build checks it.

## Creating the Xcode project

The project, signing, and archives have to be made on macOS. They cannot be generated or validated from Linux.

1. In Xcode 16 or later, create an iOS App project named `TennisScoring` in this directory. Set the bundle identifier to `com.companytennisleague.app`, the interface to SwiftUI, and the minimum deployment target to iOS 17. Delete the template's generated Swift files, then add the `TennisScoring/` folder to the app target.
2. Add `TennisKit` as a local package (**File → Add Package Dependencies → Add Local**), and link `TennisCore` and `TennisAppModel` to the app target.
3. Add `https://github.com/firebase/firebase-ios-sdk` (version 11 or later; the adapters use its async/await APIs and `Codable` document decoding) and link `FirebaseAuth`, `FirebaseFirestore`, and `FirebaseFunctions` to the app target. Messaging and Storage come later, with notifications and report PDFs.
4. Add `GoogleService-Info.plist` from the release credential workflow to the app target. It is not committed. Without it, a debug build runs on demo data, and a release build shows a configuration error instead of starting.
5. Add the URL schemes `tennisleague` and `com.companytennisleague.app`, plus the remote-notification and associated-domains entitlements from the release credential workflow.
6. Add a watchOS App target named `TennisScoringWatch` (watchOS 10 minimum) embedded in the iOS app. Add the `TennisScoringWatch/` folder to it and link `TennisCore`.
7. Add a unit test target that depends on the `TennisKit` test targets, or run `swift test` as CI does. Then replace `scripts/ios-typecheck.sh` in `.github/workflows/native-mobile.yml` with `xcodebuild test`.

## Demo mode

A debug build without Firebase configuration uses `DemoBackend.sample()`. Sign in as `demo@tennisleague.test` with any password. The invite code for the join-division screen is `DEMO`. Demo matches are fully playable: points run through the same `ScoreEngine` the server uses, and confirming a report recomputes the standings with `RankingEngine`. SwiftUI previews and the `TennisAppModel` tests use the same backend.
