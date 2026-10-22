import Foundation
import Observation
import TennisCore
import WatchConnectivity

/// The watch's end of the WatchConnectivity session. Receives score snapshots
/// from the phone and sends points and undos back, tagged with the match they
/// are for, and waits for the phone to say it applied each one.
@MainActor
@Observable
final class WatchSessionManager: NSObject {
  static let shared = WatchSessionManager()

  /// How long a command waits for the phone's answer before it counts as not
  /// applied. A scored point normally answers within a second.
  static let replyTimeout: Duration = .seconds(5)

  /// A snapshot older than this, replayed from the application context at
  /// launch, is shown but does not start a workout: the match it describes has
  /// had no update for as long as the workout's own idle timeout.
  static let liveSnapshotMaxAge: TimeInterval = 5 * 60

  /// The outcome of one command, for the tap's haptic and announcement. A new
  /// value for every command, so two failures in a row are two events.
  struct CommandResult: Equatable {
    let id = UUID()
    let command: WatchCommand
    let applied: Bool
  }

  private(set) var snapshot: WatchScoreSnapshot?
  /// When the phone sent `snapshot`, or nil when its message carried no time
  /// (the React Native module's do not). The screen uses it to say how old a
  /// score replayed from the application context is.
  private(set) var snapshotSentAt: Date?
  private(set) var isReachable = false
  /// The command waiting for the phone's answer. The buttons wait with it.
  private(set) var pendingCommand: WatchCommand?
  private(set) var lastResult: CommandResult?
  /// The last command the phone did not apply, so the screen can say so;
  /// cleared by the next send and by the next snapshot.
  private(set) var failedCommand: WatchCommand?
  /// Records the match as a workout, which also keeps the scoreboard on screen.
  let workout = MatchWorkoutSession()
  @ObservationIgnored private var pendingId: UUID?

  private override init() {
    super.init()
    guard WCSession.isSupported() else { return }
    WCSession.default.delegate = self
    WCSession.default.activate()
  }

  /// Scoring needs a phone to talk to and a snapshot that names its match; a
  /// score-only message from the React Native app is shown read-only.
  var canScore: Bool { isReachable && (snapshot?.canScore ?? false) }
  var canUndo: Bool { isReachable && (snapshot?.canUndo ?? false) }
  var isSending: Bool { pendingCommand != nil }

  func sendPoint(_ scorer: Player) {
    guard canScore, let snapshot else { return }
    send(.point(matchId: snapshot.matchId, scorer: scorer))
  }

  func sendUndo() {
    guard canUndo, let snapshot else { return }
    send(.undo(matchId: snapshot.matchId))
  }

  private func send(_ command: WatchCommand) {
    guard pendingId == nil else { return }
    let session = WCSession.default
    // `canScore` is cached state; the session may have gone since.
    guard session.activationState == .activated, session.isReachable else {
      complete(command, applied: false)
      return
    }
    let id = UUID()
    pendingId = id
    pendingCommand = command
    failedCommand = nil
    // WatchConnectivity calls both handlers on a background queue, so they are
    // explicitly nonisolated and hop back to the main actor.
    session.sendMessage(
      command.message,
      replyHandler: { @Sendable reply in
        let applied = WatchCommand.isApplied(reply)
        Task { @MainActor in self.finish(id, applied: applied) }
      },
      errorHandler: { @Sendable _ in
        Task { @MainActor in self.finish(id, applied: false) }
      }
    )
    Task { [weak self] in
      try? await Task.sleep(for: Self.replyTimeout)
      self?.finish(id, applied: false)
    }
  }

  /// The first answer for a command wins: the reply, the error, or the timeout.
  private func finish(_ id: UUID, applied: Bool) {
    guard pendingId == id, let command = pendingCommand else { return }
    pendingId = nil
    pendingCommand = nil
    complete(command, applied: applied)
  }

  private func complete(_ command: WatchCommand, applied: Bool) {
    failedCommand = applied ? nil : command
    lastResult = CommandResult(command: command, applied: applied)
  }

  fileprivate func receive(_ message: [String: Any]) {
    if let removed = WatchScoreSnapshot.removedMatchId(in: message) {
      guard snapshot == nil || snapshot?.matchId == removed else { return }
      snapshot = nil
      snapshotSentAt = nil
      failedCommand = nil
      workout.snapshotReceived(live: false)
      return
    }
    guard let snapshot = WatchScoreSnapshot(message: message) else { return }
    self.snapshot = snapshot
    let sentAt = WatchScoreSnapshot.sentAt(in: message)
    snapshotSentAt = sentAt
    failedCommand = nil
    // A player opening their own scheduled match is the moment to ask for
    // Health access, before the first point rather than over it.
    if snapshot.isParticipant && snapshot.status == .scheduled { workout.prepare() }
    // Live means in progress, scoreable from this watch, and fresh. A
    // spectator's snapshot, the read-only one the phone sends when it leaves
    // the match screen, and an old one the application context replays at
    // launch must not start a workout.
    let age = sentAt.map { Date().timeIntervalSince($0) }
    let fresh = age.map { $0 < Self.liveSnapshotMaxAge } ?? false
    workout.snapshotReceived(live: snapshot.status == .inProgress && snapshot.canScore && fresh)
  }

  fileprivate func reachabilityChanged(_ reachable: Bool) {
    isReachable = reachable
  }
}

extension WatchSessionManager: WCSessionDelegate {
  nonisolated func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
    let reachable = session.isReachable
    // The phone updates the application context on every change, so it holds
    // the latest snapshot (or removal) even when the watch app was closed.
    let context = session.receivedApplicationContext.compactMapValues { $0 as? String }
    Task { @MainActor in
      self.reachabilityChanged(reachable)
      if !context.isEmpty { self.receive(context) }
    }
  }

  nonisolated func sessionReachabilityDidChange(_ session: WCSession) {
    let reachable = session.isReachable
    Task { @MainActor in self.reachabilityChanged(reachable) }
  }

  nonisolated func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
    let strings = message.compactMapValues { $0 as? String }
    Task { @MainActor in self.receive(strings) }
  }

  nonisolated func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
    let strings = applicationContext.compactMapValues { $0 as? String }
    Task { @MainActor in self.receive(strings) }
  }
}
