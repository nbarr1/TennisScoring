import Foundation
import XCTest
@testable import TennisCore

final class MessagingDecodingTests: XCTestCase {
  private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
    try JSONDecoder().decode(T.self, from: Data(json.utf8))
  }

  func testChannelFromTheContractFixture() throws {
    // fixtures/mobile-contract/scoring.json's representative channel: no type,
    // no createdAt, and a legacy `memberIds` field rather than participantIds.
    let channel = try decode(Channel.self, #"{"id": "c1", "memberIds": ["u1", "u2"]}"#)
    XCTAssertEqual(channel.type, "division")
    XCTAssertFalse(channel.isDirect)
    XCTAssertEqual(channel.participantIds, [])
  }

  func testDirectChannel() throws {
    let channel = try decode(Channel.self, """
      {"type": "direct", "participantIds": ["a", "b"], "createdAt": 100,
       "lastMessage": {"content": "hi", "senderId": "b", "senderName": "", "timestamp": 250}}
      """)
    XCTAssertTrue(channel.isDirect)
    XCTAssertEqual(channel.otherParticipant(for: "a"), "b")
    XCTAssertNil(Channel(id: "g", type: "division", participantIds: ["a", "b"]).otherParticipant(for: "a"), "group channels have no single other participant")
    XCTAssertEqual(channel.lastMessage?.senderName, "Unknown")
    XCTAssertEqual(channel.lastActivity, 250)
  }

  func testMessageKindsAndContact() throws {
    let text = try decode(Message.self, #"{"senderId": "a", "senderName": "Ann", "content": "hi", "type": "text", "sharedContact": null, "createdAt": 5}"#)
    XCTAssertEqual(text.kind, .text)
    XCTAssertNil(text.sharedContact)

    let share = try decode(Message.self, """
      {"senderId": "a", "senderName": "Ann", "content": "Shared contact information", "type": "contact_share",
       "sharedContact": {"phone": "555-0100", "email": ""}}
      """)
    XCTAssertEqual(share.kind, .contactShare)
    XCTAssertEqual(share.sharedContact, SharedContact(phone: "555-0100"))

    let unknown = try decode(Message.self, #"{"type": "poll", "content": "?"}"#)
    XCTAssertEqual(unknown.kind, .text, "an unknown type still renders as text")
    XCTAssertEqual(unknown.senderName, "Unknown")
  }

  func testShareableContactFollowsPreferences() {
    var user = User(id: "a", displayName: "Ann", email: "ann@example.test", phone: "555-0100")
    user.contactPreferences = ContactPreferences(allowEmail: true, allowSMS: false, allowInApp: true)
    XCTAssertEqual(SharedContact.shareable(from: user), SharedContact(email: "ann@example.test"))
    user.contactPreferences = ContactPreferences(allowEmail: false, allowSMS: true, allowInApp: true)
    XCTAssertEqual(SharedContact.shareable(from: user), SharedContact(phone: "555-0100"))
    user.contactPreferences = ContactPreferences(allowEmail: false, allowSMS: false, allowInApp: true)
    XCTAssertTrue(SharedContact.shareable(from: user).isEmpty)
  }
}
