import Foundation
import Observation
import TennisCore

/// What the Messages screens need from the backend. The Firebase adapter makes
/// the same reads and writes as `packages/firebase-client` (`useMessages.ts` and
/// `moderation.ts`), so Firestore rules see identical documents from both apps.
public protocol MessagingRepository: Sendable {
  /// Every channel the player belongs to, in no particular order.
  func observeChannels(userId: String) -> AsyncThrowingStream<[Channel], Error>
  /// The newest `limit` messages, oldest first.
  func observeMessages(channelId: String, limit: Int) -> AsyncThrowingStream<[Message], Error>
  func send(channelId: String, sender: User, content: String, sharedContact: SharedContact?) async throws
  /// The public display name of a player, or nil when it cannot be read.
  func displayName(of userId: String) async -> String?
  /// Division members whose name contains `text`, case-insensitively.
  func searchPlayers(divisionId: String, matching text: String) async throws -> [PlayerSummary]
  /// The existing direct channel between two players, or a new one.
  func openDirectChannel(between userId: String, and otherUserId: String) async throws -> Channel
  func report(_ message: Message, reportedBy: String, reason: MessageReportReason, note: String?, divisionId: String) async throws
  func block(_ blockedUserId: String, by userId: String) async throws
  func unblock(_ blockedUserId: String, by userId: String) async throws
}

/// Resolves player names once and remembers them, so a list of direct channels
/// does not re-read the same profile for every row and every update.
@MainActor
@Observable
public final class PlayerNameCache {
  public private(set) var names: [String: String] = [:]
  @ObservationIgnored private var pending: Set<String> = []
  private let repository: any MessagingRepository

  public init(repository: any MessagingRepository) {
    self.repository = repository
  }

  public func name(for userId: String) -> String? { names[userId] }

  /// Looks up any ids not already known or in flight.
  public func resolve(_ userIds: some Sequence<String>) async {
    let missing = Set(userIds).subtracting(names.keys).subtracting(pending)
    guard !missing.isEmpty else { return }
    pending.formUnion(missing)
    defer { pending.subtract(missing) }
    for id in missing {
      if let name = await repository.displayName(of: id) { names[id] = name }
    }
  }
}

// MARK: - Channel list

public struct ChannelRow: Identifiable, Equatable, Sendable {
  public let id: String
  public let title: String
  public let isDirect: Bool
  /// `"Sam: See you at 6"`, or nil for a channel with no messages yet.
  public let preview: String?
  public let lastActivity: Int64
}

@MainActor
@Observable
public final class ChannelListModel {
  public private(set) var channels: [Channel] = []
  public private(set) var isLoading = true
  public private(set) var errorMessage: String?
  /// The signed-in player. The view keeps it current, so a block takes effect
  /// immediately.
  public var user: User

  public let names: PlayerNameCache
  private let repository: any MessagingRepository

  public init(user: User, repository: any MessagingRepository, names: PlayerNameCache) {
    self.user = user
    self.repository = repository
    self.names = names
  }

  /// Most recent activity first. Channel documents have no composite index for
  /// `participantIds` plus `createdAt`, and ordering by activity is what a
  /// conversation list wants anyway, so the order is decided here.
  public var rows: [ChannelRow] {
    channels
      .sorted { a, b in a.lastActivity != b.lastActivity ? a.lastActivity > b.lastActivity : a.id < b.id }
      .map(row(for:))
  }

  public func title(for channel: Channel) -> String {
    if let name = channel.name { return name }
    guard channel.isDirect else { return "Division chat" }
    guard let other = channel.otherParticipant(for: user.id) else { return "Direct message" }
    return names.name(for: other) ?? "Direct message"
  }

  public func channel(id: String) -> Channel? { channels.first { $0.id == id } }

  /// Keeps a channel the player just opened, so navigating to it works before
  /// the listener's next snapshot includes it.
  public func remember(_ channel: Channel) {
    if !channels.contains(where: { $0.id == channel.id }) { channels.append(channel) }
  }

  public func observe() async {
    do {
      for try await channels in repository.observeChannels(userId: user.id) {
        self.channels = channels
        isLoading = false
        errorMessage = nil
        await names.resolve(channels.compactMap { $0.otherParticipant(for: user.id) })
      }
    } catch is CancellationError {
      return
    } catch {
      isLoading = false
      errorMessage = error.localizedDescription
    }
  }

  private func row(for channel: Channel) -> ChannelRow {
    var preview: String?
    if let last = channel.lastMessage, !last.content.isEmpty {
      if user.blockedUserIds.contains(last.senderId) {
        preview = "Message from a blocked player"
      } else {
        let sender = last.senderId == user.id ? "You" : last.senderName
        preview = "\(sender): \(last.content)"
      }
    }
    return ChannelRow(id: channel.id, title: title(for: channel), isDirect: channel.isDirect, preview: preview, lastActivity: channel.lastActivity)
  }
}

// MARK: - Conversation

@MainActor
@Observable
public final class ConversationModel {
  public private(set) var allMessages: [Message] = []
  public private(set) var isLoading = true
  public private(set) var isSending = false
  public var draft = ""
  public var errorMessage: String?
  /// Shown after a report is filed or a player is blocked.
  public var notice: String?
  public var user: User

  public let channelId: String
  /// The channel's division, which a report is filed under. Direct channels
  /// carry none, so reports fall back to the player's own division.
  public let channelDivisionId: String?
  private let repository: any MessagingRepository
  public static let pageSize = 50

  public init(channel: Channel, user: User, repository: any MessagingRepository) {
    channelId = channel.id
    channelDivisionId = channel.divisionId
    self.user = user
    self.repository = repository
  }

  /// Messages to show: blocked senders are hidden, but never the player's own.
  public var messages: [Message] {
    let blocked = Set(user.blockedUserIds)
    return allMessages.filter { $0.senderId == user.id || !blocked.contains($0.senderId) }
  }

  public var trimmedDraft: String { draft.trimmingCharacters(in: .whitespacesAndNewlines) }

  public var canSend: Bool {
    !isSending && !trimmedDraft.isEmpty && trimmedDraft.count <= Message.maxLength
  }

  /// Characters left, once the draft is close enough to the limit to matter.
  public var remainingCharacters: Int? {
    let remaining = Message.maxLength - trimmedDraft.count
    return remaining < 200 ? remaining : nil
  }

  public var shareableContact: SharedContact { SharedContact.shareable(from: user) }

  public func isMine(_ message: Message) -> Bool { message.senderId == user.id }

  /// Other players' ordinary messages can be reported, and their senders blocked.
  public func canModerate(_ message: Message) -> Bool {
    !isMine(message) && message.kind != .system && !message.senderId.isEmpty
  }

  public func observe() async {
    do {
      for try await messages in repository.observeMessages(channelId: channelId, limit: Self.pageSize) {
        allMessages = messages
        isLoading = false
      }
    } catch is CancellationError {
      return
    } catch {
      isLoading = false
      errorMessage = error.localizedDescription
    }
  }

  /// Sends the draft. On failure the draft is kept, so nothing typed is lost.
  public func send() async {
    guard canSend else { return }
    let content = trimmedDraft
    isSending = true
    errorMessage = nil
    defer { isSending = false }
    do {
      try await repository.send(channelId: channelId, sender: user, content: content, sharedContact: nil)
      // Keep anything typed while the message was sending.
      if trimmedDraft == content { draft = "" }
    } catch {
      errorMessage = "Message not sent. Your draft is still here."
    }
  }

  public func shareContact() async {
    let contact = shareableContact
    guard !contact.isEmpty else {
      errorMessage = "Allow email or text contact in your profile before sharing your details."
      return
    }
    guard !isSending else { return }
    isSending = true
    errorMessage = nil
    defer { isSending = false }
    do {
      try await repository.send(channelId: channelId, sender: user, content: "Shared contact information", sharedContact: contact)
    } catch {
      errorMessage = "Contact details not sent. Try again."
    }
  }

  public func report(_ message: Message, reason: MessageReportReason, note: String) async {
    guard canModerate(message) else { return }
    guard let divisionId = channelDivisionId ?? user.divisionId else {
      errorMessage = "Join a division before reporting messages."
      return
    }
    do {
      let note = note.trimmingCharacters(in: .whitespacesAndNewlines)
      try await repository.report(message, reportedBy: user.id, reason: reason, note: note.isEmpty ? nil : note, divisionId: divisionId)
      notice = "Message reported. A division leader will review it."
    } catch {
      errorMessage = "Report not sent. Try again."
    }
  }

  public func blockSender(of message: Message) async {
    guard canModerate(message) else { return }
    do {
      try await repository.block(message.senderId, by: user.id)
      // Hide their messages now rather than waiting for the profile listener.
      if !user.blockedUserIds.contains(message.senderId) { user.blockedUserIds.append(message.senderId) }
      notice = "\(message.senderName) is blocked. Unblock them from your profile."
    } catch {
      errorMessage = "Couldn't block \(message.senderName). Try again."
    }
  }
}

// MARK: - New direct message

@MainActor
@Observable
public final class NewMessageModel {
  public var query = ""
  public private(set) var results: [PlayerSummary] = []
  public private(set) var isSearching = false
  public private(set) var isOpening = false
  public private(set) var errorMessage: String?

  public let user: User
  private let repository: any MessagingRepository

  public init(user: User, repository: any MessagingRepository) {
    self.user = user
    self.repository = repository
  }

  /// Searches the player's division, leaving out the player and anyone they
  /// have blocked.
  public func search() async {
    let text = query.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let divisionId = user.divisionId, !text.isEmpty else {
      results = []
      return
    }
    isSearching = true
    defer { isSearching = false }
    do {
      let found = try await repository.searchPlayers(divisionId: divisionId, matching: text)
      // A later keystroke may have started another search; drop stale results.
      guard text == query.trimmingCharacters(in: .whitespacesAndNewlines) else { return }
      let blocked = Set(user.blockedUserIds)
      results = found
        .filter { $0.id != user.id && !blocked.contains($0.id) }
        .sorted { $0.displayName.localizedCaseInsensitiveCompare($1.displayName) == .orderedAscending }
      errorMessage = nil
    } catch is CancellationError {
      return
    } catch {
      results = []
      errorMessage = error.localizedDescription
    }
  }

  /// Opens (or creates) the direct channel with `player`.
  public func open(_ player: PlayerSummary) async -> Channel? {
    isOpening = true
    defer { isOpening = false }
    do {
      return try await repository.openDirectChannel(between: user.id, and: player.id)
    } catch {
      errorMessage = error.localizedDescription
      return nil
    }
  }
}
