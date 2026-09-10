package com.companytennisleague.app.crash

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.firebase.crashlytics.FirebaseCrashlytics

/** Bridges JavaScript diagnostics to the native Crashlytics SDK. */
class CrashAnalyticsModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private val crashlytics = FirebaseCrashlytics.getInstance()

  override fun getName() = "CrashAnalytics"

  @ReactMethod
  fun recordError(message: String, stack: String?) {
    val exception = JavaScriptException(message)
    if (!stack.isNullOrBlank()) {
      exception.stackTrace = stack.lineSequence()
        .filter { it.isNotBlank() }
        .map { StackTraceElement("JavaScript", it.trim(), "JavaScript", -1) }
        .toList()
        .toTypedArray()
    }
    crashlytics.recordException(exception)
  }

  @ReactMethod
  fun log(message: String) {
    crashlytics.log(message.take(MAX_LOG_LENGTH))
  }

  @ReactMethod
  fun setUserId(userId: String?) {
    // Crashlytics only accepts strings; an empty value clears the prior user.
    crashlytics.setUserId(userId.orEmpty())
  }

  private class JavaScriptException(message: String) : RuntimeException(message)

  private companion object {
    const val MAX_LOG_LENGTH = 1024
  }
}
