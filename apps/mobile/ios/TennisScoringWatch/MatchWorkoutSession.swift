import Foundation
import HealthKit
import Observation

/// Records a tennis workout during a live match the player is scoring. Besides
/// saving the match to Health (with heart rate and active energy, and ring
/// credit), the running workout session keeps the scoreboard on screen:
/// without one, watchOS returns to the watch face whenever the wrist drops.
///
/// The workout starts on the first snapshot of a live match this watch can
/// score, and ends when the match is no longer live, or after `idleTimeout`
/// with no snapshot, which covers a phone that closed the match screen
/// mid-match. A workout shorter than `minimumDuration` is discarded rather than
/// saved: that is a match opened and closed again, not one that was played.
@MainActor
@Observable
final class MatchWorkoutSession: NSObject {
  static let idleTimeout: Duration = .seconds(5 * 60)
  static let minimumDuration: TimeInterval = 60

  /// True while a workout is collecting data, for the "Workout recording" line.
  private(set) var isRecording = false
  /// The latest heart rate the workout collected, in beats per minute. Nil
  /// until a reading arrives, and whenever the player has not allowed it.
  private(set) var heartRate: Double?
  /// True from the moment Health access turns out to be denied until the end
  /// of the next live match, once per denial, so the player learns why the
  /// workout is not recording without being told at every match.
  private(set) var showsDeniedNotice = false

  @ObservationIgnored private let healthStore = HKHealthStore()
  @ObservationIgnored private var current: Recording?
  /// Every workout not yet saved or discarded, by session. A workout outlives
  /// `current` while HealthKit finishes ending its session and saving it.
  @ObservationIgnored private var recordings: [ObjectIdentifier: Recording] = [:]
  @ObservationIgnored private var authorizationRequested = false
  @ObservationIgnored private var idleTask: Task<Void, Never>?
  @ObservationIgnored private var lastLiveSnapshot: Date?
  @ObservationIgnored private var noticeSeenLive = false

  private static let deniedNoticeKey = "workoutDeniedNoticeShown"

  private static var shareTypes: Set<HKSampleType> {
    [HKObjectType.workoutType(), HKQuantityType(.activeEnergyBurned)]
  }

  private static var readTypes: Set<HKObjectType> {
    [HKQuantityType(.heartRate), HKQuantityType(.activeEnergyBurned)]
  }

  /// Asks for Health access ahead of a match, so the system prompt appears
  /// while the match is still scheduled rather than over the first point.
  /// Asking again after the player answered shows nothing.
  func prepare() {
    guard !authorizationRequested else { return }
    Task { await requestAuthorization() }
  }

  /// Called with every snapshot from the phone.
  func snapshotReceived(live: Bool) {
    idleTask?.cancel()
    idleTask = nil
    guard live else {
      end(at: Date())
      if showsDeniedNotice && noticeSeenLive {
        showsDeniedNotice = false
        noticeSeenLive = false
      }
      return
    }
    lastLiveSnapshot = Date()
    if showsDeniedNotice { noticeSeenLive = true }
    idleTask = Task { [weak self] in
      try? await Task.sleep(for: Self.idleTimeout)
      guard !Task.isCancelled, let self else { return }
      // Nothing has happened since the last snapshot, so that is when the
      // match was last known to be going on.
      self.end(at: self.lastLiveSnapshot ?? Date())
    }
    if current == nil { Task { await start() } }
  }

  private func requestAuthorization() async {
    guard HKHealthStore.isHealthDataAvailable(), !authorizationRequested else { return }
    authorizationRequested = true
    try? await healthStore.requestAuthorization(toShare: Self.shareTypes, read: Self.readTypes)
    noteAuthorization()
  }

  /// Only the share status of workouts can be read (HealthKit never says
  /// whether reading was allowed), and it is what starting a workout needs.
  private func noteAuthorization() {
    let defaults = UserDefaults.standard
    switch healthStore.authorizationStatus(for: HKObjectType.workoutType()) {
    case .sharingDenied:
      guard !defaults.bool(forKey: Self.deniedNoticeKey) else { return }
      defaults.set(true, forKey: Self.deniedNoticeKey)
      showsDeniedNotice = true
      // Found during a live match: that match is the one it is shown for.
      noticeSeenLive = idleTask != nil
    case .sharingAuthorized:
      // Allowed again, so a later denial is worth one more notice.
      defaults.removeObject(forKey: Self.deniedNoticeKey)
      showsDeniedNotice = false
    default:
      break
    }
  }

  private func start() async {
    guard HKHealthStore.isHealthDataAvailable() else { return }
    // Normally answered already, from `prepare()` on a scheduled match. A
    // match started on the phone before the watch saw it asks here instead.
    await requestAuthorization()
    noteAuthorization()
    guard healthStore.authorizationStatus(for: HKObjectType.workoutType()) == .sharingAuthorized else { return }
    // The match may have ended, or another start won, while the prompt was up.
    guard current == nil, idleTask != nil else { return }

    let configuration = HKWorkoutConfiguration()
    configuration.activityType = .tennis
    configuration.locationType = .unknown
    let session: HKWorkoutSession
    do {
      session = try HKWorkoutSession(healthStore: healthStore, configuration: configuration)
    } catch {
      return
    }
    let builder = session.associatedWorkoutBuilder()
    builder.dataSource = HKLiveWorkoutDataSource(healthStore: healthStore, workoutConfiguration: configuration)
    session.delegate = self
    builder.delegate = self

    let startDate = Date()
    let recording = Recording(session: session, builder: builder, start: startDate)
    recordings[recording.id] = recording
    current = recording
    session.startActivity(with: startDate)
    let id = recording.id
    builder.beginCollection(withStart: startDate) { @Sendable began, _ in
      Task { @MainActor in self.collectionBegan(id, began) }
    }
  }

  private func collectionBegan(_ id: ObjectIdentifier, _ began: Bool) {
    guard let recording = recordings[id] else { return }
    recording.collecting = began
    // Without collection the session still keeps the scoreboard up; it just
    // has nothing to save.
    if current === recording { isRecording = began }
  }

  /// Ends the current workout. Saving happens once HealthKit reports the
  /// session ended (`sessionEnded`).
  private func end(at date: Date) {
    idleTask?.cancel()
    idleTask = nil
    guard let recording = current else { return }
    current = nil
    isRecording = false
    heartRate = nil
    recording.end = date
    recording.session.end()
  }

  fileprivate func sessionEnded(_ id: ObjectIdentifier, at date: Date) {
    guard let recording = recordings[id] else { return }
    if current === recording {
      // HealthKit ended it on its own (another workout app starting, for one);
      // forgetting it lets the next live snapshot start a new one.
      current = nil
      isRecording = false
      heartRate = nil
    }
    if recording.end == nil { recording.end = date }
    finish(recording)
  }

  /// Saves the workout, or discards it if it never collected or was too short
  /// to be a match.
  private func finish(_ recording: Recording) {
    guard !recording.finishing else { return }
    recording.finishing = true
    let end = max(recording.end ?? Date(), recording.start)
    guard recording.collecting, end.timeIntervalSince(recording.start) >= Self.minimumDuration else {
      discard(recording)
      return
    }
    let id = recording.id
    recording.builder.endCollection(withEnd: end) { @Sendable ended, _ in
      Task { @MainActor in self.collectionEnded(id, ended) }
    }
  }

  private func collectionEnded(_ id: ObjectIdentifier, _ ended: Bool) {
    guard let recording = recordings[id] else { return }
    guard ended else {
      discard(recording)
      return
    }
    recording.builder.finishWorkout { @Sendable _, _ in
      Task { @MainActor in self.recordings[id] = nil }
    }
  }

  private func discard(_ recording: Recording) {
    recording.builder.discardWorkout()
    recordings[recording.id] = nil
  }

  fileprivate func heartRateCollected(_ id: ObjectIdentifier, _ bpm: Double) {
    guard let current, current.id == id else { return }
    heartRate = bpm
  }

  /// One workout: its session and builder, and what is known about its span.
  @MainActor
  private final class Recording {
    let session: HKWorkoutSession
    let builder: HKLiveWorkoutBuilder
    let start: Date
    var end: Date?
    var collecting = false
    var finishing = false

    var id: ObjectIdentifier { ObjectIdentifier(session) }

    init(session: HKWorkoutSession, builder: HKLiveWorkoutBuilder, start: Date) {
      self.session = session
      self.builder = builder
      self.start = start
    }
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
    let id = ObjectIdentifier(workoutSession)
    Task { @MainActor in self.sessionEnded(id, at: date) }
  }

  nonisolated func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
    let id = ObjectIdentifier(workoutSession)
    let now = Date()
    Task { @MainActor in self.sessionEnded(id, at: now) }
  }
}

extension MatchWorkoutSession: HKLiveWorkoutBuilderDelegate {
  nonisolated func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder, didCollectDataOf collectedTypes: Set<HKSampleType>) {
    let heartRateType = HKQuantityType(.heartRate)
    guard collectedTypes.contains(heartRateType),
          let bpm = workoutBuilder.statistics(for: heartRateType)?.mostRecentQuantity()?
            .doubleValue(for: HKUnit.count().unitDivided(by: .minute())),
          let session = workoutBuilder.workoutSession
    else { return }
    let id = ObjectIdentifier(session)
    Task { @MainActor in self.heartRateCollected(id, bpm) }
  }

  nonisolated func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}
}
