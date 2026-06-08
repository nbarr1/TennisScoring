package com.tennisleague.app.wear

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
    registerListener()
  }

  override fun invalidate() {
    unregisterListener()
    super.invalidate()
  }

  @Suppress("UNUSED_PARAMETER")
  @ReactMethod
  fun addListener(eventName: String) {
    registerListener()
  }

  @ReactMethod
  fun removeListeners(count: Int) {
    if (count <= 0) unregisterListener()
  }

  @ReactMethod
  fun sendScore(scoreJson: String, promise: Promise) {
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
  }

  @ReactMethod
  fun isWearOsAvailable(promise: Promise) {
    Wearable.getNodeClient(reactContext).connectedNodes
      .addOnSuccessListener { nodes -> promise.resolve(nodes.isNotEmpty()) }
      .addOnFailureListener { promise.resolve(false) }
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
    Wearable.getMessageClient(reactContext).addListener(this)
    listenerRegistered = true
  }

  private fun unregisterListener() {
    if (!listenerRegistered) return
    Wearable.getMessageClient(reactContext).removeListener(this)
    listenerRegistered = false
  }

  companion object {
    private const val SCORE_PATH = "/tennis/score"
    private const val POINT_PATH = "/tennis/point"
    private const val SYNC_REQUEST_PATH = "/tennis/sync-request"
  }
}
