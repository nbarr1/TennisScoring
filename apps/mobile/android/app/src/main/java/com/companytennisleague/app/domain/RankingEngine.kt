package com.companytennisleague.app.domain

data class RankingInput(val userId: String, val displayName: String, val divisionId: String, val season: String, val matchesWon: Int, val matchesLost: Int, val setsWon: Int, val setsLost: Int, val gamesWon: Int, val gamesLost: Int)
data class HeadToHead(val player1Id: String, val player2Id: String, val player1Wins: Int, val player2Wins: Int)
data class PlayerRanking(val input: RankingInput, val matchesPlayed: Int, val gameDifferential: Int, val rank: Int, val updatedAt: Long)

object RankingEngine {
  fun compute(inputs: List<RankingInput>, headToHeads: List<HeadToHead>, now: Long = System.currentTimeMillis()): List<PlayerRanking> {
    val h2h = buildMap<Pair<String,String>,Int> { headToHeads.forEach { put(it.player1Id to it.player2Id,it.player1Wins); put(it.player2Id to it.player1Id,it.player2Wins) } }
    val sorted = inputs.sortedWith { a,b ->
      compareValuesBy(b,a,{it.matchesWon},{it.setsWon},{it.gamesWon},{it.gamesWon-it.gamesLost}).takeIf { it != 0 }
        ?: ((h2h[b.userId to a.userId] ?: 0) - (h2h[a.userId to b.userId] ?: 0)).takeIf { it != 0 }
        ?: a.displayName.compareTo(b.displayName)
    }
    return sorted.mapIndexed { index, it -> PlayerRanking(it, it.matchesWon + it.matchesLost, it.gamesWon - it.gamesLost, index + 1, now) }
  }
}
