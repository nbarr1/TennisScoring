import Foundation

public enum UserRole: String, Codable, Sendable, CaseIterable {
  case player
  case divisionLeader = "division_leader"
  case admin
  case appDeveloper = "app_developer"

  /// Mirrors `isPrivilegedRole` in `@tennis/shared`.
  public var isPrivileged: Bool { self != .player }
}

public struct ContactPreferences: Codable, Equatable, Sendable {
  public var allowEmail: Bool
  public var allowSMS: Bool
  public var allowInApp: Bool

  public static let `default` = ContactPreferences(allowEmail: true, allowSMS: false, allowInApp: true)

  public init(allowEmail: Bool, allowSMS: Bool, allowInApp: Bool) {
    self.allowEmail = allowEmail
    self.allowSMS = allowSMS
    self.allowInApp = allowInApp
  }

  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    allowEmail = c.decode(.allowEmail, default: ContactPreferences.default.allowEmail)
    allowSMS = c.decode(.allowSMS, default: ContactPreferences.default.allowSMS)
    allowInApp = c.decode(.allowInApp, default: ContactPreferences.default.allowInApp)
  }
}

/// The denormalized standings snapshot Cloud Functions write onto `users/{uid}`.
public struct UserRankingSummary: Codable, Equatable, Sendable {
  public var divisionId: String
  public var rank: Int
  public var matchesPlayed: Int
  public var matchesWon: Int
  public var matchesLost: Int

  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    divisionId = c.decode(.divisionId, default: "")
    rank = c.decode(.rank, default: 0)
    matchesPlayed = c.decode(.matchesPlayed, default: 0)
    matchesWon = c.decode(.matchesWon, default: 0)
    matchesLost = c.decode(.matchesLost, default: 0)
  }

  public init(divisionId: String, rank: Int, matchesPlayed: Int, matchesWon: Int, matchesLost: Int) {
    self.divisionId = divisionId
    self.rank = rank
    self.matchesPlayed = matchesPlayed
    self.matchesWon = matchesWon
    self.matchesLost = matchesLost
  }
}

/// Mirrors the fields of `User` in `@tennis/shared` that the native client reads.
public struct User: Decodable, Equatable, Identifiable, Sendable {
  public var id: String
  public var displayName: String
  public var email: String
  public var phone: String?
  public var avatarUrl: String?
  public var contactPreferences: ContactPreferences
  public var divisionId: String?
  public var role: UserRole
  public var fcmTokens: [String]
  public var tipsEnabled: Bool
  public var tutorialDone: Bool
  public var rankingSummary: UserRankingSummary?
  public var blockedUserIds: [String]
  public var accountDeleted: Bool
  public var createdAt: Int64
  public var updatedAt: Int64

  public init(
    id: String,
    displayName: String,
    email: String,
    phone: String? = nil,
    avatarUrl: String? = nil,
    contactPreferences: ContactPreferences = .default,
    divisionId: String? = nil,
    role: UserRole = .player,
    fcmTokens: [String] = [],
    tipsEnabled: Bool = true,
    tutorialDone: Bool = false,
    rankingSummary: UserRankingSummary? = nil,
    blockedUserIds: [String] = [],
    accountDeleted: Bool = false,
    createdAt: Int64 = 0,
    updatedAt: Int64 = 0
  ) {
    self.id = id
    self.displayName = displayName
    self.email = email
    self.phone = phone
    self.avatarUrl = avatarUrl
    self.contactPreferences = contactPreferences
    self.divisionId = divisionId
    self.role = role
    self.fcmTokens = fcmTokens
    self.tipsEnabled = tipsEnabled
    self.tutorialDone = tutorialDone
    self.rankingSummary = rankingSummary
    self.blockedUserIds = blockedUserIds
    self.accountDeleted = accountDeleted
    self.createdAt = createdAt
    self.updatedAt = updatedAt
  }

  enum CodingKeys: String, CodingKey {
    case id, displayName, email, phone, avatarUrl, contactPreferences, divisionId, role
    case fcmTokens, tipsEnabled, tutorialDone, rankingSummary, blockedUserIds, accountDeleted
    case createdAt, updatedAt
  }

  /// Nothing is required. `joinDivisionByCode` writes `updatedAt` as a server
  /// timestamp, and an unrecognised `role` reads as `.player`, the least
  /// privileged role, rather than failing sign-in.
  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    let email = c.decode(.email, default: "")
    self.init(
      id: c.decode(.id, default: ""),
      displayName: c.decodeNonBlank(.displayName) ?? email,
      email: email,
      phone: c.decodeNonBlank(.phone),
      avatarUrl: c.decodeNonBlank(.avatarUrl),
      contactPreferences: c.decode(.contactPreferences, default: .default),
      divisionId: c.decodeNonBlank(.divisionId),
      role: c.decode(.role, default: .player),
      fcmTokens: c.decode(.fcmTokens, default: [LenientString]()).compactMap(\.value),
      tipsEnabled: c.decode(.tipsEnabled, default: true),
      tutorialDone: c.decode(.tutorialDone, default: false),
      rankingSummary: c.decodeLenient(UserRankingSummary.self, .rankingSummary),
      blockedUserIds: c.decode(.blockedUserIds, default: [LenientString]()).compactMap(\.value),
      accountDeleted: c.decode(.accountDeleted, default: false),
      createdAt: c.decodeMillis(.createdAt) ?? 0,
      updatedAt: c.decodeMillis(.updatedAt) ?? 0
    )
  }
}
