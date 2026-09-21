package com.companytennisleague.app.domain

enum class Player(val wire: String) { PLAYER1("player1"), PLAYER2("player2"); fun other() = if (this == PLAYER1) PLAYER2 else PLAYER1 }
enum class TennisPoint(val wire: String) { LOVE("0"), FIFTEEN("15"), THIRTY("30"), FORTY("40"), ADVANTAGE("Ad") }
enum class ServiceSide(val wire: String) { DEUCE("deuce"), ADVANTAGE("advantage") }
enum class MatchStatus(val wire: String) { PROPOSED("proposed"), SCHEDULED("scheduled"), IN_PROGRESS("in_progress"), PENDING_REPORT("pending_report"), COMPLETED("completed"), DISPUTED("disputed"), CANCELLED("cancelled") }
enum class UserRole(val wire: String) { PLAYER("player"), DIVISION_LEADER("division_leader"), ADMIN("admin"), APP_DEVELOPER("app_developer"); val privileged get() = this != PLAYER }

data class MatchFormat(val setsToWin: Int = 2, val gamesPerSet: Int = 6, val tiebreakAt: Int = 6, val finalSetTiebreak: Boolean = true)
data class TiebreakScore(val player1Points: Int = 0, val player2Points: Int = 0)
data class SetScore(val setNumber: Int, val player1Games: Int = 0, val player2Games: Int = 0, val tiebreak: TiebreakScore? = null, val winner: Player? = null, val startedAt: Long? = null, val completedAt: Long? = null, val durationMs: Long? = null)
data class GameScore(val player1: TennisPoint = TennisPoint.LOVE, val player2: TennisPoint = TennisPoint.LOVE)
data class LiveScore(val sets: List<SetScore> = listOf(SetScore(0)), val currentSet: Int = 0, val currentGame: GameScore = GameScore(), val isTiebreak: Boolean = false, val tiebreakScore: TiebreakScore? = null, val server: Player = Player.PLAYER1, val serviceSide: ServiceSide = ServiceSide.DEUCE, val player1SetsWon: Int = 0, val player2SetsWon: Int = 0)
data class ContactPreferences(val allowEmail: Boolean = true, val allowSMS: Boolean = false, val allowInApp: Boolean = true)
data class User(val id: String, val displayName: String, val email: String, val phone: String? = null, val avatarUrl: String? = null, val contactPreferences: ContactPreferences, val divisionId: String? = null, val role: UserRole, val fcmTokens: List<String> = emptyList(), val tipsEnabled: Boolean = true, val tutorialDone: Boolean? = null, val createdAt: Long, val updatedAt: Long)
data class Match(val id: String, val divisionId: String, val seasonId: String? = null, val divisionLevelId: String? = null, val player1Id: String, val player2Id: String, val player1Name: String? = null, val player2Name: String? = null, val playerIds: List<String>, val format: MatchFormat, val status: MatchStatus, val liveScore: LiveScore, val winner: Player? = null, val reportUrl: String? = null, val tipsEnabled: Boolean, val createdBy: String, val scheduledAt: Long? = null, val startedAt: Long? = null, val completedAt: Long? = null, val createdAt: Long)
