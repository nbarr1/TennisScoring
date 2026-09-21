package com.companytennisleague.app.data

import com.companytennisleague.app.domain.*
import com.google.firebase.firestore.DocumentSnapshot

/** The only Firestore-to-domain conversion boundary; timestamps use Unix milliseconds. */
object FirestoreMapper {
  fun user(document: DocumentSnapshot): User = User(
    id = document.id, displayName = document.string("displayName"), email = document.string("email"), phone = document.getString("phone"), avatarUrl = document.getString("avatarUrl"),
    contactPreferences = (document.get("contactPreferences") as? Map<*,*>)?.let { ContactPreferences(it["allowEmail"] as? Boolean ?: true, it["allowSMS"] as? Boolean ?: false, it["allowInApp"] as? Boolean ?: true) } ?: ContactPreferences(),
    divisionId = document.getString("divisionId"), role = UserRole.entries.first { it.wire == document.string("role") }, fcmTokens = (document.get("fcmTokens") as? List<*>)?.filterIsInstance<String>().orEmpty(), tipsEnabled = document.getBoolean("tipsEnabled") ?: true,
    tutorialDone = document.getBoolean("tutorialDone"), createdAt = document.millis("createdAt"), updatedAt = document.millis("updatedAt"))
  private fun DocumentSnapshot.string(field: String) = requireNotNull(getString(field)) { "$field missing from $id" }
  private fun DocumentSnapshot.millis(field: String): Long = getLong(field) ?: getTimestamp(field)?.toDate()?.time ?: error("$field missing from $id")
}

data class CallableRequest(val name: String, val payload: Map<String, Any?>)
sealed interface CallableResult<out T> { data class Success<T>(val value: T): CallableResult<T>; data class Failure(val code: String, val message: String): CallableResult<Nothing> }
