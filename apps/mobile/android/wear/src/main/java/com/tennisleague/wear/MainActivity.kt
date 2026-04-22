package com.tennisleague.wear

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.wear.compose.material.MaterialTheme

class MainActivity : ComponentActivity() {
  private val dataLayerService = DataLayerService()

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setContent {
      MaterialTheme {
        ScoreScreen(service = dataLayerService)
      }
    }
  }
}
