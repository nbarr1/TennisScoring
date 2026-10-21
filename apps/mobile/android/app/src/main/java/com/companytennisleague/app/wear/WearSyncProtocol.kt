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

/**
 * [canScore] is whether the phone will act on commands for this snapshot (see
 * [isScoreable]). The watch renders a live, tappable scoreboard and keeps its
 * screen awake only when it is true. It was added inside v1 rather than as a new
 * version: a watch that predates it ignores the field, and a watch that reads it
 * falls back to the snapshot's status when a phone that predates it leaves it out.
 */
data class WearSnapshot(
  val protocolVersion: Int = CURRENT_VERSION,
  val sessionId: String,
  val matchId: String,
  val sequence: Long,
  val acknowledgedEventIds: Set<String>,
  val scoreJson: String,
  val canScore: Boolean,
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

/** The only match status the phone scores from the watch. */
const val SCOREABLE_STATUS = "in_progress"

/**
 * The liveness rule both artifacts share: the watch may score a match only while
 * it is in progress and the phone says its wearer can score it. [canScore] comes
 * from the match screen (the signed-in player is a participant) and is null when
 * the screen does not send it, which leaves the decision to the status alone.
 * A missing [status] reads as in progress, as it always has on the watch.
 *
 * The watch mirrors this rule in wear/.../MainActivity.kt for snapshots that
 * carry no [WearSnapshot.canScore], so a change here must be made there too.
 */
fun isScoreable(status: String?, canScore: Boolean?): Boolean =
  (status ?: SCOREABLE_STATUS) == SCOREABLE_STATUS && canScore != false

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
  private var scoreable = false

  /**
   * Records the snapshot just sent. [scoreable] follows every snapshot, so a
   * match that leaves in_progress stops accepting commands at once; it never
   * resets the ordering, which only a new match does.
   */
  @Synchronized fun activate(matchId: String, scoreable: Boolean = true) {
    if (activeMatchId != matchId) {
      activeMatchId = matchId
      lastSequence = -1L
    }
    this.scoreable = scoreable
  }

  @Synchronized fun accept(command: WearCommand): Boolean {
    if (!scoreable) return false
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
   * whether a scoreable match is open. Returns the match to attribute the command
   * to, or null to drop it.
   */
  @Synchronized fun acceptLegacy(action: String): String? {
    if (action !in VALID_ACTIONS || !scoreable) return null
    return activeMatchId
  }
}
