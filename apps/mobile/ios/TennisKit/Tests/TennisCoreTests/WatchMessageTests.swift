import Foundation
import XCTest
@testable import TennisCore

final class WatchMessageTests: XCTestCase {
  func testSnapshotRoundTrips() throws {
    let score = LiveScore(
      sets: [SetScore(setNumber: 0, player1Games: 3, player2Games: 2)],
      currentGame: GameScore(player1: .thirty, player2: .forty),
      server: .player2
    )
    let snapshot = WatchScoreSnapshot(matchId: "m1", player1Name: "Ann", player2Name: "Bob", status: .inProgress, score: score, canScore: true)
    let message = try snapshot.message()
    XCTAssertEqual(WatchScoreSnapshot(message: message), snapshot)
  }

  func testMessagesAreDeterministic() throws {
    let snapshot = WatchScoreSnapshot(matchId: "m1", player1Name: "A", player2Name: "B", status: .inProgress, score: LiveScore(), canScore: true)
    XCTAssertEqual(try snapshot.message(), try snapshot.message())
  }

  func testReactNativeScoreOnlyMessageIsReadOnly() throws {
    let json = String(decoding: try JSONEncoder().encode(LiveScore()), as: UTF8.self)
    let snapshot = try XCTUnwrap(WatchScoreSnapshot(message: ["score": json]))
    XCTAssertEqual(snapshot.matchId, "")
    XCTAssertFalse(snapshot.canScore, "without a match id, any command would be rejected by the phone")
  }

  func testSnapshotRejectsGarbage() {
    XCTAssertNil(WatchScoreSnapshot(message: [:]))
    XCTAssertNil(WatchScoreSnapshot(message: ["score": "not json"]))
    XCTAssertNil(WatchScoreSnapshot(message: ["score": 42]))
  }

  func testCommandRoundTrips() {
    let command = WatchCommand.point(matchId: "m1", scorer: .player2)
    XCTAssertEqual(WatchCommand(message: command.message), command)
  }

  func testCommandWithoutMatchIdIsRejected() {
    // The pre-scoping watch build sent exactly this.
    XCTAssertNil(WatchCommand(message: ["action": "point", "player": "player1"]))
    XCTAssertNil(WatchCommand(message: ["action": "point", "player": "player1", "matchId": ""]))
    XCTAssertNil(WatchCommand(message: ["action": "point", "player": "player3", "matchId": "m1"]))
    XCTAssertNil(WatchCommand(message: ["action": "undo", "player": "player1", "matchId": "m1"]))
  }
}
