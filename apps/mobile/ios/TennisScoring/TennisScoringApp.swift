import SwiftUI
import TennisAppModel

@main
struct TennisScoringApp: App {
  @State private var session: SessionModel?
  private let configurationError: String?

  init() {
    switch AppBootstrap.makeServices() {
    case let .success(services):
      _session = State(initialValue: SessionModel(services: services))
      configurationError = nil
    case let .failure(error):
      _session = State(initialValue: nil)
      configurationError = error.message
    }
    PhoneWatchConnector.shared.activate()
  }

  var body: some Scene {
    WindowGroup {
      if let session {
        RootView(session: session)
      } else {
        ContentUnavailableView(
          "Tennis League can't start",
          systemImage: "exclamationmark.triangle",
          description: Text(configurationError ?? "")
        )
      }
    }
  }
}
