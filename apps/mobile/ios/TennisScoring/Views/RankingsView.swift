import SwiftUI
import TennisAppModel
import TennisCore

struct RankingsView: View {
  let model: RankingsModel

  var body: some View {
    List {
      if let error = model.errorMessage {
        Label(error, systemImage: "exclamationmark.triangle")
          .foregroundStyle(.red)
      }
      if let table = model.selectedTable {
        if model.tables.count > 1 {
          Picker("Standings", selection: selection) {
            ForEach(model.tables) { table in
              Text("\(table.title) · \(table.seasonName)").tag(Optional(table.id))
            }
          }
        }
        Section {
          ForEach(table.rows) { row in
            StandingsRowView(row: row)
          }
        } header: {
          Text("\(table.title) · \(table.seasonName)")
        } footer: {
          Text("Ordered by matches won, then sets won, games won, game difference, and head-to-head.")
        }
      }
    }
    .overlay {
      if model.isLoading {
        ProgressView()
      } else if model.tables.isEmpty && model.errorMessage == nil {
        ContentUnavailableView(
          "No standings yet",
          systemImage: "list.number",
          description: Text("Standings appear once a match result is confirmed.")
        )
      }
    }
  }

  /// The picker's selection, defaulting to the table on screen.
  private var selection: Binding<String?> {
    Binding(
      get: { model.selectedTable?.id },
      set: { model.selectedTableId = $0 }
    )
  }
}

private struct StandingsRowView: View {
  let row: StandingsRow

  var body: some View {
    HStack(spacing: 12) {
      Text(row.rank > 0 ? "\(row.rank)" : "–")
        .font(.headline.monospacedDigit())
        .frame(width: 28, alignment: .trailing)
      VStack(alignment: .leading, spacing: 2) {
        Text(row.name)
          .font(.body.weight(row.isCurrentUser ? .semibold : .regular))
          .lineLimit(1)
        Text("Sets \(row.setsWon)-\(row.setsLost) · Games \(row.gameDifferential >= 0 ? "+" : "")\(row.gameDifferential)")
          .font(.caption)
          .foregroundStyle(.secondary)
      }
      Spacer()
      Text("\(row.won)-\(row.lost)")
        .font(.headline.monospacedDigit())
    }
    .listRowBackground(row.isCurrentUser ? Color.league.opacity(0.1) : nil)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(
      "\(row.rank > 0 ? "Rank \(row.rank), " : "")\(row.name)\(row.isCurrentUser ? " (you)" : ""), \(row.won) won, \(row.lost) lost"
    )
  }
}
