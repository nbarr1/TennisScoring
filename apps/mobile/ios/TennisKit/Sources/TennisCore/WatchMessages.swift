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
  public static let action = "action"
  public static let player = "player"
}

/// What the phone shows the watch: the score of one match and whether the
/// signed-in player may score it.
public struct WatchScoreSnapshot: Equatable, Sendable {
  public var matchId: String
  public var player1Name: String
  public var player2Name: String
  public var status: MatchStatus
  public var score: LiveScore
  public var canScore: Bool

  public init(matchId: String, player1Name: String, player2Name: String, status: MatchStatus, score: LiveScore, canScore: Bool) {
    self.matchId = matchId
    self.player1Name = player1Name
    self.player2Name = player2Name
    self.status = status
    self.score = score
    self.canScore = canScore
  }

  public func message() throws -> [String: String] {
    let json = try JSONEncoder.sortedKeys.encode(score)
    return [
      WatchMessageKey.score: String(decoding: json, as: UTF8.self),
      WatchMessageKey.matchId: matchId,
      WatchMessageKey.player1Name: player1Name,
      WatchMessageKey.player2Name: player2Name,
      WatchMessageKey.status: status.rawValue,
      WatchMessageKey.canScore: canScore ? "true" : "false",
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
    player1Name = message[WatchMessageKey.player1Name] as? String ?? "Player 1"
    player2Name = message[WatchMessageKey.player2Name] as? String ?? "Player 2"
    status = (message[WatchMessageKey.status] as? String).flatMap(MatchStatus.init(rawValue:)) ?? .inProgress
    canScore = !matchId.isEmpty && (message[WatchMessageKey.canScore] as? String) == "true"
  }
}

/// A command from the watch.
public enum WatchCommand: Equatable, Sendable {
  case point(matchId: String, scorer: Player)

  public var matchId: String {
    switch self { case let .point(matchId, _): matchId }
  }

  public var message: [String: String] {
    switch self {
    case let .point(matchId, scorer):
      [WatchMessageKey.action: "point", WatchMessageKey.player: scorer.rawValue, WatchMessageKey.matchId: matchId]
    }
  }

  /// Parses a watch message. A command without a match id is rejected: the phone
  /// cannot tell which match it was meant for.
  public init?(message: [String: Any]) {
    guard message[WatchMessageKey.action] as? String == "point",
          let raw = message[WatchMessageKey.player] as? String,
          let scorer = Player(rawValue: raw),
          let matchId = message[WatchMessageKey.matchId] as? String,
          !matchId.isEmpty
    else { return nil }
    self = .point(matchId: matchId, scorer: scorer)
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
