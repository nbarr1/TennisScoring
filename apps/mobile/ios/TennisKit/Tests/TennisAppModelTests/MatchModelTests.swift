import XCTest
import TennisCore
@testable import TennisAppModel

@MainActor
final class MatchListTests: XCTestCase {
  func testSectionsFollowTheSampleDivision() async {
    let backend = DemoBackend.sample(signedIn: true)
    let model = MatchListModel(userId: "demo", repository: backend)
    let observation = Task { await model.observe() }
    defer { observation.cancel() }

    await eventually("loaded") { !model.isLoading }
    XCTAssertEqual(model.sections.map(\.kind), [.needsResponse, .live, .reports, .upcoming, .awaitingOpponent, .recent])
    XCTAssertEqual(model.sections.first { $0.kind == .needsResponse }?.matches.map(\.id), ["incoming"])
    XCTAssertEqual(model.sections.first { $0.kind == .awaitingOpponent }?.matches.map(\.id), ["outgoing"])
    XCTAssertEqual(model.sections.first { $0.kind == .recent }?.matches.map(\.id), ["won-1", "lost-1", "won-2"])
    XCTAssertEqual(model.actionCount, 2, "one proposal to answer and one report to confirm")
  }

  func testCancelledMatchesAndOtherPlayersProposalsAreHidden() {
    let matches = [
      Match(id: "c", divisionId: "d", player1Id: "me", player2Id: "x", status: .cancelled),
      Match(id: "p", divisionId: "d", player1Id: "x", player2Id: "y", playerIds: ["x", "y", "me"], status: .proposed),
    ]
    XCTAssertEqual(MatchSections.make(matches, userId: "me"), [])
  }

  func testUpcomingIsSoonestFirstAndRecentIsCapped() {
    let upcoming = [
      Match(id: "later", divisionId: "d", player1Id: "me", player2Id: "x", status: .scheduled, scheduledAt: 300, createdAt: 1),
      Match(id: "sooner", divisionId: "d", player1Id: "me", player2Id: "x", status: .scheduled, scheduledAt: 200, createdAt: 2),
    ]
    let recent = (0..<30).map {
      Match(id: "r\($0)", divisionId: "d", player1Id: "me", player2Id: "x", status: .completed, completedAt: Int64($0), createdAt: 0)
    }
    let sections = MatchSections.make(upcoming + recent, userId: "me", recentLimit: 5)
    XCTAssertEqual(sections.first { $0.kind == .upcoming }?.matches.map(\.id), ["sooner", "later"])
    XCTAssertEqual(sections.first { $0.kind == .recent }?.matches.map(\.id), ["r29", "r28", "r27", "r26", "r25"])
  }
}

@MainActor
final class MatchDetailTests: XCTestCase {
  private func load(_ matchId: String, as userId: String = "demo", tips: Bool = true) async -> (MatchDetailModel, DemoBackend, Task<Void, Never>) {
    let backend = DemoBackend.sample(signedIn: true)
    let model = MatchDetailModel(matchId: matchId, userId: userId, tipsEnabled: tips, repository: backend)
    let observation = Task { await model.observe() }
    await eventually("match loaded") { model.match != nil }
    return (model, backend, observation)
  }

  func testScoringAndUndoOnALiveMatch() async {
    let (model, backend, observation) = await load("live")
    defer { observation.cancel() }
    XCTAssertTrue(model.canScore)
    XCTAssertFalse(model.canUndo)

    await model.score(.player1)
    XCTAssertEqual(model.match?.liveScore.currentGame, GameScore(player1: .forty, player2: .fifteen))
    XCTAssertEqual(model.currentTip?.trigger, .gamePoint)
    XCTAssertTrue(model.canUndo)

    await model.undo()
    await eventually("undone") { model.match?.liveScore.currentGame == GameScore(player1: .thirty, player2: .fifteen) }
    XCTAssertEqual(backend.performedActions, [.undoLastPoint(matchId: "live")])
    XCTAssertNil(model.currentTip)
  }

  func testTipsRespectThePlayerSetting() async {
    let (model, _, observation) = await load("live", tips: false)
    defer { observation.cancel() }
    await model.score(.player1)
    XCTAssertNil(model.currentTip)
  }

  func testWinningTheMatchMovesItToReporting() async {
    let (model, _, observation) = await load("live")
    defer { observation.cancel() }
    // Up a set and 3-2, player1 wins every remaining point.
    var guardrail = 0
    while model.match?.status == .inProgress && guardrail < 100 {
      await model.score(.player1)
      guardrail += 1
    }
    XCTAssertEqual(model.match?.status, .pendingReport)
    XCTAssertEqual(model.match?.winner, .player1)
    XCTAssertEqual(model.currentTip?.trigger, .matchComplete)
    XCTAssertFalse(model.canScore)
    XCTAssertTrue(model.canSubmitReport)
    XCTAssertTrue(model.canUndo, "the last point can still be taken back until a report is filed")

    await model.submitReport()
    await eventually("report filed") { model.match?.reportSubmission != nil }
    XCTAssertTrue(model.isAwaitingReportConfirmation)
    XCTAssertFalse(model.canRespondToReport, "the submitter never confirms their own report")
    XCTAssertFalse(model.canUndo)
  }

  func testOpponentConfirmsAReport() async {
    let (model, backend, observation) = await load("to-confirm")
    defer { observation.cancel() }
    XCTAssertTrue(model.canRespondToReport)
    XCTAssertFalse(model.canSubmitReport)

    await model.confirmReport()
    await eventually("completed") { model.match?.status == .completed }
    XCTAssertEqual(backend.performedActions, [.confirmReport(matchId: "to-confirm", confirmedBy: "demo")])
  }

  func testProposalsAreAnsweredBySideTwoAndWithdrawnBySideOne() async {
    let (incoming, _, first) = await load("incoming")
    defer { first.cancel() }
    XCTAssertTrue(incoming.canRespondToProposal)
    XCTAssertFalse(incoming.canWithdrawProposal)
    await incoming.acceptProposal()
    await eventually("accepted") { incoming.match?.status == .scheduled }

    let (outgoing, _, second) = await load("outgoing")
    defer { second.cancel() }
    XCTAssertFalse(outgoing.canRespondToProposal)
    XCTAssertTrue(outgoing.canWithdrawProposal)
    await outgoing.acceptProposal()
    XCTAssertEqual(outgoing.match?.status, .proposed, "the proposer cannot accept their own proposal")
    await outgoing.declineProposal()
    await eventually("withdrawn") { outgoing.match?.status == .cancelled }
  }

  func testAScheduledMatchMustBeStartedBeforeScoring() async {
    let (model, _, observation) = await load("upcoming")
    defer { observation.cancel() }
    XCTAssertFalse(model.canScore)
    XCTAssertTrue(model.canStart)
    await model.start(server: .player2)
    await eventually("started") { model.match?.status == .inProgress }
    XCTAssertEqual(model.match?.liveScore.server, .player2)
    XCTAssertTrue(model.canScore)
  }

  func testWriteErrorsAreShownAndClearOnTheNextAttempt() async {
    let (model, backend, observation) = await load("live")
    defer { observation.cancel() }
    backend.failNextWrite("Network unavailable")
    await model.score(.player2)
    XCTAssertEqual(model.errorMessage, "Network unavailable")
    XCTAssertEqual(model.match?.liveScore.currentGame, GameScore(player1: .thirty, player2: .fifteen))
    XCTAssertFalse(model.isWorking)

    await model.score(.player2)
    XCTAssertNil(model.errorMessage)
    XCTAssertEqual(model.match?.liveScore.currentGame, GameScore(player1: .thirty, player2: .thirty))
  }

  func testWatchCommandsAreScopedToThisMatch() async {
    let (model, _, observation) = await load("live")
    defer { observation.cancel() }

    let applied = await model.handle(.point(matchId: "some-other-match", scorer: .player1))
    XCTAssertFalse(applied)
    XCTAssertEqual(model.match?.liveScore.currentGame, GameScore(player1: .thirty, player2: .fifteen))

    let accepted = await model.handle(.point(matchId: "live", scorer: .player2))
    XCTAssertTrue(accepted)
    XCTAssertEqual(model.match?.liveScore.currentGame, GameScore(player1: .thirty, player2: .thirty))

    let snapshot = model.watchSnapshot
    XCTAssertEqual(snapshot?.matchId, "live")
    XCTAssertEqual(snapshot?.player1Name, "Alex Demo")
    XCTAssertEqual(snapshot?.canScore, true)
  }

  /// The second player on each doubles side is neither player1Id nor player2Id,
  /// and used to be shut out of scoring.
  func testEveryDoublesPlayerCanScore() async {
    let players = ["ann", "bob", "cara", "dan", "eve"].map {
      User(id: $0, displayName: $0.capitalized, email: "\($0)@example.test", divisionId: "d")
    }
    let doubles = Match(
      id: "dbl", divisionId: "d", matchType: "doubles",
      side1: MatchSide(playerIds: ["ann", "bob"]), side2: MatchSide(playerIds: ["cara", "dan"]),
      player1Id: "ann", player2Id: "cara", status: .inProgress
    )
    for (userId, expected) in [("ann", true), ("bob", true), ("cara", true), ("dan", true), ("eve", false)] {
      let backend = DemoBackend(users: players, matches: [doubles], signedInAs: userId)
      let model = MatchDetailModel(matchId: "dbl", userId: userId, tipsEnabled: false, repository: backend)
      let observation = Task { await model.observe() }
      await eventually("loaded") { model.match != nil }
      XCTAssertEqual(model.canScore, expected, userId)

      await model.handle(.point(matchId: "dbl", scorer: .player2))
      XCTAssertNil(model.errorMessage, userId)
      XCTAssertEqual(backend.match(id: "dbl")?.liveScore.currentGame.player2 == .fifteen, expected, userId)
      observation.cancel()
    }
  }

  func testSpectatorsCannotScore() async {
    let (model, _, observation) = await load("other-1", as: "demo")
    defer { observation.cancel() }
    XCTAssertFalse(model.canScore)
    XCTAssertFalse(model.canSubmitReport)
    XCTAssertNil(model.watchSnapshot, "a completed match has nothing live to mirror")
  }
}

@MainActor
final class RankingsTests: XCTestCase {
  func testSampleStandingsSplitByLevel() async {
    let backend = DemoBackend.sample(signedIn: true)
    let model = RankingsModel(divisionId: DemoBackend.demoDivisionId, userId: "demo", repository: backend)
    let observation = Task { await model.observe() }
    defer { observation.cancel() }

    await eventually("loaded") { !model.isLoading && model.tables.count == 2 }
    let titles = Set(model.tables.map(\.title))
    XCTAssertEqual(titles, ["Intermediate Singles", "Open Doubles"])
    let singles = model.tables.first { $0.kind == .singles }
    XCTAssertEqual(singles?.seasonName, "Fall 2026")
    XCTAssertEqual(singles?.rows.map(\.rank), Array(1...(singles?.rows.count ?? 0)))
    XCTAssertTrue(singles?.containsCurrentUser ?? false)
  }

  func testConfirmingAReportUpdatesStandings() async {
    let backend = DemoBackend.sample(signedIn: true)
    let model = RankingsModel(divisionId: DemoBackend.demoDivisionId, userId: "demo", repository: backend)
    let observation = Task { await model.observe() }
    defer { observation.cancel() }
    await eventually("loaded") { !model.isLoading }
    let before = model.tables.first { $0.kind == .singles }?.rows.first { $0.id == "riley" }?.played

    try? await backend.perform(.confirmReport(matchId: "to-confirm", confirmedBy: "demo"))
    await eventually("riley's confirmed match counted") {
      model.tables.first { $0.kind == .singles }?.rows.first { $0.id == "riley" }?.played == (before ?? 0) + 1
    }
  }

  func testTablesSeparateSeasonsAndPutThePlayersTableFirst() {
    func ranking(_ user: String, season: String, rank: Int, updatedAt: Int64) -> PlayerRanking {
      PlayerRanking(
        userId: user, displayName: user, divisionId: "d", season: season, seasonId: season, rank: rank,
        matchesPlayed: 1, matchesWon: 1, matchesLost: 0, setsWon: 2, setsLost: 0,
        gamesWon: 12, gamesLost: 3, gameDifferential: 9, updatedAt: updatedAt
      )
    }
    let tables = Standings.tables(
      singles: [
        ranking("a", season: "spring-2026", rank: 1, updatedAt: 10),
        ranking("me", season: "spring-2026", rank: 2, updatedAt: 10),
        ranking("b", season: "fall-2026", rank: 0, updatedAt: 20),
        ranking("c", season: "fall-2026", rank: 1, updatedAt: 20),
      ],
      doubles: [],
      levels: [],
      userId: "me"
    )
    XCTAssertEqual(tables.map(\.seasonName), ["Spring 2026", "Fall 2026"])
    XCTAssertEqual(tables[1].rows.map(\.id), ["c", "b"], "unranked rows sort last")
  }
}
