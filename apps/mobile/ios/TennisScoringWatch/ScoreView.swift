import SwiftUI
import TennisCore
import WatchKit

struct ScoreView: View {
  let session: WatchSessionManager
  /// True in the Always On state, which the workout makes the usual one
  /// between points: the wrist is down and the screen dimmed.
  @Environment(\.isLuminanceReduced) private var isLuminanceReduced
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize
  /// Grow with the text, so the points column and the player stripe keep their
  /// proportions at large sizes instead of clipping a two-digit tiebreak score.
  @ScaledMetric(relativeTo: .title2) private var pointsMinWidth: CGFloat = 34
  @ScaledMetric(relativeTo: .footnote) private var stripeHeight: CGFloat = 22

  /// The scoreboard's player colors (DESIGN.md `player-blue` and `player-orange`),
  /// which stay distinguishable with red-green color blindness. Each row also
  /// carries the player's name, so color is never the only cue.
  private static let player1Color = Color(red: 0x3D / 255, green: 0x8B / 255, blue: 1)
  private static let player2Color = Color(red: 1, green: 0x9F / 255, blue: 0x1C / 255)

  var body: some View {
    if let snapshot = session.snapshot {
      scoreboard(snapshot)
        .onChange(of: session.lastResult) { _, result in
          if let result { confirm(result) }
        }
    } else {
      ScrollView {
        VStack(spacing: 8) {
          Image(systemName: session.isReachable ? "tennisball" : "iphone.slash")
            .font(.title2)
            .accessibilityHidden(true)
          Text("No live match")
            .font(.headline)
          // Without a reachable iPhone, opening a match there changes nothing
          // here, so the first step is getting the phone in range.
          Text(session.isReachable
            ? "Open a match on your iPhone to score it here."
            : "Keep your iPhone nearby with Tennis League open, then open a match.")
            .font(.footnote)
            .multilineTextAlignment(.center)
            .foregroundStyle(.secondary)
        }
        .padding()
        .accessibilityElement(children: .combine)
      }
    }
  }

  /// Feedback follows the phone's answer, not the tap: a click (or, for an
  /// undo, a falling tone) once the phone applied it, a failure buzz and a
  /// VoiceOver announcement when it did not.
  private func confirm(_ result: WatchSessionManager.CommandResult) {
    let device = WKInterfaceDevice.current()
    guard result.applied else {
      device.play(.failure)
      AccessibilityNotification.Announcement(failureText(result.command)).post()
      return
    }
    switch result.command {
    case .point: device.play(.click)
    case .undo: device.play(.directionDown)
    }
  }

  /// Built for a glance between points: each row leads with the points in large
  /// numerals, the current set's games beside them, and the set history below.
  /// In the Always On state only the score stays, larger and without color.
  private func scoreboard(_ snapshot: WatchScoreSnapshot) -> some View {
    let score = snapshot.score
    let live = snapshot.status == .inProgress
    return ScrollView {
      VStack(spacing: 4) {
        ForEach(Player.allCases, id: \.self) { side in
          playerRow(snapshot, side, live: live)
        }

        Text(summaryLine(snapshot))
          .font(.caption2.monospacedDigit())
          .foregroundStyle(score.isTiebreak && !isLuminanceReduced ? Color.yellow : Color.secondary)
          // A three-set history at accessibility sizes wraps rather than
          // shrinking below legibility or dropping the game score.
          .lineLimit(dynamicTypeSize.isAccessibilitySize ? 2 : 1)
          .minimumScaleFactor(0.8)
          .multilineTextAlignment(.center)

        if !isLuminanceReduced {
          if live {
            liveControls(snapshot)
          } else {
            finishedOrWaiting(snapshot)
          }
          workoutLines(live: live && snapshot.canScore)
        }
      }
      .padding(.horizontal, 4)
    }
  }

  /// One player's line. At accessibility sizes a name beside the games and
  /// points shrinks to a letter or two, so the name takes a line of its own and
  /// the numbers sit under it.
  @ViewBuilder
  private func playerRow(_ snapshot: WatchScoreSnapshot, _ side: Player, live: Bool) -> some View {
    let score = snapshot.score
    let isServing = live && score.server == side
    Group {
      if dynamicTypeSize.isAccessibilitySize {
        VStack(alignment: .leading, spacing: 2) {
          HStack(spacing: 4) {
            stripe(side)
            serveBall(isServing)
            nameText(snapshot, side)
              .lineLimit(2)
          }
          HStack(spacing: 4) {
            Spacer(minLength: 0)
            gamesText(score, side)
            if live { pointsText(score, side) }
          }
        }
      } else {
        HStack(spacing: 4) {
          stripe(side)
          serveBall(isServing)
          nameText(snapshot, side)
            .lineLimit(1)
          Spacer(minLength: 2)
          gamesText(score, side)
          if live { pointsText(score, side) }
        }
      }
    }
    // One sentence per player, instead of bare numbers with no context.
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(rowAccessibilityLabel(snapshot, side, isServing: isServing))
  }

  private func stripe(_ side: Player) -> some View {
    Capsule()
      .fill(color(for: side))
      .opacity(isLuminanceReduced ? 0.5 : 1)
      .frame(width: 4, height: stripeHeight)
      .accessibilityHidden(true)
  }

  private func serveBall(_ isServing: Bool) -> some View {
    Image(systemName: "tennisball.fill")
      .font(.caption2)
      .imageScale(.small)
      .foregroundStyle(isLuminanceReduced ? Color.secondary : Color.yellow)
      .opacity(isServing ? 1 : 0)
      .accessibilityHidden(true)
  }

  private func nameText(_ snapshot: WatchScoreSnapshot, _ side: Player) -> some View {
    Text(name(snapshot, side))
      .font(.footnote)
      .foregroundStyle(isLuminanceReduced ? Color.secondary : Color.primary)
  }

  private func gamesText(_ score: LiveScore, _ side: Player) -> some View {
    Text("\(games(score, side))")
      .font(.body.monospacedDigit())
      .foregroundStyle(.secondary)
  }

  private func pointsText(_ score: LiveScore, _ side: Player) -> some View {
    Text(points(score, side))
      .font((isLuminanceReduced ? Font.title : Font.title2).monospacedDigit().weight(.semibold))
      .foregroundStyle(score.isTiebreak && !isLuminanceReduced ? Color.yellow : Color.primary)
      .frame(minWidth: pointsMinWidth, alignment: .trailing)
  }

  @ViewBuilder
  private func liveControls(_ snapshot: WatchScoreSnapshot) -> some View {
    let names = snapshot.buttonNames
    HStack(spacing: 8) {
      pointButton(.player1, label: names.player1, name: snapshot.player1Name)
      pointButton(.player2, label: names.player2, name: snapshot.player2Name)
    }
    .disabled(!session.canScore || session.isSending)
    .padding(.top, 4)
    if let failed = session.failedCommand {
      Text(failureText(failed))
        .font(.caption2)
        .foregroundStyle(.red)
        .multilineTextAlignment(.center)
    } else if session.isSending {
      Text("Sending to your iPhone…")
        .font(.caption2)
        .foregroundStyle(.secondary)
    } else if !session.canScore {
      Text(readOnlyReason(snapshot))
        .font(.caption2)
        .foregroundStyle(.secondary)
        .multilineTextAlignment(.center)
    } else {
      Text("Tap who won the point.")
        .font(.caption2)
        .foregroundStyle(.secondary)
        .multilineTextAlignment(.center)
    }
    staleNotice
    if snapshot.canUndo { undoButton }
  }

  /// Why a live match can't be scored from this watch. A spectator was told to
  /// open the match on their iPhone, which can never let them score it.
  private func readOnlyReason(_ snapshot: WatchScoreSnapshot) -> LocalizedStringKey {
    if !snapshot.matchId.isEmpty && !snapshot.isParticipant {
      return "View only. Only the players in this match can score it."
    }
    if !session.isReachable { return "iPhone not reachable. Keep it nearby to score." }
    return "Open this match on your iPhone to score from here."
  }

  /// "Last update 12 minutes ago" once the score on screen is older than a live
  /// match's usual gap, as it is when the application context replays a match
  /// the phone stopped sending. The buttons stay: the phone decides whether a
  /// point applies, and answers no for a match it no longer has open.
  @ViewBuilder
  private var staleNotice: some View {
    if let sentAt = session.snapshotSentAt {
      let maxAge = WatchSessionManager.liveSnapshotMaxAge
      TimelineView(.periodic(from: .now, by: 30)) { context in
        if context.date.timeIntervalSince(sentAt) > maxAge {
          Label("Last update \(sentAt.formatted(.relative(presentation: .named)))", systemImage: "clock")
            .font(.caption2)
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.center)
        }
      }
    }
  }

  @ViewBuilder
  private func finishedOrWaiting(_ snapshot: WatchScoreSnapshot) -> some View {
    Text(snapshot.status.metadata.label)
      .font(.caption)
      .foregroundStyle(.secondary)
    if let winner = leader(snapshot.score), snapshot.status == .pendingReport || snapshot.status == .completed {
      Text("\(name(snapshot, winner)) wins")
        .font(.headline)
        .multilineTextAlignment(.center)
    }
    if let next = nextStep(snapshot.status) {
      Text(next)
        .font(.caption2)
        .foregroundStyle(.secondary)
        .multilineTextAlignment(.center)
    }
    // The match-winning point can still be taken back until a report is filed.
    if snapshot.canUndo {
      if let failed = session.failedCommand {
        Text(failureText(failed))
          .font(.caption2)
          .foregroundStyle(.red)
          .multilineTextAlignment(.center)
      }
      undoButton
    }
  }

  /// "Workout recording · 128 BPM" while the match is recorded, or, once after
  /// Health access was declined, why it isn't.
  @ViewBuilder
  private func workoutLines(live: Bool) -> some View {
    let workout = session.workout
    if live && workout.isRecording {
      HStack(spacing: 3) {
        Image(systemName: "heart.fill")
          .foregroundStyle(.red)
          .imageScale(.small)
          .accessibilityHidden(true)
        Text(workout.heartRate.map { "Workout recording · \(Int($0.rounded())) BPM" } ?? "Workout recording")
          .foregroundStyle(.secondary)
      }
      .font(.caption2.monospacedDigit())
      .padding(.top, 2)
      .accessibilityElement(children: .combine)
    } else if workout.showsDeniedNotice {
      Text("Not recording a workout. To record matches and keep the score on screen, allow Tennis League in Health settings.")
        .font(.caption2)
        .foregroundStyle(.secondary)
        .multilineTextAlignment(.center)
        .padding(.top, 2)
    }
  }

  private var undoButton: some View {
    Button {
      session.sendUndo()
    } label: {
      Label("Undo last point", systemImage: "arrow.uturn.backward")
        .font(.footnote)
        .frame(maxWidth: .infinity, minHeight: 44)
    }
    .buttonStyle(.bordered)
    .disabled(!session.canUndo || session.isSending)
    .padding(.top, 2)
  }

  private func pointButton(_ side: Player, label: String, name: String) -> some View {
    Button {
      // The click comes when the phone confirms the point (see `confirm`).
      session.sendPoint(side)
    } label: {
      Text(label)
        .font(.headline)
        .lineLimit(1)
        .minimumScaleFactor(0.6)
        // Black on the bright player colors reads at 6:1 or better in sunlight;
        // the default white label does not.
        .foregroundStyle(.black)
        .frame(maxWidth: .infinity, minHeight: 44)
    }
    .buttonStyle(.borderedProminent)
    .tint(color(for: side))
    .accessibilityLabel("Point to \(name)")
  }

  private func failureText(_ command: WatchCommand) -> String {
    switch command {
    case .point: "Point not scored. Check the score on your iPhone."
    case .undo: "Undo didn't go through. Check the score on your iPhone."
    }
  }

  private func color(for side: Player) -> Color {
    side == .player1 ? Self.player1Color : Self.player2Color
  }

  private func name(_ snapshot: WatchScoreSnapshot, _ side: Player) -> String {
    side == .player1 ? snapshot.player1Name : snapshot.player2Name
  }

  private func rowAccessibilityLabel(_ snapshot: WatchScoreSnapshot, _ side: Player, isServing: Bool) -> String {
    let score = snapshot.score
    let sets = score.setsWon(by: side)
    let gamesWon = games(score, side)
    var parts = [
      name(snapshot, side),
      "\(sets) \(sets == 1 ? "set" : "sets")",
      "\(gamesWon) \(gamesWon == 1 ? "game" : "games") this set",
    ]
    if snapshot.status == .inProgress {
      parts.append(score.isTiebreak ? "\(points(score, side)) in the tiebreak" : "\(points(score, side)) in this game")
    }
    if isServing { parts.append("serving") }
    return parts.joined(separator: ", ")
  }

  /// The set scores so far, then the game in words while the match is live:
  /// "6-4, 3-2 · 30-all", or "6-6 · Tiebreak".
  private func summaryLine(_ snapshot: WatchScoreSnapshot) -> String {
    let score = snapshot.score
    let sets = ScoreEngine.formatScoreDisplay(score)
    guard snapshot.status == .inProgress else { return sets }
    let game = score.isTiebreak ? "Tiebreak" : ScoreEngine.formatGameScore(score)
    return sets.isEmpty ? game : "\(sets) · \(game)"
  }

  private func points(_ score: LiveScore, _ side: Player) -> String {
    if score.isTiebreak, let tiebreak = score.tiebreakScore { return "\(tiebreak.points(for: side))" }
    return score.currentGame[side].rawValue
  }

  /// Games in the set being played, or in the last set once the match is over.
  private func games(_ score: LiveScore, _ side: Player) -> Int {
    guard score.sets.indices.contains(score.currentSet) else { return score.sets.last?.games(for: side) ?? 0 }
    return score.sets[score.currentSet].games(for: side)
  }

  /// The side ahead on sets, which is the winner once the match is over.
  private func leader(_ score: LiveScore) -> Player? {
    let first = score.setsWon(by: .player1), second = score.setsWon(by: .player2)
    if first == second { return nil }
    return first > second ? .player1 : .player2
  }

  private func nextStep(_ status: MatchStatus) -> String? {
    switch status {
    case .proposed: return "Waiting for the proposal to be accepted."
    case .scheduled: return "Start the match on your iPhone to score it here."
    case .pendingReport: return "Finish the report on your iPhone."
    case .disputed: return "Your division leader will resolve the result."
    case .cancelled: return "This match was cancelled."
    case .inProgress, .completed: return nil
    }
  }
}
