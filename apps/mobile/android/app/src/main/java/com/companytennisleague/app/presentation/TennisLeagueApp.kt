package com.companytennisleague.app.presentation

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.navigation.NavType
import androidx.navigation.compose.*
import androidx.navigation.navArgument

enum class Route(val path: String, val label: String) { LOGIN("login","Sign in"), DIVISION("division","Choose division"), TUTORIAL("tutorial","Tutorial"), DASHBOARD("dashboard","Dashboard"), MATCHES("matches","Matches"), RANKINGS("rankings","Rankings"), MESSAGES("messages","Messages"), PROFILE("profile","Profile & availability"), ADMIN("admin","Administration"), FEEDBACK("feedback","Feedback"), PRIVACY("privacy-policy","Privacy policy"), ROUND_ROBIN("round-robin-scheduler","Round-robin scheduler") }

@Composable fun TennisLeagueApp() = MaterialTheme(colorScheme = lightColorScheme(primary = androidx.compose.ui.graphics.Color(0xff1a472a))) {
  val nav = rememberNavController()
  NavHost(nav, startDestination = Route.LOGIN.path) {
    Route.entries.forEach { route -> composable(route.path) { Destination(route.label) } }
    composable("match/{id}", arguments=listOf(navArgument("id"){type=NavType.StringType})) { Destination("Match ${it.arguments?.getString("id")}") }
  }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable private fun Destination(title: String) {
  Scaffold(topBar={ TopAppBar(title={ Text(title, Modifier.semantics { heading() }) }) }) { padding ->
    Column(Modifier.padding(padding).padding(24.dp).fillMaxSize(), verticalArrangement=Arrangement.spacedBy(12.dp)) {
      Text(title, style=MaterialTheme.typography.headlineMedium)
      Text("Native Tennis League", style=MaterialTheme.typography.bodyLarge)
    }
  }
}
