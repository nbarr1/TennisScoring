# Native iOS client

The SwiftUI sources use the production bundle identifier `com.companytennisleague.app`, iOS deployment/signing settings, `tennisleague` URL scheme, remote-notification entitlement, and associated domains from the release credential workflow. `GoogleService-Info.plist` is intentionally not committed.

An Xcode project must be created with Xcode on macOS before Firebase SPM products can be safely linked. The Linux migration environment cannot generate or validate Apple signing, entitlements, schemes, archives, or the watchOS target. After project creation, link FirebaseAuth, FirebaseFirestore, FirebaseFunctions, FirebaseMessaging, and FirebaseStorage with the repository's Xcode setup workflow and include `TennisScoringWatch` as a watchOS target.
