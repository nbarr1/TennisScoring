import ExpoModulesCore
import WatchConnectivity

// Expo Module that bridges WatchConnectivity to TypeScript.
// The React Native scoring screen calls sendScore() after each Firestore update,
// and listens for onWatchScoreInput events when the watch sends a point.
public class AppleWatchModule: Module, WCSessionDelegate {
  private var session: WCSession?

  public func definition() -> ModuleDefinition {
    Name("AppleWatch")

    Events("onWatchScoreInput", "onWatchConnected", "onWatchDisconnected")

    OnCreate {
      if WCSession.isSupported() {
        let session = WCSession.default
        session.delegate = self
        session.activate()
        self.session = session
      }
    }

    // Send current live score to the Apple Watch
    Function("sendScore") { (scoreJson: String) in
      guard let session = self.session, session.activationState == .activated else { return }
      let message = ["score": scoreJson]
      if session.isReachable {
        session.sendMessage(message, replyHandler: nil, errorHandler: nil)
      } else {
        try? session.updateApplicationContext(message)
      }
    }

    // Check if a watch is paired and reachable
    Function("isWatchConnected") { () -> Bool in
      return self.session?.isPaired == true && self.session?.isWatchAppInstalled == true
    }
  }

  // MARK: - WCSessionDelegate

  public func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
    if activationState == .activated {
      sendEvent("onWatchConnected", ["paired": session.isPaired, "installed": session.isWatchAppInstalled])
    }
  }

  public func sessionDidBecomeInactive(_ session: WCSession) {}
  public func sessionDidDeactivate(_ session: WCSession) {
    session.activate()
  }

  // Receive point input from the watch
  public func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
    if let action = message["action"] as? String, action == "point",
       let player = message["player"] as? String {
      sendEvent("onWatchScoreInput", ["player": player])
    }
  }
}
