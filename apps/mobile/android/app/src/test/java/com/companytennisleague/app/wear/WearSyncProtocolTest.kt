package com.companytennisleague.app.wear
import org.junit.Assert.*
import org.junit.Test
class WearSyncProtocolTest { @Test fun duplicateEventsAreRejected(){ val guard=DuplicateEventGuard(); assertTrue(guard.accept("event-1")); assertFalse(guard.accept("event-1")); assertTrue(guard.accept("event-2")) } }
