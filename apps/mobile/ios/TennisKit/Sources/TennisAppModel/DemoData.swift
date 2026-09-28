import Foundation
import TennisCore

extension DemoBackend {
  public static let demoEmail = "demo@tennisleague.test"
  public static let demoInviteCode = "DEMO"
  static let demoDivisionId = "demo-division"
  static let demoSeasonId = "fall-2026"
  static let demoLevelId = "demo-intermediate-singles"

  /// A division with one match in every state the Matches tab shows, so each
  /// screen has something to render. Sign in as `demoEmail` with any password.
  public static func sample(signedIn: Bool = false) -> DemoBackend {
    let now = RankingEngine.currentMillis()
    let hour: Int64 = 3_600_000
    let day = 24 * hour

    func player(_ id: String, _ name: String) -> User {
      User(
        id: id,
        displayName: name,
        email: id == "demo" ? demoEmail : "\(id)@tennisleague.test",
        divisionId: demoDivisionId,
        createdAt: now - 90 * day,
        updatedAt: now - day
      )
    }
    let users = [
      player("demo", "Alex Demo"),
      player("sam", "Sam Rivera"),
      player("jordan", "Jordan Lee"),
      player("casey", "Casey Park"),
      player("riley", "Riley Chen"),
    ]
    let names = Dictionary(uniqueKeysWithValues: users.map { ($0.id, $0.displayName) })

    func match(
      _ id: String, _ p1: String, _ p2: String, _ status: MatchStatus,
      sets: [(Int, Int)] = [], game: GameScore = GameScore(), server: Player = .player1,
      winner: Player? = nil, report: ReportSubmission? = nil,
      createdDaysAgo: Int64, scheduledInHours: Int64? = nil
    ) -> Match {
      var liveSets = sets.enumerated().map { index, games in
        SetScore(setNumber: index, player1Games: games.0, player2Games: games.1)
      }
      if liveSets.isEmpty { liveSets = [SetScore(setNumber: 0)] }
      // Every set but the last is finished; so is the last one in a finished match.
      let finishedCount = status == .completed || status == .pendingReport ? liveSets.count : liveSets.count - 1
      for index in 0..<finishedCount {
        liveSets[index].winner = liveSets[index].player1Games > liveSets[index].player2Games ? .player1 : .player2
      }
      let score = LiveScore(
        sets: liveSets,
        currentSet: liveSets.count - 1,
        currentGame: game,
        server: server,
        player1SetsWon: liveSets.filter { $0.winner == .player1 }.count,
        player2SetsWon: liveSets.filter { $0.winner == .player2 }.count
      )
      return Match(
        id: id,
        divisionId: demoDivisionId,
        seasonId: demoSeasonId,
        divisionLevelId: demoLevelId,
        matchType: "singles",
        player1Id: p1,
        player2Id: p2,
        player1Name: names[p1],
        player2Name: names[p2],
        status: status,
        liveScore: score,
        reportSubmission: report,
        winner: winner,
        createdBy: p1,
        scheduledAt: scheduledInHours.map { now + $0 * hour },
        startedAt: status == .inProgress ? now - hour : nil,
        completedAt: status == .completed || status == .pendingReport ? now - createdDaysAgo * day + 2 * hour : nil,
        createdAt: now - createdDaysAgo * day
      )
    }

    let matches = [
      match("live", "demo", "sam", .inProgress, sets: [(6, 4), (3, 2)], game: GameScore(player1: .thirty, player2: .fifteen), server: .player2, createdDaysAgo: 1),
      match("upcoming", "jordan", "demo", .scheduled, createdDaysAgo: 3, scheduledInHours: 30),
      match("incoming", "casey", "demo", .proposed, createdDaysAgo: 0),
      match("outgoing", "demo", "riley", .proposed, createdDaysAgo: 2),
      match(
        "to-confirm", "riley", "demo", .pendingReport, sets: [(6, 3), (4, 6), (6, 2)], winner: .player1,
        report: ReportSubmission(submittedBy: "riley", submittedAt: now - hour, status: .pendingConfirmation),
        createdDaysAgo: 4
      ),
      match("won-1", "demo", "jordan", .completed, sets: [(6, 2), (6, 4)], winner: .player1, createdDaysAgo: 10),
      match("lost-1", "casey", "demo", .completed, sets: [(7, 6), (6, 3)], winner: .player1, createdDaysAgo: 17),
      match("won-2", "demo", "riley", .completed, sets: [(4, 6), (6, 3), (6, 4)], winner: .player1, createdDaysAgo: 24),
      match("other-1", "sam", "jordan", .completed, sets: [(6, 1), (6, 2)], winner: .player1, createdDaysAgo: 12),
      match("other-2", "casey", "riley", .completed, sets: [(6, 4), (7, 5)], winner: .player1, createdDaysAgo: 20),
    ]

    let levels = [
      DivisionLevel(id: demoLevelId, name: "Intermediate Singles", seasonId: demoSeasonId),
      DivisionLevel(id: "demo-open-doubles", name: "Open Doubles", seasonId: demoSeasonId, matchType: "doubles", sortOrder: 1),
    ]

    let doubles = [
      (["demo", "sam"], 3, 1, 7, 3, 52, 38),
      (["casey", "riley"], 2, 2, 5, 5, 45, 47),
      (["jordan", "tess"], 1, 3, 3, 6, 36, 48),
    ].enumerated().map { index, entry in
      let (ids, won, lost, setsWon, setsLost, gamesWon, gamesLost) = entry
      return DoublesTeamRanking(
        teamId: DoublesTeam.teamId(ids),
        playerIds: ids,
        displayName: DoublesTeam.formatName(ids.map { names[$0] ?? "Tess Morgan" }),
        divisionId: demoDivisionId,
        season: demoSeasonId,
        seasonId: demoSeasonId,
        divisionLevelId: "demo-open-doubles",
        rank: index + 1,
        matchesPlayed: won + lost,
        matchesWon: won,
        matchesLost: lost,
        setsWon: setsWon,
        setsLost: setsLost,
        gamesWon: gamesWon,
        gamesLost: gamesLost,
        gameDifferential: gamesWon - gamesLost,
        updatedAt: now - 2 * day
      )
    }

    let divisionChannel = Channel(
      id: "demo-division-chat",
      type: "division",
      divisionId: demoDivisionId,
      participantIds: users.map(\.id),
      name: "Demo Division",
      createdAt: now - 90 * day
    )
    let directChannel = Channel(id: "dm-demo-sam", type: "direct", participantIds: ["demo", "sam"], createdAt: now - 5 * day)
    func message(_ id: String, _ channel: Channel, _ sender: String, _ content: String, minutesAgo: Int64) -> Message {
      Message(
        id: id,
        channelId: channel.id,
        senderId: sender,
        senderName: names[sender] ?? sender,
        content: content,
        readBy: [sender],
        createdAt: now - minutesAgo * 60_000
      )
    }
    let messages = [
      message("m1", divisionChannel, "jordan", "Courts 3 and 4 are booked for league night on Thursday.", minutesAgo: 3 * 24 * 60),
      message("m2", divisionChannel, "casey", "Thanks! Anyone free for a practice hit on Saturday morning?", minutesAgo: 2 * 24 * 60),
      message("m3", divisionChannel, "riley", "I'm in, 9am works for me.", minutesAgo: 2 * 24 * 60 - 30),
      message("m4", directChannel, "sam", "Good match yesterday. Want to finish the second set tonight?", minutesAgo: 90),
      message("m5", directChannel, "demo", "Sounds good, see you at 6.", minutesAgo: 75),
    ]

    return DemoBackend(
      users: users,
      matches: matches,
      levels: levels,
      doublesRankings: doubles,
      inviteCodes: [demoInviteCode: demoDivisionId],
      channels: [divisionChannel, directChannel].map { channel in
        var channel = channel
        if let last = messages.filter({ $0.channelId == channel.id }).max(by: { $0.createdAt < $1.createdAt }) {
          channel.lastMessage = Channel.LastMessage(content: last.content, senderId: last.senderId, senderName: last.senderName, timestamp: last.createdAt)
        }
        return channel
      },
      messages: messages,
      signedInAs: signedIn ? "demo" : nil
    )
  }
}
