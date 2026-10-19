package com.tennisleague.watch

import android.app.Activity
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.StateListDrawable
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.TextUtils
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.KeyCharacterMap
import android.view.KeyEvent
import android.view.View
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
  private lateinit var statusTitle: TextView
  private lateinit var scoreboard: LinearLayout
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

    statusTitle = label("WAITING", 12, AMBER, true)
    statusTitle.letterSpacing = 0.18f
    root.addView(statusTitle)

    // TalkBack reads the scoreboard as one sentence (its contentDescription, set
    // in renderScore) rather than four fragments such as "AD-40".
    scoreboard = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      background = rounded(SCOREBOARD, dp(18), LINE_SUBTLE, dp(1))
      setPadding(dp(10), dp(8), dp(10), dp(8))
      isFocusable = true
      importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_YES
    }
    setsScore = label("Sets 0-0", 18, LINE, true)
    gamesScore = label("Games 0-0", 15, AMBER, true)
    pointScore = label("0-0", 32, LINE, true)
    pointScore.typeface = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD)
    serverText = label("Waiting for phone", 13, MUTED, false)
    for (child in listOf(setsScore, gamesScore, pointScore, serverText)) {
      child.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
      scoreboard.addView(child)
    }
    root.addView(scoreboard, fullWidth())

    val names = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER
      setPadding(0, dp(6), 0, dp(2))
    }
    // The point buttons already name each player, so TalkBack skips this row.
    player1Name = singleLine(label("Player 1", 12, LINE, true))
    player2Name = singleLine(label("Player 2", 12, LINE, true))
    player1Name.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
    player2Name.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
    names.addView(player1Name, rowWeight())
    names.addView(player2Name, rowWeight())
    root.addView(names, fullWidth())

    val buttons = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER
    }
    player1Button = pointButton("P1", PA)
    player1Button.contentDescription = "Point to player 1"
    player1Button.setOnClickListener { view -> if (sendCommand("player1")) confirmTap(view) }
    player1Button.setOnLongClickListener { sendCommand("undo"); true }
    player2Button = pointButton("P2", PB)
    player2Button.contentDescription = "Point to player 2"
    player2Button.setOnClickListener { view -> if (sendCommand("player2")) confirmTap(view) }
    player2Button.setOnLongClickListener { sendCommand("undo"); true }
    buttons.addView(player1Button, rowWeight())
    buttons.addView(player2Button, rowWeight())
    root.addView(buttons, fullWidth())

    undoButton = Button(this).apply {
      text = "Hold to undo"
      textSize = 14f
      setAllCaps(false)
      setTextColor(Color.BLACK)
      setTypeface(Typeface.DEFAULT, Typeface.BOLD)
      background = rounded(AMBER, dp(16), Color.TRANSPARENT, 0)
      minHeight = dp(48)
      minimumHeight = dp(48)
      // TalkBack appends its own "double-tap and hold" hint for a long-press action.
      contentDescription = "Undo last point"
      setOnLongClickListener { sendCommand("undo"); true }
    }
    root.addView(undoButton, fullWidth())

    // A polite live region, so TalkBack announces sync and scoring messages
    // without the player having to find them.
    val feedback = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_HORIZONTAL
      accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE
    }
    feedbackTitle = label("", 14, AMBER, true)
    feedbackTitle.setPadding(0, dp(6), 0, 0)
    feedback.addView(feedbackTitle)

    feedbackBody = label("", 13, MUTED, false)
    feedback.addView(feedbackBody)
    root.addView(feedback, fullWidth())

    scroll.addView(root)
    setContentView(scroll)
  }

  private fun renderWaitingState() {
    matchFinished = false
    setScoreButtonsEnabled(true)
    undoButton.isEnabled = true
    statusTitle.text = "WAITING"
    setsScore.text = "Tennis League"
    gamesScore.text = "No live match"
    pointScore.text = "--"
    scoreboard.contentDescription = "No live match yet."
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

    val p1Point = if (isTiebreak) "${tiebreak?.optInt("player1Points", 0) ?: 0}" else formatPoint(currentGame?.optString("player1", "0"))
    val p2Point = if (isTiebreak) "${tiebreak?.optInt("player2Points", 0) ?: 0}" else formatPoint(currentGame?.optString("player2", "0"))
    val serverName = if (server == "player1") p1Name else p2Name
    val court = if (serviceSide == "advantage") "ad" else "deuce"

    player1Name.text = p1Name
    player2Name.text = p2Name
    player1Button.text = pointButtonLabel(p1Name, p1Point)
    player2Button.text = pointButtonLabel(p2Name, p2Point)
    player1Button.contentDescription = "Point to $p1Name, now on $p1Point"
    player2Button.contentDescription = "Point to $p2Name, now on $p2Point"
    setsScore.text = "Sets $p1Sets-$p2Sets"
    gamesScore.text = "Games $p1Games-$p2Games"
    pointScore.text =
      if (isTiebreak && tiebreak != null) {
        "TB ${tiebreak.optInt("player1Points", 0)}-${tiebreak.optInt("player2Points", 0)}"
      } else {
        "$p1Point-$p2Point"
      }
    serverText.text = "$serverName serves · $court court"
    scoreboard.contentDescription =
      "Sets $p1Sets to $p2Sets. Games $p1Games to $p2Games. " +
        "${if (isTiebreak) "Tiebreak. " else ""}$p1Name $p1Point, $p2Name $p2Point. " +
        "$serverName serves from the $court court."

    matchFinished =
      status == "pending_report" ||
        status == "completed" ||
        root.optString("feedbackTitle") == "Match complete" ||
        winnerName.isNotBlank()
    setScoreButtonsEnabled(!matchFinished)
    statusTitle.text = if (matchFinished) "FINAL" else "LIVE"

    if (matchFinished) {
      feedbackTitle.text = "Match complete"
      feedbackBody.text =
        if (winnerName.isNotBlank()) "$winnerName wins. Finish the report on your phone."
        else "Finish the report on your phone."
    } else {
      feedbackTitle.text = root.optString("feedbackTitle", "Score a point")
      feedbackBody.text = root.optString("feedbackBody", "Tap the player who won it. Hold to undo.")
    }

    hasRenderedScore = true
  }

  private fun reportRenderFailure(e: Exception) {
    Log.e(TAG, "Error rendering payload", e)
    feedbackTitle.text = "Score not updated"
    feedbackBody.text = "Couldn't read the latest score from your phone. Check the score there."
  }

  /** Returns whether the command was handed to the Data Layer; the tap haptic depends on it. */
  private fun sendCommand(command: String): Boolean {
    if (matchFinished && command != "undo") return false
    if (!hasRenderedScore) {
      showWaitingForMatch()
      return false
    }

    if (!speaksV1) {
      // A pre-v1 phone understands a bare action string on the old path only.
      sendToConnectedNodes(LEGACY_POINT_PATH, command.toByteArray(), ::reportMissingPhone)
      return true
    }

    val sessionId = activeSessionId
    val matchId = activeMatchId
    if (sessionId == null || matchId == null) {
      showWaitingForMatch()
      return false
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
    return true
  }

  /** A short tick confirming the tap registered, so the player need not look down between points. */
  private fun confirmTap(view: View) {
    view.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY)
  }

  /** Disabled point buttons also dim, so a finished match does not look tappable. */
  private fun setScoreButtonsEnabled(enabled: Boolean) {
    for (button in listOf(player1Button, player2Button)) {
      button.isEnabled = enabled
      button.alpha = if (enabled) 1f else 0.45f
    }
  }

  private fun showWaitingForMatch() {
    feedbackTitle.text = "Waiting for match"
    feedbackBody.text = "Open a live match on your phone before scoring."
  }

  private fun reportMissingPhone(hasNodes: Boolean) {
    if (hasNodes) return
    feedbackTitle.text = "Phone not found"
    feedbackBody.text = "Point not sent. Pair this watch and open the live match on your phone."
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

  /**
   * A dark scoreboard plate edged in the player's color, with white text, so the
   * label stays readable in sunlight. Pressing fills it with that color.
   */
  private fun pointButton(text: String, color: Int): Button {
    val pressed = rounded(color, dp(20), color, dp(3))
    val resting = rounded(SCOREBOARD_CONTROL, dp(20), color, dp(3))
    return Button(this).apply {
      this.text = text
      textSize = 16f
      setAllCaps(false)
      setTextColor(Color.WHITE)
      setTypeface(Typeface.create(Typeface.MONOSPACE, Typeface.BOLD))
      background = StateListDrawable().apply {
        addState(intArrayOf(android.R.attr.state_pressed), pressed)
        addState(intArrayOf(), resting)
      }
      minHeight = dp(78)
      minimumHeight = dp(78)
      setPadding(dp(4), 0, dp(4), 0)
    }
  }

  private fun singleLine(view: TextView): TextView {
    return view.apply {
      maxLines = 1
      ellipsize = TextUtils.TruncateAt.END
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
    // The scoreboard palette in DESIGN.md: scoreboard-*, player-blue, player-orange.
    private val BACKGROUND = Color.BLACK
    private val SCOREBOARD = Color.rgb(0x14, 0x14, 0x14)
    private val SCOREBOARD_CONTROL = Color.rgb(0x1C, 0x1C, 0x1C)
    private val LINE = Color.WHITE
    private val LINE_SUBTLE = Color.rgb(0x26, 0x26, 0x26)
    private val AMBER = Color.rgb(0xFF, 0xD6, 0x0A)
    private val PA = Color.rgb(0x3D, 0x8B, 0xFF)
    private val PB = Color.rgb(0xFF, 0x9F, 0x1C)
    private val MUTED = Color.rgb(0xB3, 0xB3, 0xB3)
  }
}
