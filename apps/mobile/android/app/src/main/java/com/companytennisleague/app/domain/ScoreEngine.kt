package com.companytennisleague.app.domain

data class ScoreResult(val nextScore: LiveScore, val tips: List<String> = emptyList(), val matchWinner: Player? = null, val setWinner: Player? = null)

object ScoreEngine {
  fun initial(format: MatchFormat = MatchFormat()): LiveScore { @Suppress("UNUSED_VARIABLE") val contract = format; return LiveScore() }

  fun applyPoint(score: LiveScore, scorer: Player, format: MatchFormat): ScoreResult {
    if (score.isTiebreak) return tiebreak(score, scorer, format)
    var game = score.currentGame
    val mine = if (scorer == Player.PLAYER1) game.player1 else game.player2
    val theirs = if (scorer == Player.PLAYER1) game.player2 else game.player1
    var winner: Player? = null
    val tips = mutableListOf<String>()
    val nextMine = when {
      mine == TennisPoint.ADVANTAGE -> { winner = scorer; mine }
      mine == TennisPoint.FORTY && theirs == TennisPoint.ADVANTAGE -> TennisPoint.FORTY
      mine == TennisPoint.FORTY && theirs == TennisPoint.FORTY -> TennisPoint.ADVANTAGE
      mine == TennisPoint.FORTY -> { winner = scorer; mine }
      else -> TennisPoint.entries[TennisPoint.entries.indexOf(mine) + 1]
    }
    game = if (scorer == Player.PLAYER1) GameScore(nextMine, if (theirs == TennisPoint.ADVANTAGE) TennisPoint.FORTY else theirs) else GameScore(if (theirs == TennisPoint.ADVANTAGE) TennisPoint.FORTY else theirs, nextMine)
    if (winner == null) {
      if (game.player1 == TennisPoint.FORTY && game.player2 == TennisPoint.FORTY) tips += "deuce"
      if (nextMine == TennisPoint.ADVANTAGE) tips += "advantage"
      return ScoreResult(score.copy(currentGame = game), tips)
    }
    val sets = score.sets.toMutableList()
    val old = sets[score.currentSet]
    val set = if (winner == Player.PLAYER1) old.copy(player1Games = old.player1Games + 1) else old.copy(player2Games = old.player2Games + 1)
    sets[score.currentSet] = set
    var next = score.copy(sets = sets, currentGame = GameScore(), server = score.server.other(), serviceSide = ServiceSide.DEUCE)
    val finalSet = score.player1SetsWon == format.setsToWin - 1 && score.player2SetsWon == format.setsToWin - 1
    if (set.player1Games == format.tiebreakAt && set.player2Games == format.tiebreakAt && (!finalSet || format.finalSetTiebreak))
      return ScoreResult(next.copy(isTiebreak = true, tiebreakScore = TiebreakScore()), listOf("service_change", "tiebreak_start"))
    val setWinner = when { set.player1Games >= format.gamesPerSet && set.player1Games - set.player2Games >= 2 -> Player.PLAYER1; set.player2Games >= format.gamesPerSet && set.player2Games - set.player1Games >= 2 -> Player.PLAYER2; else -> null }
    return if (setWinner == null) ScoreResult(next, listOf("service_change")) else completeSet(next, setWinner, format, mutableListOf("service_change"))
  }

  private fun tiebreak(score: LiveScore, scorer: Player, format: MatchFormat): ScoreResult {
    val old = requireNotNull(score.tiebreakScore)
    val tb = if (scorer == Player.PLAYER1) old.copy(player1Points = old.player1Points + 1) else old.copy(player2Points = old.player2Points + 1)
    val total = tb.player1Points + tb.player2Points
    var next = score.copy(tiebreakScore = tb, server = if (total % 2 == 1) score.server.other() else score.server, serviceSide = if (total % 2 == 0) if (score.serviceSide == ServiceSide.DEUCE) ServiceSide.ADVANTAGE else ServiceSide.DEUCE else ServiceSide.DEUCE)
    val winner = when { tb.player1Points >= 7 && tb.player1Points - tb.player2Points >= 2 -> Player.PLAYER1; tb.player2Points >= 7 && tb.player2Points - tb.player1Points >= 2 -> Player.PLAYER2; else -> null }
    if (winner == null) return ScoreResult(next, if (total % 6 == 0) listOf("service_change") else emptyList())
    val sets = next.sets.toMutableList(); val set = sets[next.currentSet]
    sets[next.currentSet] = if (winner == Player.PLAYER1) set.copy(player1Games = maxOf(set.player1Games, set.player2Games + 1), tiebreak = tb, winner = winner) else set.copy(player2Games = maxOf(set.player2Games, set.player1Games + 1), tiebreak = tb, winner = winner)
    next = next.copy(sets = sets)
    return completeSet(next, winner, format, mutableListOf())
  }

  private fun completeSet(score: LiveScore, winner: Player, format: MatchFormat, tips: MutableList<String>): ScoreResult {
    val sets = score.sets.toMutableList(); sets[score.currentSet] = sets[score.currentSet].copy(winner = winner)
    val p1 = score.player1SetsWon + if (winner == Player.PLAYER1) 1 else 0; val p2 = score.player2SetsWon + if (winner == Player.PLAYER2) 1 else 0
    var next = score.copy(sets = sets, player1SetsWon = p1, player2SetsWon = p2, isTiebreak = false, tiebreakScore = null)
    if (p1 == format.setsToWin || p2 == format.setsToWin) { tips += "match_complete"; return ScoreResult(next, tips, winner, winner) }
    val index = score.currentSet + 1; next = next.copy(sets = sets + SetScore(index), currentSet = index, currentGame = GameScore(), serviceSide = ServiceSide.DEUCE); tips += "new_set"
    return ScoreResult(next, tips, setWinner = winner)
  }

  fun undo(snapshot: LiveScore): LiveScore = snapshot.copy(sets = snapshot.sets.map { it.copy(tiebreak = it.tiebreak?.copy()) }, currentGame = snapshot.currentGame.copy(), tiebreakScore = snapshot.tiebreakScore?.copy())
  fun formatSets(score: LiveScore) = score.sets.filterIndexed { i, s -> s.winner != null || i == score.currentSet }.joinToString(", ") { s -> if (s.tiebreak != null && s.winner != null) "${s.player1Games}-${s.player2Games}(${if (s.winner == Player.PLAYER1) s.tiebreak.player2Points else s.tiebreak.player1Points})" else "${s.player1Games}-${s.player2Games}" }
  fun formatGame(score: LiveScore): String { if (score.isTiebreak) return "${score.tiebreakScore!!.player1Points}-${score.tiebreakScore.player2Points}"; val (a,b)=score.currentGame; return when { a==TennisPoint.FORTY&&b==TennisPoint.FORTY -> "Deuce"; a==TennisPoint.ADVANTAGE -> if(score.server==Player.PLAYER1) "Ad In" else "Ad Out"; b==TennisPoint.ADVANTAGE -> if(score.server==Player.PLAYER2) "Ad In" else "Ad Out"; a==TennisPoint.LOVE&&b==TennisPoint.LOVE -> "Love-all"; a==b -> "${a.wire}-all"; else -> "${if(a==TennisPoint.LOVE) "Love" else a.wire} – ${if(b==TennisPoint.LOVE) "Love" else b.wire}" } }
}
