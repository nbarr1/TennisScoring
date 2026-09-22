package com.tennisleague.watch

import android.app.Activity
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.KeyCharacterMap
import android.view.KeyEvent
import android.util.Log
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import com.google.android.gms.wearable.MessageClient
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.Wearable
import org.json.JSONObject
import java.util.UUID

class MainActivity : Activity(), MessageClient.OnMessageReceivedListener {
  private lateinit var player1Name: TextView
  private lateinit var player2Name: TextView
  private lateinit var setsScore: TextView
  private lateinit var gamesScore: TextView
  private lateinit var pointScore: TextView
  private lateinit var serverText: TextView
  private lateinit var feedbackTitle: TextView
  private lateinit var feedbackBody: TextView
  private lateinit var player1Button: Button
  private lateinit var player2Button: Button
  private lateinit var undoButton: Button

  private val buttonHandler = Handler(Looper.getMainLooper())
  private val pendingButtonPoints = mutableMapOf<Int, Runnable>()

  private var matchFinished = false
  private var activeMatchId: String? = null
  private var activeSessionId: String? = null
  private var commandSequence = 0L
  private var latestRenderedSequence = -1L

  /**
   * Set once a v1 snapshot arrives, and never cleared. A v1 phone also mirrors every
   * snapshot onto the pre-v1 path, so the watch has to ignore that mirror and keep
   * its own commands on the v1 path, or the phone would score each point twice.
   */
  private var speaksV1 = false
  private var hasRenderedScore = false

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    buildLayout()
    renderWaitingState()
  }

  override fun onResume() {
    super.onResume()
    Wearable.getMessageClient(this).addListener(this)
    requestScoreSync()
  }

  override fun onPause() {
    Wearable.getMessageClient(this).removeListener(this)
    pendingButtonPoints.values.forEach { buttonHandler.removeCallbacks(it) }
    pendingButtonPoints.clear()
    super.onPause()
  }

  override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
    if (!isScoreButton(keyCode)) return super.onKeyDown(keyCode, event)
    if (event.repeatCount == 0) event.startTracking()
    return true
  }

  override fun onKeyLongPress(keyCode: Int, event: KeyEvent): Boolean {
    if (!isScoreButton(keyCode)) return super.onKeyLongPress(keyCode, event)
    cancelPendingButtonPoint(keyCode)
    sendCommand("undo")
    return true
  }

  override fun onKeyUp(keyCode: Int, event: KeyEvent): Boolean {
    val pointCommand = pointCommandForButton(keyCode) ?: return super.onKeyUp(keyCode, event)
    if (event.isCanceled) return true

    val pendingPoint = pendingButtonPoints.remove(keyCode)
    if (pendingPoint != null) {
      buttonHandler.removeCallbacks(pendingPoint)
      sendCommand("undo")
      return true
    }

    val runnable = Runnable {
      pendingButtonPoints.remove(keyCode)
      sendCommand(pointCommand)
    }
    pendingButtonPoints[keyCode] = runnable
    buttonHandler.postDelayed(runnable, DOUBLE_PRESS_MS)
    return true
  }

  override fun onMessageReceived(event: MessageEvent) {
    val payload = String(event.data)
    when (event.path) {
      SCORE_PATH -> runOnUiThread { renderSnapshot(payload) }
      LEGACY_SCORE_PATH -> runOnUiThread { renderLegacySnapshot(payload) }
    }
  }

  private fun buildLayout() {
    val scroll = ScrollView(this).apply {
      setBackgroundColor(BACKGROUND)
      isFillViewport = true
    }
    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_HORIZONTAL
      setPadding(dp(12), dp(10), dp(12), dp(12))
    }

    val title = label("LIVE", 10, AMBER, true)
    title.letterSpacing = 0.22f
    root.addView(title)

    val scoreboard = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      background = rounded(SCOREBOARD, dp(18), Color.argb(55, 242, 239, 230), dp(1))
      setPadding(dp(10), dp(8), dp(10), dp(8))
    }
    setsScore = label("Sets 0-0", 18, LINE, true)
    gamesScore = label("Games 0-0", 13, AMBER, true)
    pointScore = label("0-0", 32, LINE, true)
    pointScore.typeface = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD)
    serverText = label("Waiting for phone", 10, MUTED, false)
    scoreboard.addView(setsScore)
    scoreboard.addView(gamesScore)
    scoreboard.addView(pointScore)
    scoreboard.addView(serverText)
    root.addView(scoreboard, fullWidth())

    val names = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER
      setPadding(0, dp(6), 0, dp(2))
    }
    player1Name = label("P1", 10, LINE, true)
    player2Name = label("P2", 10, LINE, true)
    names.addView(player1Name, rowWeight())
    names.addView(player2Name, rowWeight())
    root.addView(names, fullWidth())

    val buttons = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER
    }
    player1Button = pointButton("P1", PA)
    player1Button.setOnClickListener { sendCommand("player1") }
    player1Button.setOnLongClickListener { sendCommand("undo"); true }
    player2Button = pointButton("P2", PB)
    player2Button.setOnClickListener { sendCommand("player2") }
    player2Button.setOnLongClickListener { sendCommand("undo"); true }
    buttons.addView(player1Button, rowWeight())
    buttons.addView(player2Button, rowWeight())
    root.addView(buttons, fullWidth())

    undoButton = Button(this).apply {
      text = "Hold undo"
      textSize = 10f
      setTextColor(Color.rgb(36, 24, 6))
      setTypeface(Typeface.DEFAULT, Typeface.BOLD)
      background = rounded(AMBER, dp(16), Color.TRANSPARENT, 0)
      minHeight = dp(38)
      setOnLongClickListener { sendCommand("undo"); true }
    }
    root.addView(undoButton, fullWidth())

    feedbackTitle = label("", 12, AMBER, true)
    feedbackTitle.setPadding(0, dp(6), 0, 0)
    root.addView(feedbackTitle)

    feedbackBody = label("", 10, MUTED, false)
    root.addView(feedbackBody)

    scroll.addView(root)
    setContentView(scroll)
  }

  private fun renderWaitingState() {
    matchFinished = false
    player1Button.isEnabled = true
    player2Button.isEnabled = true
    undoButton.isEnabled = true
    setsScore.text = "Tennis"
    gamesScore.text = "Court-native"
    pointScore.text = "0-0"
    feedbackTitle.text = "Ready"
    feedbackBody.text = "Open a live match on your phone."
  }

  /** Handles a v1 envelope: session reset, then ordering, then the score inside it. */
  private fun renderSnapshot(payload: String) {
    try {
      val envelope = JSONObject(payload)
      if (envelope.optInt("protocolVersion", -1) != PROTOCOL_VERSION) return
      speaksV1 = true
      val matchId = envelope.optString("matchId")
      if (matchId.isBlank()) return

      // Snapshot sequences live in the phone's memory and restart at 1 when its
      // process does, so ordering state kept from a previous session would reject
      // every snapshot the new one sends.
      val sessionId = envelope.optString("sessionId").ifBlank { UNKNOWN_SESSION }
      if (sessionId != activeSessionId) {
        Log.d(TAG, "New phone session; resetting Wear sync state")
        activeSessionId = sessionId
        latestRenderedSequence = -1L
        commandSequence = 0L
        activeMatchId = null
        matchFinished = false
      }

      val sequence = envelope.optLong("sequence", -1L)
      if (sequence <= latestRenderedSequence) {
        Log.d(TAG, "Ignoring stale Wear snapshot sequence $sequence; latest is $latestRenderedSequence")
        return
      }

      latestRenderedSequence = sequence
      activeMatchId = matchId
      commandSequence = maxOf(commandSequence, sequence)
      renderScore(JSONObject(envelope.getString("scoreJson")))
    } catch (e: Exception) {
      reportRenderFailure(e)
    }
  }

  /**
   * Handles a pre-v1 snapshot, which is the bare score payload with no envelope,
   * ordering or match id. Ignored once the paired phone has proven it speaks v1.
   */
  private fun renderLegacySnapshot(payload: String) {
    if (speaksV1) return
    try {
      val root = JSONObject(payload)
      activeMatchId = root.optString("matchId").ifBlank { null }
      renderScore(root)
    } catch (e: Exception) {
      reportRenderFailure(e)
    }
  }

  private fun renderScore(root: JSONObject) {
    val score = root.optJSONObject("score") ?: root
    val p1Name = root.optString("player1Name", "Player 1")
    val p2Name = root.optString("player2Name", "Player 2")
    val status = root.optString("status", "in_progress")
    val winnerName = root.optString("matchWinnerName", "")

    val p1Sets = score.optInt("player1SetsWon", 0)
    val p2Sets = score.optInt("player2SetsWon", 0)
    val currentSetIndex = score.optInt("currentSet", 0)
    val sets = score.optJSONArray("sets")
    val currentSet = sets?.optJSONObject(currentSetIndex)
    val p1Games = currentSet?.optInt("player1Games", 0) ?: 0
    val p2Games = currentSet?.optInt("player2Games", 0) ?: 0
    val isTiebreak = score.optBoolean("isTiebreak", false)
    val currentGame = score.optJSONObject("currentGame")
    val tiebreak = score.optJSONObject("tiebreakScore")
    val server = score.optString("server", "player1")
    val serviceSide = score.optString("serviceSide", "deuce")

    player1Name.text = p1Name.take(10)
    player2Name.text = p2Name.take(10)
    player1Button.text = pointButtonLabel(p1Name, if (isTiebreak) "${tiebreak?.optInt("player1Points", 0) ?: 0}" else formatPoint(currentGame?.optString("player1", "0")))
    player2Button.text = pointButtonLabel(p2Name, if (isTiebreak) "${tiebreak?.optInt("player2Points", 0) ?: 0}" else formatPoint(currentGame?.optString("player2", "0")))
    setsScore.text = "Sets $p1Sets-$p2Sets"
    gamesScore.text = "Games $p1Games-$p2Games"
    pointScore.text =
      if (isTiebreak && tiebreak != null) {
        "TB ${tiebreak.optInt("player1Points", 0)}-${tiebreak.optInt("player2Points", 0)}"
      } else {
        "${formatPoint(currentGame?.optString("player1", "0"))}-${formatPoint(currentGame?.optString("player2", "0"))}"
      }
    serverText.text = "● ${if (server == "player1") p1Name else p2Name} · $serviceSide court"

    matchFinished =
      status == "pending_report" ||
        status == "completed" ||
        root.optString("feedbackTitle") == "Match complete" ||
        winnerName.isNotBlank()
    player1Button.isEnabled = !matchFinished
    player2Button.isEnabled = !matchFinished

    if (matchFinished) {
      feedbackTitle.text = "MATCH COMPLETE"
      feedbackBody.text = if (winnerName.isNotBlank()) "$winnerName wins. Confirm on phone." else "Confirm the report on phone."
    } else {
      feedbackTitle.text = root.optString("feedbackTitle", "Game")
      feedbackBody.text = root.optString("feedbackBody", "Tap a plinth for point. Long-press to undo.")
    }

    hasRenderedScore = true
  }

  private fun reportRenderFailure(e: Exception) {
    Log.e(TAG, "Error rendering payload", e)
    feedbackTitle.text = "Sync error"
    feedbackBody.text = "Could not read latest score."
  }

  private fun sendCommand(command: String) {
    if (matchFinished && command != "undo") return
    if (!hasRenderedScore) {
      showWaitingForMatch()
      return
    }

    if (!speaksV1) {
      // A pre-v1 phone understands a bare action string on the old path only.
      sendToConnectedNodes(LEGACY_POINT_PATH, command.toByteArray(), ::reportMissingPhone)
      return
    }

    val sessionId = activeSessionId
    val matchId = activeMatchId
    if (sessionId == null || matchId == null) {
      showWaitingForMatch()
      return
    }
    commandSequence += 1
    val payload = JSONObject()
      .put("protocolVersion", PROTOCOL_VERSION)
      .put("sessionId", sessionId)
      .put("eventId", UUID.randomUUID().toString())
      .put("matchId", matchId)
      .put("sequence", commandSequence)
      .put("action", command)
      .toString().toByteArray()
    sendToConnectedNodes(POINT_PATH, payload, ::reportMissingPhone)
  }

  private fun showWaitingForMatch() {
    feedbackTitle.text = "Waiting for match"
    feedbackBody.text = "Open a live match on your phone before scoring."
  }

  private fun reportMissingPhone(hasNodes: Boolean) {
    if (hasNodes) return
    feedbackTitle.text = "Phone not found"
    feedbackBody.text = "Pair this watch and open the live match on your phone."
  }

  private fun requestScoreSync() {
    sendToConnectedNodes(SYNC_REQUEST_PATH, ByteArray(0)) { hasNodes ->
      feedbackTitle.text = if (hasNodes) "Sync requested" else "Phone not found"
      feedbackBody.text =
        if (hasNodes) "Open the live match on your phone if the score does not appear."
        else "Install and open Tennis League on your paired phone."
    }
    // A pre-v1 phone listens on the old path only. Stop asking there once the
    // paired phone has answered on v1.
    if (!speaksV1) sendToConnectedNodes(LEGACY_SYNC_REQUEST_PATH, ByteArray(0))
  }

  private fun sendToConnectedNodes(path: String, data: ByteArray, onNodesChecked: (Boolean) -> Unit = {}) {
    Wearable.getNodeClient(this).connectedNodes
      .addOnSuccessListener(this) { nodes ->
        onNodesChecked(nodes.isNotEmpty())
        val client = Wearable.getMessageClient(this)
        for (node in nodes) {
          client.sendMessage(node.id, path, data)
            .addOnFailureListener { error -> Log.e(TAG, "Failed to send $path to ${node.displayName}", error) }
        }
      }
      .addOnFailureListener(this) { error ->
        Log.e(TAG, "Could not read connected Wear nodes", error)
        onNodesChecked(false)
      }
  }

  private fun isScoreButton(keyCode: Int): Boolean {
    return pointCommandForButton(keyCode) != null
  }

  private fun pointCommandForButton(keyCode: Int): String? {
    return when (keyCode) {
      KeyEvent.KEYCODE_STEM_PRIMARY -> "player1"
      KeyEvent.KEYCODE_STEM_1 -> if (hasPrimaryStemButton()) "player2" else "player1"
      KeyEvent.KEYCODE_STEM_2 -> "player2"
      else -> null
    }
  }

  private fun hasPrimaryStemButton(): Boolean {
    return KeyCharacterMap.deviceHasKey(KeyEvent.KEYCODE_STEM_PRIMARY)
  }

  private fun cancelPendingButtonPoint(keyCode: Int) {
    val pendingPoint = pendingButtonPoints.remove(keyCode) ?: return
    buttonHandler.removeCallbacks(pendingPoint)
  }

  private fun pointButtonLabel(name: String, score: String): String {
    val first = name.trim().split(" ").firstOrNull()?.take(7)
    return "${if (first.isNullOrBlank()) "Point" else first}\n$score"
  }

  private fun formatPoint(point: String?): String {
    return when (point) {
      null, "0" -> "0"
      "Ad" -> "AD"
      else -> point
    }
  }

  private fun pointButton(text: String, color: Int): Button {
    return Button(this).apply {
      this.text = text
      textSize = 15f
      setTextColor(Color.WHITE)
      setTypeface(Typeface.create(Typeface.MONOSPACE, Typeface.BOLD))
      background = rounded(color, dp(20), Color.argb(50, 255, 180, 74), dp(2))
      minHeight = dp(78)
      setPadding(dp(2), 0, dp(2), 0)
    }
  }

  private fun label(text: String, size: Int, color: Int, bold: Boolean): TextView {
    return TextView(this).apply {
      this.text = text
      textSize = size.toFloat()
      setTextColor(color)
      gravity = Gravity.CENTER
      includeFontPadding = true
      if (bold) setTypeface(Typeface.DEFAULT, Typeface.BOLD)
    }
  }

  private fun rowWeight(): LinearLayout.LayoutParams {
    return LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
      setMargins(dp(3), dp(3), dp(3), dp(3))
    }
  }

  private fun fullWidth(): LinearLayout.LayoutParams {
    return LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
      setMargins(0, dp(3), 0, dp(3))
    }
  }

  private fun rounded(color: Int, radius: Int, strokeColor: Int, strokeWidth: Int): GradientDrawable {
    return GradientDrawable().apply {
      shape = GradientDrawable.RECTANGLE
      setColor(color)
      cornerRadius = radius.toFloat()
      if (strokeWidth > 0) setStroke(strokeWidth, strokeColor)
    }
  }

  private fun dp(value: Int): Int {
    return (value * resources.displayMetrics.density).toInt()
  }

  companion object {
    private const val TAG = "TennisWatch"
    private const val SCORE_PATH = "/tennis/v1/snapshot"
    private const val POINT_PATH = "/tennis/v1/command"
    private const val SYNC_REQUEST_PATH = "/tennis/v1/sync"

    // Pre-v1 paths, carried for one rollout so a watch and a phone that update at
    // different times keep talking. Delete these along with every branch that
    // reads [speaksV1] once a v1 build of both artifacts has shipped.
    private const val LEGACY_SCORE_PATH = "/tennis/score"
    private const val LEGACY_POINT_PATH = "/tennis/point"
    private const val LEGACY_SYNC_REQUEST_PATH = "/tennis/sync-request"
    private const val UNKNOWN_SESSION = "unknown-session"
    private const val DOUBLE_PRESS_MS = 300L
    private const val PROTOCOL_VERSION = 1
    private val BACKGROUND = Color.rgb(8, 16, 20)
    private val SCOREBOARD = Color.rgb(14, 20, 24)
    private val LINE = Color.rgb(242, 239, 230)
    private val AMBER = Color.rgb(255, 180, 74)
    private val PA = Color.rgb(30, 136, 255)
    private val PB = Color.rgb(255, 90, 78)
    private val MUTED = Color.argb(185, 242, 239, 230)
  }
}
