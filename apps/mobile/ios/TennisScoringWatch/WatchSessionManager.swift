import Foundation
import WatchConnectivity

// Manages WCSession on the watch side. Receives score updates from the phone
// and forwards point inputs back to the phone.
class WatchSessionManager: NSObject, WCSessionDelegate, ObservableObject {
  static let shared = WatchSessionManager()

  @Published var scoreJson: String = ""
  @Published var isConnected: Bool = false

  override init() {
    super.init()
    if WCSession.isSupported() {
      WCSession.default.delegate = self
      WCSession.default.activate()
    }
  }

  // Send a point scored on the watch back to the phone
  func sendPointToPhone(player: String) {
    guard WCSession.default.activationState == .activated else { return }
    WCSession.default.sendMessage(["action": "point", "player": player], replyHandler: nil)
  }

  // MARK: - WCSessionDelegate
  func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
    DispatchQueue.main.async {
      self.isConnected = activationState == .activated
    }
  }

  func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
    if let score = message["score"] as? String {
      DispatchQueue.main.async { self.scoreJson = score }
    }
  }

  func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
    if let score = applicationContext["score"] as? String {
      DispatchQueue.main.async { self.scoreJson = score }
    }
  }
}
