import SwiftUI
import TennisCore
import UIKit

extension UIColor {
  convenience init(rgb: UInt32) {
    self.init(
      red: CGFloat((rgb >> 16) & 0xFF) / 255,
      green: CGFloat((rgb >> 8) & 0xFF) / 255,
      blue: CGFloat(rgb & 0xFF) / 255,
      alpha: 1
    )
  }
}

extension Color {
  /// A color that follows the appearance, with optional variants for Increase
  /// Contrast (`accessibilityContrast == .high`).
  static func adaptive(light: UInt32, dark: UInt32, highContrastLight: UInt32? = nil, highContrastDark: UInt32? = nil) -> Color {
    Color(uiColor: UIColor { traits in
      let high = traits.accessibilityContrast == .high
      if traits.userInterfaceStyle == .dark {
        return UIColor(rgb: high ? highContrastDark ?? dark : dark)
      }
      return UIColor(rgb: high ? highContrastLight ?? light : light)
    })
  }

  /// The league's brand green, shared with the web and Expo clients: Clubhouse
  /// Green (#1A472A) in light appearance and Light Green (#A8D5A2) in dark, where
  /// Clubhouse Green is under 2:1 on the system backgrounds. With Increase
  /// Contrast each moves further from the background (#0E2A18, #C8E6C4). It is
  /// the app's tint, so it colors text buttons, links, and filled buttons alike.
  static let league = adaptive(light: 0x1A472A, dark: 0xA8D5A2, highContrastLight: 0x0E2A18, highContrastDark: 0xC8E6C4)

  /// The serving ball on the scoreboard. System yellow is about 1.4:1 on the
  /// light scoreboard card, so light appearance uses a dark gold (4.4:1).
  static let serveBall = adaptive(light: 0x8A6D00, dark: 0xFFD60A)

  /// Text and icons on a `league` fill: white on Clubhouse Green, black on Light
  /// Green. Filled buttons and the player's own message bubbles use it.
  static let onLeague = Color(uiColor: UIColor { traits in
    traits.userInterfaceStyle == .dark ? .black : .white
  })

  /// The scoreboard's player colors (DESIGN.md `player-blue` and `player-orange`),
  /// the same pair the watch shows. Labels on them are black (6:1 and 10:1).
  static func player(_ side: Player) -> Color {
    side == .player1
      ? Color(red: 0x3D / 255, green: 0x8B / 255, blue: 1)
      : Color(red: 1, green: 0x9F / 255, blue: 0x1C / 255)
  }
}

extension MatchStatusMetadata.Tone {
  /// The status glyph's color. `MATCH_STATUS_METADATA`'s hex values have no dark
  /// variants (Scheduled's #1A472A is about 1.5:1 on a dark row) and some fail in
  /// light too, so each tone has its own pair, every one at least 3.8:1 on the
  /// system backgrounds with the badge tint behind it.
  var color: Color {
    switch self {
    case .accent: Color.adaptive(light: 0x8E44AD, dark: 0xD2A8E6)
    case .primary: Color.league
    case .success: Color.adaptive(light: 0x1E7D45, dark: 0x5FD38D)
    case .warning: Color.adaptive(light: 0xA84E00, dark: 0xF5B041)
    case .neutral: Color.adaptive(light: 0x636366, dark: 0xAEAEB2)
    case .danger: Color.adaptive(light: 0xC0392B, dark: 0xFF8A80)
    }
  }
}

struct StatusBadge: View {
  let status: MatchStatus
  @Environment(\.colorScheme) private var colorScheme

  var body: some View {
    let metadata = status.metadata
    let color = metadata.tone.color
    // The status color goes on the glyph and the tint; the label stays in the
    // primary text color, since orange or green text on its own tint fails
    // contrast in both appearances.
    HStack(spacing: 4) {
      Text(metadata.icon)
        .foregroundStyle(color)
      Text(metadata.label)
        .foregroundStyle(.primary)
    }
    .font(.caption.weight(.semibold))
    .padding(.horizontal, 8)
    .padding(.vertical, 3)
    // A 14% tint all but disappears on a dark row, so dark uses more.
    .background(color.opacity(colorScheme == .dark ? 0.22 : 0.14), in: Capsule())
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(metadata.accessibilityLabel)
  }
}

/// Set-by-set scores, the current game, and who is serving.
struct Scoreboard: View {
  let match: Match

  @Environment(\.dynamicTypeSize) private var dynamicTypeSize

  private var score: LiveScore { match.liveScore }
  private var showsServer: Bool { match.status == .inProgress }

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      // At accessibility text sizes a name column beside three sets and the
      // game squeezes names to a few letters, so each player gets a block: the
      // full name on its own line, then the sets.
      if dynamicTypeSize.isAccessibilitySize {
        stackedRows
      } else {
        grid
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

  private var stackedRows: some View {
    VStack(alignment: .leading, spacing: 16) {
      ForEach(Player.allCases, id: \.self) { side in
        VStack(alignment: .leading, spacing: 6) {
          nameLine(side, lineLimit: nil)
          // Columns when they fit, otherwise one line per set.
          ViewThatFits(in: .horizontal) {
            HStack(alignment: .top, spacing: 16) {
              ForEach(score.sets.indices, id: \.self) { index in
                VStack(spacing: 2) {
                  Text("Set \(index + 1)").font(.caption).foregroundStyle(.secondary)
                  setCell(score.sets[index], side: side)
                }
              }
              if match.status == .inProgress {
                VStack(spacing: 2) {
                  Text(score.isTiebreak ? "TB" : "Game").font(.caption).foregroundStyle(.secondary)
                  pointsText(side)
                }
              }
            }
            VStack(alignment: .leading, spacing: 4) {
              ForEach(score.sets.indices, id: \.self) { index in
                HStack {
                  Text("Set \(index + 1)").font(.caption).foregroundStyle(.secondary)
                  Spacer(minLength: 8)
                  setCell(score.sets[index], side: side)
                }
              }
              if match.status == .inProgress {
                HStack {
                  Text(score.isTiebreak ? "Tiebreak" : "Game").font(.caption).foregroundStyle(.secondary)
                  Spacer(minLength: 8)
                  pointsText(side)
                }
              }
            }
          }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(rowAccessibilityLabel(for: side))
      }
    }
  }

  private func nameLine(_ side: Player, lineLimit: Int?) -> some View {
    HStack(spacing: 6) {
      Image(systemName: "tennisball.fill")
        .font(.caption2)
        .foregroundStyle(Color.serveBall)
        .opacity(showsServer && score.server == side ? 1 : 0)
        .accessibilityHidden(true)
      Text(match.sideDisplayName(side))
        .font(.headline)
        .lineLimit(lineLimit)
        .minimumScaleFactor(lineLimit == nil ? 1 : 0.7)
      if match.winner == side {
        Image(systemName: "checkmark.circle.fill")
          .foregroundStyle(Color.league)
          .accessibilityLabel("Winner")
      }
    }
  }

  private func pointsText(_ side: Player) -> some View {
    Text(currentPoints(for: side))
      .font(.title3.monospacedDigit().weight(.bold))
      .foregroundStyle(Color.league)
  }

  private var grid: some View {
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
      // Each player's row names its sets and points, so the column headings
      // would only be read as noise.
      .accessibilityHidden(true)

      ForEach(Player.allCases, id: \.self) { side in
        GridRow {
          nameLine(side, lineLimit: 1)
          ForEach(score.sets.indices, id: \.self) { index in
            setCell(score.sets[index], side: side)
          }
          if match.status == .inProgress {
            pointsText(side)
              .gridColumnAlignment(.center)
          }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(rowAccessibilityLabel(for: side))
      }
    }
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

  /// "Ann Smith, winner, set 1: 6, set 2: 4" or "Sam Rivera, set 1: 3, 30 in this game, serving".
  private func rowAccessibilityLabel(for side: Player) -> String {
    var parts = [match.sideDisplayName(side)]
    if match.winner == side { parts.append("winner") }
    for index in score.sets.indices {
      parts.append("set \(index + 1): \(score.sets[index].games(for: side))")
    }
    if match.status == .inProgress {
      parts.append(score.isTiebreak ? "\(currentPoints(for: side)) in the tiebreak" : "\(currentPoints(for: side)) in this game")
    }
    if showsServer && score.server == side { parts.append("serving") }
    return parts.joined(separator: ", ")
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
          .frame(minWidth: 44, minHeight: 44)
          .contentShape(Rectangle())
      }
      .buttonStyle(.borderless)
      .accessibilityLabel("Dismiss tip")
    }
    .padding()
    .background(Color.yellow.opacity(0.12), in: RoundedRectangle(cornerRadius: 14))
  }
}

/// A list's load error with a way out: Retry restarts the listener the error
/// ended (pulling to refresh does the same).
struct ListErrorRow: View {
  let message: String
  let retry: @MainActor () -> Void

  var body: some View {
    // Side by side when they fit; at large text sizes a long error beside the
    // button wraps to a word per line, so the button moves under it.
    ViewThatFits(in: .horizontal) {
      HStack(spacing: 12) {
        errorLabel
        Spacer(minLength: 8)
        retryButton
      }
      VStack(alignment: .leading, spacing: 8) {
        errorLabel
        retryButton
      }
    }
  }

  private var errorLabel: some View {
    Label(message, systemImage: "exclamationmark.triangle")
      .foregroundStyle(.red)
  }

  private var retryButton: some View {
    Button("Retry") { retry() }
      .buttonStyle(.bordered)
      .frame(minHeight: 44)
  }
}

extension View {
  /// Caps a screen's content column at a readable width and centers it. An
  /// iPad in portrait otherwise stretches the scoreboard, the action buttons,
  /// and message bubbles across 800 points; a phone is narrower than the cap
  /// and is unchanged. 720 is the cap the Expo app's `useContentWidth()` uses
  /// for forms and lists.
  func readableContentWidth(_ maxWidth: CGFloat = 720) -> some View {
    frame(maxWidth: maxWidth).frame(maxWidth: .infinity)
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
