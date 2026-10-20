import Foundation
import Observation
import TennisCore
import WatchConnectivity

/// The watch's end of the WatchConnectivity session. Receives score snapshots
/// from the phone and sends points back, tagged with the match they are for.
@MainActor
@Observable
final class WatchSessionManager: NSObject {
  static let shared = WatchSessionManager()

  private(set) var snapshot: WatchScoreSnapshot?
  private(set) var isReachable = false
  /// Set when the last point never reached the phone, so the screen can say so;
  /// cleared by the next send and by the next snapshot.
  private(set) var lastSendFailed = false

  private override init() {
    super.init()
    guard WCSession.isSupported() else { return }
    WCSession.default.delegate = self
    WCSession.default.activate()
  }

  /// Scoring needs a phone to talk to and a snapshot that names its match; a
  /// score-only message from the React Native app is shown read-only.
  var canScore: Bool { isReachable && (snapshot?.canScore ?? false) }

  func sendPoint(_ scorer: Player) {
    guard canScore, let snapshot else { return }
    let session = WCSession.default
    guard session.activationState == .activated, session.isReachable else { return }
    lastSendFailed = false
    // WatchConnectivity calls the error handler on a background queue, so the
    // closure is explicitly nonisolated and hops back to the main actor.
    session.sendMessage(
      WatchCommand.point(matchId: snapshot.matchId, scorer: scorer).message,
      replyHandler: nil,
      errorHandler: { @Sendable _ in
        Task { @MainActor in self.sendFailed() }
      }
    )
  }

  fileprivate func receive(_ message: [String: Any]) {
    if let snapshot = WatchScoreSnapshot(message: message) {
      self.snapshot = snapshot
      lastSendFailed = false
    }
  }

  fileprivate func sendFailed() {
    lastSendFailed = true
  }

  fileprivate func reachabilityChanged(_ reachable: Bool) {
    isReachable = reachable
  }
}

extension WatchSessionManager: WCSessionDelegate {
  nonisolated func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
    let reachable = session.isReachable
    // The phone updates the application context on every score, so it holds the
    // latest snapshot even when the watch app was closed at the time.
    let context = session.receivedApplicationContext as? [String: String] ?? [:]
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
