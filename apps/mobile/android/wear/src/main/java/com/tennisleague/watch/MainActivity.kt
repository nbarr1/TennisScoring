package com.tennisleague.watch

import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.StateListDrawable
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.text.SpannableString
import android.text.Spanned
import android.text.TextUtils
import android.text.style.RelativeSizeSpan
import android.util.Log
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.InputDevice
import android.view.KeyCharacterMap
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.WindowManager
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.wear.ambient.AmbientLifecycleObserver
import com.google.android.gms.wearable.MessageClient
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.Wearable
import org.json.JSONObject
import java.util.UUID
import kotlin.math.roundToInt
import kotlin.random.Random

class MainActivity : ComponentActivity(), MessageClient.OnMessageReceivedListener {
  private lateinit var scroll: ScrollView
  private lateinit var root: LinearLayout
  private lateinit var statusTitle: TextView
  private lateinit var scoreboard: LinearLayout
  private lateinit var setsScore: TextView
  private lateinit var gamesScore: TextView
  private lateinit var serverText: TextView
  private lateinit var ambientScore: TextView
  private lateinit var buttons: LinearLayout
  private lateinit var feedback: LinearLayout
  private lateinit var feedbackTitle: TextView
  private lateinit var feedbackBody: TextView
  private lateinit var player1Button: Button
  private lateinit var player2Button: Button
  private lateinit var undoButton: Button
  private lateinit var plateBackground: GradientDrawable

  private val buttonHandler = Handler(Looper.getMainLooper())
  private val pendingButtonPoints = mutableMapOf<Int, Runnable>()

  // The scoreboard palette, from res/values/colors.xml. Lazy, because resources
  // can't be read before the activity is attached.
  private val backgroundColor by lazy { getColor(R.color.watch_background) }
  private val panelColor by lazy { getColor(R.color.scoreboard_panel) }
  private val controlColor by lazy { getColor(R.color.scoreboard_control) }
  private val lineSubtleColor by lazy { getColor(R.color.scoreboard_line) }
  private val textColor by lazy { getColor(R.color.scoreboard_text) }
  private val mutedColor by lazy { getColor(R.color.scoreboard_muted) }
  private val yellowColor by lazy { getColor(R.color.scoreboard_yellow) }
  private val playerBlue by lazy { getColor(R.color.player_blue) }
  private val playerOrange by lazy { getColor(R.color.player_orange) }
  private val pressedTextColor by lazy { getColor(R.color.tile_pressed_text) }

  /**
   * Above this font scale the first viewport no longer holds the status, the
   * plate, and both tiles on a 192dp round screen, so the points stop growing
   * and the server line folds into the status line.
   */
  private val largeFont by lazy { resources.configuration.fontScale > LARGE_FONT_SCALE }

  /**
   * Lets the screen time out again shortly after the last point. The display is
   * held awake only between points of a live match; a changeover, a set break, or
   * a phone that stopped sending drops to the ambient scoreboard instead.
   */
  private val releaseScreen = Runnable { window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) }

  /**
   * True only while the watch can score this match: it is in progress, the phone
   * says the wearer can score it, and it isn't over. Everything else, scheduled,
   * proposed, disputed, cancelled, finished, or a match the wearer is only
   * watching, renders read-only, with the tiles and undo disabled.
   */
  private var scoreable = false
  private var hasRenderedScore = false
  private var lastLiveSnapshotAt = 0L
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

  private lateinit var ambientObserver: AmbientLifecycleObserver
  private var isAmbient = false
  private var lowBitAmbient = false
  private var burnInProtection = false

  /**
   * Ambient mode keeps a live scoreboard visible, dimmed, when the screen times
   * out, instead of holding it at full brightness. Anything that isn't a live
   * match the wearer can score has no reason to stay up, so it goes back to the
   * watch face, as does a live match the phone hasn't updated for
   * [AMBIENT_STALE_MS].
   */
  private val ambientCallback = object : AmbientLifecycleObserver.AmbientLifecycleCallback {
    override fun onEnterAmbient(ambientDetails: AmbientLifecycleObserver.AmbientDetails) {
      isAmbient = true
      lowBitAmbient = ambientDetails.deviceHasLowBitAmbient
      burnInProtection = ambientDetails.burnInProtectionRequired
      releaseScreenNow()
      if (shouldLeaveAmbient()) {
        moveTaskToBack(true)
        return
      }
      scroll.scrollTo(0, 0)
      applyPresentation()
    }

    override fun onUpdateAmbient() {
      if (shouldLeaveAmbient()) {
        moveTaskToBack(true)
        return
      }
      if (burnInProtection) shiftForBurnIn()
    }

    override fun onExitAmbient() {
      leaveAmbientPresentation()
      if (scoreable) holdScreenOn()
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    ambientObserver = AmbientLifecycleObserver(this, ambientCallback)
    lifecycle.addObserver(ambientObserver)
    buildLayout()
    renderWaitingState()
  }

  override fun onResume() {
    super.onResume()
    Wearable.getMessageClient(this).addListener(this)
    // Rotary input goes to the focused view, and nothing else here takes focus.
    scroll.requestFocus()
    requestScoreSync()
  }

  override fun onPause() {
    Wearable.getMessageClient(this).removeListener(this)
    pendingButtonPoints.values.forEach { buttonHandler.removeCallbacks(it) }
    pendingButtonPoints.clear()
    releaseScreenNow()
    super.onPause()
  }

  override fun onStop() {
    // Leaving the screen (including the move back to the watch face from
    // ambient) ends ambient; the next start is always interactive.
    if (isAmbient) leaveAmbientPresentation()
    super.onStop()
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
      // The stem buttons are the eyes-free path, so they get the same tick as a tile.
      sendCommand(pointCommand) { confirmTap(window.decorView) }
    }
    pendingButtonPoints[keyCode] = runnable
    buttonHandler.postDelayed(runnable, DOUBLE_PRESS_MS)
    return true
  }

  /** Crown and bezel input, for when the focused ScrollView doesn't take it itself. */
  override fun onGenericMotionEvent(event: MotionEvent): Boolean {
    if (event.action == MotionEvent.ACTION_SCROLL && event.isFromSource(InputDevice.SOURCE_ROTARY_ENCODER)) {
      val delta = -event.getAxisValue(MotionEvent.AXIS_SCROLL) * ViewConfiguration.get(this).scaledVerticalScrollFactor
      scroll.smoothScrollBy(0, delta.roundToInt())
      return true
    }
    return super.onGenericMotionEvent(event)
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
    scroll = ScrollView(this).apply {
      setBackgroundColor(backgroundColor)
      isFillViewport = true
      isFocusable = true
      isFocusableInTouchMode = true
    }
    root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_HORIZONTAL
      // A round display clips the corners, so content is inset further and the
      // last rows can scroll up into the readable middle of the circle.
      if (round) setPadding(dp(20), dp(16), dp(20), dp(36)) else setPadding(dp(10), dp(8), dp(10), dp(12))
    }

    statusTitle = singleLine(label(getString(R.string.status_waiting), 12, yellowColor, true))
    statusTitle.typeface = CONDENSED_BOLD
    statusTitle.letterSpacing = 0.08f
    root.addView(statusTitle, fullWidth())

    // TalkBack reads the scoreboard as one sentence (its contentDescription, set
    // in renderScore) rather than fragments such as "Games 5-4".
    plateBackground = rounded(panelColor, dp(14), lineSubtleColor, dp(1))
    scoreboard = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      background = plateBackground
      setPadding(dp(8), dp(4), dp(8), dp(5))
      isFocusable = true
      importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_YES
    }
    val tally = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER
    }
    setsScore = label(getString(R.string.plate_sets, 0, 0), 15, textColor, true)
    gamesScore = label(getString(R.string.plate_games, 0, 0), 15, yellowColor, true)
    for (view in listOf(setsScore, gamesScore)) {
      view.typeface = CONDENSED_BOLD
      view.setPadding(dp(4), 0, dp(4), 0)
    }
    tally.addView(setsScore)
    tally.addView(gamesScore)
    serverText = singleLine(label(getString(R.string.plate_waiting_for_phone), 12, mutedColor, false))
    // The points, shown only in ambient, where the tiles that normally carry them are hidden.
    ambientScore = label("", 22, textColor, false).apply {
      typeface = CONDENSED_REGULAR
      visibility = View.GONE
    }
    for (child in listOf(tally, serverText, ambientScore)) {
      child.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
      scoreboard.addView(child)
    }
    root.addView(scoreboard, fullWidth())

    buttons = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER
    }
    val undoLabel = getString(R.string.a11y_undo_last_point)
    player1Button = pointButton(
      pointTileLabel(getString(R.string.player1_default), getString(R.string.point_unknown)),
      playerBlue,
      outerBottomLeft = round,
    )
    player1Button.contentDescription = getString(R.string.a11y_point_to, getString(R.string.player1_spoken))
    player1Button.setOnClickListener { view -> sendCommand("player1") { confirmTap(view) } }
    player1Button.setOnLongClickListener { sendCommand("undo") { showUndoSent() }; true }
    labelLongClick(player1Button, undoLabel)
    player2Button = pointButton(
      pointTileLabel(getString(R.string.player2_default), getString(R.string.point_unknown)),
      playerOrange,
      outerBottomRight = round,
    )
    player2Button.contentDescription = getString(R.string.a11y_point_to, getString(R.string.player2_spoken))
    player2Button.setOnClickListener { view -> sendCommand("player2") { confirmTap(view) } }
    player2Button.setOnLongClickListener { sendCommand("undo") { showUndoSent() }; true }
    labelLongClick(player2Button, undoLabel)
    buttons.addView(player1Button, rowWeight())
    buttons.addView(player2Button, rowWeight())
    root.addView(buttons, fullWidth())

    undoButton = Button(this).apply {
      text = getString(R.string.undo_button)
      textSize = 14f
      setAllCaps(false)
      setTextColor(Color.BLACK)
      setTypeface(Typeface.DEFAULT, Typeface.BOLD)
      background = rounded(yellowColor, dp(16), Color.TRANSPARENT, 0)
      minHeight = dp(48)
      minimumHeight = dp(48)
      // A single tap says how this control works, rather than doing nothing.
      setOnClickListener { showUndoHint() }
      setOnLongClickListener { sendCommand("undo") { showUndoSent() }; true }
    }
    labelLongClick(undoButton, undoLabel)
    root.addView(undoButton, fullWidth())

    // A polite live region, so TalkBack announces sync and scoring messages
    // without the player having to find them.
    feedback = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_HORIZONTAL
      accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE
    }
    feedbackTitle = label("", 14, yellowColor, true)
    feedbackTitle.setPadding(0, dp(6), 0, 0)
    feedback.addView(feedbackTitle)

    feedbackBody = label("", 13, mutedColor, false)
    feedback.addView(feedbackBody)
    root.addView(feedback, fullWidth())

    scroll.addView(root)
    setContentView(scroll)
    applyPresentation()
  }

  private fun renderWaitingState() {
    scoreable = false
    // Nothing to score yet, so the tiles and undo read as inactive rather than
    // inviting a tap that can only answer "waiting".
    setScoreButtonsEnabled(false)
    setUndoEnabled(false)
    releaseScreenNow()
    statusTitle.text = getString(R.string.status_waiting)
    setsScore.text = getString(R.string.plate_no_match)
    gamesScore.text = ""
    serverText.text = getString(R.string.plate_waiting_for_phone)
    scoreboard.contentDescription = getString(R.string.a11y_no_match)
    feedbackTitle.text = getString(R.string.feedback_ready)
    feedbackBody.text = getString(R.string.feedback_ready_body)
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
        scoreable = false
      }

      val sequence = envelope.optLong("sequence", -1L)
      if (sequence <= latestRenderedSequence) {
        Log.d(TAG, "Ignoring stale Wear snapshot sequence $sequence; latest is $latestRenderedSequence")
        return
      }

      latestRenderedSequence = sequence
      activeMatchId = matchId
      commandSequence = maxOf(commandSequence, sequence)
      // The phone's own verdict on whether it will act on this watch's commands.
      // A phone that predates the field leaves it out, and the status decides.
      val phoneCanScore = if (envelope.has("canScore")) envelope.optBoolean("canScore") else null
      renderScore(JSONObject(envelope.getString("scoreJson")), phoneCanScore)
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
      renderScore(root, phoneCanScore = null)
    } catch (e: Exception) {
      reportRenderFailure(e)
    }
  }

  private fun renderScore(root: JSONObject, phoneCanScore: Boolean?) {
    val score = root.optJSONObject("score") ?: root
    val p1Name = root.optString("player1Name", getString(R.string.player1_default))
    val p2Name = root.optString("player2Name", getString(R.string.player2_default))
    val status = root.optString("status", LIVE_STATUS)
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
    val court = getString(if (serviceSide == "advantage") R.string.court_ad else R.string.court_deuce)

    player1Button.text = pointTileLabel(shortName(p1Name), p1Point)
    player2Button.text = pointTileLabel(shortName(p2Name), p2Point)
    player1Button.contentDescription = getString(R.string.a11y_point_to_now_on, p1Name, p1Point)
    player2Button.contentDescription = getString(R.string.a11y_point_to_now_on, p2Name, p2Point)
    setsScore.text = getString(R.string.plate_sets, p1Sets, p2Sets)
    gamesScore.text = getString(R.string.plate_games, p1Games, p2Games)
    serverText.text = getString(R.string.plate_server, shortName(serverName), court)
    ambientScore.text =
      getString(R.string.ambient_player_line, shortName(p1Name), p1Point) + "\n" +
        getString(R.string.ambient_player_line, shortName(p2Name), p2Point)
    scoreboard.contentDescription = getString(
      R.string.a11y_scoreboard,
      p1Sets, p2Sets, p1Games, p2Games,
      if (isTiebreak) getString(R.string.a11y_tiebreak) else "",
      p1Name, p1Point, p2Name, p2Point, serverName, court,
    )

    val matchFinished =
      status == "pending_report" ||
        status == "completed" ||
        root.optString("feedbackTitle") == PHONE_MATCH_COMPLETE_TITLE ||
        winnerName.isNotBlank()
    // A match screen that sends canScore inside the score payload is honored on
    // the pre-v1 path too, where there is no envelope to carry the phone's verdict.
    val screenCanScore = if (root.has("canScore")) root.optBoolean("canScore") else null
    scoreable = !matchFinished && (phoneCanScore ?: isScoreable(status, screenCanScore))
    setScoreButtonsEnabled(scoreable)
    setUndoEnabled(scoreable)
    if (scoreable) {
      lastLiveSnapshotAt = SystemClock.elapsedRealtime()
      holdScreenOn()
    } else {
      releaseScreenNow()
    }

    when {
      matchFinished -> {
        statusTitle.text = getString(R.string.status_final)
        feedbackTitle.text =
          if (winnerName.isNotBlank()) getString(R.string.feedback_winner, winnerName)
          else getString(R.string.feedback_match_complete)
        feedbackBody.text = getString(R.string.feedback_match_complete_body)
      }
      scoreable -> {
        // The moment the phone names for this point (a tip title such as "Match
        // Point" or "Deuce") goes in the status line, the one place always in view.
        val moment = root.optString("feedbackTitle", "").trim().trimEnd('!')
        statusTitle.text =
          when {
            moment.isNotBlank() -> getString(R.string.status_live_moment, moment.uppercase())
            isTiebreak -> getString(R.string.status_live_tiebreak)
            // At large font scales the plate drops its server line, so the server
            // moves up here whenever no moment needs the space.
            largeFont -> getString(R.string.status_live_serving, shortName(serverName).uppercase())
            else -> getString(R.string.status_live)
          }
        feedbackTitle.text = root.optString("feedbackTitle", getString(R.string.feedback_score_point))
        feedbackBody.text = root.optString("feedbackBody", getString(R.string.feedback_score_point_body))
      }
      else -> renderReadOnlyStatus(status)
    }

    hasRenderedScore = true
    applyPresentation()
  }

  /** Names a match the watch can't score, and says why, instead of calling it LIVE. */
  private fun renderReadOnlyStatus(status: String) {
    val (label, title, body) = when (status) {
      LIVE_STATUS -> Triple(R.string.status_view_only, R.string.feedback_view_only, R.string.feedback_view_only_body)
      "scheduled" -> Triple(R.string.status_scheduled, R.string.feedback_scheduled, R.string.feedback_scheduled_body)
      "proposed" -> Triple(R.string.status_proposed, R.string.feedback_proposed, R.string.feedback_proposed_body)
      "disputed" -> Triple(R.string.status_disputed, R.string.feedback_disputed, R.string.feedback_disputed_body)
      "cancelled" -> Triple(R.string.status_cancelled, R.string.feedback_cancelled, R.string.feedback_cancelled_body)
      else -> {
        statusTitle.text = status.replace('_', ' ').uppercase()
        feedbackTitle.text = getString(R.string.feedback_not_live)
        feedbackBody.text = getString(R.string.feedback_not_live_body)
        return
      }
    }
    statusTitle.text = getString(label)
    feedbackTitle.text = getString(title)
    feedbackBody.text = getString(body)
  }

  /**
   * The watch's copy of the phone's isScoreable() in WearSyncProtocol.kt, used
   * only when a snapshot carries no canScore verdict from the phone. Keep the two
   * in step.
   */
  private fun isScoreable(status: String, canScore: Boolean?): Boolean =
    status == LIVE_STATUS && canScore != false

  private fun reportRenderFailure(e: Exception) {
    Log.e(TAG, "Error rendering payload", e)
    feedbackTitle.text = getString(R.string.feedback_render_failed)
    feedbackBody.text = getString(R.string.feedback_render_failed_body)
  }

  /**
   * Hands a command to the Data Layer. [onSent] runs once the phone has accepted
   * the message, so the tap haptic means the point actually left the watch.
   */
  private fun sendCommand(command: String, onSent: () -> Unit = {}) {
    if (!hasRenderedScore) {
      showWaitingForMatch()
      return
    }
    if (!scoreable) {
      // Only the stem buttons get here: the tiles and undo are disabled.
      feedbackTitle.text = getString(R.string.feedback_not_live)
      rejectHaptic()
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

  /** Felt as different from a point's tick, so an undo can't pass for a scored point. */
  private fun undoHaptic() {
    window.decorView.performHapticFeedback(
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) HapticFeedbackConstants.CONFIRM
      else HapticFeedbackConstants.LONG_PRESS,
    )
  }

  /** For a command that didn't leave the watch, so a failure isn't silent. */
  private fun rejectHaptic() {
    window.decorView.performHapticFeedback(
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) HapticFeedbackConstants.REJECT
      else HapticFeedbackConstants.LONG_PRESS,
    )
  }

  /** Disabled point buttons also dim, so a match the watch can't score does not look tappable. */
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
   * Keeps a live, scoreable scoreboard awake through the gap between points,
   * for [SCREEN_HOLD_MS] after each snapshot. Longer pauses fall to the ambient
   * scoreboard rather than holding full brightness for the whole match, and
   * nothing that isn't scoreable holds the screen at all.
   */
  private fun holdScreenOn() {
    buttonHandler.removeCallbacks(releaseScreen)
    if (isAmbient || !scoreable) {
      window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
      return
    }
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    buttonHandler.postDelayed(releaseScreen, SCREEN_HOLD_MS)
  }

  private fun releaseScreenNow() {
    buttonHandler.removeCallbacks(releaseScreen)
    window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
  }

  private fun shouldLeaveAmbient(): Boolean =
    !scoreable || SystemClock.elapsedRealtime() - lastLiveSnapshotAt > AMBIENT_STALE_MS

  /**
   * Shows the interactive scoreboard, or in ambient a low-power one: no fills,
   * no tiles or undo, the points in plain white type, everything else gray (or
   * white without anti-aliasing on a low-bit display).
   */
  private fun applyPresentation() {
    val ambient = isAmbient
    val visibleInAmbient = if (ambient) View.GONE else View.VISIBLE
    buttons.visibility = visibleInAmbient
    undoButton.visibility = visibleInAmbient
    feedback.visibility = visibleInAmbient
    serverText.visibility = if (ambient || largeFont) View.GONE else View.VISIBLE
    ambientScore.visibility = if (ambient && hasRenderedScore) View.VISIBLE else View.GONE
    scoreboard.background = if (ambient) null else plateBackground

    val secondary = if (ambient) (if (lowBitAmbient) textColor else mutedColor) else null
    statusTitle.setTextColor(secondary ?: yellowColor)
    setsScore.setTextColor(secondary ?: textColor)
    gamesScore.setTextColor(secondary ?: yellowColor)
    ambientScore.setTextColor(textColor)
    val antiAlias = !(ambient && lowBitAmbient)
    for (view in listOf(statusTitle, setsScore, gamesScore, ambientScore)) {
      view.paint.isAntiAlias = antiAlias
      view.invalidate()
    }
  }

  private fun leaveAmbientPresentation() {
    isAmbient = false
    root.translationX = 0f
    root.translationY = 0f
    applyPresentation()
  }

  /** Moves the ambient content a few pixels each update, so no pixel stays lit. */
  private fun shiftForBurnIn() {
    val range = dp(BURN_IN_SHIFT_DP)
    root.translationX = Random.nextInt(-range, range + 1).toFloat()
    root.translationY = Random.nextInt(-range, range + 1).toFloat()
  }

  private fun showWaitingForMatch() {
    feedbackTitle.text = getString(R.string.feedback_waiting_for_match)
    feedbackBody.text = getString(R.string.feedback_waiting_for_match_body)
  }

  /**
   * The status line is the one line always in view, so an undo, from a held tile
   * or a stem button, is confirmed there and felt, not only in the feedback area
   * a scroll below.
   */
  private fun showUndoSent() {
    statusTitle.text = getString(R.string.status_undo_sent)
    feedbackTitle.text = getString(R.string.feedback_undo_sent)
    feedbackBody.text = getString(R.string.feedback_undo_sent_body)
    undoHaptic()
  }

  private fun showUndoHint() {
    feedbackTitle.text = getString(R.string.feedback_undo_hint)
    feedbackBody.text = getString(R.string.feedback_undo_hint_body)
  }

  private fun reportMissingPhone(hasNodes: Boolean) {
    if (hasNodes) return
    statusTitle.text = getString(R.string.status_no_phone)
    feedbackTitle.text = getString(R.string.feedback_phone_not_found)
    feedbackBody.text = getString(R.string.feedback_phone_not_found_body)
    rejectHaptic()
  }

  private fun reportNotSent() {
    statusTitle.text = getString(R.string.status_not_sent)
    feedbackTitle.text = getString(R.string.feedback_not_sent)
    feedbackBody.text = getString(R.string.feedback_not_sent_body)
    rejectHaptic()
  }

  private fun requestScoreSync() {
    sendToConnectedNodes(SYNC_REQUEST_PATH, ByteArray(0), { hasNodes ->
      if (!hasNodes) {
        statusTitle.text = getString(R.string.status_no_phone)
        feedbackTitle.text = getString(R.string.feedback_phone_not_found)
        feedbackBody.text = getString(R.string.feedback_sync_no_phone_body, getString(R.string.app_name))
      } else if (!hasRenderedScore) {
        // Mid-match, the snapshot this asks for replaces the score on its own;
        // only an empty scoreboard needs to say what's happening.
        feedbackTitle.text = getString(R.string.feedback_looking)
        feedbackBody.text = getString(R.string.feedback_looking_body)
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

  /** Names a view's long-press action for TalkBack ("double-tap and hold to Undo last point"). */
  private fun labelLongClick(view: View, label: String) {
    view.accessibilityDelegate = object : View.AccessibilityDelegate() {
      override fun onInitializeAccessibilityNodeInfo(host: View, info: AccessibilityNodeInfo) {
        super.onInitializeAccessibilityNodeInfo(host, info)
        if (host.isLongClickable && host.isEnabled) {
          // An action with the same id replaces the unlabeled one the view added.
          info.addAction(AccessibilityNodeInfo.AccessibilityAction(AccessibilityNodeInfo.ACTION_LONG_CLICK, label))
        }
      }
    }
  }

  /**
   * The tile's two lines: a short name, then the points, drawn large. At large
   * font scales the points stay the size they are at [LARGE_FONT_SCALE], so the
   * tiles still fit the first viewport.
   */
  private fun pointTileLabel(name: String, points: String): CharSequence {
    val fontScale = resources.configuration.fontScale
    val scale = if (largeFont) POINTS_SCALE * LARGE_FONT_SCALE / fontScale else POINTS_SCALE
    val text = SpannableString("$name\n$points")
    text.setSpan(RelativeSizeSpan(scale), name.length + 1, text.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
    return text
  }

  /**
   * A name that fits half a watch face and still tells two players apart:
   * "Chris Lee" → "Chris L", "Ann Smith / Bob Jones" → "Ann/Bob".
   */
  private fun shortName(name: String): String {
    val people = name.split(" / ").map { it.trim() }.filter { it.isNotEmpty() }
    if (people.isEmpty()) return getString(R.string.player_fallback)
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
      "Ad" -> getString(R.string.point_advantage)
      else -> point
    }
  }

  /**
   * A dark scoreboard tile edged in the player's color, with white text, so the
   * points stay readable in sunlight. Pressing fills it with that color, and the
   * text turns black, which is what stays readable on the fill.
   *
   * On a round screen the tile's outer bottom corner is rounded to follow the
   * circle: at 1.0 font scale the tiles end about 13dp above the bottom of a
   * 192dp screen, where a square corner falls outside the display.
   */
  private fun pointButton(
    text: CharSequence,
    color: Int,
    outerBottomLeft: Boolean = false,
    outerBottomRight: Boolean = false,
  ): Button {
    val corners = tileCorners(outerBottomLeft, outerBottomRight)
    val pressed = rounded(color, corners, color, dp(3))
    val resting = rounded(controlColor, corners, color, dp(3))
    return Button(this).apply {
      this.text = text
      textSize = 13f
      setAllCaps(false)
      setTextColor(
        ColorStateList(
          arrayOf(intArrayOf(android.R.attr.state_pressed), intArrayOf()),
          intArrayOf(pressedTextColor, textColor),
        ),
      )
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

  /** Corner radii in GradientDrawable order: top-left, top-right, bottom-right, bottom-left. */
  private fun tileCorners(outerBottomLeft: Boolean, outerBottomRight: Boolean): FloatArray {
    val base = dp(20).toFloat()
    val outer = dp(ROUND_TILE_OUTER_CORNER_DP).toFloat()
    val bottomRight = if (outerBottomRight) outer else base
    val bottomLeft = if (outerBottomLeft) outer else base
    return floatArrayOf(base, base, base, base, bottomRight, bottomRight, bottomLeft, bottomLeft)
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

  private fun rounded(color: Int, radii: FloatArray, strokeColor: Int, strokeWidth: Int): GradientDrawable {
    return GradientDrawable().apply {
      shape = GradientDrawable.RECTANGLE
      setColor(color)
      cornerRadii = radii
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

    /** The only status the watch scores; mirrors SCOREABLE_STATUS on the phone. */
    private const val LIVE_STATUS = "in_progress"

    /** The title the phone's match screen sends once a match is over (buildWearFeedback). */
    private const val PHONE_MATCH_COMPLETE_TITLE = "Match complete"

    // The 25-second rule plus a long rally: the gap between two points. A
    // changeover or set break runs past it and drops to ambient.
    private const val SCREEN_HOLD_MS = 45 * 1000L

    // A live match the phone hasn't updated for this long leaves ambient for the
    // watch face: long enough for a set break, short enough that a match the
    // phone stopped sending doesn't stay on the wrist.
    private const val AMBIENT_STALE_MS = 5 * 60 * 1000L
    private const val BURN_IN_SHIFT_DP = 6

    // On a 192dp round screen this keeps the outer bottom corner of each tile
    // inside the circle: a corner of radius r centered at (20 + r, 179 - r)
    // stays within the 96dp radius for r of about 41dp and up.
    private const val ROUND_TILE_OUTER_CORNER_DP = 44
    private const val LARGE_FONT_SCALE = 1.15f
    // 13sp names over 30sp points on the player tiles.
    private const val POINTS_SCALE = 2.3f
    private const val SHORT_NAME_MAX = 9
    private val WHITESPACE = Regex("\\s+")
    // Android's condensed sans: the closest system face to the scoreboard's
    // Barlow Condensed, which this module doesn't ship.
    private val CONDENSED_BOLD: Typeface = Typeface.create("sans-serif-condensed", Typeface.BOLD)
    private val CONDENSED_REGULAR: Typeface = Typeface.create("sans-serif-condensed", Typeface.NORMAL)
  }
}
