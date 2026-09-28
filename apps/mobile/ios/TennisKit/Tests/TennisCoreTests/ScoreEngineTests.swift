import XCTest
@testable import TennisCore

/// Focused cases that read as documentation. Full-match behaviour is pinned by
/// `ParityFixtureTests`.
final class ScoreEngineTests: XCTestCase {
  private let oneSet = MatchFormat(setsToWin: 1, gamesPerSet: 6, tiebreakAt: 6, finalSetTiebreak: true)

  private func play(_ scorers: [Player], from score: LiveScore = LiveScore(), format: MatchFormat = .standard) -> (LiveScore, ScoreResult?) {
    var score = score
    var last: ScoreResult?
    for scorer in scorers {
      let result = ScoreEngine.applyPoint(score, scorer: scorer, format: format)
      score = result.nextScore
      last = result
    }
    return (score, last)
  }

  func testHoldingServeRotatesTheServer() {
    let (score, result) = play(Array(repeating: .player1, count: 4))
    XCTAssertEqual(score.sets[0].player1Games, 1)
    XCTAssertEqual(score.server, .player2)
    XCTAssertEqual(score.currentGame, GameScore())
    XCTAssertEqual(result?.gameCompleted, .player1)
    XCTAssertEqual(result?.tips, [.serviceChange])
  }

  func testDeuceAndAdvantage() {
    let deuce = LiveScore(currentGame: GameScore(player1: .forty, player2: .forty))
    let advantage = ScoreEngine.applyPoint(deuce, scorer: .player1, format: .standard)
    XCTAssertEqual(advantage.nextScore.currentGame.player1, .advantage)
    XCTAssertEqual(advantage.tips, [.advantage, .gamePoint])
    XCTAssertEqual(ScoreEngine.formatGameScore(advantage.nextScore), "Ad In")

    let backToDeuce = ScoreEngine.applyPoint(advantage.nextScore, scorer: .player2, format: .standard)
    XCTAssertEqual(backToDeuce.nextScore.currentGame, GameScore(player1: .forty, player2: .forty))
    XCTAssertEqual(backToDeuce.tips, [.deuce])
  }

  func testSetPointIsOnlyReportedAtGamePoint() {
    let fiveThree = LiveScore(sets: [SetScore(setNumber: 0, player1Games: 5, player2Games: 3)])
    XCTAssertEqual(ScoreEngine.applyPoint(fiveThree, scorer: .player1, format: .standard).tips, [])
    let (_, atForty) = play([.player1, .player1, .player1], from: fiveThree)
    XCTAssertEqual(atForty?.tips, [.setPoint])
  }

  func testMatchPointDescribesWhoeverIsOnePointAway() {
    let score = LiveScore(
      sets: [SetScore(setNumber: 0, player1Games: 6, player2Games: 2, winner: .player1), SetScore(setNumber: 1, player1Games: 2, player2Games: 5)],
      currentSet: 1,
      currentGame: GameScore(player1: .fifteen, player2: .forty),
      player1SetsWon: 1
    )
    // player1 scores, but player2 (still on 40) is the one a point from the set.
    // player2 has won no sets yet, so it is a set point, not a match point.
    XCTAssertEqual(ScoreEngine.applyPoint(score, scorer: .player1, format: .standard).tips, [.setPoint])
  }

  func testTiebreakCompletesSetAndMatch() {
    let score = LiveScore(
      sets: [SetScore(setNumber: 0, player1Games: 6, player2Games: 6)],
      isTiebreak: true,
      tiebreakScore: TiebreakScore(player1Points: 6, player2Points: 0)
    )
    let result = ScoreEngine.applyPoint(score, scorer: .player1, format: oneSet)
    XCTAssertEqual(result.matchWinner, .player1)
    XCTAssertEqual(result.nextScore.sets[0].player1Games, 7)
    XCTAssertEqual(result.nextScore.sets[0].tiebreak, TiebreakScore(player1Points: 7, player2Points: 0))
    XCTAssertNil(result.nextScore.tiebreakScore)
    XCTAssertEqual(ScoreEngine.formatScoreDisplay(result.nextScore), "7-6(0)")
  }

  func testTiebreakServeOrder() {
    var score = LiveScore(sets: [SetScore(setNumber: 0, player1Games: 6, player2Games: 6)], isTiebreak: true, tiebreakScore: TiebreakScore())
    var servers: [Player] = [score.server]
    for _ in 0..<5 {
      score = ScoreEngine.applyPoint(score, scorer: .player1, format: .standard).nextScore
      servers.append(score.server)
    }
    // One opening point, then two-point blocks.
    XCTAssertEqual(servers, [.player1, .player2, .player2, .player1, .player1, .player2])
  }

  func testDecidingSetCanPlayOutWithoutATiebreak() {
    let format = MatchFormat(setsToWin: 2, gamesPerSet: 6, tiebreakAt: 6, finalSetTiebreak: false)
    let score = LiveScore(
      sets: [
        SetScore(setNumber: 0, player1Games: 6, player2Games: 4, winner: .player1),
        SetScore(setNumber: 1, player1Games: 4, player2Games: 6, winner: .player2),
        SetScore(setNumber: 2, player1Games: 5, player2Games: 6),
      ],
      currentSet: 2,
      currentGame: GameScore(player1: .forty, player2: .love),
      player1SetsWon: 1,
      player2SetsWon: 1
    )
    let result = ScoreEngine.applyPoint(score, scorer: .player1, format: format)
    XCTAssertFalse(result.nextScore.isTiebreak)
    XCTAssertEqual(result.nextScore.sets[2].player1Games, 6)
    XCTAssertEqual(result.tips, [.serviceChange])
  }

  func testGameScoreWording() {
    XCTAssertEqual(ScoreEngine.formatGameScore(LiveScore()), "Love-all")
    XCTAssertEqual(ScoreEngine.formatGameScore(LiveScore(currentGame: GameScore(player1: .thirty, player2: .thirty))), "30-all")
    XCTAssertEqual(ScoreEngine.formatGameScore(LiveScore(currentGame: GameScore(player1: .love, player2: .forty))), "Love – 40")
    XCTAssertEqual(ScoreEngine.formatGameScore(LiveScore(currentGame: GameScore(player1: .advantage, player2: .forty), server: .player2)), "Ad Out")
  }
}
