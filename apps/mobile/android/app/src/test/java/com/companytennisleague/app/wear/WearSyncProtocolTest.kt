package com.companytennisleague.app.wear
import org.junit.Assert.*
import org.junit.Test
class WearSyncProtocolTest {
  private val session = "session-a"

  private fun command(
    eventId: String,
    matchId: String = "match-1",
    sequence: Long,
    action: String,
    sessionId: String = session,
  ) = WearCommand(
    sessionId = sessionId, eventId = eventId, matchId = matchId,
    sequence = sequence, action = action,
  )

  @Test fun duplicateEventsAreRejected() {
    val guard = DuplicateEventGuard()
    assertTrue(guard.accept("event-1")); assertFalse(guard.accept("event-1")); assertTrue(guard.accept("event-2"))
  }

  @Test fun commandsMustBelongToActiveMatchAndAdvanceSequence() {
    val validator = WearCommandValidator(session)
    validator.activate("match-1")
    assertTrue(validator.accept(command(eventId = "one", sequence = 1, action = "player1")))
    assertFalse(validator.accept(command(eventId = "one", sequence = 2, action = "player2")))
    assertFalse(validator.accept(command(eventId = "two", matchId = "match-2", sequence = 2, action = "player2")))
    assertFalse(validator.accept(command(eventId = "three", sequence = 1, action = "undo")))
    assertFalse(validator.accept(command(eventId = "four", sequence = 2, action = "invalid")))
    assertTrue(validator.accept(command(eventId = "five", sequence = 2, action = "undo")))
  }

  @Test fun commandsFromAnotherPhoneSessionAreRejected() {
    val validator = WearCommandValidator(session)
    validator.activate("match-1")
    assertFalse(
      validator.accept(command(eventId = "stale", sequence = 1, action = "player1", sessionId = "session-b")),
    )
    assertTrue(validator.accept(command(eventId = "fresh", sequence = 1, action = "player1")))
  }

  @Test fun legacyCommandsNeedAnOpenMatchAndAKnownAction() {
    val validator = WearCommandValidator(session)
    assertNull("no snapshot has gone out yet", validator.acceptLegacy("player1"))
    validator.activate("match-1")
    assertEquals("match-1", validator.acceptLegacy("player1"))
    assertEquals("match-1", validator.acceptLegacy("undo"))
    assertNull(validator.acceptLegacy("invalid"))
  }

  @Test fun onlyAnInProgressMatchTheWearerCanScoreIsScoreable() {
    assertTrue(isScoreable("in_progress", canScore = true))
    assertTrue("a screen that sends no canScore leaves it to the status", isScoreable("in_progress", canScore = null))
    assertTrue("a snapshot with no status reads as in progress", isScoreable(null, canScore = null))
    assertFalse("a spectator", isScoreable("in_progress", canScore = false))
    for (status in listOf("proposed", "scheduled", "pending_report", "completed", "disputed", "cancelled")) {
      assertFalse(status, isScoreable(status, canScore = true))
      assertFalse(status, isScoreable(status, canScore = null))
    }
  }

  @Test fun commandsForASnapshotThatIsNotScoreableAreRejected() {
    val validator = WearCommandValidator(session)
    validator.activate("match-1", scoreable = false)
    assertFalse(validator.accept(command(eventId = "early", sequence = 1, action = "player1")))
    assertNull(validator.acceptLegacy("player1"))

    validator.activate("match-1", scoreable = true)
    assertTrue(validator.accept(command(eventId = "live", sequence = 2, action = "player1")))
    assertEquals("match-1", validator.acceptLegacy("undo"))

    // Leaving in_progress stops commands without resetting the ordering.
    validator.activate("match-1", scoreable = false)
    assertFalse(validator.accept(command(eventId = "late", sequence = 3, action = "undo")))
    assertNull(validator.acceptLegacy("undo"))
    validator.activate("match-1", scoreable = true)
    assertFalse("sequence 2 was already used", validator.accept(command(eventId = "replay", sequence = 2, action = "player2")))
    assertTrue(validator.accept(command(eventId = "next", sequence = 3, action = "player2")))
  }
}
