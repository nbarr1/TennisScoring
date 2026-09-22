package com.companytennisleague.app.wear

import android.content.Intent
import android.net.Uri
import android.util.Log
import androidx.wear.remote.interactions.RemoteActivityHelper
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.android.gms.wearable.CapabilityClient
import com.google.android.gms.wearable.MessageClient
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.Wearable
import java.util.UUID
import java.util.concurrent.Executor
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import org.json.JSONArray
import org.json.JSONObject

class WearOsModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext), MessageClient.OnMessageReceivedListener {
  /** Identifies this phone process to the watch; see [WearCommand]. */
  private val sessionId = UUID.randomUUID().toString()
  private val commandValidator = WearCommandValidator(sessionId)

  private val listenerLock = Any()
  private var listenerRegistered = false
  private var jsListenerCount = 0

  /**
   * Guards the snapshot counter and the acknowledgement ring. [sendScore] runs on
   * the native modules thread while [onMessageReceived] is delivered on the
   * Wearable callback thread, so both touch this state concurrently.
   */
  private val snapshotLock = Any()
  private var snapshotSequence = 0L
  private val acknowledgedEventIds = LinkedHashSet<String>()

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
      synchronized(listenerLock) {
        jsListenerCount = 0
        unregisterListener()
      }
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
      synchronized(listenerLock) {
        jsListenerCount += 1
        registerListener()
      }
    } catch (e: NoClassDefFoundError) {
      Log.w(TAG, "Wearable API not available in addListener()", e)
    } catch (e: Exception) {
      Log.w(TAG, "Error registering wearable listener", e)
    }
  }

  /**
   * React Native passes the number of JavaScript subscriptions being removed, which
   * is always positive, so the listener has to be released by counting subscriptions
   * down to zero rather than by testing this argument.
   */
  @ReactMethod
  fun removeListeners(count: Int) {
    try {
      synchronized(listenerLock) {
        jsListenerCount = (jsListenerCount - count).coerceAtLeast(0)
        if (jsListenerCount == 0) unregisterListener()
      }
    } catch (e: NoClassDefFoundError) {
      Log.w(TAG, "Wearable API not available in removeListeners()", e)
    } catch (e: Exception) {
      Log.w(TAG, "Error unregistering wearable listener", e)
    }
  }

  @ReactMethod
  fun sendScore(scoreJson: String, promise: Promise) {
    try {
      val matchId = JSONObject(scoreJson).optString("matchId")
      if (matchId.isBlank()) {
        promise.reject("wear_invalid_snapshot", "A Wear score snapshot must include matchId")
        return
      }
      commandValidator.activate(matchId)
      val snapshotJson = nextSnapshotEnvelope(matchId, scoreJson)
      Wearable.getNodeClient(reactContext).connectedNodes
        .addOnSuccessListener { nodes ->
          if (nodes.isEmpty()) {
            promise.resolve(false)
            return@addOnSuccessListener
          }

          val client = Wearable.getMessageClient(reactContext)
          val payloads = listOf(
            SNAPSHOT_PATH to snapshotJson.toByteArray(),
            // Mirror for pre-v1 watches, which read this payload shape directly.
            LEGACY_SNAPSHOT_PATH to scoreJson.toByteArray(),
          )
          val remaining = AtomicInteger(nodes.size * payloads.size)
          val failed = AtomicBoolean(false)
          for (node in nodes) {
            for ((path, data) in payloads) {
              client.sendMessage(node.id, path, data)
                .addOnFailureListener { failed.set(true) }
                .addOnCompleteListener {
                  if (remaining.decrementAndGet() == 0) promise.resolve(!failed.get())
                }
            }
          }
        }
        .addOnFailureListener { error ->
          // Not reaching the watch is an ordinary state, not a scoring failure: the
          // JS caller awaits this inside the scoring flow.
          Log.w(TAG, "Could not list connected Wear nodes", error)
          promise.resolve(false)
        }
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

  /**
   * Whether a reachable watch actually has this app, which [isWearOsAvailable]
   * cannot answer: NodeClient reports that a watch is connected, never what is
   * installed on it, so gating a launch control on it offers the control for
   * watches that have never had the app.
   */
  @ReactMethod
  fun isWatchAppInstalled(promise: Promise) {
    try {
      capableNodes()
        .addOnSuccessListener { info -> promise.resolve(info.nodes.isNotEmpty()) }
        .addOnFailureListener { error ->
          Log.w(TAG, "Could not read the Wear app capability", error)
          promise.resolve(false)
        }
    } catch (e: NoClassDefFoundError) {
      Log.w(TAG, "Wearable API not available in isWatchAppInstalled()", e)
      promise.resolve(false)
    } catch (e: Exception) {
      Log.w(TAG, "Unexpected error in isWatchAppInstalled()", e)
      promise.resolve(false)
    }
  }

  /**
   * Opens the watch app on every reachable watch that has it, resolving true if
   * at least one accepted. Not reaching a watch is an ordinary state rather than
   * an error, so this resolves false instead of rejecting.
   */
  @ReactMethod
  fun launchWatchApp(promise: Promise) {
    try {
      capableNodes()
        .addOnSuccessListener { info ->
          val nodes = info.nodes
          if (nodes.isEmpty()) {
            promise.resolve(false)
            return@addOnSuccessListener
          }

          // RemoteActivityHelper rejects anything but ACTION_VIEW carrying a data
          // URI and CATEGORY_BROWSABLE, and the watch matches that shape with the
          // VIEW filter on its MainActivity.
          val intent = Intent(Intent.ACTION_VIEW)
            .setData(Uri.parse(LAUNCH_URI))
            .addCategory(Intent.CATEGORY_BROWSABLE)
          val helper = RemoteActivityHelper(reactContext)
          val remaining = AtomicInteger(nodes.size)
          val launched = AtomicBoolean(false)
          for (node in nodes) {
            val started = helper.startRemoteActivity(intent, node.id)
            started.addListener(
              {
                // A ListenableFuture reports failure only when read, and this one
                // has already completed, so get() returns without blocking.
                try {
                  started.get()
                  launched.set(true)
                } catch (e: Exception) {
                  Log.w(TAG, "Could not open the watch app on ${node.id}", e)
                }
                if (remaining.decrementAndGet() == 0) promise.resolve(launched.get())
              },
              directExecutor,
            )
          }
        }
        .addOnFailureListener { error ->
          Log.w(TAG, "Could not read the Wear app capability", error)
          promise.resolve(false)
        }
    } catch (e: NoClassDefFoundError) {
      Log.w(TAG, "Wearable API not available in launchWatchApp()", e)
      promise.resolve(false)
    } catch (e: Exception) {
      Log.w(TAG, "Unexpected error in launchWatchApp()", e)
      promise.resolve(false)
    }
  }

  private fun capableNodes() =
    Wearable.getCapabilityClient(reactContext)
      .getCapability(WATCH_APP_CAPABILITY, CapabilityClient.FILTER_REACHABLE)

  override fun onMessageReceived(event: MessageEvent) {
    when (event.path) {
      COMMAND_PATH -> handleCommand(event.data)
      LEGACY_COMMAND_PATH -> handleLegacyCommand(event.data)
      SYNC_PATH, LEGACY_SYNC_PATH -> emit("onWearSyncRequest", null)
    }
  }

  private fun handleCommand(data: ByteArray) {
    val command = decodeCommand(data) ?: return
    if (!commandValidator.accept(command)) {
      Log.w(TAG, "Ignoring invalid, stale, or duplicate Wear command")
      return
    }
    recordAcknowledgement(command.eventId)
    emit(
      "onWearScoreInput",
      scoreInputPayload(command.action, command.matchId, command.eventId, command.sequence),
    )
  }

  private fun handleLegacyCommand(data: ByteArray) {
    val action = String(data, Charsets.UTF_8).trim()
    val matchId = commandValidator.acceptLegacy(action)
    if (matchId == null) {
      Log.w(TAG, "Ignoring pre-v1 Wear command with an unknown action or no open match")
      return
    }
    emit("onWearScoreInput", scoreInputPayload(action, matchId, eventId = null, sequence = null))
  }

  private fun scoreInputPayload(
    action: String,
    matchId: String,
    eventId: String?,
    sequence: Long?,
  ): WritableMap = Arguments.createMap().apply {
    if (action == "undo") {
      putString("action", "undo")
    } else {
      putString("action", "point")
      putString("player", action)
    }
    putString("matchId", matchId)
    eventId?.let { putString("eventId", it) }
    sequence?.let { putDouble("sequence", it.toDouble()) }
  }

  private fun nextSnapshotEnvelope(matchId: String, scoreJson: String): String =
    synchronized(snapshotLock) {
      snapshotSequence += 1
      JSONObject()
        .put("protocolVersion", CURRENT_VERSION)
        .put("sessionId", sessionId)
        .put("matchId", matchId)
        .put("sequence", snapshotSequence)
        .put("acknowledgedEventIds", JSONArray(acknowledgedEventIds.toList()))
        .put("scoreJson", scoreJson)
        .toString()
    }

  private fun recordAcknowledgement(eventId: String) = synchronized(snapshotLock) {
    acknowledgedEventIds.add(eventId)
    while (acknowledgedEventIds.size > MAX_ACKNOWLEDGED_EVENTS) {
      acknowledgedEventIds.remove(acknowledgedEventIds.first())
    }
  }

  private fun decodeCommand(data: ByteArray): WearCommand? = try {
    val json = JSONObject(String(data, Charsets.UTF_8))
    WearCommand(
      json.optInt("protocolVersion", -1), json.optString("sessionId"), json.optString("eventId"),
      json.optString("matchId"), json.optLong("sequence", -1L), json.optString("action"),
    )
  } catch (e: Exception) {
    Log.w(TAG, "Ignoring malformed Wear command", e)
    null
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
    private val directExecutor = Executor { command -> command.run() }
    private const val TAG = "WearOsModule"
    private const val MAX_ACKNOWLEDGED_EVENTS = 256
  }
}
