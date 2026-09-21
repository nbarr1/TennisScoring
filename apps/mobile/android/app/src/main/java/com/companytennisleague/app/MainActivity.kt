package com.companytennisleague.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.companytennisleague.app.presentation.TennisLeagueApp

/** Native single-activity host. No JavaScript runtime or Metro bundle is involved. */
class MainActivity : ComponentActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setContent { TennisLeagueApp() }
  }
}
