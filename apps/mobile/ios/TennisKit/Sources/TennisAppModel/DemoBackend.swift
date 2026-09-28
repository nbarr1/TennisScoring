import Foundation
import TennisCore

/// An in-memory backend implementing every service protocol.
///
/// It stands in for Firebase in SwiftUI previews, in the view-model tests, and in
/// debug builds that have no `GoogleService-Info.plist`. It follows the server's
/// rules closely enough to be played: points go through the same `ScoreEngine`
/// that `scoreMatchPoint` runs, one undo snapshot is kept per match, and
/// confirming a report recomputes the standings with `RankingEngine`.
public final class DemoBackend: @unchecked Sendable {
  // Everything below is guarded by `lock`. Continuations are resumed only after
  // the lock is released.
  private let lock = NSLock()
  private var account: AuthAccount?
  private var users: [String: User]
  private var matches: [String: Match]
  private var undoSnapshots: [String: Match] = [:]
  private var levels: [DivisionLevel]
  private var rankings: [PlayerRanking] = []
  private var doublesRankings: [DoublesTeamRanking]
  private let inviteCodes: [String: String]
  private var failure: ServiceError?
  private var channels: [String: Channel]
  private var messages: [String: [Message]]
  private var reports: [(message: Message, reason: MessageReportReason, divisionId: String)] = []
  private var actions: [MatchAction] = []

  private var accountWatchers: [UUID: AsyncStream<AuthAccount?>.Continuation] = [:]
  private var userWatchers: [UUID: (String, AsyncThrowingStream<User?, Error>.Continuation)] = [:]
  private var matchListWatchers: [UUID: (String, AsyncThrowingStream<[Match], Error>.Continuation)] = [:]
  private var matchWatchers: [UUID: (String, AsyncThrowingStream<Match?, Error>.Continuation)] = [:]
  private var rankingWatchers: [UUID: (String, AsyncThrowingStream<[PlayerRanking], Error>.Continuation)] = [:]
  private var doublesWatchers: [UUID: AsyncThrowingStream<[DoublesTeamRanking], Error>.Continuation] = [:]
  private var levelWatchers: [UUID: AsyncThrowingStream<[DivisionLevel], Error>.Continuation] = [:]
  private var channelWatchers: [UUID: (String, AsyncThrowingStream<[Channel], Error>.Continuation)] = [:]
  private var messageWatchers: [UUID: (String, Int, AsyncThrowingStream<[Message], Error>.Continuation)] = [:]

  public init(
    users: [User],
    matches: [Match] = [],
    levels: [DivisionLevel] = [],
    doublesRankings: [DoublesTeamRanking] = [],
    inviteCodes: [String: String] = [:],
    channels: [Channel] = [],
    messages: [Message] = [],
    signedInAs uid: String? = nil
  ) {
    self.channels = Dictionary(channels.map { ($0.id, $0) }, uniquingKeysWith: { _, last in last })
    self.messages = Dictionary(grouping: messages, by: \.channelId)
    self.users = Dictionary(users.map { ($0.id, $0) }, uniquingKeysWith: { _, last in last })
    self.matches = Dictionary(matches.map { ($0.id, $0) }, uniquingKeysWith: { _, last in last })
    self.levels = levels
    self.doublesRankings = doublesRankings
    self.inviteCodes = Dictionary(inviteCodes.map { ($0.key.uppercased(), $0.value) }, uniquingKeysWith: { _, last in last })
    if let uid, let user = self.users[uid] {
      account = AuthAccount(uid: uid, email: user.email)
    }
    rankings = Self.computeSinglesRankings(matches: Array(self.matches.values), users: self.users)
  }

  public var services: AppServices {
    AppServices(auth: self, users: self, matches: self, rankings: self, divisions: self, messaging: self, isDemo: true)
  }

  /// Makes the next write fail with `message`. For tests.
  public func failNextWrite(_ message: String) {
    lock.withLock { failure = ServiceError(message) }
  }

  /// Every match action performed so far, in order. For tests.
  public var performedActions: [MatchAction] { lock.withLock { actions } }

  public func match(id: String) -> Match? { lock.withLock { matches[id] } }

  /// Every message report filed so far, in order. For tests.
  public var filedReports: [(messageId: String, reason: MessageReportReason, divisionId: String)] {
    lock.withLock { reports.map { ($0.message.id, $0.reason, $0.divisionId) } }
  }

  /// Adds a message as another player would send it. For tests and previews.
  public func deliver(_ message: Message) {
    lock.withLock { appendMessage(message) }
    broadcastMessaging()
  }

  /// Replaces or inserts a match, as another device's write would. For tests.
  public func upsert(_ match: Match) {
    lock.withLock { matches[match.id] = match }
    broadcastMatches()
  }

  // MARK: - Plumbing

  private func takeFailure() -> ServiceError? {
    lock.withLock {
      defer { failure = nil }
      return failure
    }
  }

  private func stream<T: Sendable>(
    register: @escaping @Sendable (UUID, AsyncThrowingStream<T, Error>.Continuation) -> T,
    unregister: @escaping @Sendable (UUID) -> Void
  ) -> AsyncThrowingStream<T, Error> {
    AsyncThrowingStream { continuation in
      let id = UUID()
      continuation.onTermination = { _ in unregister(id) }
      continuation.yield(register(id, continuation))
    }
  }

  private func broadcastMatches() {
    let (lists, singles, standings) = lock.withLock {
      (
        matchListWatchers.values.map { playerId, continuation in (continuation, matchesFor(playerId)) },
        matchWatchers.values.map { id, continuation in (continuation, matches[id]) },
        rankingWatchers.values.map { divisionId, continuation in (continuation, rankings.filter { $0.divisionId == divisionId }) }
      )
    }
    for (continuation, value) in lists { continuation.yield(value) }
    for (continuation, value) in singles { continuation.yield(value) }
    for (continuation, value) in standings { continuation.yield(value) }
  }

  private func broadcastUsers() {
    let targets = lock.withLock { userWatchers.values.map { id, continuation in (continuation, users[id]) } }
    for (continuation, user) in targets { continuation.yield(user) }
  }

  private func broadcastAccount() {
    let (targets, current) = lock.withLock { (Array(accountWatchers.values), account) }
    for continuation in targets { continuation.yield(current) }
  }

  /// Must be called with `lock` held.
  private func matchesFor(_ playerId: String) -> [Match] {
    matches.values.filter { $0.playerIds.contains(playerId) }.sorted { $0.createdAt > $1.createdAt }
  }

  private static func now() -> Int64 { RankingEngine.currentMillis() }

  /// Recomputes singles standings from completed two-player matches, the way
  /// `recalculateRankings` does, bucketed by season and level.
  static func computeSinglesRankings(matches: [Match], users: [String: User]) -> [PlayerRanking] {
    struct Bucket: Hashable { let divisionId: String; let season: String; let level: String? }
    var inputs: [Bucket: [String: RankingInput]] = [:]
    var headToHeads: [Bucket: [String: HeadToHead]] = [:]

    for match in matches where match.status == .completed && !match.isDoublesMatch {
      guard let winner = match.winner, !match.player1Id.isEmpty, !match.player2Id.isEmpty else { continue }
      let bucket = Bucket(divisionId: match.divisionId, season: match.seasonId ?? "current", level: match.divisionLevelId)
      let totals = RankingEngine.extractMatchTotals(match.liveScore.sets)
      for side in Player.allCases {
        let id = side == .player1 ? match.player1Id : match.player2Id
        let existing = inputs[bucket, default: [:]][id] ?? RankingInput(
          userId: id,
          displayName: users[id]?.displayName ?? match.sideDisplayName(side),
          divisionId: match.divisionId,
          season: bucket.season
        )
        let mine = side == .player1
        inputs[bucket, default: [:]][id] = RankingEngine.updateRanking(
          existing,
          won: winner == side,
          setsWon: mine ? totals.p1Sets : totals.p2Sets,
          setsLost: mine ? totals.p2Sets : totals.p1Sets,
          gamesWon: mine ? totals.p1Games : totals.p2Games,
          gamesLost: mine ? totals.p2Games : totals.p1Games
        )
      }
      let (first, second) = match.player1Id < match.player2Id ? (match.player1Id, match.player2Id) : (match.player2Id, match.player1Id)
      var record = headToHeads[bucket, default: [:]]["\(first)|\(second)"] ?? HeadToHead(player1Id: first, player2Id: second, player1Wins: 0, player2Wins: 0)
      let winnerId = winner == .player1 ? match.player1Id : match.player2Id
      if winnerId == first { record.player1Wins += 1 } else { record.player2Wins += 1 }
      headToHeads[bucket, default: [:]]["\(first)|\(second)"] = record
    }

    return inputs.flatMap { bucket, players in
      RankingEngine.computeRankings(Array(players.values), headToHeads: Array(headToHeads[bucket, default: [:]].values)).map {
        var ranking = $0
        ranking.seasonId = bucket.season
        ranking.divisionLevelId = bucket.level
        return ranking
      }
    }
  }
}

// MARK: - AuthService

extension DemoBackend: AuthService {
  public func accountChanges() -> AsyncStream<AuthAccount?> {
    AsyncStream { continuation in
      let id = UUID()
      let current = lock.withLock { () -> AuthAccount? in
        accountWatchers[id] = continuation
        return account
      }
      continuation.onTermination = { [weak self] _ in
        self?.lock.withLock { _ = self?.accountWatchers.removeValue(forKey: id) }
      }
      continuation.yield(current)
    }
  }

  public func signIn(email: String, password: String) async throws {
    if let failure = takeFailure() { throw failure }
    let user = lock.withLock { users.values.first { $0.email.caseInsensitiveCompare(email) == .orderedSame } }
    guard let user else { throw ServiceError("No demo account uses that email. Try \(DemoBackend.demoEmail).") }
    lock.withLock { account = AuthAccount(uid: user.id, email: user.email) }
    broadcastAccount()
  }

  public func signOut() throws {
    lock.withLock { account = nil }
    broadcastAccount()
  }
}

// MARK: - UserRepository

extension DemoBackend: UserRepository {
  public func observeUser(id: String) -> AsyncThrowingStream<User?, Error> {
    stream(
      register: { [unowned self] token, continuation in
        lock.withLock {
          userWatchers[token] = (id, continuation)
          return users[id]
        }
      },
      unregister: { [weak self] token in self?.lock.withLock { _ = self?.userWatchers.removeValue(forKey: token) } }
    )
  }
}

// MARK: - DivisionService

extension DemoBackend: DivisionService {
  public func joinDivision(inviteCode: String) async throws {
    if let failure = takeFailure() { throw failure }
    try lock.withLock {
      guard let uid = account?.uid else { throw ServiceError("You must be signed in to join a division.") }
      guard let divisionId = inviteCodes[inviteCode.uppercased()] else { throw ServiceError("Invalid invite code.") }
      users[uid]?.divisionId = divisionId
    }
    broadcastUsers()
  }
}

// MARK: - MatchRepository

extension DemoBackend: MatchRepository {
  public func observeMatches(playerId: String) -> AsyncThrowingStream<[Match], Error> {
    stream(
      register: { [unowned self] token, continuation in
        lock.withLock {
          matchListWatchers[token] = (playerId, continuation)
          return matchesFor(playerId)
        }
      },
      unregister: { [weak self] token in self?.lock.withLock { _ = self?.matchListWatchers.removeValue(forKey: token) } }
    )
  }

  public func observeMatch(id: String) -> AsyncThrowingStream<Match?, Error> {
    stream(
      register: { [unowned self] token, continuation in
        lock.withLock {
          matchWatchers[token] = (id, continuation)
          return matches[id]
        }
      },
      unregister: { [weak self] token in self?.lock.withLock { _ = self?.matchWatchers.removeValue(forKey: token) } }
    )
  }

  public func scorePoint(matchId: String, scorer: Player) async throws -> ScorePointResponse {
    if let failure = takeFailure() { throw failure }
    let response = try lock.withLock { () throws -> ScorePointResponse in
      guard var match = matches[matchId] else { throw ServiceError("Match not found.") }
      guard let uid = account?.uid, uid == match.player1Id || uid == match.player2Id else {
        throw ServiceError("Only match participants can score this match.")
      }
      guard match.status == .scheduled || match.status == .inProgress else {
        throw ServiceError("Only scheduled or in-progress matches can be scored.")
      }
      let result = ScoreEngine.applyPoint(match.liveScore, scorer: scorer, format: match.format)
      undoSnapshots[matchId] = match
      match.liveScore = result.nextScore
      match.hasUndoSnapshot = true
      if let winner = result.matchWinner {
        match.status = .pendingReport
        match.winner = winner
        match.completedAt = Self.now()
      }
      matches[matchId] = match
      return ScorePointResponse(nextScore: result.nextScore, matchWinner: result.matchWinner, tips: result.tips)
    }
    broadcastMatches()
    return response
  }

  public func perform(_ action: MatchAction) async throws {
    if let failure = takeFailure() { throw failure }
    try lock.withLock {
      actions.append(action)
      switch action {
      case let .start(matchId, server):
        try update(matchId) {
          $0.status = .inProgress
          $0.liveScore.server = server
          $0.startedAt = Self.now()
        }
      case let .undoLastPoint(matchId):
        guard var previous = undoSnapshots.removeValue(forKey: matchId) else { throw ServiceError("There is no point to undo.") }
        previous.hasUndoSnapshot = false
        matches[matchId] = previous
      case let .acceptProposal(matchId):
        try update(matchId) { $0.status = .scheduled }
      case let .declineProposal(matchId):
        try update(matchId) { $0.status = .cancelled }
      case let .submitReport(matchId, submittedBy):
        try update(matchId) {
          $0.reportSubmission = ReportSubmission(submittedBy: submittedBy, submittedAt: Self.now(), status: .pendingConfirmation)
        }
      case let .confirmReport(matchId, confirmedBy):
        try update(matchId) {
          $0.status = .completed
          $0.reportSubmission?.status = .confirmed
          $0.reportSubmission?.confirmedBy = confirmedBy
          $0.hasUndoSnapshot = false
        }
        undoSnapshots[matchId] = nil
        rankings = Self.computeSinglesRankings(matches: Array(matches.values), users: users)
      case let .disputeReport(matchId, disputedBy):
        try update(matchId) {
          $0.status = .disputed
          $0.reportSubmission?.status = .disputed
          $0.reportSubmission?.disputedBy = disputedBy
        }
      }
    }
    broadcastMatches()
  }

  /// Must be called with `lock` held.
  private func update(_ matchId: String, _ change: (inout Match) -> Void) throws {
    guard var match = matches[matchId] else { throw ServiceError("Match not found.") }
    change(&match)
    matches[matchId] = match
  }
}

// MARK: - RankingRepository

extension DemoBackend: RankingRepository {
  public func observeRankings(divisionId: String) -> AsyncThrowingStream<[PlayerRanking], Error> {
    stream(
      register: { [unowned self] token, continuation in
        lock.withLock {
          rankingWatchers[token] = (divisionId, continuation)
          return rankings.filter { $0.divisionId == divisionId }
        }
      },
      unregister: { [weak self] token in self?.lock.withLock { _ = self?.rankingWatchers.removeValue(forKey: token) } }
    )
  }

  public func observeDoublesRankings(divisionId: String) -> AsyncThrowingStream<[DoublesTeamRanking], Error> {
    stream(
      register: { [unowned self] token, continuation in
        lock.withLock {
          doublesWatchers[token] = continuation
          return doublesRankings.filter { $0.divisionId == divisionId }
        }
      },
      unregister: { [weak self] token in self?.lock.withLock { _ = self?.doublesWatchers.removeValue(forKey: token) } }
    )
  }

  public func observeLevels(divisionId: String) -> AsyncThrowingStream<[DivisionLevel], Error> {
    stream(
      register: { [unowned self] token, continuation in
        lock.withLock {
          levelWatchers[token] = continuation
          return levels
        }
      },
      unregister: { [weak self] token in self?.lock.withLock { _ = self?.levelWatchers.removeValue(forKey: token) } }
    )
  }
}

// MARK: - MessagingRepository

extension DemoBackend: MessagingRepository {
  /// Must be called with `lock` held. Updates the channel's `lastMessage`, as the
  /// `onNewMessage` Cloud Function does.
  private func appendMessage(_ message: Message) {
    messages[message.channelId, default: []].append(message)
    channels[message.channelId]?.lastMessage = Channel.LastMessage(
      content: message.content,
      senderId: message.senderId,
      senderName: message.senderName,
      timestamp: message.createdAt
    )
  }

  /// Must be called with `lock` held.
  private func channelsFor(_ userId: String) -> [Channel] {
    channels.values.filter { $0.participantIds.contains(userId) }
  }

  /// Must be called with `lock` held.
  private func newestMessages(_ channelId: String, limit: Int) -> [Message] {
    let sorted = (messages[channelId] ?? []).sorted { $0.createdAt < $1.createdAt }
    return Array(sorted.suffix(limit))
  }

  private func broadcastMessaging() {
    let (channelTargets, messageTargets) = lock.withLock {
      (
        channelWatchers.values.map { userId, continuation in (continuation, channelsFor(userId)) },
        messageWatchers.values.map { channelId, limit, continuation in (continuation, newestMessages(channelId, limit: limit)) }
      )
    }
    for (continuation, value) in channelTargets { continuation.yield(value) }
    for (continuation, value) in messageTargets { continuation.yield(value) }
  }

  public func observeChannels(userId: String) -> AsyncThrowingStream<[Channel], Error> {
    stream(
      register: { [unowned self] token, continuation in
        lock.withLock {
          channelWatchers[token] = (userId, continuation)
          return channelsFor(userId)
        }
      },
      unregister: { [weak self] token in self?.lock.withLock { _ = self?.channelWatchers.removeValue(forKey: token) } }
    )
  }

  public func observeMessages(channelId: String, limit: Int) -> AsyncThrowingStream<[Message], Error> {
    stream(
      register: { [unowned self] token, continuation in
        lock.withLock {
          messageWatchers[token] = (channelId, limit, continuation)
          return newestMessages(channelId, limit: limit)
        }
      },
      unregister: { [weak self] token in self?.lock.withLock { _ = self?.messageWatchers.removeValue(forKey: token) } }
    )
  }

  public func send(channelId: String, sender: User, content: String, sharedContact: SharedContact?) async throws {
    if let failure = takeFailure() { throw failure }
    try lock.withLock {
      guard let channel = channels[channelId], channel.participantIds.contains(sender.id) else {
        throw ServiceError("You can't post in this conversation.")
      }
      guard !content.isEmpty, content.count <= Message.maxLength else {
        throw ServiceError("Messages must be 1 to \(Message.maxLength) characters.")
      }
      let existing = messages[channelId] ?? []
      let now = max(Self.now(), (existing.map(\.createdAt).max() ?? 0) + 1)
      appendMessage(Message(
        id: UUID().uuidString,
        channelId: channelId,
        senderId: sender.id,
        senderName: sender.displayName,
        content: content,
        kind: sharedContact == nil ? .text : .contactShare,
        sharedContact: sharedContact,
        readBy: [sender.id],
        createdAt: now
      ))
    }
    broadcastMessaging()
  }

  public func displayName(of userId: String) async -> String? {
    lock.withLock { users[userId]?.displayName }
  }

  public func searchPlayers(divisionId: String, matching text: String) async throws -> [PlayerSummary] {
    if let failure = takeFailure() { throw failure }
    let needle = text.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
    return lock.withLock {
      users.values
        .filter { $0.divisionId == divisionId && $0.displayName.lowercased().contains(needle) }
        .map { PlayerSummary(id: $0.id, displayName: $0.displayName) }
    }
  }

  public func openDirectChannel(between userId: String, and otherUserId: String) async throws -> Channel {
    if let failure = takeFailure() { throw failure }
    let pair = [userId, otherUserId].sorted()
    let channel = lock.withLock { () -> Channel in
      if let existing = channels.values.first(where: { $0.isDirect && $0.participantIds == pair }) {
        return existing
      }
      let created = Channel(id: "dm-\(pair[0])-\(pair[1])", type: "direct", participantIds: pair, createdAt: Self.now())
      channels[created.id] = created
      return created
    }
    broadcastMessaging()
    return channel
  }

  public func report(_ message: Message, reportedBy: String, reason: MessageReportReason, note: String?, divisionId: String) async throws {
    if let failure = takeFailure() { throw failure }
    lock.withLock { reports.append((message, reason, divisionId)) }
  }

  public func block(_ blockedUserId: String, by userId: String) async throws {
    if let failure = takeFailure() { throw failure }
    lock.withLock {
      guard var user = users[userId], !user.blockedUserIds.contains(blockedUserId) else { return }
      user.blockedUserIds.append(blockedUserId)
      users[userId] = user
    }
    broadcastUsers()
  }

  public func unblock(_ blockedUserId: String, by userId: String) async throws {
    if let failure = takeFailure() { throw failure }
    lock.withLock { users[userId]?.blockedUserIds.removeAll { $0 == blockedUserId } }
    broadcastUsers()
  }
}
