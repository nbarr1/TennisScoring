import SwiftUI
import TennisCore

extension Color {
  /// `#RRGGBB` or `#RGB`, as used by `MATCH_STATUS_METADATA`.
  init(hex: String) {
    var digits = hex.trimmingCharacters(in: .whitespaces)
    if digits.hasPrefix("#") { digits.removeFirst() }
    if digits.count == 3 { digits = digits.map { "\($0)\($0)" }.joined() }
    let value = UInt64(digits, radix: 16) ?? 0
    self.init(
      red: Double((value >> 16) & 0xFF) / 255,
      green: Double((value >> 8) & 0xFF) / 255,
      blue: Double(value & 0xFF) / 255
    )
  }
}

/// The league's brand green, shared with the web and Expo clients.
extension Color {
  static let league = Color(hex: "#1a472a")
}

struct StatusBadge: View {
  let status: MatchStatus

  var body: some View {
    let metadata = status.metadata
    Text(metadata.label)
      .font(.caption.weight(.semibold))
      .padding(.horizontal, 8)
      .padding(.vertical, 3)
      .foregroundStyle(Color(hex: metadata.colorHex))
      .background(Color(hex: metadata.colorHex).opacity(0.14), in: Capsule())
      .accessibilityLabel(metadata.accessibilityLabel)
  }
}

/// Set-by-set scores, the current game, and who is serving.
struct Scoreboard: View {
  let match: Match

  private var score: LiveScore { match.liveScore }
  private var showsServer: Bool { match.status == .inProgress }

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      Grid(alignment: .leading, horizontalSpacing: 14, verticalSpacing: 10) {
        GridRow {
          Text("")
          ForEach(score.sets.indices, id: \.self) { index in
            Text("Set \(index + 1)").gridColumnAlignment(.center)
          }
          if match.status == .inProgress {
            Text(score.isTiebreak ? "TB" : "Game").gridColumnAlignment(.center)
          }
        }
        .font(.caption)
        .foregroundStyle(.secondary)

        ForEach(Player.allCases, id: \.self) { side in
          GridRow {
            HStack(spacing: 6) {
              Image(systemName: "tennisball.fill")
                .font(.caption2)
                .foregroundStyle(.yellow)
                .opacity(showsServer && score.server == side ? 1 : 0)
                .accessibilityHidden(true)
              Text(match.sideDisplayName(side))
                .font(.headline)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
              if match.winner == side {
                Image(systemName: "checkmark.circle.fill")
                  .foregroundStyle(Color.league)
                  .accessibilityLabel("Winner")
              }
            }
            ForEach(score.sets.indices, id: \.self) { index in
              setCell(score.sets[index], side: side)
            }
            if match.status == .inProgress {
              Text(currentPoints(for: side))
                .font(.title3.monospacedDigit().weight(.bold))
                .foregroundStyle(Color.league)
                .gridColumnAlignment(.center)
            }
          }
          .accessibilityElement(children: .combine)
        }
      }

      if match.status == .inProgress {
        Text(ScoreEngine.formatGameScore(score))
          .font(.subheadline.weight(.medium))
          .foregroundStyle(.secondary)
        if showsServer {
          Text("\(match.sideDisplayName(score.server)) serving from the \(score.serviceSide == .deuce ? "deuce" : "ad") court")
            .font(.caption)
            .foregroundStyle(.secondary)
        }
      }
    }
    .padding()
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 14))
  }

  private func setCell(_ set: SetScore, side: Player) -> some View {
    let games = set.games(for: side)
    let won = set.winner == side
    return HStack(alignment: .top, spacing: 1) {
      Text("\(games)")
        .font(.title3.monospacedDigit().weight(won ? .bold : .regular))
      if let tiebreak = set.tiebreak, set.winner != nil, !won {
        Text("\(tiebreak.points(for: side))")
          .font(.caption2.monospacedDigit())
      }
    }
    .gridColumnAlignment(.center)
  }

  private func currentPoints(for side: Player) -> String {
    if score.isTiebreak, let tiebreak = score.tiebreakScore {
      return "\(tiebreak.points(for: side))"
    }
    return score.currentGame[side].rawValue
  }
}

struct TipCard: View {
  let tip: Tip
  let dismiss: () -> Void

  var body: some View {
    HStack(alignment: .top, spacing: 12) {
      Image(systemName: "lightbulb.fill")
        .foregroundStyle(.yellow)
        .accessibilityHidden(true)
      VStack(alignment: .leading, spacing: 4) {
        Text(tip.title).font(.subheadline.weight(.semibold))
        Text(tip.body).font(.subheadline).foregroundStyle(.secondary)
      }
      Spacer(minLength: 0)
      Button(action: dismiss) {
        Image(systemName: "xmark")
      }
      .buttonStyle(.borderless)
      .accessibilityLabel("Dismiss tip")
    }
    .padding()
    .background(Color.yellow.opacity(0.12), in: RoundedRectangle(cornerRadius: 14))
  }
}

/// Shown across the top of every screen when the app runs on demo data.
struct DemoBanner: View {
  var body: some View {
    Label("Demo data. Nothing here is saved.", systemImage: "info.circle")
      .font(.footnote.weight(.medium))
      .padding(.vertical, 6)
      .frame(maxWidth: .infinity)
      .background(Color.orange.opacity(0.18))
  }
}

extension Match {
  var titleForNavigation: String {
    "\(sideDisplayName(.player1)) vs \(sideDisplayName(.player2))"
  }
}

extension Int64 {
  /// Firestore stores dates as Unix milliseconds.
  var dateFromMillis: Date { Date(timeIntervalSince1970: TimeInterval(self) / 1000) }
}
