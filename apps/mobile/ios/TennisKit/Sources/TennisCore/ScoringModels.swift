import Foundation

/// A *side* of the match, not a person. Singles carries one player per side and
/// doubles carries two, so the score engine never needs to know which it is.
public enum Player: String, Codable, Sendable, CaseIterable, Hashable {
  case player1
  case player2

  public var opponent: Player { self == .player1 ? .player2 : .player1 }
}

public enum TennisPoint: String, Codable, Sendable, CaseIterable {
  case love = "0"
  case fifteen = "15"
  case thirty = "30"
  case forty = "40"
  case advantage = "Ad"
}

public enum ServiceSide: String, Codable, Sendable {
  case deuce
  case advantage

  var toggled: ServiceSide { self == .deuce ? .advantage : .deuce }
}

/// Mirrors `MatchFormat_Config` in `@tennis/shared`.
public struct MatchFormat: Codable, Equatable, Hashable, Sendable {
  /// 2 for best of three, 3 for best of five.
  public var setsToWin: Int
  public var gamesPerSet: Int
  /// Games each at which a set goes to a tiebreak.
  public var tiebreakAt: Int
  /// When false, the deciding set plays out advantage style instead of a tiebreak.
  public var finalSetTiebreak: Bool

  public static let standard = MatchFormat(setsToWin: 2, gamesPerSet: 6, tiebreakAt: 6, finalSetTiebreak: true)

  public init(setsToWin: Int, gamesPerSet: Int, tiebreakAt: Int, finalSetTiebreak: Bool) {
    self.setsToWin = setsToWin
    self.gamesPerSet = gamesPerSet
    self.tiebreakAt = tiebreakAt
    self.finalSetTiebreak = finalSetTiebreak
  }

  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    let standard = MatchFormat.standard
    setsToWin = max(1, c.decode(.setsToWin, default: standard.setsToWin))
    gamesPerSet = max(1, c.decode(.gamesPerSet, default: standard.gamesPerSet))
    tiebreakAt = max(1, c.decode(.tiebreakAt, default: standard.tiebreakAt))
    finalSetTiebreak = c.decode(.finalSetTiebreak, default: standard.finalSetTiebreak)
  }
}

public struct TiebreakScore: Codable, Equatable, Sendable {
  public var player1Points: Int
  public var player2Points: Int

  public init(player1Points: Int = 0, player2Points: Int = 0) {
    self.player1Points = player1Points
    self.player2Points = player2Points
  }

  public func points(for player: Player) -> Int { player == .player1 ? player1Points : player2Points }
}

public struct SetScore: Codable, Equatable, Sendable {
  public var setNumber: Int
  public var player1Games: Int
  public var player2Games: Int
  public var tiebreak: TiebreakScore?
  public var winner: Player?
  public var startedAt: Int64?
  public var completedAt: Int64?
  public var durationMs: Int64?

  public init(
    setNumber: Int,
    player1Games: Int = 0,
    player2Games: Int = 0,
    tiebreak: TiebreakScore? = nil,
    winner: Player? = nil,
    startedAt: Int64? = nil,
    completedAt: Int64? = nil,
    durationMs: Int64? = nil
  ) {
    self.setNumber = setNumber
    self.player1Games = player1Games
    self.player2Games = player2Games
    self.tiebreak = tiebreak
    self.winner = winner
    self.startedAt = startedAt
    self.completedAt = completedAt
    self.durationMs = durationMs
  }

  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    setNumber = c.decode(.setNumber, default: 0)
    player1Games = c.decode(.player1Games, default: 0)
    player2Games = c.decode(.player2Games, default: 0)
    tiebreak = c.decodeLenient(TiebreakScore.self, .tiebreak)
    winner = c.decodeLenient(Player.self, .winner)
    startedAt = c.decodeMillis(.startedAt)
    completedAt = c.decodeMillis(.completedAt)
    durationMs = c.decodeMillis(.durationMs)
  }

  public func games(for player: Player) -> Int { player == .player1 ? player1Games : player2Games }
}

public struct GameScore: Codable, Equatable, Sendable {
  public var player1: TennisPoint
  public var player2: TennisPoint

  public init(player1: TennisPoint = .love, player2: TennisPoint = .love) {
    self.player1 = player1
    self.player2 = player2
  }

  public subscript(player: Player) -> TennisPoint {
    get { player == .player1 ? player1 : player2 }
    set { if player == .player1 { player1 = newValue } else { player2 = newValue } }
  }
}

/// Mirrors `LiveScore` in `@tennis/shared`. The synthesized encoding produces the
/// same JSON shape, which the watch message format relies on.
public struct LiveScore: Codable, Equatable, Sendable {
  public var sets: [SetScore]
  /// Zero-based index into `sets`.
  public var currentSet: Int
  public var currentGame: GameScore
  public var isTiebreak: Bool
  public var tiebreakScore: TiebreakScore?
  public var server: Player
  public var serviceSide: ServiceSide
  public var player1SetsWon: Int
  public var player2SetsWon: Int

  public init(
    sets: [SetScore] = [SetScore(setNumber: 0)],
    currentSet: Int = 0,
    currentGame: GameScore = GameScore(),
    isTiebreak: Bool = false,
    tiebreakScore: TiebreakScore? = nil,
    server: Player = .player1,
    serviceSide: ServiceSide = .deuce,
    player1SetsWon: Int = 0,
    player2SetsWon: Int = 0
  ) {
    self.sets = sets
    self.currentSet = currentSet
    self.currentGame = currentGame
    self.isTiebreak = isTiebreak
    self.tiebreakScore = tiebreakScore
    self.server = server
    self.serviceSide = serviceSide
    self.player1SetsWon = player1SetsWon
    self.player2SetsWon = player2SetsWon
    normalize()
  }

  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    sets = c.decode(.sets, default: [])
    currentSet = c.decode(.currentSet, default: 0)
    currentGame = c.decode(.currentGame, default: GameScore())
    isTiebreak = c.decode(.isTiebreak, default: false)
    tiebreakScore = c.decodeLenient(TiebreakScore.self, .tiebreakScore)
    server = c.decode(.server, default: .player1)
    serviceSide = c.decode(.serviceSide, default: .deuce)
    player1SetsWon = c.decode(.player1SetsWon, default: 0)
    player2SetsWon = c.decode(.player2SetsWon, default: 0)
    normalize()
  }

  /// Repairs the two inconsistencies that would otherwise crash the engine: an
  /// empty `sets` array and a `currentSet` outside it. A tiebreak flag without a
  /// tiebreak score starts that tiebreak from zero.
  private mutating func normalize() {
    if sets.isEmpty { sets = [SetScore(setNumber: 0)] }
    currentSet = min(max(currentSet, 0), sets.count - 1)
    if isTiebreak && tiebreakScore == nil { tiebreakScore = TiebreakScore() }
  }

  public func setsWon(by player: Player) -> Int { player == .player1 ? player1SetsWon : player2SetsWon }

  public var currentSetScore: SetScore { sets[currentSet] }
}
