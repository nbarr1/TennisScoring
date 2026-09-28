import SwiftUI
import TennisAppModel
import TennisCore

/// The Messages tab: the division chat and direct conversations.
struct MessagesView: View {
  let model: ChannelListModel
  let services: AppServices
  @Binding var path: [String]
  @State private var composing = false

  var body: some View {
    List {
      if let error = model.errorMessage {
        Label(error, systemImage: "exclamationmark.triangle")
          .foregroundStyle(.red)
      }
      ForEach(model.rows) { row in
        NavigationLink(value: row.id) {
          ChannelRowView(row: row)
        }
      }
    }
    .overlay {
      if model.isLoading {
        ProgressView()
      } else if model.rows.isEmpty && model.errorMessage == nil {
        ContentUnavailableView(
          "No conversations yet",
          systemImage: "bubble.left.and.bubble.right",
          description: Text("Start one with a player in your division.")
        )
      }
    }
    .toolbar {
      Button {
        composing = true
      } label: {
        Image(systemName: "square.and.pencil")
      }
      .accessibilityLabel("New message")
      .disabled(model.user.divisionId == nil)
    }
    .sheet(isPresented: $composing) {
      NewMessageView(model: NewMessageModel(user: model.user, repository: services.messaging)) { channel in
        composing = false
        model.remember(channel)
        path = [channel.id]
      }
    }
  }
}

private struct ChannelRowView: View {
  let row: ChannelRow

  var body: some View {
    HStack(spacing: 12) {
      Image(systemName: row.isDirect ? "person.crop.circle.fill" : "person.3.fill")
        .font(.title2)
        .foregroundStyle(Color.league)
        .frame(width: 36)
        .accessibilityHidden(true)
      VStack(alignment: .leading, spacing: 2) {
        HStack {
          Text(row.title)
            .font(.headline)
            .lineLimit(1)
          Spacer()
          if row.lastActivity > 0 {
            Text(row.lastActivity.dateFromMillis, format: .relative(presentation: .named))
              .font(.caption)
              .foregroundStyle(.secondary)
          }
        }
        Text(row.preview ?? "No messages yet")
          .font(.subheadline)
          .foregroundStyle(.secondary)
          .lineLimit(2)
      }
    }
    .padding(.vertical, 2)
  }
}

/// Searches the division and opens a direct conversation.
struct NewMessageView: View {
  @State var model: NewMessageModel
  let onOpen: (Channel) -> Void
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    NavigationStack {
      List {
        if let error = model.errorMessage {
          Label(error, systemImage: "exclamationmark.triangle")
            .foregroundStyle(.red)
        }
        ForEach(model.results) { player in
          Button {
            Task {
              if let channel = await model.open(player) { onOpen(channel) }
            }
          } label: {
            Label(player.displayName, systemImage: "person.crop.circle")
          }
          .disabled(model.isOpening)
        }
      }
      .overlay {
        if model.isSearching || model.isOpening {
          ProgressView()
        } else if model.results.isEmpty && !model.query.trimmingCharacters(in: .whitespaces).isEmpty {
          ContentUnavailableView.search(text: model.query)
        }
      }
      .searchable(text: $model.query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search players in your division")
      .task(id: model.query) {
        // Debounce: a cancelled sleep means another keystroke arrived.
        try? await Task.sleep(nanoseconds: 250_000_000)
        guard !Task.isCancelled else { return }
        await model.search()
      }
      .navigationTitle("New message")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancel") { dismiss() }
        }
      }
    }
  }
}
