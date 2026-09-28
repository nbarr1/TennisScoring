import Foundation
import TennisCore
import WatchConnectivity

/// The phone's end of the WatchConnectivity session.
///
/// The open match screen publishes a `WatchScoreSnapshot` whenever its score
/// changes and consumes `commands()`. Commands arrive only while a match screen
/// is listening, and the screen's model rejects any whose `matchId` is not its
/// own, so a watch still showing an earlier match cannot score this one.
final class PhoneWatchConnector: NSObject, WCSessionDelegate, @unchecked Sendable {
  static let shared = PhoneWatchConnector()

  // Guarded by `lock`: WatchConnectivity calls the delegate on a background queue.
  private let lock = NSLock()
  private var commandContinuation: AsyncStream<WatchCommand>.Continuation?
  private var commandStreamId: UUID?
  private var pendingSnapshot: [String: String]?

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
  func commands() -> AsyncStream<WatchCommand> {
    AsyncStream { continuation in
      let id = UUID()
      let previous = lock.withLock { () -> AsyncStream<WatchCommand>.Continuation? in
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
    guard WCSession.isSupported() else { return }
    let session = WCSession.default
    guard session.activationState == .activated else {
      lock.withLock { pendingSnapshot = message }
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

  // MARK: - WCSessionDelegate

  func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
    guard activationState == .activated else { return }
    let pending = lock.withLock { () -> [String: String]? in
      defer { pendingSnapshot = nil }
      return pendingSnapshot
    }
    if let pending { send(pending, on: session) }
  }

  func sessionDidBecomeInactive(_ session: WCSession) {}

  /// Called when the user switches to a different watch; activating again
  /// connects to the new one.
  func sessionDidDeactivate(_ session: WCSession) {
    session.activate()
  }

  func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
    guard let command = WatchCommand(message: message) else { return }
    let continuation = lock.withLock { commandContinuation }
    continuation?.yield(command)
  }
}
