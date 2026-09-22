package com.companytennisleague.app.wear

/**
 * Versioned phone-authoritative Data Layer contract.
 *
 * `sessionId` identifies one phone process. Sequence numbers live in memory and
 * restart at 1 when the process does, so a watch that kept counting across a phone
 * restart would reject every snapshot from the new process as stale. The watch
 * resets its ordering state whenever the session id changes.
 */
data class WearCommand(
  val protocolVersion: Int = CURRENT_VERSION,
  val sessionId: String,
  val eventId: String,
  val matchId: String,
  val sequence: Long,
  val action: String,
)

data class WearSnapshot(
  val protocolVersion: Int = CURRENT_VERSION,
  val sessionId: String,
  val matchId: String,
  val sequence: Long,
  val acknowledgedEventIds: Set<String>,
  val scoreJson: String,
)

const val CURRENT_VERSION = 1
const val COMMAND_PATH = "/tennis/v1/command"
const val SNAPSHOT_PATH = "/tennis/v1/snapshot"
const val SYNC_PATH = "/tennis/v1/sync"

/**
 * Pre-v1 paths, carried for one rollout. :app and :wear install as separate
 * artifacts and update independently, so a phone on v1 and a watch on v0 (or the
 * reverse) would otherwise go silent in both directions until both updates land.
 * The phone mirrors every snapshot onto [LEGACY_SNAPSHOT_PATH] and accepts commands
 * on [LEGACY_COMMAND_PATH]; the watch falls back to those paths only while it has
 * never seen a v1 snapshot, so a v1 pair never sends a command twice.
 *
 * Delete these constants and every branch that references them once a v1 build of
 * both artifacts has shipped.
 */
const val LEGACY_COMMAND_PATH = "/tennis/point"
const val LEGACY_SNAPSHOT_PATH = "/tennis/score"
const val LEGACY_SYNC_PATH = "/tennis/sync-request"

val VALID_ACTIONS = setOf("player1", "player2", "undo")

/**
 * The remote-launch contract with :wear, which the phone uses to open the watch
 * app. [WATCH_APP_CAPABILITY] must match the android_wear_capabilities entry in
 * wear/src/main/res/values/wear.xml, and [LAUNCH_URI]'s scheme must match the
 * VIEW intent filter on the watch's MainActivity.
 *
 * Neither is checked across the module boundary: a capability mismatch makes the
 * phone report that no watch has the app, and a scheme mismatch makes the intent
 * resolve to nothing on the watch, so the launch reports success and does nothing.
 */
const val WATCH_APP_CAPABILITY = "tennis_league_wear_app"
const val LAUNCH_URI = "tennisleague://watch"

class DuplicateEventGuard(private val capacity: Int = 256) {
  private val seen = LinkedHashSet<String>()
  @Synchronized fun accept(eventId: String): Boolean {
    if (!seen.add(eventId)) return false
    while (seen.size > capacity) seen.remove(seen.first())
    return true
  }
}

/** Validates commands against the snapshot currently displayed by the watch. */
class WearCommandValidator(
  private val sessionId: String,
  private val duplicateGuard: DuplicateEventGuard = DuplicateEventGuard(),
) {
  private var activeMatchId: String? = null
  private var lastSequence = -1L

  @Synchronized fun activate(matchId: String) {
    if (activeMatchId != matchId) {
      activeMatchId = matchId
      lastSequence = -1L
    }
  }

  @Synchronized fun accept(command: WearCommand): Boolean {
    if (command.protocolVersion != CURRENT_VERSION || command.sessionId != sessionId ||
      command.eventId.isBlank() || command.matchId != activeMatchId ||
      command.sequence <= lastSequence || command.action !in VALID_ACTIONS
    ) return false
    if (!duplicateGuard.accept(command.eventId)) return false
    lastSequence = command.sequence
    return true
  }

  /**
   * A pre-v1 watch sends a bare action string with no session, match, event id or
   * sequence, so the only checks available are whether the action is real and
   * whether a match is open. Returns the match to attribute the command to, or
   * null to drop it.
   */
  @Synchronized fun acceptLegacy(action: String): String? {
    if (action !in VALID_ACTIONS) return null
    return activeMatchId
  }
}
