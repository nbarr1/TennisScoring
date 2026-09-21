package com.companytennisleague.app.wear
import org.junit.Assert.*
import org.junit.Test
class WearSyncProtocolTest {
  @Test fun duplicateEventsAreRejected() {
    val guard = DuplicateEventGuard()
    assertTrue(guard.accept("event-1")); assertFalse(guard.accept("event-1")); assertTrue(guard.accept("event-2"))
  }

  @Test fun commandsMustBelongToActiveMatchAndAdvanceSequence() {
    val validator = WearCommandValidator()
    validator.activate("match-1")
    assertTrue(validator.accept(WearCommand(eventId = "one", matchId = "match-1", sequence = 1, action = "player1")))
    assertFalse(validator.accept(WearCommand(eventId = "one", matchId = "match-1", sequence = 2, action = "player2")))
    assertFalse(validator.accept(WearCommand(eventId = "two", matchId = "match-2", sequence = 2, action = "player2")))
    assertFalse(validator.accept(WearCommand(eventId = "three", matchId = "match-1", sequence = 1, action = "undo")))
    assertFalse(validator.accept(WearCommand(eventId = "four", matchId = "match-1", sequence = 2, action = "invalid")))
    assertTrue(validator.accept(WearCommand(eventId = "five", matchId = "match-1", sequence = 2, action = "undo")))
  }
}
