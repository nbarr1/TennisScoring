import SwiftUI
import TennisCore

struct ScoreView: View {
  let session: WatchSessionManager

  var body: some View {
    if let snapshot = session.snapshot {
      scoreboard(snapshot)
    } else {
      VStack(spacing: 8) {
        Image(systemName: "tennisball")
          .font(.title2)
        Text("Open a match on your iPhone to score it here.")
          .font(.footnote)
          .multilineTextAlignment(.center)
          .foregroundStyle(.secondary)
      }
      .padding()
    }
  }

  private func scoreboard(_ snapshot: WatchScoreSnapshot) -> some View {
    let score = snapshot.score
    return ScrollView {
      VStack(spacing: 6) {
        ForEach(Player.allCases, id: \.self) { side in
          HStack(spacing: 4) {
            Image(systemName: "tennisball.fill")
              .font(.system(size: 8))
              .foregroundStyle(.yellow)
              .opacity(snapshot.status == .inProgress && score.server == side ? 1 : 0)
              .accessibilityHidden(true)
            Text(side == .player1 ? snapshot.player1Name : snapshot.player2Name)
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
          .accessibilityElement(children: .combine)
        }

        Text(score.isTiebreak ? "Tiebreak" : ScoreEngine.formatGameScore(score))
          .font(.caption2)
          .foregroundStyle(score.isTiebreak ? Color.yellow : Color.secondary)
        Text(ScoreEngine.formatScoreDisplay(score))
          .font(.caption2.monospacedDigit())
          .foregroundStyle(.secondary)

        if snapshot.status == .inProgress {
          HStack(spacing: 8) {
            pointButton(.player1, name: snapshot.player1Name, tint: .green)
            pointButton(.player2, name: snapshot.player2Name, tint: .blue)
          }
          .disabled(!session.canScore)
          .padding(.top, 4)
          if !session.canScore {
            Text(session.isReachable ? "Scoring is available on the match screen." : "iPhone not reachable")
              .font(.caption2)
              .foregroundStyle(.secondary)
              .multilineTextAlignment(.center)
          }
        } else {
          Text(snapshot.status.metadata.label)
            .font(.caption)
            .foregroundStyle(.secondary)
        }
      }
      .padding(.horizontal, 4)
    }
  }

  private func pointButton(_ side: Player, name: String, tint: Color) -> some View {
    Button {
      session.sendPoint(side)
    } label: {
      Text(initials(name))
        .font(.headline)
        .frame(maxWidth: .infinity)
    }
    .buttonStyle(.borderedProminent)
    .tint(tint)
    .accessibilityLabel("Point to \(name)")
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
