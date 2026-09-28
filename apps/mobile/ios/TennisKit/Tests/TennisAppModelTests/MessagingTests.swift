import Foundation
import XCTest
import TennisCore
@testable import TennisAppModel

@MainActor
final class ChannelListTests: XCTestCase {
  private func demoUser(_ backend: DemoBackend) async -> User {
    await firstValue(backend.observeUser(id: "demo"))!!
  }

  func testChannelsAreNewestFirstWithResolvedNames() async {
    let backend = DemoBackend.sample(signedIn: true)
    let model = ChannelListModel(user: await demoUser(backend), repository: backend, names: PlayerNameCache(repository: backend))
    let observation = Task { await model.observe() }
    defer { observation.cancel() }

    await eventually("names resolved") { model.rows.first?.title == "Sam Rivera" }
    XCTAssertEqual(model.rows.map(\.id), ["dm-demo-sam", "demo-division-chat"])
    XCTAssertEqual(model.rows.map(\.title), ["Sam Rivera", "Demo Division"])
    XCTAssertEqual(model.rows.first?.preview, "You: Sounds good, see you at 6.")
  }

  func testUnnamedChannelsFallBack() {
    let backend = DemoBackend(users: [])
    let model = ChannelListModel(
      user: User(id: "me", displayName: "Me", email: "me@example.test"),
      repository: backend,
      names: PlayerNameCache(repository: backend)
    )
    XCTAssertEqual(model.title(for: Channel(id: "g", type: "division", participantIds: ["me"])), "Division chat")
    XCTAssertEqual(model.title(for: Channel(id: "d", type: "direct", participantIds: ["me", "unknown"])), "Direct message")
  }

  func testBlockedSendersPreviewIsHidden() async {
    let backend = DemoBackend.sample(signedIn: true)
    var user = await demoUser(backend)
    user.blockedUserIds = ["riley"]
    let model = ChannelListModel(user: user, repository: backend, names: PlayerNameCache(repository: backend))
    let observation = Task { await model.observe() }
    defer { observation.cancel() }

    await eventually("loaded") { !model.isLoading }
    XCTAssertEqual(model.rows.first { $0.id == "demo-division-chat" }?.preview, "Message from a blocked player")
  }
}

@MainActor
final class ConversationTests: XCTestCase {
  private func open(_ channelId: String) async -> (ConversationModel, DemoBackend, Task<Void, Never>) {
    let backend = DemoBackend.sample(signedIn: true)
    let user = await firstValue(backend.observeUser(id: "demo"))!!
    let channel = await firstValue(backend.observeChannels(userId: "demo"))!.first { $0.id == channelId }!
    let model = ConversationModel(channel: channel, user: user, repository: backend)
    let observation = Task { await model.observe() }
    await eventually("messages loaded") { !model.isLoading }
    return (model, backend, observation)
  }

  func testMessagesAreOldestFirst() async {
    let (model, _, observation) = await open("demo-division-chat")
    defer { observation.cancel() }
    XCTAssertEqual(model.messages.map(\.id), ["m1", "m2", "m3"])
  }

  func testOnlyTheNewestPageLoads() async {
    let backend = DemoBackend(
      users: [User(id: "me", displayName: "Me", email: "me@example.test")],
      channels: [Channel(id: "c", type: "division", participantIds: ["me"])],
      messages: (1...60).map { Message(id: "m\($0)", channelId: "c", senderId: "me", senderName: "Me", content: "\($0)", createdAt: Int64($0)) }
    )
    let model = ConversationModel(
      channel: Channel(id: "c", type: "division", participantIds: ["me"]),
      user: User(id: "me", displayName: "Me", email: "me@example.test"),
      repository: backend
    )
    let observation = Task { await model.observe() }
    defer { observation.cancel() }
    await eventually("loaded") { !model.isLoading }
    // The newest 50, in order: a conversation must never stop at its 50th message.
    XCTAssertEqual(model.messages.first?.id, "m11")
    XCTAssertEqual(model.messages.last?.id, "m60")
    XCTAssertEqual(model.messages.count, ConversationModel.pageSize)
  }

  func testSendingClearsTheDraftAndAppends() async {
    let (model, _, observation) = await open("dm-demo-sam")
    defer { observation.cancel() }
    model.draft = "  On my way  "
    XCTAssertTrue(model.canSend)
    await model.send()
    XCTAssertEqual(model.draft, "")
    await eventually("sent") { model.messages.last?.content == "On my way" }
    XCTAssertTrue(model.isMine(model.messages.last!))
  }

  func testAFailedSendKeepsTheDraft() async {
    let (model, backend, observation) = await open("dm-demo-sam")
    defer { observation.cancel() }
    backend.failNextWrite("offline")
    model.draft = "Running late"
    await model.send()
    XCTAssertEqual(model.draft, "Running late")
    XCTAssertEqual(model.errorMessage, "Message not sent. Your draft is still here.")
    XCTAssertFalse(model.isSending)
  }

  func testBlankAndOverlongDraftsCannotBeSent() async {
    let (model, _, observation) = await open("dm-demo-sam")
    defer { observation.cancel() }
    model.draft = "   \n "
    XCTAssertFalse(model.canSend)
    model.draft = String(repeating: "a", count: Message.maxLength)
    XCTAssertTrue(model.canSend)
    XCTAssertEqual(model.remainingCharacters, 0)
    model.draft += "a"
    XCTAssertFalse(model.canSend)
    XCTAssertEqual(model.remainingCharacters, -1)
  }

  func testBlockingHidesTheSendersMessagesImmediately() async {
    let (model, backend, observation) = await open("demo-division-chat")
    defer { observation.cancel() }
    let riley = model.messages.first { $0.senderId == "riley" }!
    XCTAssertTrue(model.canModerate(riley))

    await model.blockSender(of: riley)
    XCTAssertFalse(model.messages.contains { $0.senderId == "riley" })
    XCTAssertEqual(model.notice, "Riley Chen is blocked. Unblock them from your profile.")

    let saved = await firstValue(backend.observeUser(id: "demo"))
    XCTAssertEqual(saved??.blockedUserIds, ["riley"])
  }

  func testOwnMessagesCannotBeReportedOrBlocked() async {
    let (model, backend, observation) = await open("dm-demo-sam")
    defer { observation.cancel() }
    let mine = model.messages.first { $0.senderId == "demo" }!
    XCTAssertFalse(model.canModerate(mine))
    await model.report(mine, reason: .spam, note: "")
    XCTAssertTrue(backend.filedReports.isEmpty)
  }

  func testReportsAreFiledUnderTheChannelsDivisionOrThePlayers() async {
    let (group, backend, first) = await open("demo-division-chat")
    defer { first.cancel() }
    await group.report(group.messages[0], reason: .harassment, note: "  ")
    XCTAssertEqual(backend.filedReports.first?.divisionId, "demo-division")
    XCTAssertEqual(group.notice, "Message reported. A division leader will review it.")

    // Direct channels carry no division, so the player's own is used.
    let (direct, directBackend, second) = await open("dm-demo-sam")
    defer { second.cancel() }
    let fromSam = direct.messages.first { $0.senderId == "sam" }!
    await direct.report(fromSam, reason: .other, note: "")
    XCTAssertEqual(directBackend.filedReports.first?.divisionId, "demo-division")
  }

  func testSharingContactRespectsPreferences() async {
    let (model, _, observation) = await open("dm-demo-sam")
    defer { observation.cancel() }

    model.user.contactPreferences = ContactPreferences(allowEmail: false, allowSMS: false, allowInApp: true)
    await model.shareContact()
    XCTAssertEqual(model.errorMessage, "Allow email or text contact in your profile before sharing your details.")

    model.user.contactPreferences = ContactPreferences(allowEmail: true, allowSMS: true, allowInApp: true)
    model.user.phone = "555-0100"
    await model.shareContact()
    XCTAssertNil(model.errorMessage)
    await eventually("shared") { model.messages.last?.kind == .contactShare }
    XCTAssertEqual(model.messages.last?.sharedContact, SharedContact(phone: "555-0100", email: DemoBackend.demoEmail))
  }
}

@MainActor
final class NewMessageTests: XCTestCase {
  func testSearchExcludesSelfAndBlockedPlayers() async {
    let backend = DemoBackend.sample(signedIn: true)
    var user = User(id: "demo", displayName: "Alex Demo", email: DemoBackend.demoEmail, divisionId: "demo-division")
    user.blockedUserIds = ["riley"]
    let model = NewMessageModel(user: user, repository: backend)

    model.query = "r"
    await model.search()
    // Every other name with an "r" except Riley Chen, who is blocked. Alex Demo
    // (the player) has none, so search "e" to check self-exclusion as well.
    XCTAssertEqual(model.results.map(\.id), ["casey", "jordan", "sam"])

    model.query = "e"
    await model.search()
    XCTAssertFalse(model.results.contains { $0.id == "demo" })
    XCTAssertFalse(model.results.contains { $0.id == "riley" })

    model.query = "   "
    await model.search()
    XCTAssertEqual(model.results, [])
  }

  func testOpeningReusesAnExistingDirectChannel() async {
    let backend = DemoBackend.sample(signedIn: true)
    let model = NewMessageModel(
      user: User(id: "demo", displayName: "Alex Demo", email: DemoBackend.demoEmail, divisionId: "demo-division"),
      repository: backend
    )
    let existing = await model.open(PlayerSummary(id: "sam", displayName: "Sam Rivera"))
    XCTAssertEqual(existing?.id, "dm-demo-sam")
    let created = await model.open(PlayerSummary(id: "jordan", displayName: "Jordan Lee"))
    XCTAssertEqual(created?.participantIds, ["demo", "jordan"])
    let again = await model.open(PlayerSummary(id: "jordan", displayName: "Jordan Lee"))
    XCTAssertEqual(again?.id, created?.id)
  }
}
