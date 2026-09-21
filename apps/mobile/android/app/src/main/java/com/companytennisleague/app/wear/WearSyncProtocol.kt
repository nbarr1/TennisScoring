package com.companytennisleague.app.wear

/** Versioned phone-authoritative Data Layer paths shared by the active phone bridge. */
data class WearCommand(val protocolVersion: Int = CURRENT_VERSION, val eventId: String, val matchId: String, val sequence: Long, val action: String)
data class WearSnapshot(val protocolVersion: Int = CURRENT_VERSION, val matchId: String, val sequence: Long, val acknowledgedEventIds: Set<String>, val scoreJson: String)
const val CURRENT_VERSION = 1
const val COMMAND_PATH = "/tennis/v1/command"
const val SNAPSHOT_PATH = "/tennis/v1/snapshot"
const val SYNC_PATH = "/tennis/v1/sync"

class DuplicateEventGuard(private val capacity: Int = 256) {
  private val seen = LinkedHashSet<String>()
  @Synchronized fun accept(eventId: String): Boolean {
    if (!seen.add(eventId)) return false
    while (seen.size > capacity) seen.remove(seen.first())
    return true
  }
}
