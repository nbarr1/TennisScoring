import Foundation

struct ScoreResult { let nextScore: LiveScore; var tips: [String] = []; var matchWinner: Player?; var setWinner: Player? }
enum ScoreEngine {
  static func initial(_ format: MatchFormat = .init()) -> LiveScore { _ = format; return LiveScore() }
  static func applyPoint(_ score: LiveScore, scorer: Player, format: MatchFormat) -> ScoreResult {
    if score.isTiebreak { return applyTiebreak(score, scorer: scorer, format: format) }
    var next=score, game=score.currentGame; let mine = scorer == .player1 ? game.player1 : game.player2; let theirs = scorer == .player1 ? game.player2 : game.player1; var winner: Player?
    let sequence: [TennisPoint] = [.love,.fifteen,.thirty,.forty]
    var nextMine = mine
    if mine == .advantage || (mine == .forty && theirs != .forty && theirs != .advantage) { winner=scorer }
    else if mine == .forty && theirs == .advantage { if scorer == .player1 { game.player2 = .forty } else { game.player1 = .forty } }
    else if mine == .forty { nextMine = .advantage }
    else { nextMine = sequence[sequence.firstIndex(of: mine)! + 1] }
    if scorer == .player1 { game.player1=nextMine } else { game.player2=nextMine }; next.currentGame=game
    guard let winner else { return ScoreResult(nextScore: next, tips: nextMine == .advantage ? ["advantage"] : (game.player1 == .forty && game.player2 == .forty ? ["deuce"] : [])) }
    if winner == .player1 { next.sets[next.currentSet].player1Games += 1 } else { next.sets[next.currentSet].player2Games += 1 }
    next.currentGame=GameScore(); next.server=next.server.other; next.serviceSide = .deuce
    let set=next.sets[next.currentSet], finalSet=next.player1SetsWon == format.setsToWin-1 && next.player2SetsWon == format.setsToWin-1
    if set.player1Games == format.tiebreakAt && set.player2Games == format.tiebreakAt && (!finalSet || format.finalSetTiebreak) { next.isTiebreak=true; next.tiebreakScore=TiebreakScore(); return ScoreResult(nextScore: next,tips:["service_change","tiebreak_start"]) }
    let setWinner: Player? = set.player1Games >= format.gamesPerSet && set.player1Games-set.player2Games >= 2 ? .player1 : (set.player2Games >= format.gamesPerSet && set.player2Games-set.player1Games >= 2 ? .player2 : nil)
    return setWinner.map { completeSet(next,winner:$0,format:format,tips:["service_change"]) } ?? ScoreResult(nextScore:next,tips:["service_change"])
  }
  private static func applyTiebreak(_ score: LiveScore, scorer: Player, format: MatchFormat) -> ScoreResult { var next=score, tb=score.tiebreakScore!; if scorer == .player1 { tb.player1Points += 1 } else { tb.player2Points += 1 }; next.tiebreakScore=tb; let winner: Player? = tb.player1Points >= 7 && tb.player1Points-tb.player2Points >= 2 ? .player1 : (tb.player2Points >= 7 && tb.player2Points-tb.player1Points >= 2 ? .player2:nil); guard let winner else{return ScoreResult(nextScore:next)}; if winner == .player1 { next.sets[next.currentSet].player1Games=max(next.sets[next.currentSet].player1Games,next.sets[next.currentSet].player2Games+1) } else { next.sets[next.currentSet].player2Games=max(next.sets[next.currentSet].player2Games,next.sets[next.currentSet].player1Games+1) }; next.sets[next.currentSet].tiebreak=tb; return completeSet(next,winner:winner,format:format,tips:[]) }
  private static func completeSet(_ score: LiveScore,winner:Player,format:MatchFormat,tips:[String])->ScoreResult { var next=score, output=tips; next.sets[next.currentSet].winner=winner; if winner == .player1 {next.player1SetsWon += 1}else{next.player2SetsWon += 1}; next.isTiebreak=false; next.tiebreakScore=nil; if next.player1SetsWon == format.setsToWin || next.player2SetsWon == format.setsToWin {output.append("match_complete");return ScoreResult(nextScore:next,tips:output,matchWinner:winner,setWinner:winner)}; next.currentSet += 1;next.sets.append(SetScore(setNumber:next.currentSet));output.append("new_set");return ScoreResult(nextScore:next,tips:output,setWinner:winner) }
}
