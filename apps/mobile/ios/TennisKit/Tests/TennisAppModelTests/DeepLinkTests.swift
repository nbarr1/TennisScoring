import Foundation
import XCTest
@testable import TennisAppModel

final class DeepLinkTests: XCTestCase {
  func testMatchLinksInBothSchemes() {
    XCTAssertEqual(DeepLink(url: URL(string: "tennisleague://match/abc123")!), .match(id: "abc123"))
    XCTAssertEqual(DeepLink(url: URL(string: "com.companytennisleague.app://match/abc123")!), .match(id: "abc123"))
    XCTAssertEqual(DeepLink(url: URL(string: "TennisLeague://Match/abc123")!), .match(id: "abc123"))
  }

  func testRejectsOtherLinks() {
    XCTAssertNil(DeepLink(url: URL(string: "tennisleague://match")!))
    XCTAssertNil(DeepLink(url: URL(string: "tennisleague://match/")!))
    XCTAssertNil(DeepLink(url: URL(string: "tennisleague://messages/abc")!))
    XCTAssertNil(DeepLink(url: URL(string: "https://example.com/match/abc")!))
  }
}
