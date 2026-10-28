import Foundation
import Observation
import TennisCore

/// One match: its live score and every action the signed-in player can take on it.
///
/// Each `can…` property mirrors a rule the server or Firestore rules enforce, so
/// the screen only offers what will succeed.
@MainActor
@Observable
public final class MatchDetailModel {
  public private(set) var match: Match?
  public private(set) var isLoading = true
  /// True while a write is in flight. Further actions are ignored until it ends,
  /// so a double tap can never score two points.
  public private(set) var isWorking = false
  public var errorMessage: String?
  /// The tip for the last point scored, when tips are on.
  public var currentTip: Tip?

  public let matchId: String
  public let userId: String
  private let tipsEnabledForUser: Bool
  private let repository: any MatchRepository

  public init(matchId: String, userId: String, tipsEnabled: Bool, repository: any MatchRepository) {
    self.matchId = matchId
    self.userId = userId
    self.tipsEnabledForUser = tipsEnabled
    self.repository = repository
  }

  // MARK: - Derived state

  public var mySide: Player? { match?.side(of: userId) }

  /// Any player on either side may score, as `scoreMatchPoint` allows. The
  /// callable would also score a `scheduled` match, but it never changes the
  /// status, so the match has to be started first (as the React Native app does)
  /// or it would stay listed as upcoming while being played.
  public var canScore: Bool {
    guard let match, match.status == .inProgress else { return false }
    return match.side(of: userId) != nil
  }

  public var canStart: Bool {
    guard let match else { return false }
    return match.status == .scheduled && match.isParticipant(userId)
  }

  /// The server keeps one snapshot, taken before the last point.
  public var canUndo: Bool {
    guard let match, match.hasUndoSnapshot, match.reportSubmission == nil, match.isParticipant(userId) else { return false }
    return match.status == .inProgress || match.status == .pendingReport
  }

  public var canSubmitReport: Bool {
    guard let match else { return false }
    return match.status == .pendingReport && match.reportSubmission == nil && match.isParticipant(userId)
  }

  /// Only the opposing side confirms or disputes a report.
  public var canRespondToReport: Bool {
    guard let match, match.status == .pendingReport,
          let submission = match.reportSubmission, submission.status == .pendingConfirmation
    else { return false }
    return match.canRespondToReport(userId: userId, submittedBy: submission.submittedBy)
  }

  /// When the opposing side's window to answer the report closes, once the
  /// server has stamped it. Mirrors `reportConfirmationDeadline` in `@tennis/shared`.
  public var reportConfirmationDeadline: Int64? {
    guard let submission = match?.reportSubmission, submission.status == .pendingConfirmation else { return nil }
    return submission.confirmationDeadline
  }

  /// The window to answer has closed. The opposing side can still confirm, but
  /// the rules refuse a dispute, so the screen stops offering one. Mirrors
  /// `isReportWindowClosed` in `@tennis/shared`.
  public func isReportWindowClosed(now: Int64) -> Bool {
    guard match?.status == .pendingReport, let deadline = reportConfirmationDeadline else { return false }
    return now >= deadline
  }

  /// This player's side filed the report and the other side has not answered.
  public var isAwaitingReportConfirmation: Bool {
    guard let match, match.status == .pendingReport,
          let submission = match.reportSubmission, submission.status == .pendingConfirmation
    else { return false }
    return match.isParticipant(userId) && !canRespondToReport
  }

  /// The proposer is always side 1, so side 2 answers the proposal.
  public var canRespondToProposal: Bool {
    match?.status == .proposed && mySide == .player2
  }

  public var canWithdrawProposal: Bool {
    match?.status == .proposed && mySide == .player1
  }

  /// What the watch should show: the match in every status, so a match that
  /// ends, is cancelled, or goes to a report stops being live on the watch too.
  /// Nil until the match loads, and after it is deleted (see `wasRemoved`).
  public var watchSnapshot: WatchScoreSnapshot? {
    guard let match else { return nil }
    return WatchScoreSnapshot(
      matchId: match.id,
      player1Name: match.sideDisplayName(.player1),
      player2Name: match.sideDisplayName(.player2),
      status: match.status,
      score: match.liveScore,
      canScore: canScore,
      canUndo: canUndo,
      isParticipant: match.isParticipant(userId)
    )
  }

  /// True once a match that had loaded was deleted, so the screen can tell the
  /// watch to stop showing it.
  public private(set) var wasRemoved = false

  /// What the last point or undo applied from this screen (or from the watch
  /// through it) should feel and sound like. A new value for every action, so
  /// the view can drive a haptic and a VoiceOver announcement from it.
  public private(set) var lastFeedback: ScoringFeedback?
  @ObservationIgnored private var feedbackCount = 0

  // MARK: - Observation

  /// Follows the match for as long as the caller's task runs.
  public func observe() async {
    do {
      for try await match in repository.observeMatch(id: matchId) {
        if match == nil && self.match != nil { wasRemoved = true }
        self.match = match
        isLoading = false
      }
    } catch is CancellationError {
      return
    } catch {
      isLoading = false
      errorMessage = error.localizedDescription
    }
  }

  // MARK: - Actions

  public func score(_ scorer: Player) async {
    guard canScore else { return }
    await run {
      let response = try await self.repository.scorePoint(matchId: self.matchId, scorer: scorer)
      self.applyScored(response, scorer: scorer)
    }
  }

  /// Applies a command from the watch, if it is for this match and the action is
  /// allowed right now. Returns whether it was applied; the phone sends that
  /// back, and the watch confirms the tap only on true.
  @discardableResult
  public func handle(_ command: WatchCommand) async -> Bool {
    guard command.matchId == matchId, !isWorking else { return false }
    switch command {
    case let .point(_, scorer):
      guard canScore else { return false }
      await score(scorer)
    case .undo:
      guard canUndo else { return false }
      await undo()
    }
    return errorMessage == nil
  }

  public func start(server: Player) async {
    guard canStart else { return }
    await perform(.start(matchId: matchId, server: server))
  }

  public func undo() async {
    // Checked here too, so a skipped undo is never announced as done.
    guard canUndo, !isWorking else { return }
    currentTip = nil
    await perform(.undoLastPoint(matchId: matchId))
    if errorMessage == nil { emitFeedback(.undo, "Last point undone.") }
  }

  public func acceptProposal() async {
    guard canRespondToProposal else { return }
    await perform(.acceptProposal(matchId: matchId))
  }

  public func declineProposal() async {
    guard canRespondToProposal || canWithdrawProposal else { return }
    await perform(.declineProposal(matchId: matchId))
  }

  public func submitReport() async {
    guard canSubmitReport else { return }
    await perform(.submitReport(matchId: matchId, submittedBy: userId))
  }

  public func confirmReport() async {
    guard canRespondToReport else { return }
    await perform(.confirmReport(matchId: matchId, confirmedBy: userId))
  }

  public func disputeReport() async {
    guard canRespondToReport else { return }
    await perform(.disputeReport(matchId: matchId, disputedBy: userId))
  }

  // MARK: - Internals

  private func perform(_ action: MatchAction) async {
    await run { try await self.repository.perform(action) }
  }

  private func run(_ work: @MainActor () async throws -> Void) async {
    guard !isWorking else { return }
    isWorking = true
    errorMessage = nil
    defer { isWorking = false }
    do {
      try await work()
    } catch {
      errorMessage = error.localizedDescription
    }
  }

  /// Shows the server's result straight away instead of waiting for the listener,
  /// which delivers the same write moments later.
  private func applyScored(_ response: ScorePointResponse, scorer: Player) {
    if let match {
      emitFeedback(.point, Self.pointAnnouncement(
        scorer: scorer,
        before: match.liveScore,
        after: response.nextScore,
        matchWinner: response.matchWinner,
        name: match.sideDisplayName
      ))
    }
    if var match {
      match.liveScore = response.nextScore
      if let winner = response.matchWinner {
        match.status = .pendingReport
        match.winner = winner
      }
      match.hasUndoSnapshot = true
      self.match = match
    }
    let showTips = tipsEnabledForUser && (match?.tipsEnabled ?? true)
    currentTip = showTips ? TipTrigger.primary(of: response.tips)?.tip : nil
  }

  private func emitFeedback(_ kind: ScoringFeedback.Kind, _ announcement: String) {
    feedbackCount += 1
    lastFeedback = ScoringFeedback(id: feedbackCount, kind: kind, announcement: announcement)
  }

  /// What VoiceOver says after a point: the new game score, or the game, set,
  /// or match it decided. "Point to Ann Smith. 30 – 15", "Ann Smith wins the
  /// game. Games 4-2", "Ann Smith wins the set. Sets 1-0", or "Ann Smith wins
  /// the match, 6-4, 6-3".
  static func pointAnnouncement(
    scorer: Player,
    before: LiveScore,
    after: LiveScore,
    matchWinner: Player?,
    name: (Player) -> String
  ) -> String {
    if let matchWinner {
      return "\(name(matchWinner)) wins the match, \(ScoreEngine.formatScoreDisplay(after))."
    }
    let setsBefore = before.setsWon(by: .player1) + before.setsWon(by: .player2)
    let setsAfter = after.setsWon(by: .player1) + after.setsWon(by: .player2)
    if setsAfter > setsBefore {
      return "\(name(scorer)) wins the set. Sets \(after.setsWon(by: .player1))-\(after.setsWon(by: .player2))."
    }
    let gamesBefore = before.currentSetScore.player1Games + before.currentSetScore.player2Games
    let gamesAfter = after.currentSetScore.player1Games + after.currentSetScore.player2Games
    if gamesAfter > gamesBefore {
      return "\(name(scorer)) wins the game. Games \(after.currentSetScore.player1Games)-\(after.currentSetScore.player2Games)."
    }
    if after.isTiebreak {
      return "Point to \(name(scorer)). Tiebreak \(ScoreEngine.formatGameScore(after))."
    }
    return "Point to \(name(scorer)). \(ScoreEngine.formatGameScore(after))."
  }
}

/// One point or undo the phone applied, for haptics and announcements.
public struct ScoringFeedback: Equatable, Sendable {
  public enum Kind: Sendable { case point, undo }

  /// Distinct for every action, so two identical points are two events.
  public let id: Int
  public let kind: Kind
  public let announcement: String
}
