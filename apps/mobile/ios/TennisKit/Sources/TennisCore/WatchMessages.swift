import Foundation

/// The WatchConnectivity message format between the iOS app and the watchOS app.
///
/// Every value is a `String`, so a message is always a valid property list for
/// `sendMessage` and `updateApplicationContext`. The `score` key carries the
/// `LiveScore` as JSON, the same key the React Native `AppleWatch` module sends,
/// so the watch app keeps working with either phone app.
///
/// Unlike the Wear OS pair, the iOS and watchOS apps ship in one bundle and
/// update together, so there is no mixed-version rollout to carry. What the
/// protocol does need is match scoping: the phone rejects a command whose
/// `matchId` is not the match it is showing, so a tap on a watch that is still
/// displaying an earlier match can never score the current one.
public enum WatchMessageKey {
  public static let score = "score"
  public static let matchId = "matchId"
  public static let player1Name = "player1Name"
  public static let player2Name = "player2Name"
  public static let status = "status"
  public static let canScore = "canScore"
  public static let canUndo = "canUndo"
  public static let isParticipant = "isParticipant"
  /// Unix milliseconds when the phone sent the snapshot. The application context
  /// is replayed at every watch launch, so the watch needs to know its age.
  public static let sentAt = "sentAt"
  /// Set, to the match id, on the message the phone sends when the match on
  /// screen was deleted.
  public static let removedMatchId = "removedMatchId"
  public static let action = "action"
  public static let player = "player"
  /// The phone's reply to a command: `"true"` once it has applied it.
  public static let applied = "applied"
}

/// What the phone shows the watch: the score of one match and whether the
/// signed-in player may score it.
///
/// The phone sends one for every status, cancelled and completed included, so a
/// match that stops being live on the phone stops being live on the watch.
public struct WatchScoreSnapshot: Equatable, Sendable {
  public var matchId: String
  public var player1Name: String
  public var player2Name: String
  public var status: MatchStatus
  public var score: LiveScore
  public var canScore: Bool
  /// Whether the phone would apply `WatchCommand.undo` right now.
  public var canUndo: Bool
  /// Whether the signed-in player is on either side. A scheduled match the
  /// player is in is the watch's cue to ask for Health access before play starts.
  public var isParticipant: Bool

  public init(
    matchId: String,
    player1Name: String,
    player2Name: String,
    status: MatchStatus,
    score: LiveScore,
    canScore: Bool,
    canUndo: Bool = false,
    isParticipant: Bool = false
  ) {
    self.matchId = matchId
    self.player1Name = player1Name
    self.player2Name = player2Name
    self.status = status
    self.score = score
    self.canScore = canScore
    self.canUndo = canUndo
    self.isParticipant = isParticipant
  }

  /// The message for this snapshot, stamped with `sentAt`. Pass a fixed date
  /// for deterministic output.
  public func message(sentAt: Date = Date()) throws -> [String: String] {
    let json = try JSONEncoder.sortedKeys.encode(score)
    return [
      WatchMessageKey.score: String(decoding: json, as: UTF8.self),
      WatchMessageKey.matchId: matchId,
      WatchMessageKey.player1Name: player1Name,
      WatchMessageKey.player2Name: player2Name,
      WatchMessageKey.status: status.rawValue,
      WatchMessageKey.canScore: canScore ? "true" : "false",
      WatchMessageKey.canUndo: canUndo ? "true" : "false",
      WatchMessageKey.isParticipant: isParticipant ? "true" : "false",
      WatchMessageKey.sentAt: String(Int64((sentAt.timeIntervalSince1970 * 1000).rounded())),
    ]
  }

  /// Parses a phone message. A message from the React Native module carries only
  /// `score`; it decodes with an empty `matchId` and `canScore` false, so the
  /// watch shows it read-only rather than sending commands the phone would reject.
  public init?(message: [String: Any]) {
    guard let json = message[WatchMessageKey.score] as? String,
          let score = try? JSONDecoder().decode(LiveScore.self, from: Data(json.utf8))
    else { return nil }
    self.score = score
    matchId = message[WatchMessageKey.matchId] as? String ?? ""
    // A side with no name and no player id reaches the phone as "" (see
    // `Match.sideDisplayName`), which drew a blank point button on the watch.
    player1Name = Self.nonBlank(message[WatchMessageKey.player1Name]) ?? "Player 1"
    player2Name = Self.nonBlank(message[WatchMessageKey.player2Name]) ?? "Player 2"
    status = (message[WatchMessageKey.status] as? String).flatMap(MatchStatus.init(rawValue:)) ?? .inProgress
    canScore = !matchId.isEmpty && (message[WatchMessageKey.canScore] as? String) == "true"
    canUndo = !matchId.isEmpty && (message[WatchMessageKey.canUndo] as? String) == "true"
    isParticipant = !matchId.isEmpty && (message[WatchMessageKey.isParticipant] as? String) == "true"
  }

  /// A message value as trimmed text, or nil when it is missing, not a string, or blank.
  private static func nonBlank(_ value: Any?) -> String? {
    guard let text = (value as? String)?.trimmedForId, !text.isEmpty else { return nil }
    return text
  }

  /// When the phone sent `message`, or nil when it carries no timestamp (the
  /// React Native module's messages do not).
  public static func sentAt(in message: [String: Any]) -> Date? {
    guard let raw = message[WatchMessageKey.sentAt] as? String, let millis = Int64(raw) else { return nil }
    return Date(timeIntervalSince1970: TimeInterval(millis) / 1000)
  }

  /// The message that tells the watch the match it shows was deleted.
  public static func removalMessage(matchId: String) -> [String: String] {
    [WatchMessageKey.removedMatchId: matchId]
  }

  /// The match a removal message is about, or nil for any other message.
  public static func removedMatchId(in message: [String: Any]) -> String? {
    guard let id = message[WatchMessageKey.removedMatchId] as? String, !id.isEmpty else { return nil }
    return id
  }

  /// Short labels for the watch's point buttons: first names ("Ann", or
  /// "Ann/Bob" for a doubles side), with the last initial added when both sides
  /// would otherwise read the same ("Chris L" and "Chris M"). If even that
  /// collides, the full names are used.
  public var buttonNames: (player1: String, player2: String) {
    let plain = (Self.shortName(player1Name, initials: false), Self.shortName(player2Name, initials: false))
    if plain.0 != plain.1 { return plain }
    let initialed = (Self.shortName(player1Name, initials: true), Self.shortName(player2Name, initials: true))
    if initialed.0 != initialed.1 { return initialed }
    return (player1Name, player2Name)
  }

  /// "Ann Smith / Bob Jones" → "Ann/Bob", or "Ann S/Bob J" with initials;
  /// "Sam Rivera" → "Sam".
  private static func shortName(_ name: String, initials: Bool) -> String {
    let people = name.components(separatedBy: " / ").compactMap { person -> String? in
      let words = person.split(separator: " ")
      guard let first = words.first else { return nil }
      guard initials, words.count > 1, let initial = words.last?.first else { return String(first) }
      return "\(first) \(initial)"
    }
    return people.isEmpty ? name : people.joined(separator: "/")
  }
}

/// A command from the watch.
public enum WatchCommand: Equatable, Sendable {
  case point(matchId: String, scorer: Player)
  /// Takes back the last point, as the phone's "Undo last point" does.
  case undo(matchId: String)

  public var matchId: String {
    switch self {
    case let .point(matchId, _): matchId
    case let .undo(matchId): matchId
    }
  }

  public var message: [String: String] {
    switch self {
    case let .point(matchId, scorer):
      [WatchMessageKey.action: "point", WatchMessageKey.player: scorer.rawValue, WatchMessageKey.matchId: matchId]
    case let .undo(matchId):
      [WatchMessageKey.action: "undo", WatchMessageKey.matchId: matchId]
    }
  }

  /// Parses a watch message. A command without a match id is rejected: the phone
  /// cannot tell which match it was meant for.
  public init?(message: [String: Any]) {
    guard let matchId = message[WatchMessageKey.matchId] as? String, !matchId.isEmpty else { return nil }
    switch message[WatchMessageKey.action] as? String {
    case "point":
      guard let raw = message[WatchMessageKey.player] as? String, let scorer = Player(rawValue: raw) else { return nil }
      self = .point(matchId: matchId, scorer: scorer)
    case "undo":
      self = .undo(matchId: matchId)
    default:
      return nil
    }
  }

  /// The phone's reply to a command. The watch confirms a tap only when it says
  /// `applied`, so a command the phone rejected never feels like it counted.
  public static func replyMessage(applied: Bool) -> [String: String] {
    [WatchMessageKey.applied: applied ? "true" : "false"]
  }

  /// Whether a reply says the phone applied the command. Anything else is a no.
  public static func isApplied(_ reply: [String: Any]) -> Bool {
    (reply[WatchMessageKey.applied] as? String) == "true"
  }
}

extension JSONEncoder {
  /// Deterministic output, so identical scores produce identical messages.
  static var sortedKeys: JSONEncoder {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    return encoder
  }
}
