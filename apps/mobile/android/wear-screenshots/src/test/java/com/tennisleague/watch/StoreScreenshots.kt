package com.tennisleague.watch

import android.graphics.Bitmap
import android.graphics.Canvas
import android.view.View
import android.widget.ScrollView
import androidx.wear.ambient.AmbientLifecycleObserver
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import org.robolectric.shadows.ShadowLooper
import java.io.File
import java.io.FileOutputStream

/**
 * Renders the real MainActivity under Robolectric's native graphics, feeds it
 * the same v1 snapshot envelope the phone's WearOsModule sends, and saves the
 * window as a PNG. Nothing here draws UI of its own.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w227dp-h227dp-round-watch-xhdpi")
class StoreScreenshots {
  private val out = File(System.getProperty("shots.out") ?: "build/shots").apply { mkdirs() }
  private var sequence = 0L

  private fun score(
    sets: List<Pair<Int, Int>>,
    p1: String = "0",
    p2: String = "0",
    server: String = "player1",
    side: String = "deuce",
    tiebreak: Pair<Int, Int>? = null,
    setsWon: Pair<Int, Int>? = null,
  ): JSONObject {
    val setArray = JSONArray()
    sets.forEachIndexed { i, (a, b) ->
      setArray.put(JSONObject().put("setNumber", i + 1).put("player1Games", a).put("player2Games", b))
    }
    var p1Sets = 0
    var p2Sets = 0
    sets.dropLast(1).forEach { (a, b) -> if (a > b) p1Sets++ else p2Sets++ }
    if (setsWon != null) { p1Sets = setsWon.first; p2Sets = setsWon.second }
    return JSONObject()
      .put("sets", setArray)
      .put("currentSet", sets.size - 1)
      .put("currentGame", JSONObject().put("player1", p1).put("player2", p2))
      .put("isTiebreak", tiebreak != null)
      .apply { if (tiebreak != null) put("tiebreakScore", JSONObject().put("player1Points", tiebreak.first).put("player2Points", tiebreak.second)) }
      .put("server", server)
      .put("serviceSide", side)
      .put("player1SetsWon", p1Sets)
      .put("player2SetsWon", p2Sets)
  }

  private fun envelope(score: JSONObject, status: String, canScore: Boolean, extra: Map<String, String> = emptyMap()): String {
    val payload = JSONObject()
      .put("score", score)
      .put("matchId", "demo-match")
      .put("status", status)
      .put("canScore", canScore)
      .put("player1Name", "Jordan Lee")
      .put("player2Name", "Maya Patel")
    extra.forEach { (k, v) -> payload.put(k, v) }
    sequence += 1
    return JSONObject()
      .put("protocolVersion", 1)
      .put("sessionId", "demo-session")
      .put("matchId", "demo-match")
      .put("sequence", sequence)
      .put("acknowledgedEventIds", JSONArray())
      .put("scoreJson", payload.toString())
      .put("canScore", canScore)
      .toString()
  }

  private fun shoot(name: String, prepare: (MainActivity) -> Unit) {
    // Created, started, and attached, but not resumed: onResume asks the Data
    // Layer for connected nodes, and with no Play services under Robolectric that
    // request fails asynchronously and overwrites the status with NO PHONE.
    val controller = Robolectric.buildActivity(MainActivity::class.java).create().start().postCreate(null).visible()
    val activity = controller.get()
    ShadowLooper.idleMainLooper()
    prepare(activity)
    ShadowLooper.idleMainLooper()
    val decor = activity.window.decorView
    val metrics = activity.resources.displayMetrics
    val w = metrics.widthPixels
    val h = metrics.heightPixels
    decor.measure(View.MeasureSpec.makeMeasureSpec(w, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(h, View.MeasureSpec.EXACTLY))
    decor.layout(0, 0, w, h)
    // Let the scroll indicator that appears on attach fade, as it does on a watch.
    ShadowLooper.idleMainLooper(3, java.util.concurrent.TimeUnit.SECONDS)
    val bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
    decor.draw(Canvas(bitmap))
    FileOutputStream(File(out, "$name.png")).use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
    println("Saved $name ${w}x$h")
    controller.stop().destroy()
  }

  private fun MainActivity.render(payload: String) {
    val m = MainActivity::class.java.getDeclaredMethod("renderSnapshot", String::class.java)
    m.isAccessible = true
    m.invoke(this, payload)
  }

  private fun MainActivity.scrollToBottom() {
    val f = MainActivity::class.java.getDeclaredField("scroll")
    f.isAccessible = true
    val scroll = f.get(this) as ScrollView
    val w = resources.displayMetrics.widthPixels
    val h = resources.displayMetrics.heightPixels
    window.decorView.measure(View.MeasureSpec.makeMeasureSpec(w, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(h, View.MeasureSpec.EXACTLY))
    window.decorView.layout(0, 0, w, h)
    scroll.scrollTo(0, scroll.getChildAt(0).height)
  }

  private fun MainActivity.enterAmbient() {
    val f = MainActivity::class.java.getDeclaredField("ambientCallback")
    f.isAccessible = true
    val callback = f.get(this) as AmbientLifecycleObserver.AmbientLifecycleCallback
    callback.onEnterAmbient(AmbientLifecycleObserver.AmbientDetails(false, false))
  }

  @Test
  fun liveRally() = shoot("01-live-scoring") {
    it.render(envelope(score(listOf(6 to 4, 3 to 2), p1 = "30", p2 = "15"), "in_progress", true))
  }

  @Test
  fun breakPointMoment() = shoot("02-deuce") {
    it.render(
      envelope(
        score(listOf(6 to 4, 4 to 4), p1 = "40", p2 = "40", server = "player2", side = "deuce"),
        "in_progress", true,
        mapOf("feedbackTitle" to "Deuce", "feedbackBody" to "Deuce — must win by 2 consecutive points to win the game."),
      ),
    )
  }

  @Test
  fun tiebreak() = shoot("03-tiebreak") {
    it.render(envelope(score(listOf(4 to 6, 6 to 6), server = "player2", side = "advantage", tiebreak = 5 to 4), "in_progress", true))
  }

  @Test
  fun matchPoint() = shoot("04-match-point") {
    it.render(
      envelope(
        score(listOf(6 to 4, 5 to 3), p1 = "40", p2 = "15", server = "player1", side = "advantage"),
        "in_progress", true,
        mapOf("feedbackTitle" to "Match point", "feedbackBody" to "Match point. Win the next game to win the match."),
      ),
    )
  }

  @Test
  fun undoAndHelp() = shoot("05-undo-and-help") {
    it.render(envelope(score(listOf(6 to 4, 3 to 2), p1 = "30", p2 = "15"), "in_progress", true))
    it.scrollToBottom()
  }

  @Test
  fun finalScore() = shoot("06-final") {
    it.render(
      envelope(
        score(listOf(6 to 4, 6 to 3), setsWon = 2 to 0),
        "pending_report", false,
        mapOf(
          "feedbackTitle" to "Match complete",
          "feedbackBody" to "Check your phone to confirm the final match report.",
          "matchWinnerName" to "Jordan Lee",
        ),
      ),
    )
  }

  @Test
  fun ambient() = shoot("07-ambient") {
    it.render(envelope(score(listOf(6 to 4, 3 to 2), p1 = "30", p2 = "15"), "in_progress", true))
    it.enterAmbient()
  }

  @Test
  fun waiting() = shoot("08-waiting-for-phone") { }
}
