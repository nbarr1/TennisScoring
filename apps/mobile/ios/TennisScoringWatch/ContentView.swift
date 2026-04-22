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
  @StateObject private var session = WatchSessionManager.shared

  var body: some View {
    ScoreView()
  }
}
