import Foundation

/// Port of `doubles/doublesTeam.ts`.
///
/// A doubles team is a fixed partnership identified by its members' sorted ids,
/// encoded as `<length>:<id>` pairs. The encoding is JavaScript's, so lengths are
/// counted and ids are sorted in UTF-16 code units, and duplicates are removed by
/// exact code-unit equality. Swift's own `String` comparison and `Set` would
/// treat canonically equivalent strings as equal and order astral characters
/// differently, and the ids would no longer match what Cloud Functions write.
public enum DoublesTeam {
  /// Stable, order-independent id for a partnership. Empty when no usable ids are given.
  public static func teamId(_ playerIds: [String]) -> String {
    var seen: [[UInt16]] = []
    var unique: [String] = []
    for id in playerIds.map(\.trimmedForId) where !id.isEmpty {
      let units = Array(id.utf16)
      if !seen.contains(units) {
        seen.append(units)
        unique.append(id)
      }
    }
    return encode(unique.sorted(by: utf16Precedes))
  }

  /// The member ids encoded in a team id, in sorted order. Empty when malformed.
  public static func playerIds(inTeamId teamId: String) -> [String] {
    guard !teamId.trimmedForId.isEmpty else { return [] }
    return decode(teamId)
  }

  /// Head-to-head document id for two partnerships, scoped to the given division,
  /// season, and level when supplied.
  public static func headToHeadId(
    _ teamA: String,
    _ teamB: String,
    seasonId: String? = nil,
    divisionLevelId: String? = nil,
    divisionId: String? = nil
  ) -> String {
    let pair = [teamA, teamB].sorted(by: utf16Precedes)
    var parts = ["doubles"]
    for scope in [divisionId, seasonId, divisionLevelId] {
      if let value = scope?.trimmedForId, !value.isEmpty { parts.append(value) }
    }
    parts += pair
    return encode(parts)
  }

  /// `"Ann Smith / Bob Jones"`. Blank names are dropped; order is preserved.
  public static func formatName(_ displayNames: [String]) -> String {
    displayNames.map(\.trimmedForId).filter { !$0.isEmpty }.joined(separator: " / ")
  }

  static func utf16Precedes(_ a: String, _ b: String) -> Bool {
    a.utf16.lexicographicallyPrecedes(b.utf16)
  }

  private static func encode(_ parts: [String]) -> String {
    parts.map { "\($0.utf16.count):\($0)" }.joined()
  }

  private static func decode(_ value: String) -> [String] {
    let units = Array(value.utf16)
    let colon = UInt16(UInt8(ascii: ":"))
    let zero = UInt16(UInt8(ascii: "0")), nine = UInt16(UInt8(ascii: "9"))
    var parts: [String] = []
    var offset = 0
    while offset < units.count {
      guard let colonIndex = units[offset...].firstIndex(of: colon) else { return [] }
      let digits = units[offset..<colonIndex]
      guard !digits.isEmpty, digits.allSatisfy({ $0 >= zero && $0 <= nine }) else { return [] }
      guard let length = Int(String(decoding: digits, as: UTF16.self)) else { return [] }
      let start = colonIndex + 1
      guard length <= units.count - start else { return [] }
      let end = start + length
      parts.append(String(decoding: units[start..<end], as: UTF16.self))
      offset = end
    }
    return parts
  }
}
