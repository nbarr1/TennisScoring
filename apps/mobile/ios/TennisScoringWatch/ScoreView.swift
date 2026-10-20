import SwiftUI
import TennisCore
import WatchKit

struct ScoreView: View {
  let session: WatchSessionManager

  /// The scoreboard's player colors (DESIGN.md `player-blue` and `player-orange`),
  /// which stay distinguishable with red-green color blindness. Each row also
  /// carries the player's name, so color is never the only cue.
  private static let player1Color = Color(red: 0x3D / 255, green: 0x8B / 255, blue: 1)
  private static let player2Color = Color(red: 1, green: 0x9F / 255, blue: 0x1C / 255)

  var body: some View {
    if let snapshot = session.snapshot {
      scoreboard(snapshot)
        .onChange(of: session.lastSendFailed) { _, failed in
          if failed { WKInterfaceDevice.current().play(.failure) }
        }
    } else {
      VStack(spacing: 8) {
        Image(systemName: "tennisball")
          .font(.title2)
          .accessibilityHidden(true)
        Text("No live match")
          .font(.headline)
        Text("Open a match on your iPhone to score it here.")
          .font(.footnote)
          .multilineTextAlignment(.center)
          .foregroundStyle(.secondary)
      }
      .padding()
      .accessibilityElement(children: .combine)
    }
  }

  /// Built for a glance between points: each row leads with the points in large
  /// numerals, the current set's games beside them, and the set history below.
  private func scoreboard(_ snapshot: WatchScoreSnapshot) -> some View {
    let score = snapshot.score
    return ScrollView {
      VStack(spacing: 4) {
        ForEach(Player.allCases, id: \.self) { side in
          let isServing = snapshot.status == .inProgress && score.server == side
          HStack(spacing: 4) {
            Capsule()
              .fill(color(for: side))
              .frame(width: 4, height: 22)
              .accessibilityHidden(true)
            Image(systemName: "tennisball.fill")
              .font(.system(size: 8))
              .foregroundStyle(.yellow)
              .opacity(isServing ? 1 : 0)
              .accessibilityHidden(true)
            Text(name(snapshot, side))
              .font(.footnote)
              .lineLimit(1)
            Spacer(minLength: 2)
            Text("\(games(score, side))")
              .font(.body.monospacedDigit())
              .foregroundStyle(.secondary)
            if snapshot.status == .inProgress {
              Text(points(score, side))
                .font(.title2.monospacedDigit().weight(.semibold))
                .foregroundStyle(score.isTiebreak ? Color.yellow : Color.primary)
                .frame(minWidth: 34, alignment: .trailing)
            }
          }
          // One sentence per player, instead of bare numbers with no context.
          .accessibilityElement(children: .ignore)
          .accessibilityLabel(rowAccessibilityLabel(snapshot, side, isServing: isServing))
        }

        Text(summaryLine(snapshot))
          .font(.caption2.monospacedDigit())
          .foregroundStyle(score.isTiebreak ? Color.yellow : Color.secondary)
          .lineLimit(1)
          .minimumScaleFactor(0.8)

        if snapshot.status == .inProgress {
          HStack(spacing: 8) {
            pointButton(.player1, name: snapshot.player1Name)
            pointButton(.player2, name: snapshot.player2Name)
          }
          .disabled(!session.canScore)
          .padding(.top, 4)
          if session.lastSendFailed {
            Text("Point not sent. Check the score on your iPhone.")
              .font(.caption2)
              .foregroundStyle(.red)
              .multilineTextAlignment(.center)
          } else if !session.canScore {
            Text(session.isReachable
              ? "Open this match on your iPhone to score from here."
              : "iPhone not reachable. Keep it nearby to score.")
              .font(.caption2)
              .foregroundStyle(.secondary)
              .multilineTextAlignment(.center)
          } else {
            Text("Tap who won the point. Undo on your iPhone.")
              .font(.caption2)
              .foregroundStyle(.secondary)
              .multilineTextAlignment(.center)
          }
        } else {
          Text(snapshot.status.metadata.label)
            .font(.caption)
            .foregroundStyle(.secondary)
          if let winner = leader(score), snapshot.status == .pendingReport || snapshot.status == .completed {
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
        }
      }
      .padding(.horizontal, 4)
    }
  }

  private func pointButton(_ side: Player, name: String) -> some View {
    Button {
      // A click confirms the tap registered without looking down between points.
      WKInterfaceDevice.current().play(.click)
      session.sendPoint(side)
    } label: {
      Text(firstNames(name))
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
    case .scheduled: return "Start the match on your iPhone to score it here."
    case .pendingReport: return "Finish the report on your iPhone."
    default: return nil
    }
  }

  /// "Ann Smith / Bob Jones" → "Ann/Bob"; "Sam Rivera" → "Sam".
  private func firstNames(_ name: String) -> String {
    let names = name.components(separatedBy: " / ").compactMap { person -> String? in
      guard let first = person.split(separator: " ").first else { return nil }
      return String(first)
    }
    return names.isEmpty ? name : names.joined(separator: "/")
  }
}
