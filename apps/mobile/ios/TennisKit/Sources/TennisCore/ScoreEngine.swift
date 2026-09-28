import Foundation

/// Mirrors `TipTrigger` in `@tennis/shared`.
public enum TipTrigger: String, Codable, Sendable, CaseIterable {
  case serviceChange = "service_change"
  case tiebreakStart = "tiebreak_start"
  case deuce
  case advantage
  case gamePoint = "game_point"
  case setPoint = "set_point"
  case matchPoint = "match_point"
  case newSet = "new_set"
  case matchComplete = "match_complete"
}

public struct SetCompletion: Codable, Equatable, Sendable {
  public var setIndex: Int
  public var winner: Player

  public init(setIndex: Int, winner: Player) {
    self.setIndex = setIndex
    self.winner = winner
  }
}

public struct ScoreResult: Equatable, Sendable {
  public var nextScore: LiveScore
  public var tips: [TipTrigger]
  public var matchWinner: Player?
  public var setCompleted: SetCompletion?
  /// Set only when a game ends without also ending the set or starting a tiebreak.
  public var gameCompleted: Player?

  public init(
    nextScore: LiveScore,
    tips: [TipTrigger] = [],
    matchWinner: Player? = nil,
    setCompleted: SetCompletion? = nil,
    gameCompleted: Player? = nil
  ) {
    self.nextScore = nextScore
    self.tips = tips
    self.matchWinner = matchWinner
    self.setCompleted = setCompleted
    self.gameCompleted = gameCompleted
  }
}

/// Port of `scoreEngine.ts`: 0-15-30-40-Ad-Deuce, 7-point tiebreaks won by two,
/// set and match completion, and advantage-style deciding sets when
/// `finalSetTiebreak` is false.
///
/// The Cloud Function `scoreMatchPoint` is authoritative for live matches; this
/// port exists so the app can show what a point *would* do, replay scores, and
/// stay testable offline. `fixtures/mobile-contract/engine-parity.json` pins it to
/// the TypeScript behaviour.
public enum ScoreEngine {
  public static func initialScore(for format: MatchFormat = .standard) -> LiveScore {
    _ = format
    return LiveScore()
  }

  public static func applyPoint(_ score: LiveScore, scorer: Player, format: MatchFormat) -> ScoreResult {
    var tips: [TipTrigger] = []

    if score.isTiebreak {
      let tiebreak = advanceTiebreak(score, scorer: scorer)
      tips += tiebreak.tips
      guard let setWinner = tiebreak.setWinner else {
        return ScoreResult(nextScore: tiebreak.score, tips: tips)
      }
      return completeSet(tiebreak.score, winner: setWinner, format: format, tips: tips)
    }

    var next = score
    let mine = next.currentGame[scorer]
    let theirs = next.currentGame[scorer.opponent]
    var gameWinner: Player?

    if mine == .advantage {
      gameWinner = scorer
    } else if mine == .forty && theirs == .advantage {
      // The opponent had advantage: back to deuce.
      next.currentGame[scorer.opponent] = .forty
      tips.append(.deuce)
      return ScoreResult(nextScore: next, tips: tips)
    } else if mine == .forty && theirs == .forty {
      next.currentGame[scorer] = .advantage
      tips.append(.advantage)
      appendOpportunityTip(next, format: format, to: &tips)
      return ScoreResult(nextScore: next, tips: tips)
    } else {
      next.currentGame[scorer] = nextPoint(mine)
      if mine == .forty { gameWinner = scorer }
    }

    guard let gameWinner else {
      if next.currentGame.player1 == .forty && next.currentGame.player2 == .forty {
        tips.append(.deuce)
      }
      appendOpportunityTip(next, format: format, to: &tips)
      return ScoreResult(nextScore: next, tips: tips)
    }

    // Game won: reset the game and credit it.
    next.currentGame = GameScore()
    next.serviceSide = .deuce
    if gameWinner == .player1 {
      next.sets[next.currentSet].player1Games += 1
    } else {
      next.sets[next.currentSet].player2Games += 1
    }
    let set = next.sets[next.currentSet]

    // A tiebreak starts at tiebreakAt-all, except in a deciding set played
    // advantage style.
    let isFinalSet = next.player1SetsWon == format.setsToWin - 1 && next.player2SetsWon == format.setsToWin - 1
    if set.player1Games == format.tiebreakAt && set.player2Games == format.tiebreakAt
      && (!isFinalSet || format.finalSetTiebreak) {
      next.server = next.server.opponent
      next.serviceSide = .deuce
      next.isTiebreak = true
      next.tiebreakScore = TiebreakScore()
      tips += [.serviceChange, .tiebreakStart]
      return ScoreResult(nextScore: next, tips: tips)
    }

    next.server = next.server.opponent
    tips.append(.serviceChange)

    guard let setWinner = resolveSetWinner(set, format: format) else {
      return ScoreResult(nextScore: next, tips: tips, gameCompleted: gameWinner)
    }
    return completeSet(next, winner: setWinner, format: format, tips: tips)
  }

  // MARK: - Display

  /// Completed sets plus the one in progress, e.g. `"6-4, 6-7(5), 2-1"`. A
  /// tiebreak set shows the loser's tiebreak points in parentheses.
  public static func formatScoreDisplay(_ score: LiveScore) -> String {
    score.sets.enumerated()
      .filter { index, set in set.winner != nil || index == score.currentSet }
      .map { _, set in
        if let tiebreak = set.tiebreak, let winner = set.winner {
          return "\(set.player1Games)-\(set.player2Games)(\(tiebreak.points(for: winner.opponent)))"
        }
        return "\(set.player1Games)-\(set.player2Games)"
      }
      .joined(separator: ", ")
  }

  /// The current game in words: `"Love-all"`, `"30-all"`, `"Deuce"`,
  /// `"Ad In"`/`"Ad Out"` (relative to the server), `"15 – 40"`, or the
  /// tiebreak points.
  public static func formatGameScore(_ score: LiveScore) -> String {
    if score.isTiebreak, let tiebreak = score.tiebreakScore {
      return "\(tiebreak.player1Points)-\(tiebreak.player2Points)"
    }
    let p1 = score.currentGame.player1, p2 = score.currentGame.player2
    if p1 == .forty && p2 == .forty { return "Deuce" }
    if p1 == .advantage { return score.server == .player1 ? "Ad In" : "Ad Out" }
    if p2 == .advantage { return score.server == .player2 ? "Ad In" : "Ad Out" }
    if p1 == .love && p2 == .love { return "Love-all" }
    if p1 == p2 { return "\(p1.rawValue)-all" }
    func spoken(_ point: TennisPoint) -> String { point == .love ? "Love" : point.rawValue }
    return "\(spoken(p1)) – \(spoken(p2))"
  }

  // MARK: - Internals

  private static let pointSequence: [TennisPoint] = [.love, .fifteen, .thirty, .forty]

  private static func nextPoint(_ current: TennisPoint) -> TennisPoint {
    guard let index = pointSequence.firstIndex(of: current), index < pointSequence.count - 1 else { return .forty }
    return pointSequence[index + 1]
  }

  private static func isGamePoint(_ game: GameScore, for player: Player) -> Bool {
    let mine = game[player], theirs = game[player.opponent]
    return mine == .advantage || (mine == .forty && theirs != .forty && theirs != .advantage)
  }

  /// Emits at most one of match point, set point, or game point, describing
  /// whoever is one point from winning the game (not necessarily the scorer).
  private static func appendOpportunityTip(_ score: LiveScore, format: MatchFormat, to tips: inout [TipTrigger]) {
    let player: Player
    if isGamePoint(score.currentGame, for: .player1) {
      player = .player1
    } else if isGamePoint(score.currentGame, for: .player2) {
      player = .player2
    } else {
      return
    }
    let setPoint = isSetPoint(score, for: player, format: format)
    if setPoint && score.setsWon(by: player) == format.setsToWin - 1 {
      tips.append(.matchPoint)
    } else if setPoint {
      tips.append(.setPoint)
    } else {
      tips.append(.gamePoint)
    }
  }

  private static func isSetPoint(_ score: LiveScore, for player: Player, format: MatchFormat) -> Bool {
    let set = score.sets[score.currentSet]
    let gamesIfWon = set.games(for: player) + 1
    return gamesIfWon >= format.gamesPerSet && gamesIfWon - set.games(for: player.opponent) >= 2
  }

  private static func advanceTiebreak(_ score: LiveScore, scorer: Player) -> (score: LiveScore, tips: [TipTrigger], setWinner: Player?) {
    var next = score
    var tiebreak = next.tiebreakScore ?? TiebreakScore()
    var tips: [TipTrigger] = []

    if scorer == .player1 { tiebreak.player1Points += 1 } else { tiebreak.player2Points += 1 }

    // Players change ends every six points.
    let total = tiebreak.player1Points + tiebreak.player2Points
    if total > 0 && total % 6 == 0 { tips.append(.serviceChange) }

    // One opening point, then alternating two-point blocks.
    if total > 0 && total % 2 == 1 {
      next.server = next.server.opponent
      next.serviceSide = .deuce
    } else if total > 0 {
      next.serviceSide = next.serviceSide.toggled
    }

    guard let winner = resolveTiebreakWinner(tiebreak) else {
      next.tiebreakScore = tiebreak
      return (next, tips, nil)
    }
    var set = next.sets[next.currentSet]
    if winner == .player1 {
      set.player1Games = max(set.player1Games, set.player2Games + 1)
    } else {
      set.player2Games = max(set.player2Games, set.player1Games + 1)
    }
    set.tiebreak = tiebreak
    set.winner = winner
    next.sets[next.currentSet] = set
    next.tiebreakScore = tiebreak
    return (next, tips, winner)
  }

  private static func resolveTiebreakWinner(_ tiebreak: TiebreakScore) -> Player? {
    let p1 = tiebreak.player1Points, p2 = tiebreak.player2Points
    if p1 >= 7 && p1 - p2 >= 2 { return .player1 }
    if p2 >= 7 && p2 - p1 >= 2 { return .player2 }
    return nil
  }

  private static func resolveSetWinner(_ set: SetScore, format: MatchFormat) -> Player? {
    if set.player1Games >= format.gamesPerSet && set.player1Games - set.player2Games >= 2 { return .player1 }
    if set.player2Games >= format.gamesPerSet && set.player2Games - set.player1Games >= 2 { return .player2 }
    return nil
  }

  private static func completeSet(_ score: LiveScore, winner: Player, format: MatchFormat, tips: [TipTrigger]) -> ScoreResult {
    var next = score
    var tips = tips
    next.sets[next.currentSet].winner = winner
    next.isTiebreak = false
    next.tiebreakScore = nil
    if winner == .player1 { next.player1SetsWon += 1 } else { next.player2SetsWon += 1 }

    let completion = SetCompletion(setIndex: next.currentSet, winner: winner)
    if next.setsWon(by: winner) == format.setsToWin {
      tips.append(.matchComplete)
      return ScoreResult(nextScore: next, tips: tips, matchWinner: winner, setCompleted: completion)
    }

    next.currentSet += 1
    next.sets.append(SetScore(setNumber: next.currentSet))
    next.currentGame = GameScore()
    next.serviceSide = .deuce
    tips.append(.newSet)
    return ScoreResult(nextScore: next, tips: tips, setCompleted: completion)
  }
}

// MARK: - Tips

/// Mirrors `TIPS` in `@tennis/shared/tips`.
public struct Tip: Equatable, Sendable {
  public let trigger: TipTrigger
  public let title: String
  public let body: String
}

extension TipTrigger {
  public var tip: Tip {
    switch self {
    case .serviceChange:
      Tip(trigger: self, title: "Service Change", body: "Server switches after each game. Remember to switch ends after odd-numbered games in each set.")
    case .tiebreakStart:
      Tip(trigger: self, title: "Tiebreak!", body: "First to 7 points, must win by 2. Server serves 1 point, then players alternate every 2 points. Switch ends every 6 points.")
    case .deuce:
      Tip(trigger: self, title: "Deuce", body: "Deuce — must win by 2 consecutive points to win the game.")
    case .advantage:
      Tip(trigger: self, title: "Advantage", body: "One player has advantage. Win the next point to win the game, or it returns to Deuce.")
    case .gamePoint:
      Tip(trigger: self, title: "Game Point", body: "One player has game point. Win the next point to win the game.")
    case .setPoint:
      Tip(trigger: self, title: "Set Point", body: "One player has set point. Win the next game to win the set.")
    case .matchPoint:
      Tip(trigger: self, title: "Match Point", body: "Match point! Win the next game to win the match.")
    case .newSet:
      Tip(trigger: self, title: "New Set", body: "New set begins. Players switch ends. Score resets to 0-0.")
    case .matchComplete:
      Tip(trigger: self, title: "Match Complete", body: "The match is over. Great game!")
    }
  }

  /// When several triggers fire on one point, the one to show. Mirrors the
  /// priority list in `getTipsForTriggers`.
  public static func primary(of triggers: [TipTrigger]) -> TipTrigger? {
    let priority: [TipTrigger] = [
      .matchComplete, .tiebreakStart, .matchPoint, .setPoint, .deuce,
      .advantage, .newSet, .serviceChange, .gamePoint,
    ]
    return priority.first(where: triggers.contains)
  }
}
