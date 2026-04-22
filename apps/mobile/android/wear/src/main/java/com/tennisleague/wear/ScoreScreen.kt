package com.tennisleague.wear

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.*
import org.json.JSONObject

data class WatchScoreState(
  val p1Sets: Int = 0,
  val p2Sets: Int = 0,
  val p1Games: Int = 0,
  val p2Games: Int = 0,
  val p1Points: String = "0",
  val p2Points: String = "0",
  val isTiebreak: Boolean = false,
  val p1TbPoints: Int = 0,
  val p2TbPoints: Int = 0,
)

fun parseScore(json: String): WatchScoreState {
  return try {
    val obj = JSONObject(json)
    val sets = obj.getJSONArray("sets")
    val currentSetIdx = obj.getInt("currentSet")
    val curSet = if (sets.length() > currentSetIdx) sets.getJSONObject(currentSetIdx) else null
    val gameObj = obj.getJSONObject("currentGame")
    val isTb = obj.getBoolean("isTiebreak")
    val tbObj = if (isTb && obj.has("tiebreakScore")) obj.getJSONObject("tiebreakScore") else null
    WatchScoreState(
      p1Sets = obj.getInt("player1SetsWon"),
      p2Sets = obj.getInt("player2SetsWon"),
      p1Games = curSet?.getInt("player1Games") ?: 0,
      p2Games = curSet?.getInt("player2Games") ?: 0,
      p1Points = gameObj.getString("player1"),
      p2Points = gameObj.getString("player2"),
      isTiebreak = isTb,
      p1TbPoints = tbObj?.getInt("player1Points") ?: 0,
      p2TbPoints = tbObj?.getInt("player2Points") ?: 0,
    )
  } catch (e: Exception) {
    WatchScoreState()
  }
}

@Composable
fun ScoreScreen(service: DataLayerService) {
  val rawJson by DataLayerService.scoreJson.collectAsState()
  val score = remember(rawJson) { if (rawJson.isNotEmpty()) parseScore(rawJson) else WatchScoreState() }

  ScalingLazyColumn(
    modifier = Modifier.fillMaxSize().background(Color.Black),
    horizontalAlignment = Alignment.CenterHorizontally,
    contentPadding = PaddingValues(vertical = 16.dp),
  ) {
    // Sets score
    item {
      Text(
        text = "${score.p1Sets} – ${score.p2Sets}",
        color = Color.White,
        fontSize = 22.sp,
        fontWeight = FontWeight.Bold,
      )
    }

    // Game score
    item {
      val gameText = when {
        score.isTiebreak -> "${score.p1TbPoints}–${score.p2TbPoints} TB"
        score.p1Points == "40" && score.p2Points == "40" -> "Deuce"
        score.p1Points == "Ad" -> "Ad In"
        score.p2Points == "Ad" -> "Ad Out"
        else -> "${score.p1Games}–${score.p2Games} (${score.p1Points}–${score.p2Points})"
      }
      Text(text = gameText, color = Color(0xFF90EE90), fontSize = 14.sp)
    }

    // Point buttons
    item {
      Spacer(modifier = Modifier.height(8.dp))
      Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Button(
          onClick = { service.sendPointToPhone("player1") },
          colors = ButtonDefaults.buttonColors(backgroundColor = Color(0xFF2d6a4f)),
          modifier = Modifier.size(56.dp),
        ) {
          Text("P1", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold)
        }
        Button(
          onClick = { service.sendPointToPhone("player2") },
          colors = ButtonDefaults.buttonColors(backgroundColor = Color(0xFF1b4332)),
          modifier = Modifier.size(56.dp),
        ) {
          Text("P2", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold)
        }
      }
    }
  }
}
