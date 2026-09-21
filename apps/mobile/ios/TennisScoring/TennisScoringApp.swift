import SwiftUI

@main struct TennisScoringApp: App {
  var body: some Scene { WindowGroup { RootView() } }
}

enum AppRoute: Hashable { case division, tutorial, dashboard, matches, match(String), rankings, messages, profile, admin, feedback, privacy, roundRobin }
struct RootView: View {
  @State private var path: [AppRoute] = []
  var body: some View { NavigationStack(path: $path) { SignInView().navigationDestination(for: AppRoute.self) { route in DestinationView(title: String(describing: route)) } }.onOpenURL { url in if url.host == "match", let id=url.pathComponents.last { path=[.match(id)] } } }
}
struct SignInView: View { var body: some View { VStack { Text("Tennis League").font(.largeTitle).accessibilityAddTraits(.isHeader); Text("Sign in") }.padding() } }
struct DestinationView: View { let title: String; var body: some View { ContentUnavailableView(title, systemImage: "tennis.racket") } }
