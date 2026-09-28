import Foundation

/// A `channels/{channelId}` document: the division's group chat or a direct
/// conversation between two players.
public struct Channel: Decodable, Equatable, Identifiable, Sendable {
  public struct LastMessage: Decodable, Equatable, Sendable {
    public var content: String
    public var senderId: String
    public var senderName: String
    public var timestamp: Int64

    public init(content: String, senderId: String, senderName: String, timestamp: Int64) {
      self.content = content
      self.senderId = senderId
      self.senderName = senderName
      self.timestamp = timestamp
    }

    enum CodingKeys: String, CodingKey { case content, senderId, senderName, timestamp }

    public init(from decoder: Decoder) throws {
      let c = try decoder.container(keyedBy: CodingKeys.self)
      content = c.decode(.content, default: "")
      senderId = c.decode(.senderId, default: "")
      senderName = c.decodeNonBlank(.senderName) ?? "Unknown"
      timestamp = c.decodeMillis(.timestamp) ?? 0
    }
  }

  /// The Firestore document id, assigned by the repository.
  public var id: String
  /// `"division"` or `"direct"`. Anything else is treated as a group channel.
  public var type: String
  public var divisionId: String?
  public var participantIds: [String]
  public var name: String?
  public var lastMessage: LastMessage?
  public var createdAt: Int64

  public var isDirect: Bool { type == "direct" }

  /// When the channel last had activity, for ordering the channel list.
  public var lastActivity: Int64 { max(lastMessage?.timestamp ?? 0, createdAt) }

  /// The other player in a direct channel.
  public func otherParticipant(for userId: String) -> String? {
    guard isDirect else { return nil }
    return participantIds.first { $0 != userId }
  }

  public init(
    id: String,
    type: String,
    divisionId: String? = nil,
    participantIds: [String],
    name: String? = nil,
    lastMessage: LastMessage? = nil,
    createdAt: Int64 = 0
  ) {
    self.id = id
    self.type = type
    self.divisionId = divisionId
    self.participantIds = participantIds
    self.name = name
    self.lastMessage = lastMessage
    self.createdAt = createdAt
  }

  enum CodingKeys: String, CodingKey { case id, type, divisionId, participantIds, name, lastMessage, createdAt }

  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    self.init(
      id: c.decode(.id, default: ""),
      type: c.decode(.type, default: "division"),
      divisionId: c.decodeNonBlank(.divisionId),
      participantIds: c.decode(.participantIds, default: [LenientString]()).compactMap(\.value),
      name: c.decodeNonBlank(.name),
      lastMessage: c.decodeLenient(LastMessage.self, .lastMessage),
      createdAt: c.decodeMillis(.createdAt) ?? 0
    )
  }
}

public struct SharedContact: Codable, Equatable, Sendable {
  public var phone: String?
  public var email: String?

  public init(phone: String? = nil, email: String? = nil) {
    self.phone = phone
    self.email = email
  }

  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    phone = c.decodeNonBlank(.phone)
    email = c.decodeNonBlank(.email)
  }

  public var isEmpty: Bool { phone == nil && email == nil }

  /// What a player may share, given their contact preferences. Mirrors the Expo
  /// client: a phone number only when SMS contact is allowed, an email only when
  /// email contact is allowed.
  public static func shareable(from user: User) -> SharedContact {
    SharedContact(
      phone: user.contactPreferences.allowSMS ? user.phone : nil,
      email: user.contactPreferences.allowEmail && !user.email.isEmpty ? user.email : nil
    )
  }
}

/// A `channels/{channelId}/messages/{messageId}` document.
public struct Message: Decodable, Equatable, Identifiable, Sendable {
  public enum Kind: String, Decodable, Sendable {
    case text
    case system
    case contactShare = "contact_share"
  }

  /// The Firestore document id, assigned by the repository.
  public var id: String
  public var channelId: String
  public var senderId: String
  public var senderName: String
  public var content: String
  public var kind: Kind
  public var sharedContact: SharedContact?
  public var readBy: [String]
  public var createdAt: Int64

  /// Firestore rules reject longer messages.
  public static let maxLength = 2000

  public init(
    id: String,
    channelId: String,
    senderId: String,
    senderName: String,
    content: String,
    kind: Kind = .text,
    sharedContact: SharedContact? = nil,
    readBy: [String] = [],
    createdAt: Int64 = 0
  ) {
    self.id = id
    self.channelId = channelId
    self.senderId = senderId
    self.senderName = senderName
    self.content = content
    self.kind = kind
    self.sharedContact = sharedContact
    self.readBy = readBy
    self.createdAt = createdAt
  }

  enum CodingKeys: String, CodingKey { case id, channelId, senderId, senderName, content, type, sharedContact, readBy, createdAt }

  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    let sharedContact = c.decodeLenient(SharedContact.self, .sharedContact)
    self.init(
      id: c.decode(.id, default: ""),
      channelId: c.decode(.channelId, default: ""),
      senderId: c.decode(.senderId, default: ""),
      senderName: c.decodeNonBlank(.senderName) ?? "Unknown",
      content: c.decode(.content, default: ""),
      kind: c.decode(.type, default: .text),
      sharedContact: sharedContact?.isEmpty == true ? nil : sharedContact,
      readBy: c.decode(.readBy, default: [LenientString]()).compactMap(\.value),
      createdAt: c.decodeMillis(.createdAt) ?? 0
    )
  }
}

/// Mirrors `MessageReportReason` in `@tennis/shared`.
public enum MessageReportReason: String, Codable, Sendable, CaseIterable {
  case harassment
  case spam
  case inappropriate
  case other

  public var label: String {
    switch self {
    case .harassment: "Harassment"
    case .spam: "Spam"
    case .inappropriate: "Inappropriate"
    case .other: "Other"
    }
  }
}

/// A division member as the new-message search lists them: the public
/// `profiles/{uid}` mirror, not the private `users` document.
public struct PlayerSummary: Decodable, Equatable, Identifiable, Sendable {
  public var id: String
  public var displayName: String

  public init(id: String, displayName: String) {
    self.id = id
    self.displayName = displayName
  }

  enum CodingKeys: String, CodingKey { case id, displayName }

  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    id = c.decode(.id, default: "")
    displayName = c.decodeNonBlank(.displayName) ?? "Player"
  }
}
