import SwiftUI

@main
struct TennisScoringWatchApp: App {
  var body: some Scene {
    WindowGroup {
      ContentView()
    }
  }
}

struct ContentView: View {
  var body: some View {
    ScoreView(session: WatchSessionManager.shared)
  }
}
