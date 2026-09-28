import SwiftUI
import TennisAppModel
import TennisCore

struct MainTabView: View {
  private enum Tab: Hashable { case matches, rankings, profile }

  let session: SessionModel
  let user: User
  @Binding var pendingMatchId: String?

  @State private var selection: Tab = .matches
  @State private var matchPath: [String] = []
  @State private var matchList: MatchListModel
  @State private var rankings: RankingsModel?

  init(session: SessionModel, user: User, pendingMatchId: Binding<String?>) {
    self.session = session
    self.user = user
    _pendingMatchId = pendingMatchId
    _matchList = State(initialValue: MatchListModel(userId: user.id, repository: session.services.matches))
    _rankings = State(initialValue: user.divisionId.map {
      RankingsModel(divisionId: $0, userId: user.id, repository: session.services.rankings)
    })
  }

  var body: some View {
    TabView(selection: $selection) {
      NavigationStack(path: $matchPath) {
        MatchListView(model: matchList)
          .navigationTitle("Matches")
          .navigationDestination(for: String.self) { matchId in
            MatchDetailView(matchId: matchId, user: user, services: session.services)
          }
      }
      .tabItem { Label("Matches", systemImage: "tennisball") }
      .badge(matchList.actionCount)
      .tag(Tab.matches)

      NavigationStack {
        Group {
          if let rankings {
            RankingsView(model: rankings)
          } else {
            ContentUnavailableView("No division", systemImage: "list.number")
          }
        }
        .navigationTitle("Standings")
      }
      .tabItem { Label("Standings", systemImage: "list.number") }
      .tag(Tab.rankings)

      NavigationStack {
        ProfileView(session: session, user: user)
          .navigationTitle("Profile")
      }
      .tabItem { Label("Profile", systemImage: "person.crop.circle") }
      .tag(Tab.profile)
    }
    // Observed here rather than inside each tab, so the badge stays current and
    // pushing a match screen does not tear the listeners down.
    .task { await matchList.observe() }
    .task { await rankings?.observe() }
    .onChange(of: pendingMatchId, initial: true) { _, matchId in
      guard let matchId else { return }
      selection = .matches
      matchPath = [matchId]
      pendingMatchId = nil
    }
  }
}

struct MatchListView: View {
  let model: MatchListModel

  var body: some View {
    List {
      if let error = model.errorMessage {
        Label(error, systemImage: "exclamationmark.triangle")
          .foregroundStyle(.red)
      }
      ForEach(model.sections) { section in
        Section(section.title) {
          ForEach(section.matches) { match in
            NavigationLink(value: match.id) {
              MatchRow(match: match, userId: model.userId)
            }
          }
        }
      }
    }
    .overlay {
      if model.isLoading {
        ProgressView()
      } else if model.sections.isEmpty && model.errorMessage == nil {
        ContentUnavailableView(
          "No matches yet",
          systemImage: "tennisball",
          description: Text("Matches you propose, schedule, or play appear here.")
        )
      }
    }
  }
}

struct MatchRow: View {
  let match: Match
  let userId: String

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      HStack {
        Text(opponentLine)
          .font(.headline)
          .lineLimit(1)
        Spacer()
        StatusBadge(status: match.status)
      }
      if let detail {
        Text(detail)
          .font(.subheadline)
          .foregroundStyle(.secondary)
      }
    }
    .padding(.vertical, 2)
  }

  /// "vs Sam Rivera" when the player is in the match, otherwise both sides.
  private var opponentLine: String {
    guard let side = match.side(of: userId) else { return match.titleForNavigation }
    return "vs \(match.sideDisplayName(side.opponent))"
  }

  private var detail: String? {
    switch match.status {
    case .inProgress:
      let sets = ScoreEngine.formatScoreDisplay(match.liveScore)
      return "\(sets) · \(ScoreEngine.formatGameScore(match.liveScore))"
    case .pendingReport, .completed, .disputed:
      var line = ScoreEngine.formatScoreDisplay(match.liveScore)
      if let winner = match.winner {
        let result = match.side(of: userId).map { $0 == winner ? "Won" : "Lost" } ?? "\(match.sideDisplayName(winner)) won"
        line = "\(result) \(line)"
      }
      return line
    case .scheduled, .proposed:
      guard let scheduledAt = match.scheduledAt else { return nil }
      return scheduledAt.dateFromMillis.formatted(date: .abbreviated, time: .shortened)
    case .cancelled:
      return nil
    }
  }
}
