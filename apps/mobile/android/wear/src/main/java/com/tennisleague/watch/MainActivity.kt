package com.tennisleague.watch

import android.app.Activity
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.StateListDrawable
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.SpannableString
import android.text.Spanned
import android.text.TextUtils
import android.text.style.RelativeSizeSpan
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.KeyCharacterMap
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
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
  private lateinit var setsScore: TextView
  private lateinit var gamesScore: TextView
  private lateinit var serverText: TextView
  private lateinit var feedbackTitle: TextView
  private lateinit var feedbackBody: TextView
  private lateinit var player1Button: Button
  private lateinit var player2Button: Button
  private lateinit var undoButton: Button

  private val buttonHandler = Handler(Looper.getMainLooper())
  private val pendingButtonPoints = mutableMapOf<Int, Runnable>()

  /**
   * Lets the screen sleep again once no snapshot has arrived for a while, so a
   * match the phone has stopped sending can't keep the display on indefinitely.
   */
  private val releaseScreen = Runnable { window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) }

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
    keepScreenOn(false)
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
    sendCommand("undo") { showUndoSent() }
    return true
  }

  override fun onKeyUp(keyCode: Int, event: KeyEvent): Boolean {
    val pointCommand = pointCommandForButton(keyCode) ?: return super.onKeyUp(keyCode, event)
    if (event.isCanceled) return true

    val pendingPoint = pendingButtonPoints.remove(keyCode)
    if (pendingPoint != null) {
      buttonHandler.removeCallbacks(pendingPoint)
      sendCommand("undo") { showUndoSent() }
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

  /**
   * Laid out for the first viewport of a 192dp round watch: the status line, a
   * compact sets-and-games plate, and the two player tiles, which carry each
   * player's points and are themselves the tap targets (the phone's split
   * scoreboard, side by side). Undo and the help text sit below, one scroll away.
   */
  private fun buildLayout() {
    val round = resources.configuration.isScreenRound
    val scroll = ScrollView(this).apply {
      setBackgroundColor(BACKGROUND)
      isFillViewport = true
    }
    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_HORIZONTAL
      // A round display clips the corners, so content is inset further and the
      // last rows can scroll up into the readable middle of the circle.
      if (round) setPadding(dp(20), dp(16), dp(20), dp(36)) else setPadding(dp(10), dp(8), dp(10), dp(12))
    }

    statusTitle = singleLine(label("WAITING", 12, AMBER, true))
    statusTitle.typeface = CONDENSED_BOLD
    statusTitle.letterSpacing = 0.08f
    root.addView(statusTitle, fullWidth())

    // TalkBack reads the scoreboard as one sentence (its contentDescription, set
    // in renderScore) rather than fragments such as "Games 5-4".
    scoreboard = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      background = rounded(SCOREBOARD, dp(14), LINE_SUBTLE, dp(1))
      setPadding(dp(8), dp(4), dp(8), dp(5))
      isFocusable = true
      importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_YES
    }
    val tally = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER
    }
    setsScore = label("Sets 0-0", 15, LINE, true)
    gamesScore = label("Games 0-0", 15, AMBER, true)
    for (view in listOf(setsScore, gamesScore)) {
      view.typeface = CONDENSED_BOLD
      view.setPadding(dp(4), 0, dp(4), 0)
    }
    tally.addView(setsScore)
    tally.addView(gamesScore)
    serverText = singleLine(label("Waiting for your phone", 12, MUTED, false))
    for (child in listOf(tally, serverText)) {
      child.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
      scoreboard.addView(child)
    }
    root.addView(scoreboard, fullWidth())

    val buttons = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER
    }
    player1Button = pointButton(pointTileLabel("Player 1", "–"), PA)
    player1Button.contentDescription = "Point to player 1"
    player1Button.setOnClickListener { view -> sendCommand("player1") { confirmTap(view) } }
    player1Button.setOnLongClickListener { sendCommand("undo") { showUndoSent() }; true }
    player2Button = pointButton(pointTileLabel("Player 2", "–"), PB)
    player2Button.contentDescription = "Point to player 2"
    player2Button.setOnClickListener { view -> sendCommand("player2") { confirmTap(view) } }
    player2Button.setOnLongClickListener { sendCommand("undo") { showUndoSent() }; true }
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
      setOnLongClickListener { sendCommand("undo") { showUndoSent() }; true }
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
    // Nothing to score yet, so the tiles and undo read as inactive rather than
    // inviting a tap that can only answer "waiting".
    setScoreButtonsEnabled(false)
    setUndoEnabled(false)
    keepScreenOn(false)
    statusTitle.text = "WAITING"
    setsScore.text = "No live match"
    gamesScore.text = ""
    serverText.text = "Waiting for your phone"
    scoreboard.contentDescription = "No live match yet."
    feedbackTitle.text = "Ready"
    feedbackBody.text = "Open a live match on your phone. The score appears here."
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

    player1Button.text = pointTileLabel(shortName(p1Name), p1Point)
    player2Button.text = pointTileLabel(shortName(p2Name), p2Point)
    player1Button.contentDescription = "Point to $p1Name, now on $p1Point"
    player2Button.contentDescription = "Point to $p2Name, now on $p2Point"
    setsScore.text = "Sets $p1Sets-$p2Sets"
    gamesScore.text = "Games $p1Games-$p2Games"
    serverText.text = "${shortName(serverName)} serves · $court court"
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
    setUndoEnabled(true)
    keepScreenOn(!matchFinished)

    if (matchFinished) {
      statusTitle.text = "FINAL"
      feedbackTitle.text = if (winnerName.isNotBlank()) "$winnerName wins" else "Match complete"
      feedbackBody.text = "Finish the report on your phone."
    } else {
      // The moment the phone names for this point (a tip title such as "Match
      // Point" or "Deuce") goes in the status line, the one place always in view.
      val moment = root.optString("feedbackTitle", "").trim().trimEnd('!')
      statusTitle.text =
        when {
          moment.isNotBlank() -> "LIVE · ${moment.uppercase()}"
          isTiebreak -> "LIVE · TIEBREAK"
          else -> "LIVE"
        }
      feedbackTitle.text = root.optString("feedbackTitle", "Score a point")
      feedbackBody.text = root.optString("feedbackBody", "Tap the player who won it. Hold a player to undo.")
    }

    hasRenderedScore = true
  }

  private fun reportRenderFailure(e: Exception) {
    Log.e(TAG, "Error rendering payload", e)
    feedbackTitle.text = "Score not updated"
    feedbackBody.text = "Couldn't read the latest score from your phone. Check the score there."
  }

  /**
   * Hands a command to the Data Layer. [onSent] runs once the phone has accepted
   * the message, so the tap haptic means the point actually left the watch.
   */
  private fun sendCommand(command: String, onSent: () -> Unit = {}) {
    if (matchFinished && command != "undo") return
    if (!hasRenderedScore) {
      showWaitingForMatch()
      return
    }

    if (!speaksV1) {
      // A pre-v1 phone understands a bare action string on the old path only.
      sendToConnectedNodes(LEGACY_POINT_PATH, command.toByteArray(), ::reportMissingPhone, onSent, ::reportNotSent)
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
    sendToConnectedNodes(POINT_PATH, payload, ::reportMissingPhone, onSent, ::reportNotSent)
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

  private fun setUndoEnabled(enabled: Boolean) {
    undoButton.isEnabled = enabled
    undoButton.alpha = if (enabled) 1f else 0.45f
  }

  /**
   * Keeps the scoreboard on screen between points instead of dropping to the
   * watch face. Each snapshot restarts the timer, and it lapses after
   * [KEEP_SCREEN_ON_MS] without one, when the match ends, or when the app leaves
   * the screen.
   */
  private fun keepScreenOn(live: Boolean) {
    buttonHandler.removeCallbacks(releaseScreen)
    if (live) {
      window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
      buttonHandler.postDelayed(releaseScreen, KEEP_SCREEN_ON_MS)
    } else {
      window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }
  }

  private fun showWaitingForMatch() {
    feedbackTitle.text = "Waiting for match"
    feedbackBody.text = "Open a live match on your phone before scoring."
  }

  private fun showUndoSent() {
    feedbackTitle.text = "Undo sent"
    feedbackBody.text = "The last point comes off once your phone confirms."
  }

  private fun reportMissingPhone(hasNodes: Boolean) {
    if (hasNodes) return
    statusTitle.text = "NO PHONE"
    feedbackTitle.text = "Phone not found"
    feedbackBody.text = "Nothing was sent. Keep your phone nearby with the live match open."
  }

  private fun reportNotSent() {
    statusTitle.text = "NOT SENT"
    feedbackTitle.text = "Not sent"
    feedbackBody.text = "Your phone didn't receive that. Check the score there, then tap again."
  }

  private fun requestScoreSync() {
    sendToConnectedNodes(SYNC_REQUEST_PATH, ByteArray(0), { hasNodes ->
      if (!hasNodes) {
        statusTitle.text = "NO PHONE"
        feedbackTitle.text = "Phone not found"
        feedbackBody.text = "Install and open Tennis League on your paired phone."
      } else if (!hasRenderedScore) {
        // Mid-match, the snapshot this asks for replaces the score on its own;
        // only an empty scoreboard needs to say what's happening.
        feedbackTitle.text = "Looking for a match"
        feedbackBody.text = "Open the live match on your phone if the score doesn't appear."
      }
    })
    // A pre-v1 phone listens on the old path only. Stop asking there once the
    // paired phone has answered on v1.
    if (!speaksV1) sendToConnectedNodes(LEGACY_SYNC_REQUEST_PATH, ByteArray(0))
  }

  /**
   * Sends [data] to every connected node. [onSent] runs once, on the first node
   * that accepts the message; [onFailed] runs only if every node rejects it.
   */
  private fun sendToConnectedNodes(
    path: String,
    data: ByteArray,
    onNodesChecked: (Boolean) -> Unit = {},
    onSent: () -> Unit = {},
    onFailed: () -> Unit = {},
  ) {
    Wearable.getNodeClient(this).connectedNodes
      .addOnSuccessListener(this) { nodes ->
        onNodesChecked(nodes.isNotEmpty())
        val client = Wearable.getMessageClient(this)
        var sent = false
        var failures = 0
        for (node in nodes) {
          client.sendMessage(node.id, path, data)
            .addOnSuccessListener {
              if (!sent) {
                sent = true
                onSent()
              }
            }
            .addOnFailureListener { error ->
              Log.e(TAG, "Failed to send $path to ${node.displayName}", error)
              failures += 1
              if (failures == nodes.size) onFailed()
            }
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

  /** The tile's two lines: a short name, then the points, drawn large. */
  private fun pointTileLabel(name: String, points: String): CharSequence {
    val text = SpannableString("$name\n$points")
    text.setSpan(RelativeSizeSpan(POINTS_SCALE), name.length + 1, text.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
    return text
  }

  /**
   * A name that fits half a watch face and still tells two players apart:
   * "Chris Lee" → "Chris L", "Ann Smith / Bob Jones" → "Ann/Bob".
   */
  private fun shortName(name: String): String {
    val people = name.split(" / ").map { it.trim() }.filter { it.isNotEmpty() }
    if (people.isEmpty()) return "Player"
    if (people.size > 1) {
      return people.joinToString("/") { person -> person.split(WHITESPACE).first().take(4) }
    }
    val parts = people.first().split(WHITESPACE)
    val first = parts.first()
    val initial = if (parts.size > 1) parts.last().firstOrNull() else null
    val withInitial = if (initial != null) "$first $initial" else first
    return if (withInitial.length <= SHORT_NAME_MAX) withInitial else first.take(SHORT_NAME_MAX)
  }

  private fun formatPoint(point: String?): String {
    return when (point) {
      null, "0" -> "0"
      "Ad" -> "AD"
      else -> point
    }
  }

  /**
   * A dark scoreboard tile edged in the player's color, with white text, so the
   * points stay readable in sunlight. Pressing fills it with that color.
   */
  private fun pointButton(text: CharSequence, color: Int): Button {
    val pressed = rounded(color, dp(20), color, dp(3))
    val resting = rounded(SCOREBOARD_CONTROL, dp(20), color, dp(3))
    return Button(this).apply {
      this.text = text
      textSize = 13f
      setAllCaps(false)
      setTextColor(Color.WHITE)
      typeface = CONDENSED_BOLD
      background = StateListDrawable().apply {
        addState(intArrayOf(android.R.attr.state_pressed), pressed)
        addState(intArrayOf(), resting)
      }
      minHeight = dp(78)
      minimumHeight = dp(78)
      setPadding(dp(4), dp(2), dp(4), dp(4))
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
    // Long enough for a changeover or a set break, short enough that a match the
    // phone stopped sending doesn't hold the display on.
    private const val KEEP_SCREEN_ON_MS = 5 * 60 * 1000L
    // 13sp names over 30sp points on the player tiles.
    private const val POINTS_SCALE = 2.3f
    private const val SHORT_NAME_MAX = 9
    private val WHITESPACE = Regex("\\s+")
    // Android's condensed sans: the closest system face to the scoreboard's
    // Barlow Condensed, which this module doesn't ship.
    private val CONDENSED_BOLD: Typeface = Typeface.create("sans-serif-condensed", Typeface.BOLD)
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
