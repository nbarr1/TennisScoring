import XCTest
import TennisCore
@testable import TennisAppModel

@MainActor
final class SessionModelTests: XCTestCase {
  func testStartsSignedOutAndSignsIn() async {
    let backend = DemoBackend.sample()
    let session = SessionModel(services: backend.services)
    let observation = Task { await session.observe() }
    defer { observation.cancel() }

    await eventually("signed out") { session.state == .signedOut }

    await session.signIn(email: " \(DemoBackend.demoEmail.uppercased()) ", password: "anything")
    await eventually("ready") {
      if case let .ready(user) = session.state { return user.id == "demo" }
      return false
    }
    XCTAssertNil(session.signInError)
    XCTAssertEqual(session.user?.displayName, "Alex Demo")
  }

  func testSignInErrorsAreShown() async {
    let session = SessionModel(services: DemoBackend.sample().services)
    await session.signIn(email: "", password: "")
    XCTAssertEqual(session.signInError, "Enter your email and password.")

    await session.signIn(email: "nobody@example.test", password: "x")
    XCTAssertNotNil(session.signInError)
    XCTAssertFalse(session.isSigningIn)
  }

  func testPlayerWithoutDivisionJoinsByCode() async {
    let backend = DemoBackend(
      users: [User(id: "new", displayName: "New Player", email: "new@example.test")],
      inviteCodes: ["ABC123": "d1"],
      signedInAs: "new"
    )
    let session = SessionModel(services: backend.services)
    let observation = Task { await session.observe() }
    defer { observation.cancel() }

    await eventually("needs division") {
      if case .needsDivision = session.state { return true }
      return false
    }

    let rejected = await session.joinDivision(inviteCode: "WRONG")
    XCTAssertFalse(rejected)
    XCTAssertEqual(session.joinDivisionError, "Invalid invite code.")

    let joined = await session.joinDivision(inviteCode: "abc123")
    XCTAssertTrue(joined)
    await eventually("ready after joining") {
      if case let .ready(user) = session.state { return user.divisionId == "d1" }
      return false
    }
  }

  func testSigningOutReturnsToSignIn() async {
    let session = SessionModel(services: DemoBackend.sample(signedIn: true).services)
    let observation = Task { await session.observe() }
    defer { observation.cancel() }

    await eventually("ready") { session.user != nil }
    session.signOut()
    await eventually("signed out") { session.state == .signedOut }
    XCTAssertNil(session.user)
  }

  func testMissingProfileIsReportedNotTreatedAsSignedOut() async {
    let backend = DemoBackend(users: [User(id: "ghost", displayName: "Ghost", email: "ghost@example.test")], signedInAs: "ghost")
    // Sign in as an account whose profile document is absent.
    let empty = DemoBackend(users: [], signedInAs: nil)
    let services = AppServices(auth: backend, users: empty, matches: empty, rankings: empty, divisions: empty, messaging: empty, isDemo: true)
    let session = SessionModel(services: services)
    let observation = Task { await session.observe() }
    defer { observation.cancel() }

    await eventually("failed") {
      if case .failed = session.state { return true }
      return false
    }
  }
}
