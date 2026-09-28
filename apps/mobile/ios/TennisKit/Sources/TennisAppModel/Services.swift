import Foundation
import TennisCore

// The seams between the view models and the backend. The app target supplies
// Firebase implementations; `DemoBackend` supplies an in-memory one for previews,
// tests, and simulator runs without a `GoogleService-Info.plist`.
//
// Streams emit the current value first and then every change, the way a
// Firestore snapshot listener does, and finish (or throw) when the listener does.

/// The signed-in Firebase Auth account.
public struct AuthAccount: Equatable, Sendable {
  public let uid: String
  public let email: String?

  public init(uid: String, email: String?) {
    self.uid = uid
    self.email = email
  }
}

/// An error with a message fit to show the player.
public struct ServiceError: LocalizedError, Equatable, Sendable {
  public let message: String

  public init(_ message: String) { self.message = message }

  public var errorDescription: String? { message }
}

public protocol AuthService: Sendable {
  func accountChanges() -> AsyncStream<AuthAccount?>
  func signIn(email: String, password: String) async throws
  func signOut() throws
}

public protocol UserRepository: Sendable {
  func observeUser(id: String) -> AsyncThrowingStream<User?, Error>
}

/// Writes a player can make to a match, other than scoring a point.
public enum MatchAction: Equatable, Sendable {
  case start(matchId: String, server: Player)
  case undoLastPoint(matchId: String)
  case acceptProposal(matchId: String)
  /// Declining an incoming proposal and withdrawing your own are the same write.
  case declineProposal(matchId: String)
  case submitReport(matchId: String, submittedBy: String)
  case confirmReport(matchId: String, confirmedBy: String)
  case disputeReport(matchId: String, disputedBy: String)
}

/// The `scoreMatchPoint` callable's response.
public struct ScorePointResponse: Decodable, Equatable, Sendable {
  public var nextScore: LiveScore
  public var matchWinner: Player?
  public var tips: [TipTrigger]

  public init(nextScore: LiveScore, matchWinner: Player? = nil, tips: [TipTrigger] = []) {
    self.nextScore = nextScore
    self.matchWinner = matchWinner
    self.tips = tips
  }

  enum CodingKeys: String, CodingKey { case nextScore, matchWinner, tips }

  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    nextScore = try c.decode(LiveScore.self, forKey: .nextScore)
    matchWinner = try? c.decodeIfPresent(Player.self, forKey: .matchWinner)
    // A trigger this build does not know is dropped rather than failing the point.
    let raw = (try? c.decodeIfPresent([String].self, forKey: .tips)) ?? []
    tips = raw.compactMap(TipTrigger.init(rawValue:))
  }
}

public protocol MatchRepository: Sendable {
  /// Every match the player is in, newest first.
  func observeMatches(playerId: String) -> AsyncThrowingStream<[Match], Error>
  func observeMatch(id: String) -> AsyncThrowingStream<Match?, Error>
  /// Scores through the server, which is authoritative for live scores.
  func scorePoint(matchId: String, scorer: Player) async throws -> ScorePointResponse
  func perform(_ action: MatchAction) async throws
}

public protocol RankingRepository: Sendable {
  func observeRankings(divisionId: String) -> AsyncThrowingStream<[PlayerRanking], Error>
  func observeDoublesRankings(divisionId: String) -> AsyncThrowingStream<[DoublesTeamRanking], Error>
  func observeLevels(divisionId: String) -> AsyncThrowingStream<[DivisionLevel], Error>
}

public protocol DivisionService: Sendable {
  /// Calls `joinDivisionByCode`, which adds the player and sets their `divisionId`.
  func joinDivision(inviteCode: String) async throws
}

/// Everything the app needs from the backend.
public struct AppServices: Sendable {
  public let auth: any AuthService
  public let users: any UserRepository
  public let matches: any MatchRepository
  public let rankings: any RankingRepository
  public let divisions: any DivisionService
  public let messaging: any MessagingRepository
  /// True for the in-memory backend, so the UI can say it is showing demo data.
  public let isDemo: Bool

  public init(
    auth: any AuthService,
    users: any UserRepository,
    matches: any MatchRepository,
    rankings: any RankingRepository,
    divisions: any DivisionService,
    messaging: any MessagingRepository,
    isDemo: Bool = false
  ) {
    self.auth = auth
    self.users = users
    self.matches = matches
    self.rankings = rankings
    self.divisions = divisions
    self.messaging = messaging
    self.isDemo = isDemo
  }
}
