import Foundation
import Observation
import TennisCore

public struct StandingsRow: Identifiable, Equatable, Sendable {
  public let id: String
  public let rank: Int
  public let name: String
  public let played: Int
  public let won: Int
  public let lost: Int
  public let setsWon: Int
  public let setsLost: Int
  public let gameDifferential: Int
  public let isCurrentUser: Bool
}

/// One standings table: a season, a division level, and singles or doubles.
public struct StandingsTable: Identifiable, Equatable, Sendable {
  public enum Kind: String, Sendable { case singles, doubles }

  public let id: String
  public let kind: Kind
  public let title: String
  public let seasonName: String
  public let rows: [StandingsRow]
  public let updatedAt: Int64

  public var containsCurrentUser: Bool { rows.contains(where: \.isCurrentUser) }
}

public enum Standings {
  /// Splits ranking documents into tables. Cloud Functions bucket standings per
  /// season and division level, and a division's rankings collection holds every
  /// bucket, so showing them as one list would mix seasons together.
  ///
  /// Tables the player appears in come first, then the most recently updated.
  public static func tables(
    singles: [PlayerRanking],
    doubles: [DoublesTeamRanking],
    levels: [DivisionLevel],
    userId: String
  ) -> [StandingsTable] {
    let levelsById = Dictionary(levels.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })

    func title(levelId: String?, kind: StandingsTable.Kind) -> String {
      if let levelId, let level = levelsById[levelId] { return level.name }
      return kind == .singles ? "Singles" : "Doubles"
    }

    struct Key: Hashable { let season: String; let level: String?; let kind: StandingsTable.Kind }

    var tables: [StandingsTable] = []

    let singlesGroups = Dictionary(grouping: singles) { Key(season: $0.seasonId ?? $0.season, level: $0.divisionLevelId, kind: .singles) }
    for (key, rankings) in singlesGroups {
      let rows = rankings.map {
        StandingsRow(
          id: $0.userId, rank: $0.rank, name: $0.displayName, played: $0.matchesPlayed,
          won: $0.matchesWon, lost: $0.matchesLost, setsWon: $0.setsWon, setsLost: $0.setsLost,
          gameDifferential: $0.gameDifferential, isCurrentUser: $0.userId == userId
        )
      }
      tables.append(table(key.season, key.level, .singles, title(levelId: key.level, kind: .singles), rows, rankings.map(\.updatedAt).max() ?? 0))
    }

    let doublesGroups = Dictionary(grouping: doubles) { Key(season: $0.seasonId ?? $0.season, level: $0.divisionLevelId, kind: .doubles) }
    for (key, rankings) in doublesGroups {
      let rows = rankings.map {
        StandingsRow(
          id: $0.teamId, rank: $0.rank, name: $0.displayName, played: $0.matchesPlayed,
          won: $0.matchesWon, lost: $0.matchesLost, setsWon: $0.setsWon, setsLost: $0.setsLost,
          gameDifferential: $0.gameDifferential, isCurrentUser: $0.playerIds.contains(userId)
        )
      }
      tables.append(table(key.season, key.level, .doubles, title(levelId: key.level, kind: .doubles), rows, rankings.map(\.updatedAt).max() ?? 0))
    }

    return tables.sorted { a, b in
      if a.containsCurrentUser != b.containsCurrentUser { return a.containsCurrentUser }
      if a.updatedAt != b.updatedAt { return a.updatedAt > b.updatedAt }
      return a.id < b.id
    }
  }

  private static func table(
    _ season: String, _ level: String?, _ kind: StandingsTable.Kind, _ title: String,
    _ rows: [StandingsRow], _ updatedAt: Int64
  ) -> StandingsTable {
    // Unranked rows (rank 0) go last; ties keep a stable, readable order.
    let sorted = rows.sorted { a, b in
      let ra = a.rank > 0 ? a.rank : Int.max, rb = b.rank > 0 ? b.rank : Int.max
      if ra != rb { return ra < rb }
      return a.name.localizedCaseInsensitiveCompare(b.name) == .orderedAscending
    }
    return StandingsTable(
      id: "\(kind.rawValue)|\(season)|\(level ?? "")",
      kind: kind,
      title: title,
      seasonName: Season.displayName(forSeasonId: season),
      rows: sorted,
      updatedAt: updatedAt
    )
  }
}

@MainActor
@Observable
public final class RankingsModel {
  public private(set) var tables: [StandingsTable] = []
  public private(set) var isLoading = true
  public private(set) var errorMessage: String?
  /// The table on screen. Kept across updates while it still exists.
  public var selectedTableId: String?

  public let divisionId: String
  public let userId: String
  private let repository: any RankingRepository
  @ObservationIgnored private var singles: [PlayerRanking] = []
  @ObservationIgnored private var doubles: [DoublesTeamRanking] = []
  @ObservationIgnored private var levels: [DivisionLevel] = []
  @ObservationIgnored private var receivedSingles = false
  @ObservationIgnored private var receivedDoubles = false

  public init(divisionId: String, userId: String, repository: any RankingRepository) {
    self.divisionId = divisionId
    self.userId = userId
    self.repository = repository
  }

  public var selectedTable: StandingsTable? {
    tables.first { $0.id == selectedTableId } ?? tables.first
  }

  /// Follows singles standings, doubles standings, and level names together for
  /// as long as the caller's task runs.
  public func observe() async {
    await withTaskGroup(of: Void.self) { group in
      group.addTask { await self.followSingles() }
      group.addTask { await self.followDoubles() }
      group.addTask { await self.followLevels() }
    }
  }

  private func followSingles() async {
    await follow(repository.observeRankings(divisionId: divisionId)) { model, value in
      model.singles = value
      model.receivedSingles = true
    }
  }

  private func followDoubles() async {
    await follow(repository.observeDoublesRankings(divisionId: divisionId)) { model, value in
      model.doubles = value
      model.receivedDoubles = true
    }
  }

  private func followLevels() async {
    await follow(repository.observeLevels(divisionId: divisionId)) { model, value in
      model.levels = value
    }
  }

  private func follow<T: Sendable>(
    _ stream: AsyncThrowingStream<T, Error>,
    apply: (RankingsModel, T) -> Void
  ) async {
    do {
      for try await value in stream {
        apply(self, value)
        rebuild()
      }
    } catch is CancellationError {
      return
    } catch {
      errorMessage = error.localizedDescription
      isLoading = false
    }
  }

  private func rebuild() {
    tables = Standings.tables(singles: singles, doubles: doubles, levels: levels, userId: userId)
    if let selectedTableId, !tables.contains(where: { $0.id == selectedTableId }) {
      self.selectedTableId = nil
    }
    // Level names are cosmetic; the standings themselves decide when loading ends.
    if receivedSingles && receivedDoubles { isLoading = false }
  }
}
