import Foundation

public enum MatchStatus: String, Codable, Sendable, CaseIterable {
  case proposed
  case scheduled
  case inProgress = "in_progress"
  case pendingReport = "pending_report"
  case completed
  case disputed
  case cancelled
}

/// Mirrors `MATCH_STATUS_METADATA` in `@tennis/shared`, so a status reads the
/// same on every client.
public struct MatchStatusMetadata: Equatable, Sendable {
  public enum Tone: String, Sendable { case success, warning, danger, neutral, primary, accent }

  public let label: String
  public let icon: String
  /// `#RRGGBB` or `#RGB`.
  public let colorHex: String
  public let tone: Tone
  public let accessibilityLabel: String
}

extension MatchStatus {
  public var metadata: MatchStatusMetadata {
    switch self {
    case .proposed:
      MatchStatusMetadata(label: "Proposed", icon: "○", colorHex: "#8e44ad", tone: .accent, accessibilityLabel: "Match proposed")
    case .scheduled:
      MatchStatusMetadata(label: "Scheduled", icon: "●", colorHex: "#1a472a", tone: .primary, accessibilityLabel: "Match scheduled")
    case .inProgress:
      MatchStatusMetadata(label: "Live", icon: "●", colorHex: "#27ae60", tone: .success, accessibilityLabel: "Match live")
    case .pendingReport:
      MatchStatusMetadata(label: "Pending Report", icon: "◐", colorHex: "#e67e22", tone: .warning, accessibilityLabel: "Match pending report")
    case .completed:
      MatchStatusMetadata(label: "Final", icon: "✓", colorHex: "#555", tone: .neutral, accessibilityLabel: "Match final")
    case .disputed:
      MatchStatusMetadata(label: "Disputed", icon: "⚠", colorHex: "#c0392b", tone: .danger, accessibilityLabel: "Match disputed")
    case .cancelled:
      MatchStatusMetadata(label: "Cancelled", icon: "×", colorHex: "#777", tone: .neutral, accessibilityLabel: "Match cancelled")
    }
  }
}

/// One side's roster. Present only on doubles documents.
public struct MatchSide: Codable, Equatable, Sendable {
  public var playerIds: [String]
  public var displayName: String?

  public init(playerIds: [String], displayName: String? = nil) {
    self.playerIds = playerIds
    self.displayName = displayName
  }

  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    // Entries that are not strings are dropped, as `sidePlayerIds` does in TypeScript.
    let raw = c.decode(.playerIds, default: [LenientString]())
    playerIds = raw.compactMap(\.value)
    displayName = c.decodeLenient(String.self, .displayName)
  }
}

/// Decodes a string, or `nil` for any other JSON value, without failing the array.
struct LenientString: Decodable {
  let value: String?
  init(from decoder: Decoder) throws {
    value = try? decoder.singleValueContainer().decode(String.self)
  }
}

public struct ReportSubmission: Codable, Equatable, Sendable {
  public enum Status: String, Codable, Sendable {
    case pendingConfirmation = "pending_confirmation"
    case confirmed
    case disputed
  }

  public var submittedBy: String
  public var submittedAt: Int64?
  public var status: Status
  public var confirmedBy: String?
  public var disputedBy: String?

  public init(submittedBy: String, submittedAt: Int64? = nil, status: Status, confirmedBy: String? = nil, disputedBy: String? = nil) {
    self.submittedBy = submittedBy
    self.submittedAt = submittedAt
    self.status = status
    self.confirmedBy = confirmedBy
    self.disputedBy = disputedBy
  }

  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    submittedBy = c.decode(.submittedBy, default: "")
    submittedAt = c.decodeMillis(.submittedAt)
    status = c.decode(.status, default: .pendingConfirmation)
    confirmedBy = c.decodeLenient(String.self, .confirmedBy)
    disputedBy = c.decodeLenient(String.self, .disputedBy)
  }
}

/// Mirrors the fields of `Match` in `@tennis/shared` that the native client
/// reads. Stats and the undo snapshot are left to the server and to the Firebase
/// adapter; `hasUndoSnapshot` records only whether one exists.
public struct Match: Decodable, Equatable, Identifiable, Sendable {
  /// The Firestore document id. Documents do not store it, so the repository
  /// assigns it after decoding.
  public var id: String
  public var divisionId: String
  public var seasonId: String?
  public var divisionLevelId: String?
  /// A *label* stamped from the division level, never the singles/doubles
  /// discriminator. Use `isDoublesMatch`, which checks the side rosters.
  public var matchType: String?
  public var side1: MatchSide?
  public var side2: MatchSide?
  public var player1Id: String
  public var player2Id: String
  public var player1Name: String?
  public var player2Name: String?
  public var player2IsGuest: Bool
  public var playerIds: [String]
  public var format: MatchFormat
  public var status: MatchStatus
  public var liveScore: LiveScore
  public var reportSubmission: ReportSubmission?
  public var winner: Player?
  public var reportUrl: String?
  public var tipsEnabled: Bool
  public var hasUndoSnapshot: Bool
  public var source: String?
  public var createdBy: String
  public var scheduledAt: Int64?
  public var startedAt: Int64?
  public var completedAt: Int64?
  public var createdAt: Int64

  public init(
    id: String,
    divisionId: String,
    seasonId: String? = nil,
    divisionLevelId: String? = nil,
    matchType: String? = nil,
    side1: MatchSide? = nil,
    side2: MatchSide? = nil,
    player1Id: String,
    player2Id: String,
    player1Name: String? = nil,
    player2Name: String? = nil,
    player2IsGuest: Bool = false,
    playerIds: [String]? = nil,
    format: MatchFormat = .standard,
    status: MatchStatus,
    liveScore: LiveScore = LiveScore(),
    reportSubmission: ReportSubmission? = nil,
    winner: Player? = nil,
    reportUrl: String? = nil,
    tipsEnabled: Bool = true,
    hasUndoSnapshot: Bool = false,
    source: String? = nil,
    createdBy: String? = nil,
    scheduledAt: Int64? = nil,
    startedAt: Int64? = nil,
    completedAt: Int64? = nil,
    createdAt: Int64 = 0
  ) {
    self.id = id
    self.divisionId = divisionId
    self.seasonId = seasonId
    self.divisionLevelId = divisionLevelId
    self.matchType = matchType
    self.side1 = side1
    self.side2 = side2
    self.player1Id = player1Id
    self.player2Id = player2Id
    self.player1Name = player1Name
    self.player2Name = player2Name
    self.player2IsGuest = player2IsGuest
    self.playerIds = playerIds ?? Match.flatPlayerIds(player1Id, player2Id, side1, side2)
    self.format = format
    self.status = status
    self.liveScore = liveScore
    self.reportSubmission = reportSubmission
    self.winner = winner
    self.reportUrl = reportUrl
    self.tipsEnabled = tipsEnabled
    self.hasUndoSnapshot = hasUndoSnapshot
    self.source = source
    self.createdBy = createdBy ?? player1Id
    self.scheduledAt = scheduledAt
    self.startedAt = startedAt
    self.completedAt = completedAt
    self.createdAt = createdAt
  }

  enum CodingKeys: String, CodingKey {
    case id, divisionId, seasonId, divisionLevelId, matchType, side1, side2
    case player1Id, player2Id, player1Name, player2Name, player2IsGuest, playerIds
    case format, status, liveScore, reportSubmission, winner, reportUrl, tipsEnabled
    case undoSnapshot, source, createdBy, scheduledAt, startedAt, completedAt, createdAt
  }

  /// Only `status` is required: a match without one cannot be placed anywhere in
  /// the app, so it fails to decode and the repository skips it. Everything else
  /// falls back to what the TypeScript clients would infer.
  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    let side1 = c.decodeLenient(MatchSide.self, .side1)
    let side2 = c.decodeLenient(MatchSide.self, .side2)
    let player1Id = c.decodeLenient(String.self, .player1Id) ?? side1?.playerIds.first ?? ""
    let player2Id = c.decodeLenient(String.self, .player2Id) ?? side2?.playerIds.first ?? ""
    let format = c.decode(.format, default: MatchFormat.standard)
    let rawPlayerIds = c.decodeLenient([LenientString].self, .playerIds)?.compactMap(\.value)

    self.init(
      id: c.decode(.id, default: ""),
      divisionId: c.decode(.divisionId, default: ""),
      seasonId: c.decodeNonBlank(.seasonId),
      divisionLevelId: c.decodeNonBlank(.divisionLevelId),
      matchType: c.decodeLenient(String.self, .matchType),
      side1: side1,
      side2: side2,
      player1Id: player1Id,
      player2Id: player2Id,
      player1Name: c.decodeLenient(String.self, .player1Name),
      player2Name: c.decodeLenient(String.self, .player2Name),
      player2IsGuest: c.decode(.player2IsGuest, default: false),
      playerIds: rawPlayerIds,
      format: format,
      status: try c.decode(MatchStatus.self, forKey: .status),
      liveScore: c.decode(.liveScore, default: ScoreEngine.initialScore(for: format)),
      reportSubmission: c.decodeLenient(ReportSubmission.self, .reportSubmission),
      winner: c.decodeLenient(Player.self, .winner),
      reportUrl: c.decodeNonBlank(.reportUrl),
      tipsEnabled: c.decode(.tipsEnabled, default: true),
      hasUndoSnapshot: c.contains(.undoSnapshot) && !((try? c.decodeNil(forKey: .undoSnapshot)) ?? true),
      source: c.decodeLenient(String.self, .source),
      createdBy: c.decodeNonBlank(.createdBy),
      scheduledAt: c.decodeMillis(.scheduledAt),
      startedAt: c.decodeMillis(.startedAt),
      completedAt: c.decodeMillis(.completedAt),
      createdAt: c.decodeMillis(.createdAt) ?? 0
    )
  }

  private static func flatPlayerIds(_ p1: String, _ p2: String, _ s1: MatchSide?, _ s2: MatchSide?) -> [String] {
    let ids = (s1?.playerIds ?? [p1]) + (s2?.playerIds ?? [p2])
    return ids.filter { !$0.trimmedForId.isEmpty }
  }
}
