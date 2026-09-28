import Foundation

/// A `divisions/{divisionId}/rankings/{id}` document, and the output of
/// `RankingEngine.computeRankings`.
public struct PlayerRanking: Decodable, Equatable, Identifiable, Sendable {
  public var userId: String
  public var displayName: String
  public var divisionId: String
  public var season: String
  public var seasonId: String?
  public var divisionLevelId: String?
  public var rank: Int
  public var matchesPlayed: Int
  public var matchesWon: Int
  public var matchesLost: Int
  public var setsWon: Int
  public var setsLost: Int
  public var gamesWon: Int
  public var gamesLost: Int
  public var gameDifferential: Int
  public var updatedAt: Int64

  public var id: String { "\(seasonId ?? season)|\(divisionLevelId ?? "")|\(userId)" }

  public init(
    userId: String, displayName: String, divisionId: String, season: String,
    seasonId: String? = nil, divisionLevelId: String? = nil, rank: Int,
    matchesPlayed: Int, matchesWon: Int, matchesLost: Int, setsWon: Int, setsLost: Int,
    gamesWon: Int, gamesLost: Int, gameDifferential: Int, updatedAt: Int64
  ) {
    self.userId = userId
    self.displayName = displayName
    self.divisionId = divisionId
    self.season = season
    self.seasonId = seasonId
    self.divisionLevelId = divisionLevelId
    self.rank = rank
    self.matchesPlayed = matchesPlayed
    self.matchesWon = matchesWon
    self.matchesLost = matchesLost
    self.setsWon = setsWon
    self.setsLost = setsLost
    self.gamesWon = gamesWon
    self.gamesLost = gamesLost
    self.gameDifferential = gameDifferential
    self.updatedAt = updatedAt
  }

  enum CodingKeys: String, CodingKey {
    case userId, displayName, divisionId, season, seasonId, divisionLevelId, rank, matchesPlayed
    case matchesWon, matchesLost, setsWon, setsLost, gamesWon, gamesLost, gameDifferential, updatedAt
  }

  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    let userId = try c.decode(String.self, forKey: .userId)
    let gamesWon = c.decode(.gamesWon, default: 0)
    let gamesLost = c.decode(.gamesLost, default: 0)
    let won = c.decode(.matchesWon, default: 0)
    let lost = c.decode(.matchesLost, default: 0)
    self.init(
      userId: userId,
      displayName: c.decodeNonBlank(.displayName) ?? userId,
      divisionId: c.decode(.divisionId, default: ""),
      season: c.decode(.season, default: ""),
      seasonId: c.decodeNonBlank(.seasonId),
      divisionLevelId: c.decodeNonBlank(.divisionLevelId),
      rank: c.decode(.rank, default: 0),
      matchesPlayed: c.decode(.matchesPlayed, default: won + lost),
      matchesWon: won,
      matchesLost: lost,
      setsWon: c.decode(.setsWon, default: 0),
      setsLost: c.decode(.setsLost, default: 0),
      gamesWon: gamesWon,
      gamesLost: gamesLost,
      gameDifferential: c.decode(.gameDifferential, default: gamesWon - gamesLost),
      updatedAt: c.decodeMillis(.updatedAt) ?? 0
    )
  }
}

/// A `divisions/{divisionId}/doublesRankings/{id}` document: one row per fixed
/// partnership. `teamId` is opaque; use `DoublesTeam` to work with it.
public struct DoublesTeamRanking: Decodable, Equatable, Identifiable, Sendable {
  public var teamId: String
  public var playerIds: [String]
  public var displayName: String
  public var divisionId: String
  public var season: String
  public var seasonId: String?
  public var divisionLevelId: String?
  public var rank: Int
  public var matchesPlayed: Int
  public var matchesWon: Int
  public var matchesLost: Int
  public var setsWon: Int
  public var setsLost: Int
  public var gamesWon: Int
  public var gamesLost: Int
  public var gameDifferential: Int
  public var updatedAt: Int64

  public var id: String { "\(seasonId ?? season)|\(divisionLevelId ?? "")|\(teamId)" }

  public init(
    teamId: String, playerIds: [String], displayName: String, divisionId: String, season: String,
    seasonId: String? = nil, divisionLevelId: String? = nil, rank: Int,
    matchesPlayed: Int, matchesWon: Int, matchesLost: Int, setsWon: Int, setsLost: Int,
    gamesWon: Int, gamesLost: Int, gameDifferential: Int, updatedAt: Int64
  ) {
    self.teamId = teamId
    self.playerIds = playerIds
    self.displayName = displayName
    self.divisionId = divisionId
    self.season = season
    self.seasonId = seasonId
    self.divisionLevelId = divisionLevelId
    self.rank = rank
    self.matchesPlayed = matchesPlayed
    self.matchesWon = matchesWon
    self.matchesLost = matchesLost
    self.setsWon = setsWon
    self.setsLost = setsLost
    self.gamesWon = gamesWon
    self.gamesLost = gamesLost
    self.gameDifferential = gameDifferential
    self.updatedAt = updatedAt
  }

  enum CodingKeys: String, CodingKey {
    case teamId, playerIds, displayName, divisionId, season, seasonId, divisionLevelId, rank, matchesPlayed
    case matchesWon, matchesLost, setsWon, setsLost, gamesWon, gamesLost, gameDifferential, updatedAt
  }

  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    let teamId = try c.decode(String.self, forKey: .teamId)
    let playerIds = c.decode(.playerIds, default: [LenientString]()).compactMap(\.value)
    let gamesWon = c.decode(.gamesWon, default: 0)
    let gamesLost = c.decode(.gamesLost, default: 0)
    let won = c.decode(.matchesWon, default: 0)
    let lost = c.decode(.matchesLost, default: 0)
    self.init(
      teamId: teamId,
      playerIds: playerIds,
      displayName: c.decodeNonBlank(.displayName) ?? DoublesTeam.formatName(playerIds),
      divisionId: c.decode(.divisionId, default: ""),
      season: c.decode(.season, default: ""),
      seasonId: c.decodeNonBlank(.seasonId),
      divisionLevelId: c.decodeNonBlank(.divisionLevelId),
      rank: c.decode(.rank, default: 0),
      matchesPlayed: c.decode(.matchesPlayed, default: won + lost),
      matchesWon: won,
      matchesLost: lost,
      setsWon: c.decode(.setsWon, default: 0),
      setsLost: c.decode(.setsLost, default: 0),
      gamesWon: gamesWon,
      gamesLost: gamesLost,
      gameDifferential: c.decode(.gameDifferential, default: gamesWon - gamesLost),
      updatedAt: c.decodeMillis(.updatedAt) ?? 0
    )
  }
}

/// A head-to-head record. On doubles records `player1Id`/`player2Id` hold team ids.
public struct HeadToHead: Codable, Equatable, Sendable {
  public var player1Id: String
  public var player2Id: String
  public var player1Wins: Int
  public var player2Wins: Int

  public init(player1Id: String, player2Id: String, player1Wins: Int, player2Wins: Int) {
    self.player1Id = player1Id
    self.player2Id = player2Id
    self.player1Wins = player1Wins
    self.player2Wins = player2Wins
  }
}

public struct RankingInput: Codable, Equatable, Sendable {
  public var userId: String
  public var displayName: String
  public var divisionId: String
  public var season: String
  public var matchesWon: Int
  public var matchesLost: Int
  public var setsWon: Int
  public var setsLost: Int
  public var gamesWon: Int
  public var gamesLost: Int

  public init(
    userId: String, displayName: String, divisionId: String, season: String,
    matchesWon: Int = 0, matchesLost: Int = 0, setsWon: Int = 0, setsLost: Int = 0,
    gamesWon: Int = 0, gamesLost: Int = 0
  ) {
    self.userId = userId
    self.displayName = displayName
    self.divisionId = divisionId
    self.season = season
    self.matchesWon = matchesWon
    self.matchesLost = matchesLost
    self.setsWon = setsWon
    self.setsLost = setsLost
    self.gamesWon = gamesWon
    self.gamesLost = gamesLost
  }
}

public struct DoublesTeamRankingInput: Codable, Equatable, Sendable {
  public var teamId: String
  public var playerIds: [String]
  public var displayName: String
  public var divisionId: String
  public var season: String
  public var matchesWon: Int
  public var matchesLost: Int
  public var setsWon: Int
  public var setsLost: Int
  public var gamesWon: Int
  public var gamesLost: Int

  public init(
    teamId: String, playerIds: [String], displayName: String, divisionId: String, season: String,
    matchesWon: Int = 0, matchesLost: Int = 0, setsWon: Int = 0, setsLost: Int = 0,
    gamesWon: Int = 0, gamesLost: Int = 0
  ) {
    self.teamId = teamId
    self.playerIds = playerIds
    self.displayName = displayName
    self.divisionId = divisionId
    self.season = season
    self.matchesWon = matchesWon
    self.matchesLost = matchesLost
    self.setsWon = setsWon
    self.setsLost = setsLost
    self.gamesWon = gamesWon
    self.gamesLost = gamesLost
  }
}

/// Set and game counts for one completed match.
public struct MatchTotals: Codable, Equatable, Sendable {
  public var p1Sets: Int
  public var p2Sets: Int
  public var p1Games: Int
  public var p2Games: Int

  public init(p1Sets: Int = 0, p2Sets: Int = 0, p1Games: Int = 0, p2Games: Int = 0) {
    self.p1Sets = p1Sets
    self.p2Sets = p2Sets
    self.p1Games = p1Games
    self.p2Games = p2Games
  }
}

/// Port of `rankingEngine.ts`. Standings are always recomputed from scratch.
public enum RankingEngine {
  /// Sorted by matches won, sets won, games won, game differential,
  /// head-to-head, then display name, with 1-based ranks assigned.
  public static func computeRankings(
    _ inputs: [RankingInput],
    headToHeads: [HeadToHead],
    now: Int64 = currentMillis()
  ) -> [PlayerRanking] {
    let ordered = rank(inputs, key: \.userId, headToHeads: headToHeads) {
      Totals(name: $0.displayName, matchesWon: $0.matchesWon, setsWon: $0.setsWon, gamesWon: $0.gamesWon, gamesLost: $0.gamesLost)
    }
    return ordered.enumerated().map { index, p in
      PlayerRanking(
        userId: p.userId, displayName: p.displayName, divisionId: p.divisionId, season: p.season,
        rank: index + 1, matchesPlayed: p.matchesWon + p.matchesLost,
        matchesWon: p.matchesWon, matchesLost: p.matchesLost, setsWon: p.setsWon, setsLost: p.setsLost,
        gamesWon: p.gamesWon, gamesLost: p.gamesLost, gameDifferential: p.gamesWon - p.gamesLost,
        updatedAt: now
      )
    }
  }

  /// The same ordering applied to fixed partnerships. `headToHeads` hold team ids.
  public static func computeDoublesRankings(
    _ inputs: [DoublesTeamRankingInput],
    headToHeads: [HeadToHead],
    now: Int64 = currentMillis()
  ) -> [DoublesTeamRanking] {
    let ordered = rank(inputs, key: \.teamId, headToHeads: headToHeads) {
      Totals(name: $0.displayName, matchesWon: $0.matchesWon, setsWon: $0.setsWon, gamesWon: $0.gamesWon, gamesLost: $0.gamesLost)
    }
    return ordered.enumerated().map { index, t in
      DoublesTeamRanking(
        teamId: t.teamId, playerIds: t.playerIds, displayName: t.displayName,
        divisionId: t.divisionId, season: t.season,
        rank: index + 1, matchesPlayed: t.matchesWon + t.matchesLost,
        matchesWon: t.matchesWon, matchesLost: t.matchesLost, setsWon: t.setsWon, setsLost: t.setsLost,
        gamesWon: t.gamesWon, gamesLost: t.gamesLost, gameDifferential: t.gamesWon - t.gamesLost,
        updatedAt: now
      )
    }
  }

  public static func updateRanking(
    _ existing: RankingInput,
    won: Bool,
    setsWon: Int,
    setsLost: Int,
    gamesWon: Int,
    gamesLost: Int
  ) -> RankingInput {
    var next = existing
    next.matchesWon += won ? 1 : 0
    next.matchesLost += won ? 0 : 1
    next.setsWon += setsWon
    next.setsLost += setsLost
    next.gamesWon += gamesWon
    next.gamesLost += gamesLost
    return next
  }

  /// Set and game counts from a completed match's sets. Sets without a recorded
  /// winner count only when the score itself shows one (6-4, 7-5, 7-6, ...).
  public static func extractMatchTotals(_ sets: [SetScore]) -> MatchTotals {
    var totals = MatchTotals()
    for set in sets {
      guard let winner = set.winner ?? inferWinner(set.player1Games, set.player2Games) else { continue }
      totals.p1Games += set.player1Games
      totals.p2Games += set.player2Games
      if winner == .player1 { totals.p1Sets += 1 } else { totals.p2Sets += 1 }
    }
    return totals
  }

  public static func currentMillis() -> Int64 { Int64((Date().timeIntervalSince1970 * 1000).rounded()) }

  // MARK: - Shared ordering

  private struct Totals {
    let name: String
    let matchesWon: Int
    let setsWon: Int
    let gamesWon: Int
    let gamesLost: Int
  }

  private static func rank<T>(
    _ entities: [T],
    key: KeyPath<T, String>,
    headToHeads: [HeadToHead],
    totals: (T) -> Totals
  ) -> [T] {
    // wins[a][b] = a's wins over b
    var wins: [String: [String: Int]] = [:]
    for h in headToHeads {
      wins[h.player1Id, default: [:]][h.player2Id] = h.player1Wins
      wins[h.player2Id, default: [:]][h.player1Id] = h.player2Wins
    }

    // The input index is the final key, so equal entries keep their order the
    // way JavaScript's stable Array.prototype.sort does.
    let keyed = entities.enumerated().map { (offset: $0.offset, entity: $0.element, totals: totals($0.element)) }
    return keyed.sorted { a, b in
      let ta = a.totals, tb = b.totals
      if ta.matchesWon != tb.matchesWon { return ta.matchesWon > tb.matchesWon }
      if ta.setsWon != tb.setsWon { return ta.setsWon > tb.setsWon }
      if ta.gamesWon != tb.gamesWon { return ta.gamesWon > tb.gamesWon }
      let da = ta.gamesWon - ta.gamesLost, db = tb.gamesWon - tb.gamesLost
      if da != db { return da > db }
      let aKey = a.entity[keyPath: key], bKey = b.entity[keyPath: key]
      let aBeatB = wins[aKey]?[bKey] ?? 0
      let bBeatA = wins[bKey]?[aKey] ?? 0
      if aBeatB != bBeatA { return aBeatB > bBeatA }
      let byName = compareNames(ta.name, tb.name)
      if byName != .orderedSame { return byName == .orderedAscending }
      return a.offset < b.offset
    }.map(\.entity)
  }

  /// Approximates JavaScript's `localeCompare`: case differences only break
  /// otherwise-equal names, with lowercase first.
  static func compareNames(_ a: String, _ b: String) -> ComparisonResult {
    let folded = a.compare(b, options: [.caseInsensitive, .diacriticInsensitive])
    if folded != .orderedSame { return folded }
    let accents = a.compare(b, options: [.caseInsensitive])
    if accents != .orderedSame { return accents }
    // ICU's default tertiary ordering puts lowercase before uppercase; a plain
    // code-point comparison would do the opposite.
    return b.compare(a)
  }

  private static func inferWinner(_ p1: Int, _ p2: Int) -> Player? {
    let most = max(p1, p2), least = min(p1, p2)
    let standardWin = most >= 6 && most - least >= 2
    let sevenFiveOrSix = most == 7 && (least == 5 || least == 6)
    guard standardWin || sevenFiveOrSix else { return nil }
    return p1 > p2 ? .player1 : .player2
  }
}
