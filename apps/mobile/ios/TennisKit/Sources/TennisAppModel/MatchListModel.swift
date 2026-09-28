import Foundation
import Observation
import TennisCore

/// One group on the Matches tab.
public struct MatchSection: Identifiable, Equatable, Sendable {
  public enum Kind: String, Sendable, CaseIterable {
    /// Proposals sent to this player.
    case needsResponse
    case live
    /// Finished matches whose report is pending or disputed.
    case reports
    case upcoming
    /// Proposals this player sent.
    case awaitingOpponent
    case recent
  }

  public let kind: Kind
  public let matches: [Match]

  public var id: Kind { kind }

  public var title: String {
    switch kind {
    case .needsResponse: "Needs your response"
    case .live: "Live"
    case .reports: "Match reports"
    case .upcoming: "Upcoming"
    case .awaitingOpponent: "Waiting on opponent"
    case .recent: "Recent results"
    }
  }
}

public enum MatchSections {
  /// Groups a player's matches the way the React Native Matches tab does.
  /// Proposals are split by side: the proposer is always side 1. Cancelled
  /// matches are left out, and empty sections are dropped.
  public static func make(_ matches: [Match], userId: String, recentLimit: Int = 20) -> [MatchSection] {
    var buckets: [MatchSection.Kind: [Match]] = [:]
    for match in matches {
      let kind: MatchSection.Kind?
      switch match.status {
      case .proposed:
        switch match.side(of: userId) {
        case .player2: kind = .needsResponse
        case .player1: kind = .awaitingOpponent
        case nil: kind = nil
        }
      case .inProgress: kind = .live
      case .pendingReport, .disputed: kind = .reports
      case .scheduled: kind = .upcoming
      case .completed: kind = .recent
      case .cancelled: kind = nil
      }
      if let kind { buckets[kind, default: []].append(match) }
    }

    func newestFirst(_ a: Match, _ b: Match) -> Bool { a.createdAt > b.createdAt }
    buckets[.needsResponse]?.sort(by: newestFirst)
    buckets[.awaitingOpponent]?.sort(by: newestFirst)
    buckets[.live]?.sort(by: newestFirst)
    buckets[.reports]?.sort(by: newestFirst)
    buckets[.upcoming]?.sort { ($0.scheduledAt ?? $0.createdAt) < ($1.scheduledAt ?? $1.createdAt) }
    buckets[.recent] = buckets[.recent].map {
      Array($0.sorted { ($0.completedAt ?? $0.createdAt) > ($1.completedAt ?? $1.createdAt) }.prefix(recentLimit))
    }

    return MatchSection.Kind.allCases.compactMap { kind in
      guard let matches = buckets[kind], !matches.isEmpty else { return nil }
      return MatchSection(kind: kind, matches: matches)
    }
  }
}

@MainActor
@Observable
public final class MatchListModel {
  public private(set) var sections: [MatchSection] = []
  public private(set) var isLoading = true
  public private(set) var errorMessage: String?

  public let userId: String
  private let repository: any MatchRepository

  public init(userId: String, repository: any MatchRepository) {
    self.userId = userId
    self.repository = repository
  }

  /// How many matches need something from this player: proposals to answer and
  /// reports to confirm. Suitable for a tab badge.
  public var actionCount: Int {
    sections.reduce(0) { total, section in
      switch section.kind {
      case .needsResponse:
        total + section.matches.count
      case .reports:
        total + section.matches.filter {
          $0.status == .pendingReport
            && $0.reportSubmission?.status == .pendingConfirmation
            && $0.canRespondToReport(userId: userId, submittedBy: $0.reportSubmission?.submittedBy)
        }.count
      default:
        total
      }
    }
  }

  /// Follows the player's matches for as long as the caller's task runs.
  public func observe() async {
    do {
      for try await matches in repository.observeMatches(playerId: userId) {
        sections = MatchSections.make(matches, userId: userId)
        isLoading = false
        errorMessage = nil
      }
    } catch is CancellationError {
      return
    } catch {
      isLoading = false
      errorMessage = error.localizedDescription
    }
  }
}
