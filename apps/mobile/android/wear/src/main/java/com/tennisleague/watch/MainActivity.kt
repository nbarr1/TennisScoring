package com.tennisleague.watch

import android.app.Activity
import android.graphics.Color
import android.graphics.Typeface
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import com.google.android.gms.wearable.MessageClient
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.Wearable
import org.json.JSONObject

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

  private var matchFinished = false

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    buildLayout()
    renderWaitingState()
  }

  override fun onResume() {
    super.onResume()
    Wearable.getMessageClient(this).addListener(this)
  }

  override fun onPause() {
    Wearable.getMessageClient(this).removeListener(this)
    super.onPause()
  }

  override fun onMessageReceived(event: MessageEvent) {
    if (event.path != SCORE_PATH) return
    val payload = String(event.data)
    runOnUiThread { renderPayload(payload) }
  }

  private fun buildLayout() {
    val scroll = ScrollView(this).apply {
      setBackgroundColor(BACKGROUND)
      isFillViewport = true
    }
    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_HORIZONTAL
      setPadding(dp(14), dp(12), dp(14), dp(14))
    }

    val title = label("Tennis Score", 12, MUTED, true)
    root.addView(title)

    setsScore = label("Sets 0-0", 24, Color.WHITE, true)
    root.addView(setsScore)

    gamesScore = label("Games 0-0", 16, YELLOW, true)
    root.addView(gamesScore)

    pointScore = label("Open a live match", 18, GREEN_LIGHT, true)
    root.addView(pointScore)

    serverText = label("Waiting for phone", 12, MUTED, false)
    root.addView(serverText)

    val names = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER
      setPadding(0, dp(8), 0, dp(4))
    }
    player1Name = label("P1", 11, Color.WHITE, true)
    player2Name = label("P2", 11, Color.WHITE, true)
    names.addView(player1Name, rowWeight())
    names.addView(player2Name, rowWeight())
    root.addView(names)

    val buttons = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER
    }
    player1Button = pointButton("P1 +")
    player1Button.setOnClickListener { sendPoint("player1") }
    player2Button = pointButton("P2 +")
    player2Button.setOnClickListener { sendPoint("player2") }
    buttons.addView(player1Button, rowWeight())
    buttons.addView(player2Button, rowWeight())
    root.addView(buttons)

    feedbackTitle = label("", 13, YELLOW, true)
    feedbackTitle.setPadding(0, dp(8), 0, 0)
    root.addView(feedbackTitle)

    feedbackBody = label("", 11, MUTED, false)
    root.addView(feedbackBody)

    scroll.addView(root)
    setContentView(scroll)
  }

  private fun renderWaitingState() {
    matchFinished = false
    player1Button.isEnabled = true
    player2Button.isEnabled = true
    feedbackTitle.text = "Ready"
    feedbackBody.text = "Open a live match on your phone, then score points here."
  }

  private fun renderPayload(payload: String) {
    try {
      val root = JSONObject(payload)
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

      player1Name.text = p1Name
      player2Name.text = p2Name
      player1Button.text = shortButtonLabel(p1Name)
      player2Button.text = shortButtonLabel(p2Name)
      setsScore.text = "Sets $p1Sets-$p2Sets"
      gamesScore.text = "Games $p1Games-$p2Games"
      pointScore.text =
        if (isTiebreak && tiebreak != null) {
          "TB ${tiebreak.optInt("player1Points", 0)}-${tiebreak.optInt("player2Points", 0)}"
        } else {
          "${formatPoint(currentGame?.optString("player1", "0"))}-${formatPoint(currentGame?.optString("player2", "0"))}"
        }
      serverText.text = "${if (server == "player1") p1Name else p2Name} serves, $serviceSide"

      matchFinished =
        status == "pending_report" ||
        status == "completed" ||
        root.optString("feedbackTitle") == "Match complete" ||
        winnerName.isNotBlank()
      player1Button.isEnabled = !matchFinished
      player2Button.isEnabled = !matchFinished

      if (matchFinished) {
        feedbackTitle.text = "Match complete"
        feedbackBody.text =
          if (winnerName.isNotBlank()) {
            "$winnerName wins. Check your phone to confirm the final match report."
          } else {
            "Check your phone to confirm the final match report."
          }
      } else {
        feedbackTitle.text = root.optString("feedbackTitle", "Live")
        feedbackBody.text = root.optString("feedbackBody", "Score points from your watch.")
      }
    } catch (_: Exception) {
      feedbackTitle.text = "Sync error"
      feedbackBody.text = "Could not read the latest score from the phone."
    }
  }

  private fun sendPoint(player: String) {
    if (matchFinished) return
    Wearable.getNodeClient(this).connectedNodes.addOnSuccessListener { nodes ->
      val client = Wearable.getMessageClient(this)
      for (node in nodes) {
        client.sendMessage(node.id, POINT_PATH, player.toByteArray())
      }
    }
  }

  private fun shortButtonLabel(name: String): String {
    val first = name.trim().split(" ").firstOrNull()?.take(8)
    return if (first.isNullOrBlank()) "Point" else "$first +"
  }

  private fun formatPoint(point: String?): String {
    return when (point) {
      null, "0" -> "0"
      else -> point
    }
  }

  private fun pointButton(text: String): Button {
    return Button(this).apply {
      this.text = text
      textSize = 12f
      setTextColor(Color.WHITE)
      setTypeface(Typeface.DEFAULT, Typeface.BOLD)
      setBackgroundColor(GREEN)
      minHeight = dp(44)
      setPadding(dp(4), 0, dp(4), 0)
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

  private fun dp(value: Int): Int {
    return (value * resources.displayMetrics.density).toInt()
  }

  companion object {
    private const val SCORE_PATH = "/tennis/score"
    private const val POINT_PATH = "/tennis/point"
    private val BACKGROUND = Color.rgb(5, 8, 6)
    private val GREEN = Color.rgb(26, 71, 42)
    private val GREEN_LIGHT = Color.rgb(168, 213, 162)
    private val YELLOW = Color.rgb(255, 220, 96)
    private val MUTED = Color.rgb(180, 190, 184)
  }
}
