import Foundation
import XCTest
@testable import TennisCore

/// Replays fixtures/mobile-contract/engine-parity.json, which records what the
/// TypeScript engines in `@tennis/shared` return, against the Swift port.
///
/// When this fails after an intentional engine change, the TypeScript suite
/// `mobileContractFixture.test.ts` will have failed first: run
/// `pnpm fixtures:mobile-contract`, then port the change here.
final class ParityFixtureTests: XCTestCase {
  private static let fixture: Fixture = {
    let url = URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent() // TennisCoreTests
      .deletingLastPathComponent() // Tests
      .deletingLastPathComponent() // TennisKit
      .deletingLastPathComponent() // ios
      .deletingLastPathComponent() // mobile
      .deletingLastPathComponent() // apps
      .deletingLastPathComponent() // repository root
      .appendingPathComponent("fixtures/mobile-contract/engine-parity.json")
    do {
      return try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: url))
    } catch {
      fatalError("Could not read \(url.path): \(error)")
    }
  }()

  func testFixtureCoversEveryScoringPath() {
    let scenarios = Self.fixture.scoring
    XCTAssertGreaterThanOrEqual(scenarios.count, 6)
    let tips = Set(scenarios.flatMap { $0.points.flatMap(\.tips) })
    XCTAssertEqual(tips, Set(TipTrigger.allCases.map(\.rawValue)), "every tip should fire somewhere in the fixture")
  }

  func testScoringReplaysPointByPoint() throws {
    for scenario in Self.fixture.scoring {
      var score = ScoreEngine.initialScore(for: scenario.format)
      XCTAssertEqual(score, scenario.initialScore, scenario.name)

      for (index, step) in scenario.points.enumerated() {
        let at = "\(scenario.name), point \(index + 1)"
        let result = ScoreEngine.applyPoint(score, scorer: step.scorer, format: scenario.format)
        XCTAssertEqual(result.tips.map(\.rawValue), step.tips, at)
        XCTAssertEqual(result.matchWinner, step.matchWinner, at)
        XCTAssertEqual(result.setCompleted, step.setCompleted, at)
        XCTAssertEqual(result.gameCompleted, step.gameCompleted?.winner, at)
        XCTAssertEqual(result.nextScore.server, step.server, at)
        XCTAssertEqual(result.nextScore.serviceSide, step.serviceSide, at)
        XCTAssertEqual(ScoreEngine.formatScoreDisplay(result.nextScore), step.sets, at)
        XCTAssertEqual(ScoreEngine.formatGameScore(result.nextScore), step.game, at)
        if let expected = step.score {
          XCTAssertEqual(result.nextScore, expected, at)
          // The encoded form is what the watch receives; it must round-trip.
          let encoded = try JSONEncoder().encode(result.nextScore)
          XCTAssertEqual(try JSONDecoder().decode(LiveScore.self, from: encoded), expected, at)
        }
        score = result.nextScore
        // Stop at the first divergent point rather than reporting hundreds.
        if testRun?.failureCount ?? 0 > 0 { return }
      }
    }
  }

  func testSinglesRankingOrder() {
    let cases = Self.fixture.ranking.singles
    let actual = RankingEngine.computeRankings(cases.inputs, headToHeads: cases.headToHeads, now: 0)
    XCTAssertEqual(
      actual.map { SinglesExpectation(userId: $0.userId, rank: $0.rank, matchesPlayed: $0.matchesPlayed, gameDifferential: $0.gameDifferential) },
      cases.expected
    )
  }

  func testDoublesRankingOrder() {
    let cases = Self.fixture.ranking.doubles
    let actual = RankingEngine.computeDoublesRankings(cases.inputs, headToHeads: cases.headToHeads, now: 0)
    XCTAssertEqual(actual.map { DoublesExpectation(teamId: $0.teamId, rank: $0.rank) }, cases.expected)
  }

  func testMatchTotals() {
    for c in Self.fixture.ranking.matchTotals {
      XCTAssertEqual(RankingEngine.extractMatchTotals(c.sets), c.totals, "\(c.sets)")
    }
  }

  func testMatchSideQueries() {
    for c in Self.fixture.matchSides {
      let match = c.match
      XCTAssertEqual(match.isDoublesMatch, c.isDoubles, c.key)
      XCTAssertEqual(match.sidePlayerIds(.player1), c.side1PlayerIds, c.key)
      XCTAssertEqual(match.sidePlayerIds(.player2), c.side2PlayerIds, c.key)
      XCTAssertEqual(match.sideDisplayName(.player1), c.side1Name, c.key)
      XCTAssertEqual(match.sideDisplayName(.player2), c.side2Name, c.key)
      for u in c.users {
        let label = "\(c.key)/\(u.userId.isEmpty ? "(empty)" : u.userId)"
        XCTAssertEqual(match.side(of: u.userId), u.side, label)
        XCTAssertEqual(match.isParticipant(u.userId), u.participant, label)
        XCTAssertEqual(match.arePartners(u.userId, "u1"), u.partnerOfU1, label)
        XCTAssertEqual(match.canRespondToReport(userId: u.userId, submittedBy: "u1"), u.canRespondToU1, label)
        XCTAssertEqual(match.canRespondToReport(userId: u.userId, submittedBy: "u3"), u.canRespondToU3, label)
        XCTAssertEqual(match.canRespondToReport(userId: u.userId, submittedBy: "u9"), u.canRespondToU9, label)
      }
    }
  }

  func testDoublesIds() {
    let ids = Self.fixture.doublesIds
    for c in ids.teamIds {
      XCTAssertEqual(DoublesTeam.teamId(c.playerIds), c.teamId, "\(c.playerIds)")
      XCTAssertEqual(DoublesTeam.playerIds(inTeamId: c.teamId), c.decoded, c.teamId)
    }
    for c in ids.malformedTeamIds {
      XCTAssertEqual(DoublesTeam.playerIds(inTeamId: c.teamId), c.decoded, c.teamId)
    }
    for c in ids.headToHeadIds {
      XCTAssertEqual(
        DoublesTeam.headToHeadId(c.a, c.b, seasonId: c.seasonId, divisionLevelId: c.divisionLevelId, divisionId: c.divisionId),
        c.id
      )
    }
    for c in ids.teamNames {
      XCTAssertEqual(DoublesTeam.formatName(c.names), c.expected)
    }
  }

  func testPrimaryTip() {
    for c in Self.fixture.tips {
      let triggers = c.triggers.compactMap(TipTrigger.init(rawValue:))
      XCTAssertEqual(triggers.count, c.triggers.count)
      XCTAssertEqual(TipTrigger.primary(of: triggers)?.rawValue, c.primary, "\(c.triggers)")
    }
  }
}

// MARK: - Fixture shape

private struct Fixture: Decodable {
  let scoring: [Scenario]
  let ranking: RankingCases
  let matchSides: [MatchSideCase]
  let doublesIds: DoublesIdCases
  let tips: [TipCase]
}

private struct Scenario: Decodable {
  let name: String
  let format: MatchFormat
  let initialScore: LiveScore
  let points: [Step]
}

private struct Step: Decodable {
  struct GameCompletion: Decodable { let winner: Player }
  let scorer: Player
  let tips: [String]
  let server: Player
  let serviceSide: ServiceSide
  let sets: String
  let game: String
  let matchWinner: Player?
  let setCompleted: SetCompletion?
  let gameCompleted: GameCompletion?
  let score: LiveScore?
}

private struct SinglesExpectation: Decodable, Equatable {
  let userId: String
  let rank: Int
  let matchesPlayed: Int
  let gameDifferential: Int
}

private struct DoublesExpectation: Decodable, Equatable {
  let teamId: String
  let rank: Int
}

private struct RankingCases: Decodable {
  struct Singles: Decodable {
    let inputs: [RankingInput]
    let headToHeads: [HeadToHead]
    let expected: [SinglesExpectation]
  }
  struct Doubles: Decodable {
    let inputs: [DoublesTeamRankingInput]
    let headToHeads: [HeadToHead]
    let expected: [DoublesExpectation]
  }
  struct Totals: Decodable {
    let sets: [SetScore]
    let totals: MatchTotals
  }
  let singles: Singles
  let doubles: Doubles
  let matchTotals: [Totals]
}

private struct MatchSideCase: Decodable {
  struct UserCase: Decodable {
    let userId: String
    let side: Player?
    let participant: Bool
    let partnerOfU1: Bool
    let canRespondToU1: Bool
    let canRespondToU3: Bool
    let canRespondToU9: Bool
  }
  let key: String
  let match: Match
  let isDoubles: Bool
  let side1PlayerIds: [String]
  let side2PlayerIds: [String]
  let side1Name: String
  let side2Name: String
  let users: [UserCase]
}

private struct DoublesIdCases: Decodable {
  struct TeamIdCase: Decodable {
    let playerIds: [String]
    let teamId: String
    let decoded: [String]
  }
  struct DecodeCase: Decodable {
    let teamId: String
    let decoded: [String]
  }
  struct HeadToHeadCase: Decodable {
    let a: String
    let b: String
    let seasonId: String?
    let divisionLevelId: String?
    let divisionId: String?
    let id: String
  }
  struct NameCase: Decodable {
    let names: [String]
    let expected: String
    init(from decoder: Decoder) throws {
      var c = try decoder.unkeyedContainer()
      names = try c.decode([String].self)
      expected = try c.decode(String.self)
    }
  }
  let teamIds: [TeamIdCase]
  let malformedTeamIds: [DecodeCase]
  let headToHeadIds: [HeadToHeadCase]
  let teamNames: [NameCase]
}

private struct TipCase: Decodable {
  let triggers: [String]
  let primary: String?
}
