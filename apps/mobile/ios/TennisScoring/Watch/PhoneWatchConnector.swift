import Foundation
import TennisCore
import WatchConnectivity

/// A command from the watch and the way to answer it. `reply(true)` tells the
/// watch the phone applied it, which is when the watch confirms the tap; any
/// other outcome must call `reply(false)`, so the wrist never clicks for a point
/// the phone discarded.
struct IncomingWatchCommand: Sendable {
  let command: WatchCommand
  let reply: @Sendable (Bool) -> Void
}

/// The phone's end of the WatchConnectivity session.
///
/// The open match screen publishes a `WatchScoreSnapshot` whenever its match
/// changes, in every status, and consumes `commands()`. Commands arrive only
/// while a match screen is listening, and the screen's model rejects any whose
/// `matchId` is not its own, so a watch still showing an earlier match cannot
/// score this one. Every command is answered, applied or not.
final class PhoneWatchConnector: NSObject, WCSessionDelegate, @unchecked Sendable {
  static let shared = PhoneWatchConnector()

  // Guarded by `lock`: WatchConnectivity calls the delegate on a background queue.
  private let lock = NSLock()
  private var commandContinuation: AsyncStream<IncomingWatchCommand>.Continuation?
  private var commandStreamId: UUID?
  private var pendingMessage: [String: String]?

  private override init() {
    super.init()
  }

  func activate() {
    guard WCSession.isSupported() else { return }
    WCSession.default.delegate = self
    WCSession.default.activate()
  }

  /// Commands from the watch, for as long as the caller iterates. A new call
  /// replaces the previous listener, since only one match screen is on top.
  func commands() -> AsyncStream<IncomingWatchCommand> {
    AsyncStream { continuation in
      let id = UUID()
      let previous = lock.withLock { () -> AsyncStream<IncomingWatchCommand>.Continuation? in
        defer {
          commandContinuation = continuation
          commandStreamId = id
        }
        return commandContinuation
      }
      previous?.finish()
      continuation.onTermination = { [weak self] _ in
        self?.lock.withLock {
          if self?.commandStreamId == id {
            self?.commandContinuation = nil
            self?.commandStreamId = nil
          }
        }
      }
    }
  }

  /// Sends the score to the watch: as application context, so a watch that
  /// wakes later still gets the latest state, and as a message when the watch is
  /// reachable, so an open watch app updates at once.
  func publish(_ snapshot: WatchScoreSnapshot) {
    guard let message = try? snapshot.message() else { return }
    deliver(message)
  }

  /// Tells the watch the match it shows was deleted, so it stops showing it
  /// (and replaying it from the application context at every launch).
  func publishRemoval(matchId: String) {
    deliver(WatchScoreSnapshot.removalMessage(matchId: matchId))
  }

  private func deliver(_ message: [String: String]) {
    guard WCSession.isSupported() else { return }
    let session = WCSession.default
    guard session.activationState == .activated else {
      lock.withLock { pendingMessage = message }
      return
    }
    send(message, on: session)
  }

  private func send(_ message: [String: String], on session: WCSession) {
    guard session.isPaired, session.isWatchAppInstalled else { return }
    try? session.updateApplicationContext(message)
    if session.isReachable {
      session.sendMessage(message, replyHandler: nil, errorHandler: nil)
    }
  }

  private func dispatch(_ message: [String: Any], reply: @escaping @Sendable (Bool) -> Void) {
    guard let command = WatchCommand(message: message) else {
      reply(false)
      return
    }
    let continuation = lock.withLock { commandContinuation }
    guard let continuation else {
      // No match screen is open, so nothing will apply it.
      reply(false)
      return
    }
    switch continuation.yield(IncomingWatchCommand(command: command, reply: reply)) {
    case .enqueued: break
    default: reply(false)
    }
  }

  // MARK: - WCSessionDelegate

  func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
    guard activationState == .activated else { return }
    let pending = lock.withLock { () -> [String: String]? in
      defer { pendingMessage = nil }
      return pendingMessage
    }
    if let pending { send(pending, on: session) }
  }

  func sessionDidBecomeInactive(_ session: WCSession) {}

  /// Called when the user switches to a different watch; activating again
  /// connects to the new one.
  func sessionDidDeactivate(_ session: WCSession) {
    session.activate()
  }

  /// The watch sends every command with a reply handler and waits for the
  /// answer before confirming the tap.
  func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
    let answer = ReplyOnce(replyHandler)
    dispatch(message) { applied in answer.send(applied) }
  }

  func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
    dispatch(message) { _ in }
  }
}

/// Answers a WatchConnectivity reply handler exactly once, from whichever
/// thread the command finishes on.
private final class ReplyOnce: @unchecked Sendable {
  private let lock = NSLock()
  private var handler: (([String: Any]) -> Void)?

  init(_ handler: @escaping ([String: Any]) -> Void) {
    self.handler = handler
  }

  func send(_ applied: Bool) {
    let handler = lock.withLock { () -> (([String: Any]) -> Void)? in
      defer { self.handler = nil }
      return self.handler
    }
    handler?(WatchCommand.replyMessage(applied: applied))
  }
}
