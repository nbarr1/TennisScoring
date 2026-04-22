package com.tennisleague.modules.wearos

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import com.google.android.gms.wearable.Wearable
import com.google.android.gms.wearable.MessageClient
import com.google.android.gms.wearable.MessageEvent
import android.content.Context

// Expo Module that bridges the Wearable Data Layer API to TypeScript.
// Allows React Native to send score updates to a paired Galaxy Watch (Wear OS)
// and receive point inputs back from the watch.
class WearOsModule : Module(), MessageClient.OnMessageReceivedListener {
  companion object {
    const val SCORE_PATH = "/tennis/score"
    const val POINT_PATH = "/tennis/point"
  }

  override fun definition() = ModuleDefinition {
    Name("WearOs")

    Events("onWearScoreInput", "onWearConnected")

    OnCreate {
      val context = appContext.reactContext ?: return@OnCreate
      Wearable.getMessageClient(context).addListener(this@WearOsModule)
    }

    OnDestroy {
      val context = appContext.reactContext ?: return@OnDestroy
      Wearable.getMessageClient(context).removeListener(this@WearOsModule)
    }

    // Send score JSON to all connected Wear OS nodes
    AsyncFunction("sendScore") { scoreJson: String ->
      val context = appContext.reactContext ?: return@AsyncFunction
      val nodeClient = Wearable.getNodeClient(context)
      nodeClient.connectedNodes.addOnSuccessListener { nodes ->
        val msgClient = Wearable.getMessageClient(context)
        for (node in nodes) {
          msgClient.sendMessage(node.id, SCORE_PATH, scoreJson.toByteArray())
        }
      }
    }

    Function("isWearOsAvailable") {
      appContext.reactContext?.packageManager?.let {
        it.hasSystemFeature("android.hardware.type.watch").not()
      } ?: false
    }
  }

  override fun onMessageReceived(event: MessageEvent) {
    if (event.path == POINT_PATH) {
      val player = String(event.data)
      sendEvent("onWearScoreInput", mapOf("player" to player))
    }
  }
}
