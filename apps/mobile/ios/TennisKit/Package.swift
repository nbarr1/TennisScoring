// swift-tools-version:6.0
import PackageDescription

// The platform-neutral half of the native iOS client.
//
// TennisCore is the Swift port of @tennis/shared: models, the score and ranking
// engines, match-side helpers, doubles team ids, and the phone-to-watch message
// format. TennisAppModel holds the view models and the service protocols the
// SwiftUI screens and Firebase adapters plug into.
//
// Neither target imports SwiftUI, UIKit, Firebase, or WatchConnectivity, so the
// whole package builds and tests on Linux as well as on Apple platforms
// (`swift test --package-path apps/mobile/ios/TennisKit`). The iOS app and
// watchOS app link it as a local package.
let package = Package(
  name: "TennisKit",
  platforms: [.iOS(.v17), .watchOS(.v10), .macOS(.v14)],
  products: [
    .library(name: "TennisCore", targets: ["TennisCore"]),
    .library(name: "TennisAppModel", targets: ["TennisAppModel"]),
  ],
  targets: [
    .target(name: "TennisCore"),
    .target(name: "TennisAppModel", dependencies: ["TennisCore"]),
    .testTarget(name: "TennisCoreTests", dependencies: ["TennisCore"]),
    .testTarget(name: "TennisAppModelTests", dependencies: ["TennisAppModel"]),
  ]
)
