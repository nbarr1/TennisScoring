import Foundation
import HealthKit

/// Keeps the scoreboard on screen during a live match by running a tennis
/// workout session. Without one, watchOS returns to the watch face whenever the
/// wrist drops, so the player raises their wrist to the clock between points.
///
/// The session only holds the app in front: it collects no samples and saves no
/// workout to Health. It starts on the first snapshot of a live match this watch can score, and ends
/// when the match is no longer live, or after `idleTimeout` with no snapshot,
/// which covers a phone that closed the match screen mid-match.
@MainActor
final class MatchWorkoutSession: NSObject {
  static let idleTimeout: Duration = .seconds(5 * 60)

  private let healthStore = HKHealthStore()
  private var session: HKWorkoutSession?
  private var authorizationRequested = false
  private var idleTask: Task<Void, Never>?

  /// Called with every snapshot from the phone.
  func snapshotReceived(live: Bool) {
    idleTask?.cancel()
    idleTask = nil
    guard live else {
      end()
      return
    }
    idleTask = Task { [weak self] in
      try? await Task.sleep(for: Self.idleTimeout)
      guard !Task.isCancelled else { return }
      self?.end()
    }
    if session == nil { Task { await start() } }
  }

  private func start() async {
    guard HKHealthStore.isHealthDataAvailable() else { return }
    // Starting a workout session needs permission to write workouts, even
    // though this one never saves any. Players asked once, on their first live
    // match; a player who declines keeps the default screen behavior.
    if !authorizationRequested {
      authorizationRequested = true
      try? await healthStore.requestAuthorization(toShare: [HKObjectType.workoutType()], read: [])
    }
    guard healthStore.authorizationStatus(for: HKObjectType.workoutType()) == .sharingAuthorized else { return }
    // The match may have ended, or another start won, while the prompt was up.
    guard session == nil, idleTask != nil else { return }

    let configuration = HKWorkoutConfiguration()
    configuration.activityType = .tennis
    configuration.locationType = .unknown
    do {
      let session = try HKWorkoutSession(healthStore: healthStore, configuration: configuration)
      session.delegate = self
      self.session = session
      session.startActivity(with: Date())
    } catch {
      self.session = nil
    }
  }

  private func end() {
    idleTask?.cancel()
    idleTask = nil
    guard let session else { return }
    self.session = nil
    session.end()
  }

  fileprivate func sessionStopped(_ stopped: ObjectIdentifier) {
    if let session, ObjectIdentifier(session) == stopped { self.session = nil }
  }
}

extension MatchWorkoutSession: HKWorkoutSessionDelegate {
  nonisolated func workoutSession(
    _ workoutSession: HKWorkoutSession,
    didChangeTo toState: HKWorkoutSessionState,
    from fromState: HKWorkoutSessionState,
    date: Date
  ) {
    guard toState == .ended || toState == .stopped else { return }
    // HealthKit can end a session on its own (another workout app starting,
    // for one); forgetting it lets the next live snapshot start a new one.
    let stopped = ObjectIdentifier(workoutSession)
    Task { @MainActor in self.sessionStopped(stopped) }
  }

  nonisolated func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
    let stopped = ObjectIdentifier(workoutSession)
    Task { @MainActor in self.sessionStopped(stopped) }
  }
}
