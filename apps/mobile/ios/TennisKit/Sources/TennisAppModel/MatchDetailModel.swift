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

  /// `scoreMatchPoint` accepts only `player1Id` and `player2Id`, so in doubles
  /// only the first-listed player on each side can score. The callable would also
  /// score a `scheduled` match, but it never changes the status, so the match has
  /// to be started first (as the React Native app does) or it would stay listed
  /// as upcoming while being played.
  public var canScore: Bool {
    guard let match, match.status == .inProgress else { return false }
    return userId == match.player1Id || userId == match.player2Id
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

  /// What the watch should show, or nil when there is nothing live to mirror.
  public var watchSnapshot: WatchScoreSnapshot? {
    guard let match, match.status == .scheduled || match.status == .inProgress || match.status == .pendingReport else { return nil }
    return WatchScoreSnapshot(
      matchId: match.id,
      player1Name: match.sideDisplayName(.player1),
      player2Name: match.sideDisplayName(.player2),
      status: match.status,
      score: match.liveScore,
      canScore: canScore
    )
  }

  // MARK: - Observation

  /// Follows the match for as long as the caller's task runs.
  public func observe() async {
    do {
      for try await match in repository.observeMatch(id: matchId) {
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
      self.applyScored(response)
    }
  }

  /// Applies a command from the watch, if it is for this match and scoring is
  /// allowed. Returns whether it was applied.
  @discardableResult
  public func handle(_ command: WatchCommand) async -> Bool {
    guard command.matchId == matchId, canScore, !isWorking else { return false }
    switch command {
    case let .point(_, scorer):
      await score(scorer)
    }
    return errorMessage == nil
  }

  public func start(server: Player) async {
    guard canStart else { return }
    await perform(.start(matchId: matchId, server: server))
  }

  public func undo() async {
    guard canUndo else { return }
    currentTip = nil
    await perform(.undoLastPoint(matchId: matchId))
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
  private func applyScored(_ response: ScorePointResponse) {
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
}
