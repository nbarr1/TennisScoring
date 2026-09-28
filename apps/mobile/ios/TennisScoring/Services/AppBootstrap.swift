import Foundation
import TennisAppModel

#if canImport(FirebaseCore) && canImport(FirebaseAuth) && canImport(FirebaseFirestore) && canImport(FirebaseFunctions)
import FirebaseCore
#endif

/// Chooses the backend at launch.
///
/// With the Firebase packages linked and a `GoogleService-Info.plist` in the
/// bundle, the app talks to Firebase. Otherwise a debug build falls back to the
/// in-memory `DemoBackend`, so the app runs in the simulator (and in previews)
/// without credentials; a release build refuses to start rather than ship demo
/// data.
enum AppBootstrap {
  static func makeServices(bundle: Bundle = .main) -> Result<AppServices, ServiceError> {
    #if canImport(FirebaseCore) && canImport(FirebaseAuth) && canImport(FirebaseFirestore) && canImport(FirebaseFunctions)
    if bundle.path(forResource: "GoogleService-Info", ofType: "plist") != nil {
      if FirebaseApp.app() == nil { FirebaseApp.configure() }
      return .success(FirebaseServices.make())
    }
    #endif

    #if DEBUG
    return .success(DemoBackend.sample().services)
    #else
    return .failure(ServiceError(
      "This build is missing its Firebase configuration. Add GoogleService-Info.plist to the app target and link the Firebase packages."
    ))
    #endif
  }
}
