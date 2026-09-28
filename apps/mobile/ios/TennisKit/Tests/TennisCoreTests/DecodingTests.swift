import Foundation
import XCTest
@testable import TennisCore

final class DecodingTests: XCTestCase {
  private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
    try JSONDecoder().decode(T.self, from: Data(json.utf8))
  }

  /// fixtures/mobile-contract/scoring.json holds minimal documents shared with the
  /// Android suite. They omit fields the older Swift models required, so they
  /// are what a sparse production document looks like.
  func testRepresentativeContractDocumentsDecode() throws {
    let url = URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
      .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
      .deletingLastPathComponent()
      .appendingPathComponent("fixtures/mobile-contract/scoring.json")
    struct Contract: Decodable {
      struct Representative: Decodable {
        let users: [User]
        let matches: [Match]
      }
      let format: MatchFormat
      let representative: Representative
    }
    let contract = try JSONDecoder().decode(Contract.self, from: Data(contentsOf: url))
    XCTAssertEqual(contract.format, .standard)

    let user = try XCTUnwrap(contract.representative.users.first)
    XCTAssertEqual(user.id, "u1")
    XCTAssertEqual(user.displayName, "Ada")
    XCTAssertEqual(user.role, .player)
    XCTAssertEqual(user.contactPreferences, .default)
    XCTAssertEqual(user.createdAt, 1_700_000_000_000)

    let match = try XCTUnwrap(contract.representative.matches.first)
    XCTAssertEqual(match.status, .scheduled)
    XCTAssertEqual(match.playerIds, ["u1", "u2"], "missing playerIds fall back to the flat ids")
    XCTAssertEqual(match.format, .standard)
    XCTAssertEqual(match.liveScore, LiveScore())
    XCTAssertEqual(match.createdBy, "u1")
    XCTAssertFalse(match.isDoublesMatch)
  }

  func testUserToleratesServerTimestampsAndUnknownRoles() throws {
    let user = try decode(User.self, """
      {"email": "ann@example.test", "role": "coach", "updatedAt": {"seconds": 1, "nanoseconds": 0},
       "divisionId": "  ", "fcmTokens": ["t1", 7, null], "createdAt": 1700000000000.0}
      """)
    XCTAssertEqual(user.displayName, "ann@example.test", "a missing display name falls back to the email")
    XCTAssertEqual(user.role, .player, "an unknown role is the least privileged one")
    XCTAssertNil(user.divisionId, "a blank division id means no division")
    XCTAssertEqual(user.fcmTokens, ["t1"])
    XCTAssertEqual(user.createdAt, 1_700_000_000_000)
    XCTAssertEqual(user.updatedAt, 0, "an unreadable timestamp reads as zero, not a decoding failure")
  }

  func testMatchWithoutStatusIsRejected() {
    XCTAssertThrowsError(try decode(Match.self, #"{"player1Id": "a", "player2Id": "b"}"#))
  }

  func testDoublesMatchDerivesFlatFieldsFromSides() throws {
    let match = try decode(Match.self, """
      {"status": "in_progress", "matchType": "doubles",
       "side1": {"playerIds": ["a", "b"], "displayName": "Ann / Bob"},
       "side2": {"playerIds": ["c", "d"]}}
      """)
    XCTAssertEqual(match.player1Id, "a")
    XCTAssertEqual(match.player2Id, "c")
    XCTAssertEqual(match.playerIds, ["a", "b", "c", "d"])
    XCTAssertTrue(match.isDoublesMatch)
    XCTAssertEqual(match.sideDisplayName(.player1), "Ann / Bob")
    XCTAssertEqual(match.sideDisplayName(.player2), "c")
  }

  func testUndoSnapshotPresenceIsRecorded() throws {
    let withSnapshot = try decode(Match.self, #"{"status": "in_progress", "undoSnapshot": {"status": "scheduled"}}"#)
    let withNull = try decode(Match.self, #"{"status": "in_progress", "undoSnapshot": null}"#)
    let without = try decode(Match.self, #"{"status": "in_progress"}"#)
    XCTAssertTrue(withSnapshot.hasUndoSnapshot)
    XCTAssertFalse(withNull.hasUndoSnapshot)
    XCTAssertFalse(without.hasUndoSnapshot)
  }

  func testMalformedLiveScoreIsRepairedInsteadOfCrashingTheEngine() throws {
    let match = try decode(Match.self, """
      {"status": "in_progress", "liveScore": {"sets": [], "currentSet": 4, "isTiebreak": true}}
      """)
    XCTAssertEqual(match.liveScore.sets.count, 1)
    XCTAssertEqual(match.liveScore.currentSet, 0)
    XCTAssertEqual(match.liveScore.tiebreakScore, TiebreakScore())
    let result = ScoreEngine.applyPoint(match.liveScore, scorer: .player1, format: match.format)
    XCTAssertEqual(result.nextScore.tiebreakScore?.player1Points, 1)
  }

  func testRankingDocumentsFillDerivedFields() throws {
    let ranking = try decode(PlayerRanking.self, """
      {"userId": "u1", "matchesWon": 3, "matchesLost": 1, "gamesWon": 40, "gamesLost": 31, "rank": 2, "seasonId": "fall-2026"}
      """)
    XCTAssertEqual(ranking.displayName, "u1")
    XCTAssertEqual(ranking.matchesPlayed, 4)
    XCTAssertEqual(ranking.gameDifferential, 9)
    XCTAssertEqual(ranking.id, "fall-2026||u1")

    let team = try decode(DoublesTeamRanking.self, #"{"teamId": "1:a1:b", "playerIds": ["a", "b"], "rank": 1}"#)
    XCTAssertEqual(team.displayName, "a / b")
  }

  func testFormatClampsNonsenseValues() throws {
    let format = try decode(MatchFormat.self, #"{"setsToWin": 0, "gamesPerSet": -3}"#)
    XCTAssertEqual(format.setsToWin, 1)
    XCTAssertEqual(format.gamesPerSet, 1)
    XCTAssertEqual(format.tiebreakAt, 6)
    XCTAssertTrue(format.finalSetTiebreak)
  }
}
