import Foundation

/// Port of `match/matchSides.ts`. Read sides through these helpers rather than
/// `player1Id`/`player2Id`, so singles, doubles, and legacy documents (which have
/// no `side1`/`side2`) all behave the same.
extension Match {
  /// True when the document has two full partnerships. Deliberately checks the
  /// rosters, never `matchType`, which is a client-writable label.
  public var isDoublesMatch: Bool {
    sidePlayerIds(.player1).count == 2 && sidePlayerIds(.player2).count == 2
  }

  /// Every user id on one side, falling back to the flat id for singles.
  public func sidePlayerIds(_ side: Player) -> [String] {
    let roster = (side == .player1 ? side1 : side2)?.playerIds ?? []
    let cleaned = roster.filter { !$0.trimmedForId.isEmpty }
    if !cleaned.isEmpty { return cleaned }
    let flat = side == .player1 ? player1Id : player2Id
    return flat.trimmedForId.isEmpty ? [] : [flat]
  }

  /// The name to show for a side: the side's team name, then the flat name, then
  /// the first player id.
  public func sideDisplayName(_ side: Player) -> String {
    if let name = (side == .player1 ? side1 : side2)?.displayName?.trimmedForId, !name.isEmpty { return name }
    if let name = (side == .player1 ? player1Name : player2Name)?.trimmedForId, !name.isEmpty { return name }
    return sidePlayerIds(side).first ?? ""
  }

  /// Which side a user plays on, or nil when they are not in the match.
  public func side(of userId: String) -> Player? {
    if sidePlayerIds(.player1).contains(userId) { return .player1 }
    if sidePlayerIds(.player2).contains(userId) { return .player2 }
    return nil
  }

  public func isParticipant(_ userId: String) -> Bool {
    guard !userId.isEmpty else { return false }
    return playerIds.contains(userId) || side(of: userId) != nil
  }

  /// True when both users play on the same side.
  public func arePartners(_ userId: String, _ otherUserId: String) -> Bool {
    guard userId != otherUserId, let side = side(of: userId) else { return false }
    return side == self.side(of: otherUserId)
  }

  /// True when `userId` may confirm or dispute a report filed by `submittedBy`.
  /// Only the opposing side may, never the submitter or their partner.
  public func canRespondToReport(userId: String, submittedBy: String?) -> Bool {
    guard !userId.isEmpty, let submittedBy, !submittedBy.isEmpty, userId != submittedBy else { return false }
    guard let submitterSide = side(of: submittedBy) else { return isParticipant(userId) }
    return side(of: userId) == submitterSide.opponent
  }
}
