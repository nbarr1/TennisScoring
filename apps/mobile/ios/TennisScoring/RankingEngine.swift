import Foundation

struct RankingInput: Equatable { let userId, displayName, divisionId, season: String; let matchesWon, matchesLost, setsWon, setsLost, gamesWon, gamesLost: Int }
struct HeadToHead { let player1Id, player2Id: String; let player1Wins, player2Wins: Int }
struct PlayerRanking { let input: RankingInput; let matchesPlayed, gameDifferential, rank: Int; let updatedAt: Int64 }
enum RankingEngine {
  static func compute(_ inputs: [RankingInput], headToHeads: [HeadToHead], now: Int64) -> [PlayerRanking] {
    var h2h: [String: Int] = [:]
    headToHeads.forEach { h2h["\($0.player1Id):\($0.player2Id)"] = $0.player1Wins; h2h["\($0.player2Id):\($0.player1Id)"] = $0.player2Wins }
    let ordered = inputs.sorted { a, b in
      let av = [a.matchesWon,a.setsWon,a.gamesWon,a.gamesWon-a.gamesLost], bv = [b.matchesWon,b.setsWon,b.gamesWon,b.gamesWon-b.gamesLost]
      if av != bv { return av.lexicographicallyPrecedes(bv, by: >) }
      let aw = h2h["\(a.userId):\(b.userId)", default: 0], bw = h2h["\(b.userId):\(a.userId)", default: 0]
      return aw == bw ? a.displayName.localizedCompare(b.displayName) == .orderedAscending : aw > bw
    }
    return ordered.enumerated().map { PlayerRanking(input: $0.element, matchesPlayed: $0.element.matchesWon+$0.element.matchesLost, gameDifferential: $0.element.gamesWon-$0.element.gamesLost, rank: $0.offset+1, updatedAt: now) }
  }
}
