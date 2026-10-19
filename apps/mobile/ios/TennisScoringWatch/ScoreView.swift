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

  private func scoreboard(_ snapshot: WatchScoreSnapshot) -> some View {
    let score = snapshot.score
    return ScrollView {
      VStack(spacing: 6) {
        ForEach(Player.allCases, id: \.self) { side in
          let isServing = snapshot.status == .inProgress && score.server == side
          HStack(spacing: 4) {
            Capsule()
              .fill(color(for: side))
              .frame(width: 4, height: 16)
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
            Text("\(score.setsWon(by: side))")
              .font(.footnote.monospacedDigit())
              .foregroundStyle(.secondary)
            Text(points(score, side))
              .font(.headline.monospacedDigit())
              .foregroundStyle(score.isTiebreak ? Color.yellow : Color.green)
              .frame(minWidth: 26, alignment: .trailing)
          }
          // One sentence per player, instead of bare numbers with no context.
          .accessibilityElement(children: .ignore)
          .accessibilityLabel(rowAccessibilityLabel(snapshot, side, isServing: isServing))
        }

        Text(score.isTiebreak ? "Tiebreak" : ScoreEngine.formatGameScore(score))
          .font(.caption2)
          .foregroundStyle(score.isTiebreak ? Color.yellow : Color.secondary)
        Text(ScoreEngine.formatScoreDisplay(score))
          .font(.caption2.monospacedDigit())
          .foregroundStyle(.secondary)

        if snapshot.status == .inProgress {
          HStack(spacing: 8) {
            pointButton(.player1, name: snapshot.player1Name)
            pointButton(.player2, name: snapshot.player2Name)
          }
          .disabled(!session.canScore)
          .padding(.top, 4)
          if !session.canScore {
            Text(session.isReachable
              ? "Open this match on your iPhone to score from here."
              : "iPhone not reachable. Keep it nearby to score.")
              .font(.caption2)
              .foregroundStyle(.secondary)
              .multilineTextAlignment(.center)
          }
        } else {
          Text(snapshot.status.metadata.label)
            .font(.caption)
            .foregroundStyle(.secondary)
          if snapshot.status == .pendingReport {
            Text("Finish the report on your iPhone.")
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
      Text(initials(name))
        .font(.headline)
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
    var parts = [name(snapshot, side), "\(sets) \(sets == 1 ? "set" : "sets")"]
    if snapshot.status == .inProgress {
      parts.append(score.isTiebreak ? "\(points(score, side)) in the tiebreak" : "\(points(score, side)) in this game")
    }
    if isServing { parts.append("serving") }
    return parts.joined(separator: ", ")
  }

  private func points(_ score: LiveScore, _ side: Player) -> String {
    if score.isTiebreak, let tiebreak = score.tiebreakScore { return "\(tiebreak.points(for: side))" }
    return score.currentGame[side].rawValue
  }

  /// "Ann Smith / Bob Jones" → "AS/BJ"; "Sam Rivera" → "SR".
  private func initials(_ name: String) -> String {
    name.components(separatedBy: " / ").map { person in
      String(person.split(separator: " ").prefix(2).compactMap(\.first))
    }.joined(separator: "/")
  }
}
