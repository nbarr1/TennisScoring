#if canImport(FirebaseCore) && canImport(FirebaseAuth) && canImport(FirebaseFirestore) && canImport(FirebaseFunctions)
import FirebaseAuth
import FirebaseFirestore
import FirebaseFunctions
import Foundation
import TennisAppModel
import TennisCore

// Firebase implementations of the TennisAppModel service protocols.
//
// This file compiles only when the Firebase packages are linked, so
// `scripts/ios-typecheck.sh` (which has no Firebase modules) skips it; it is
// checked when the Xcode project builds. Every write mirrors the one the React
// Native client makes in `packages/firebase-client`, so Firestore rules and Cloud
// Functions see identical documents from both apps.

enum FirebaseServices {
  static func make() -> AppServices {
    let db = Firestore.firestore()
    let functions = Functions.functions()
    return AppServices(
      auth: FirebaseAuthService(),
      users: FirestoreUserRepository(db: db),
      matches: FirestoreMatchRepository(db: db, functions: functions),
      rankings: FirestoreRankingRepository(db: db),
      divisions: FunctionsDivisionService(functions: functions)
    )
  }
}

/// Wraps a Firebase listener handle so it can be released from a `@Sendable`
/// termination handler. The handles are thread-safe to remove.
private final class ListenerBox: @unchecked Sendable {
  private let remove: () -> Void
  init(_ remove: @escaping () -> Void) { self.remove = remove }
  func cancel() { remove() }
}

private func nowMillis() -> Int64 { Int64((Date().timeIntervalSince1970 * 1000).rounded()) }

// MARK: - Auth

final class FirebaseAuthService: AuthService {
  func accountChanges() -> AsyncStream<AuthAccount?> {
    AsyncStream { continuation in
      let handle = Auth.auth().addStateDidChangeListener { _, user in
        continuation.yield(user.map { AuthAccount(uid: $0.uid, email: $0.email) })
      }
      let box = ListenerBox { Auth.auth().removeStateDidChangeListener(handle) }
      continuation.onTermination = { _ in box.cancel() }
    }
  }

  func signIn(email: String, password: String) async throws {
    do {
      _ = try await Auth.auth().signIn(withEmail: email, password: password)
    } catch {
      throw ServiceError(Self.message(for: error))
    }
  }

  func signOut() throws {
    try Auth.auth().signOut()
  }

  /// Firebase Auth's documented error codes. Matching the raw values keeps this
  /// independent of how a given SDK version spells `AuthErrorCode` in Swift (a
  /// struct with a nested `Code` enum before Firebase 11, an enum after).
  private enum AuthCode {
    static let domain = "FIRAuthErrorDomain"
    static let invalidCredential = 17004
    static let userDisabled = 17005
    static let invalidEmail = 17008
    static let wrongPassword = 17009
    static let tooManyRequests = 17010
    static let userNotFound = 17011
    static let networkError = 17020
  }

  private static func message(for error: Error) -> String {
    let nsError = error as NSError
    guard nsError.domain == AuthCode.domain else { return error.localizedDescription }
    switch nsError.code {
    case AuthCode.wrongPassword, AuthCode.invalidCredential, AuthCode.userNotFound:
      return "That email and password don't match an account."
    case AuthCode.invalidEmail:
      return "Enter a valid email address."
    case AuthCode.userDisabled:
      return "This account has been disabled. Contact your division leader."
    case AuthCode.tooManyRequests:
      return "Too many attempts. Wait a moment and try again."
    case AuthCode.networkError:
      return "No connection. Check your network and try again."
    default:
      return error.localizedDescription
    }
  }
}

// MARK: - Users

final class FirestoreUserRepository: UserRepository, @unchecked Sendable {
  private let db: Firestore

  init(db: Firestore) { self.db = db }

  func observeUser(id: String) -> AsyncThrowingStream<User?, Error> {
    AsyncThrowingStream { continuation in
      let registration = db.collection("users").document(id).addSnapshotListener { snapshot, error in
        if let error {
          continuation.finish(throwing: error)
          return
        }
        guard let snapshot, snapshot.exists else {
          continuation.yield(nil)
          return
        }
        do {
          var user = try snapshot.data(as: User.self)
          user.id = snapshot.documentID
          continuation.yield(user)
        } catch {
          continuation.finish(throwing: error)
        }
      }
      let box = ListenerBox { registration.remove() }
      continuation.onTermination = { _ in box.cancel() }
    }
  }
}

// MARK: - Matches

final class FirestoreMatchRepository: MatchRepository, @unchecked Sendable {
  private let db: Firestore
  private let functions: Functions

  init(db: Firestore, functions: Functions) {
    self.db = db
    self.functions = functions
  }

  private func matchRef(_ id: String) -> DocumentReference { db.collection("matches").document(id) }

  /// Same query as `playerMatchesQuery`, so it uses the existing composite index.
  func observeMatches(playerId: String) -> AsyncThrowingStream<[Match], Error> {
    AsyncThrowingStream { continuation in
      let registration = db.collection("matches")
        .whereField("playerIds", arrayContains: playerId)
        .order(by: "createdAt", descending: true)
        .limit(to: 200)
        .addSnapshotListener { snapshot, error in
          if let error {
            continuation.finish(throwing: error)
            return
          }
          // A document that cannot be decoded is skipped rather than hiding
          // every other match.
          let matches = (snapshot?.documents ?? []).compactMap { document -> Match? in
            guard var match = try? document.data(as: Match.self) else { return nil }
            match.id = document.documentID
            return match
          }
          continuation.yield(matches)
        }
      let box = ListenerBox { registration.remove() }
      continuation.onTermination = { _ in box.cancel() }
    }
  }

  func observeMatch(id: String) -> AsyncThrowingStream<Match?, Error> {
    AsyncThrowingStream { continuation in
      let registration = matchRef(id).addSnapshotListener { snapshot, error in
        if let error {
          continuation.finish(throwing: error)
          return
        }
        guard let snapshot, snapshot.exists else {
          continuation.yield(nil)
          return
        }
        do {
          var match = try snapshot.data(as: Match.self)
          match.id = snapshot.documentID
          continuation.yield(match)
        } catch {
          continuation.finish(throwing: error)
        }
      }
      let box = ListenerBox { registration.remove() }
      continuation.onTermination = { _ in box.cancel() }
    }
  }

  func scorePoint(matchId: String, scorer: Player) async throws -> ScorePointResponse {
    let result = try await functions.httpsCallable("scoreMatchPoint").call([
      "matchId": matchId,
      "scorer": scorer.rawValue,
    ])
    guard JSONSerialization.isValidJSONObject(result.data) else {
      throw ServiceError("The server returned an unexpected score.")
    }
    let data = try JSONSerialization.data(withJSONObject: result.data)
    return try JSONDecoder().decode(ScorePointResponse.self, from: data)
  }

  func perform(_ action: MatchAction) async throws {
    switch action {
    case let .start(matchId, server):
      // Mirrors `startMatch` without a supplied score.
      let now = nowMillis()
      try await matchRef(matchId).updateData([
        "status": MatchStatus.inProgress.rawValue,
        "startedAt": now,
        "currentSetStartedAt": now,
        "advancedStatsEnabled": false,
        "liveScore.server": server.rawValue,
      ])
    case let .undoLastPoint(matchId):
      try await undoLastPoint(matchId)
    case let .acceptProposal(matchId):
      try await matchRef(matchId).updateData(["status": MatchStatus.scheduled.rawValue])
    case let .declineProposal(matchId):
      try await matchRef(matchId).updateData(["status": MatchStatus.cancelled.rawValue])
    case let .submitReport(matchId, submittedBy):
      try await matchRef(matchId).updateData([
        "reportSubmission": [
          "submittedBy": submittedBy,
          "submittedAt": nowMillis(),
          "status": ReportSubmission.Status.pendingConfirmation.rawValue,
        ],
      ])
    case let .confirmReport(matchId, confirmedBy):
      try await matchRef(matchId).updateData([
        "status": MatchStatus.completed.rawValue,
        "reportSubmission.status": ReportSubmission.Status.confirmed.rawValue,
        "reportSubmission.confirmedBy": confirmedBy,
        "reportSubmission.confirmedAt": nowMillis(),
      ])
    case let .disputeReport(matchId, disputedBy):
      try await matchRef(matchId).updateData([
        "status": MatchStatus.disputed.rawValue,
        "reportSubmission.status": ReportSubmission.Status.disputed.rawValue,
        "reportSubmission.disputedBy": disputedBy,
        "reportSubmission.disputedAt": nowMillis(),
      ])
    }
  }

  /// Restores the server's undo snapshot, as `undoLastPoint` does, but inside a
  /// transaction: the snapshot is read and applied atomically, so a point the
  /// opponent scored in between is never silently overwritten with a stale one.
  /// The snapshot is written back as raw data, so the stats it carries survive
  /// without this client having to model them.
  private func undoLastPoint(_ matchId: String) async throws {
    let ref = matchRef(matchId)
    _ = try await db.runTransaction { (transaction, errorPointer) -> Any? in
      do {
        let snapshot = try transaction.getDocument(ref)
        guard let undo = snapshot.data()?["undoSnapshot"] as? [String: Any],
              let liveScore = undo["liveScore"], let status = undo["status"]
        else {
          errorPointer?.pointee = NSError(
            domain: "TennisScoring", code: 1,
            userInfo: [NSLocalizedDescriptionKey: "There is no point to undo."]
          )
          return nil
        }
        var updates: [String: Any] = [
          "liveScore": liveScore,
          "status": status,
          "undoSnapshot": FieldValue.delete(),
        ]
        if let stats = undo["stats"] { updates["stats"] = stats }
        for key in ["winner", "completedAt", "currentSetStartedAt", "matchDurationMs"] {
          updates[key] = undo[key] ?? FieldValue.delete()
        }
        transaction.updateData(updates, forDocument: ref)
      } catch {
        errorPointer?.pointee = error as NSError
      }
      return nil
    }
  }
}

// MARK: - Rankings

final class FirestoreRankingRepository: RankingRepository, @unchecked Sendable {
  private let db: Firestore

  init(db: Firestore) { self.db = db }

  func observeRankings(divisionId: String) -> AsyncThrowingStream<[PlayerRanking], Error> {
    observe(divisionId: divisionId, collection: "rankings") { try? $0.data(as: PlayerRanking.self) }
  }

  func observeDoublesRankings(divisionId: String) -> AsyncThrowingStream<[DoublesTeamRanking], Error> {
    observe(divisionId: divisionId, collection: "doublesRankings") { try? $0.data(as: DoublesTeamRanking.self) }
  }

  func observeLevels(divisionId: String) -> AsyncThrowingStream<[DivisionLevel], Error> {
    observe(divisionId: divisionId, collection: "levels") { document in
      guard var level = try? document.data(as: DivisionLevel.self) else { return nil }
      level.id = document.documentID
      return level
    }
  }

  private func observe<T: Sendable>(
    divisionId: String,
    collection: String,
    decode: @escaping (QueryDocumentSnapshot) -> T?
  ) -> AsyncThrowingStream<[T], Error> {
    AsyncThrowingStream { continuation in
      let registration = db.collection("divisions").document(divisionId).collection(collection)
        .addSnapshotListener { snapshot, error in
          if let error {
            continuation.finish(throwing: error)
            return
          }
          continuation.yield((snapshot?.documents ?? []).compactMap(decode))
        }
      let box = ListenerBox { registration.remove() }
      continuation.onTermination = { _ in box.cancel() }
    }
  }
}

// MARK: - Divisions

final class FunctionsDivisionService: DivisionService, @unchecked Sendable {
  private let functions: Functions

  init(functions: Functions) { self.functions = functions }

  func joinDivision(inviteCode: String) async throws {
    // The callable's messages ("Invalid invite code.") are written for players,
    // so they pass through unchanged.
    _ = try await functions.httpsCallable("joinDivisionByCode").call(["inviteCode": inviteCode])
  }
}
#endif
