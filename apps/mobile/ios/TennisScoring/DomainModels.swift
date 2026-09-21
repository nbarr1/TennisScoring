import Foundation

enum Player: String, Codable { case player1, player2; var other: Self { self == .player1 ? .player2 : .player1 } }
enum TennisPoint: String, Codable { case love = "0", fifteen = "15", thirty = "30", forty = "40", advantage = "Ad" }
enum ServiceSide: String, Codable { case deuce, advantage }
enum MatchStatus: String, Codable { case proposed, scheduled, inProgress = "in_progress", pendingReport = "pending_report", completed, disputed, cancelled }
enum UserRole: String, Codable { case player, divisionLeader = "division_leader", admin, appDeveloper = "app_developer" }
struct MatchFormat: Codable, Equatable { var setsToWin = 2; var gamesPerSet = 6; var tiebreakAt = 6; var finalSetTiebreak = true }
struct TiebreakScore: Codable, Equatable { var player1Points = 0; var player2Points = 0 }
struct SetScore: Codable, Equatable { var setNumber: Int; var player1Games = 0; var player2Games = 0; var tiebreak: TiebreakScore?; var winner: Player?; var startedAt: Int64?; var completedAt: Int64?; var durationMs: Int64? }
struct GameScore: Codable, Equatable { var player1 = TennisPoint.love; var player2 = TennisPoint.love }
struct LiveScore: Codable, Equatable { var sets = [SetScore(setNumber: 0)]; var currentSet = 0; var currentGame = GameScore(); var isTiebreak = false; var tiebreakScore: TiebreakScore?; var server = Player.player1; var serviceSide = ServiceSide.deuce; var player1SetsWon = 0; var player2SetsWon = 0 }
struct ContactPreferences: Codable { var allowEmail: Bool; var allowSMS: Bool; var allowInApp: Bool }
struct User: Codable, Identifiable { let id: String; var displayName: String; var email: String; var phone: String?; var avatarUrl: String?; var contactPreferences: ContactPreferences; var divisionId: String?; var role: UserRole; var fcmTokens: [String]; var tipsEnabled: Bool; var tutorialDone: Bool?; var createdAt: Int64; var updatedAt: Int64 }
