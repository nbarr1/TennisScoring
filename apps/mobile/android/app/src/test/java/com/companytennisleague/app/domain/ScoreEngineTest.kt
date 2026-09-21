package com.companytennisleague.app.domain

import org.junit.Assert.*
import org.junit.Test

class ScoreEngineTest {
  private val format = MatchFormat(setsToWin=1)
  @Test fun normalGameAndServiceRotation() { var s=LiveScore(); repeat(4){s=ScoreEngine.applyPoint(s,Player.PLAYER1,format).nextScore}; assertEquals(1,s.sets[0].player1Games); assertEquals(Player.PLAYER2,s.server); assertEquals(GameScore(),s.currentGame) }
  @Test fun deuceAdvantageAndUndo() { var s=LiveScore(currentGame=GameScore(TennisPoint.FORTY,TennisPoint.FORTY)); s=ScoreEngine.applyPoint(s,Player.PLAYER1,format).nextScore; assertEquals(TennisPoint.ADVANTAGE,s.currentGame.player1); val snapshot=s; s=ScoreEngine.applyPoint(s,Player.PLAYER2,format).nextScore; assertEquals(GameScore(TennisPoint.FORTY,TennisPoint.FORTY),s.currentGame); assertEquals(snapshot,ScoreEngine.undo(snapshot)) }
  @Test fun tiebreakCompletesSetAndMatch() { var s=LiveScore(sets=listOf(SetScore(0,6,6)),isTiebreak=true,tiebreakScore=TiebreakScore(6,0)); val result=ScoreEngine.applyPoint(s,Player.PLAYER1,format); assertEquals(Player.PLAYER1,result.matchWinner); assertEquals(7,result.nextScore.sets[0].player1Games) }
  @Test fun decidingSetCanPlayOut() { val f=MatchFormat(2,6,6,false); var s=LiveScore(sets=listOf(SetScore(0,6,4,winner=Player.PLAYER1),SetScore(1,4,6,winner=Player.PLAYER2),SetScore(2,5,6)),currentSet=2,currentGame=GameScore(TennisPoint.FORTY,TennisPoint.LOVE),player1SetsWon=1,player2SetsWon=1); s=ScoreEngine.applyPoint(s,Player.PLAYER1,f).nextScore; assertFalse(s.isTiebreak); assertEquals(6,s.sets[2].player1Games) }
  @Test fun formatting() { assertEquals("Love-all",ScoreEngine.formatGame(LiveScore())); assertEquals("6-7(5)",ScoreEngine.formatSets(LiveScore(sets=listOf(SetScore(0,6,7,TiebreakScore(5,7),Player.PLAYER2))))) }
}
