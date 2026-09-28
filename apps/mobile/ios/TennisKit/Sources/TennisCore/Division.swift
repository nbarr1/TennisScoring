import Foundation

/// A `divisions/{divisionId}/levels/{levelId}` document: one competition inside a
/// division for one season (for example, "Intermediate Singles", Fall 2026).
public struct DivisionLevel: Decodable, Equatable, Identifiable, Sendable {
  /// The Firestore document id, assigned by the repository.
  public var id: String
  public var name: String
  public var seasonId: String
  /// `"singles"` or `"doubles"`.
  public var matchType: String
  public var sortOrder: Int
  public var active: Bool

  public init(id: String, name: String, seasonId: String, matchType: String = "singles", sortOrder: Int = 0, active: Bool = true) {
    self.id = id
    self.name = name
    self.seasonId = seasonId
    self.matchType = matchType
    self.sortOrder = sortOrder
    self.active = active
  }

  enum CodingKeys: String, CodingKey { case id, name, seasonId, matchType, sortOrder, active }

  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    self.init(
      id: c.decode(.id, default: ""),
      name: c.decodeNonBlank(.name) ?? "Division level",
      seasonId: c.decode(.seasonId, default: ""),
      matchType: c.decode(.matchType, default: "singles"),
      sortOrder: c.decode(.sortOrder, default: 0),
      active: c.decode(.active, default: true)
    )
  }
}

public enum Season {
  /// `"fall-2026"` → `"Fall 2026"`, mirroring `formatSeasonName`. Any other value
  /// is returned as is, so legacy season labels still display.
  public static func displayName(forSeasonId seasonId: String) -> String {
    let parts = seasonId.split(separator: "-", maxSplits: 1).map(String.init)
    guard parts.count == 2, let year = Int(parts[1]) else { return seasonId }
    switch parts[0] {
    case "spring": return "Spring \(year)"
    case "fall": return "Fall \(year)"
    default: return seasonId
    }
  }
}
