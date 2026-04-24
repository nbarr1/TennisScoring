package com.tennisleague.wear

import android.content.Context
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.Wearable
import com.google.android.gms.wearable.WearableListenerService
import kotlinx.coroutines.flow.MutableStateFlow

// Runs on the watch, listens for score updates sent from the phone via the Data Layer API.
class DataLayerService : WearableListenerService() {
  companion object {
    val scoreJson = MutableStateFlow("")
    const val SCORE_PATH = "/tennis/score"
    const val POINT_PATH = "/tennis/point"

    fun sendPointToPhone(context: Context, player: String) {
      Wearable.getNodeClient(context).connectedNodes.addOnSuccessListener { nodes ->
        for (node in nodes) {
          Wearable.getMessageClient(context).sendMessage(node.id, POINT_PATH, player.toByteArray())
        }
      }
    }
  }

  override fun onMessageReceived(event: MessageEvent) {
    if (event.path == SCORE_PATH) {
      scoreJson.value = String(event.data)
    }
  }
}
