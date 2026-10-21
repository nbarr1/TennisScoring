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
    let snapshot = WatchScoreSnapshot(
      matchId: "m1", player1Name: "Ann", player2Name: "Bob", status: .inProgress, score: score,
      canScore: true, canUndo: true, isParticipant: true
    )
    let message = try snapshot.message()
    XCTAssertEqual(WatchScoreSnapshot(message: message), snapshot)
  }

  func testMessagesAreDeterministic() throws {
    let snapshot = WatchScoreSnapshot(matchId: "m1", player1Name: "A", player2Name: "B", status: .inProgress, score: LiveScore(), canScore: true)
    let sentAt = Date(timeIntervalSince1970: 1_800_000_000)
    XCTAssertEqual(try snapshot.message(sentAt: sentAt), try snapshot.message(sentAt: sentAt))
  }

  func testSnapshotCarriesWhenItWasSent() throws {
    let snapshot = WatchScoreSnapshot(matchId: "m1", player1Name: "A", player2Name: "B", status: .inProgress, score: LiveScore(), canScore: true)
    let sentAt = Date(timeIntervalSince1970: 1_800_000_000.25)
    let message = try snapshot.message(sentAt: sentAt)
    XCTAssertEqual(message["sentAt"], "1800000000250")
    XCTAssertEqual(WatchScoreSnapshot.sentAt(in: message)?.timeIntervalSince1970 ?? 0, sentAt.timeIntervalSince1970, accuracy: 0.001)
    XCTAssertNil(WatchScoreSnapshot.sentAt(in: ["score": "{}"]), "the React Native module sends no timestamp")
  }

  func testReactNativeScoreOnlyMessageIsReadOnly() throws {
    let json = String(decoding: try JSONEncoder().encode(LiveScore()), as: UTF8.self)
    let snapshot = try XCTUnwrap(WatchScoreSnapshot(message: ["score": json]))
    XCTAssertEqual(snapshot.matchId, "")
    XCTAssertFalse(snapshot.canScore, "without a match id, any command would be rejected by the phone")
    XCTAssertFalse(snapshot.canUndo)
    XCTAssertFalse(snapshot.isParticipant)
  }

  func testSnapshotRejectsGarbage() {
    XCTAssertNil(WatchScoreSnapshot(message: [:]))
    XCTAssertNil(WatchScoreSnapshot(message: ["score": "not json"]))
    XCTAssertNil(WatchScoreSnapshot(message: ["score": 42]))
  }

  func testRemovalMessageNamesTheMatchAndIsNotASnapshot() {
    let message = WatchScoreSnapshot.removalMessage(matchId: "m1")
    XCTAssertEqual(WatchScoreSnapshot.removedMatchId(in: message), "m1")
    XCTAssertNil(WatchScoreSnapshot(message: message))
    XCTAssertNil(WatchScoreSnapshot.removedMatchId(in: ["removedMatchId": ""]))
    XCTAssertNil(WatchScoreSnapshot.removedMatchId(in: ["score": "{}"]))
  }

  func testButtonNamesAddTheLastInitialOnlyWhenFirstNamesCollide() {
    func names(_ first: String, _ second: String) -> [String] {
      let labels = WatchScoreSnapshot(matchId: "m", player1Name: first, player2Name: second, status: .inProgress, score: LiveScore(), canScore: true).buttonNames
      return [labels.player1, labels.player2]
    }
    XCTAssertEqual(names("Ann Smith", "Sam Rivera"), ["Ann", "Sam"])
    XCTAssertEqual(names("Chris Lee", "Chris Moore"), ["Chris L", "Chris M"])
    XCTAssertEqual(names("Ann Smith / Bob Jones", "Ann Lee / Bob Kim"), ["Ann S/Bob J", "Ann L/Bob K"])
    XCTAssertEqual(names("Ann Smith / Bob Jones", "Cara Lee / Dan Ruiz"), ["Ann/Bob", "Cara/Dan"])
    XCTAssertEqual(names("Chris Lee", "Chris Long"), ["Chris Lee", "Chris Long"], "initials collide too, so the full names are used")
    XCTAssertEqual(names("Chris", "Chris Lee"), ["Chris", "Chris L"])
  }

  func testCommandsRoundTrip() {
    for command in [WatchCommand.point(matchId: "m1", scorer: .player2), .undo(matchId: "m1")] {
      XCTAssertEqual(WatchCommand(message: command.message), command)
      XCTAssertEqual(command.matchId, "m1")
    }
  }

  func testCommandWithoutMatchIdIsRejected() {
    // The pre-scoping watch build sent exactly this.
    XCTAssertNil(WatchCommand(message: ["action": "point", "player": "player1"]))
    XCTAssertNil(WatchCommand(message: ["action": "point", "player": "player1", "matchId": ""]))
    XCTAssertNil(WatchCommand(message: ["action": "point", "player": "player3", "matchId": "m1"]))
    XCTAssertNil(WatchCommand(message: ["action": "undo"]))
    XCTAssertNil(WatchCommand(message: ["action": "undo", "matchId": ""]))
    XCTAssertNil(WatchCommand(message: ["action": "redo", "matchId": "m1"]))
  }

  func testReplies() {
    XCTAssertTrue(WatchCommand.isApplied(WatchCommand.replyMessage(applied: true)))
    XCTAssertFalse(WatchCommand.isApplied(WatchCommand.replyMessage(applied: false)))
    XCTAssertFalse(WatchCommand.isApplied([:]), "a reply that says nothing is not a yes")
  }
}
