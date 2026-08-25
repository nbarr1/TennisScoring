package com.companytennisleague.app.wear

import android.util.Log
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.android.gms.wearable.MessageClient
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.Wearable

class WearOsModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext), MessageClient.OnMessageReceivedListener {
  private var listenerRegistered = false

  override fun getName(): String = "WearOs"

  override fun initialize() {
    super.initialize()
    // Do NOT eagerly register the wearable listener here. Register when JS subscribes
    // to avoid classloading Wearable.* at app startup on devices/builds where the
    // wearable APIs are not present.
  }

  override fun invalidate() {
    // Ensure we try to unregister, but guard for missing classes.
    try {
      unregisterListener()
    } catch (e: NoClassDefFoundError) {
      Log.w(TAG, "Wearable API not available during invalidate()", e)
    } catch (e: Exception) {
      Log.w(TAG, "Unexpected error while unregistering wearable listener", e)
    }
    super.invalidate()
  }

  @Suppress("UNUSED_PARAMETER")
  @ReactMethod
  fun addListener(eventName: String) {
    // Register the listener lazily when JS indicates it will listen.
    try {
      registerListener()
    } catch (e: NoClassDefFoundError) {
      Log.w(TAG, "Wearable API not available in addListener()", e)
    } catch (e: Exception) {
      Log.w(TAG, "Error registering wearable listener", e)
    }
  }

  @ReactMethod
  fun removeListeners(count: Int) {
    if (count <= 0) {
      try {
        unregisterListener()
      } catch (e: NoClassDefFoundError) {
        Log.w(TAG, "Wearable API not available in removeListeners()", e)
      } catch (e: Exception) {
        Log.w(TAG, "Error unregistering wearable listener", e)
      }
    }
  }

  @ReactMethod
  fun sendScore(scoreJson: String, promise: Promise) {
    try {
      Wearable.getNodeClient(reactContext).connectedNodes
        .addOnSuccessListener { nodes ->
          val client = Wearable.getMessageClient(reactContext)
          if (nodes.isEmpty()) {
            promise.resolve(false)
            return@addOnSuccessListener
          }

          var remaining = nodes.size
          var failed = false
          for (node in nodes) {
            client.sendMessage(node.id, SCORE_PATH, scoreJson.toByteArray())
              .addOnFailureListener { failed = true }
              .addOnCompleteListener {
                remaining -= 1
                if (remaining == 0) promise.resolve(!failed)
              }
          }
        }
        .addOnFailureListener { error -> promise.reject("wear_nodes_failed", error) }
    } catch (e: NoClassDefFoundError) {
      Log.w(TAG, "Wearable API not available in sendScore()", e)
      promise.resolve(false)
    } catch (e: Exception) {
      Log.w(TAG, "Unexpected error in sendScore()", e)
      promise.reject("wear_send_failed", e)
    }
  }

  @ReactMethod
  fun isWearOsAvailable(promise: Promise) {
    try {
      Wearable.getNodeClient(reactContext).connectedNodes
        .addOnSuccessListener { nodes -> promise.resolve(nodes.isNotEmpty()) }
        .addOnFailureListener { promise.resolve(false) }
    } catch (e: NoClassDefFoundError) {
      Log.w(TAG, "Wearable API not available in isWearOsAvailable()", e)
      promise.resolve(false)
    } catch (e: Exception) {
      Log.w(TAG, "Unexpected error in isWearOsAvailable()", e)
      promise.resolve(false)
    }
  }

  override fun onMessageReceived(event: MessageEvent) {
    when (event.path) {
      POINT_PATH -> {
        val command = String(event.data)
        val payload =
          if (command == "undo") mapOf("action" to "undo")
          else mapOf("action" to "point", "player" to command)
        emit("onWearScoreInput", payload)
      }

      SYNC_REQUEST_PATH -> emit("onWearSyncRequest", null)
    }
  }

  private fun emit(eventName: String, payload: Any?) {
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(eventName, payload)
  }

  private fun registerListener() {
    if (listenerRegistered) return
    try {
      Wearable.getMessageClient(reactContext).addListener(this)
      listenerRegistered = true
    } catch (e: NoClassDefFoundError) {
      Log.w(TAG, "Wearable API not available in registerListener()", e)
      listenerRegistered = false
    } catch (e: Exception) {
      Log.w(TAG, "Error registering wearable listener", e)
      listenerRegistered = false
    }
  }

  private fun unregisterListener() {
    if (!listenerRegistered) return
    try {
      Wearable.getMessageClient(reactContext).removeListener(this)
    } catch (e: NoClassDefFoundError) {
      Log.w(TAG, "Wearable API not available in unregisterListener()", e)
    } catch (e: Exception) {
      Log.w(TAG, "Error unregistering wearable listener", e)
    } finally {
      listenerRegistered = false
    }
  }

  companion object {
    private const val SCORE_PATH = "/tennis/score"
    private const val POINT_PATH = "/tennis/point"
    private const val SYNC_REQUEST_PATH = "/tennis/sync-request"
    private const val TAG = "WearOsModule"
  }
}
