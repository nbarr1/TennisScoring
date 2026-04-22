import SwiftUI

// Parsed score state for watch display
struct WatchScore: Codable {
  var player1SetsWon: Int
  var player2SetsWon: Int
  var isTiebreak: Bool
  var currentGame: GameScore?
  var tiebreakScore: TiebreakScore?

  struct GameScore: Codable {
    var player1: String
    var player2: String
  }

  struct TiebreakScore: Codable {
    var player1Points: Int
    var player2Points: Int
  }
}

struct ScoreView: View {
  @StateObject private var session = WatchSessionManager.shared

  private var score: WatchScore? {
    guard !session.scoreJson.isEmpty,
          let data = session.scoreJson.data(using: .utf8),
          let s = try? JSONDecoder().decode(WatchScore.self, from: data)
    else { return nil }
    return s
  }

  var body: some View {
    VStack(spacing: 8) {
      Text("Sets")
        .font(.caption2)
        .foregroundColor(.secondary)

      Text("\(score?.player1SetsWon ?? 0) – \(score?.player2SetsWon ?? 0)")
        .font(.title2.bold())
        .foregroundColor(.white)

      if let s = score {
        if s.isTiebreak, let tb = s.tiebreakScore {
          Text("\(tb.player1Points)–\(tb.player2Points)")
            .font(.title3.bold())
            .foregroundColor(.yellow)
          Text("TIEBREAK")
            .font(.caption2)
            .foregroundColor(.yellow)
        } else if let g = s.currentGame {
          Text("\(g.player1)–\(g.player2)")
            .font(.title3.bold())
            .foregroundColor(.green)
        }
      }

      HStack(spacing: 12) {
        Button {
          WatchSessionManager.shared.sendPointToPhone(player: "player1")
        } label: {
          Text("P1 ✓")
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
        .tint(.green)

        Button {
          WatchSessionManager.shared.sendPointToPhone(player: "player2")
        } label: {
          Text("P2 ✓")
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
        .tint(.blue)
      }
      .padding(.top, 4)
    }
    .padding()
    .background(Color.black)
  }
}
