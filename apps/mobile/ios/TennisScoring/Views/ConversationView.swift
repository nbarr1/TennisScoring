import SwiftUI
import TennisAppModel
import TennisCore
import UIKit

struct ConversationView: View {
  @State private var model: ConversationModel
  let title: String
  /// The signed-in player, as the session last delivered it.
  let user: User

  @State private var reporting: Message?
  @State private var confirmingBlock: Message?
  @State private var confirmingShare = false
  @FocusState private var composerFocused: Bool

  init(channel: Channel, title: String, user: User, repository: any MessagingRepository) {
    _model = State(initialValue: ConversationModel(channel: channel, user: user, repository: repository))
    self.title = title
    self.user = user
  }

  var body: some View {
    ScrollViewReader { proxy in
      ScrollView {
        LazyVStack(spacing: 8) {
          if model.messages.count >= ConversationModel.pageSize {
            Text("Showing the latest \(ConversationModel.pageSize) messages")
              .font(.caption)
              .foregroundStyle(.secondary)
          }
          ForEach(model.messages) { message in
            MessageBubble(message: message, isMine: model.isMine(message))
              .id(message.id)
              .contextMenu {
                Button {
                  UIPasteboard.general.string = message.content
                } label: {
                  Label("Copy", systemImage: "doc.on.doc")
                }
                if model.canModerate(message) {
                  Button {
                    reporting = message
                  } label: {
                    Label("Report message", systemImage: "flag")
                  }
                  Button(role: .destructive) {
                    confirmingBlock = message
                  } label: {
                    Label("Block \(message.senderName)", systemImage: "hand.raised")
                  }
                }
              }
          }
        }
        .padding()
      }
      .defaultScrollAnchor(.bottom)
      .scrollDismissesKeyboard(.interactively)
      .overlay {
        if model.isLoading {
          ProgressView()
        } else if model.messages.isEmpty {
          ContentUnavailableView("No messages yet", systemImage: "bubble.left", description: Text("Say hello."))
        }
      }
      .onChange(of: model.messages.last?.id) { _, id in
        guard let id else { return }
        withAnimation { proxy.scrollTo(id, anchor: .bottom) }
      }
    }
    .safeAreaInset(edge: .bottom) { composer }
    .navigationTitle(title)
    .navigationBarTitleDisplayMode(.inline)
    .task { await model.observe() }
    .onChange(of: user, initial: true) { _, user in
      // Keep blocks made elsewhere (or undone from Profile) in effect here.
      model.user = user
    }
    .sheet(item: $reporting) { message in
      ReportMessageView(message: message) { reason, note in
        Task { await model.report(message, reason: reason, note: note) }
      }
    }
    .confirmationDialog(
      "Block \(confirmingBlock?.senderName ?? "this player")?",
      isPresented: Binding(get: { confirmingBlock != nil }, set: { if !$0 { confirmingBlock = nil } }),
      titleVisibility: .visible,
      presenting: confirmingBlock
    ) { message in
      Button("Block", role: .destructive) {
        Task { await model.blockSender(of: message) }
      }
    } message: { _ in
      Text("You won't see their messages any more. You can unblock them from your profile.")
    }
    .confirmationDialog("Share your contact details?", isPresented: $confirmingShare, titleVisibility: .visible) {
      Button("Share") { Task { await model.shareContact() } }
    } message: {
      Text(shareDescription)
    }
    .alert("Couldn't complete that", isPresented: errorBinding) {
      Button("OK", role: .cancel) {}
    } message: {
      Text(model.errorMessage ?? "")
    }
    .alert(model.notice ?? "", isPresented: noticeBinding) {
      Button("OK", role: .cancel) {}
    }
  }

  private var composer: some View {
    VStack(spacing: 4) {
      if let remaining = model.remainingCharacters {
        Text(remaining >= 0 ? "\(remaining) characters left" : "\(-remaining) characters over the limit")
          .font(.caption)
          .foregroundStyle(remaining >= 0 ? Color.secondary : Color.red)
          .frame(maxWidth: .infinity, alignment: .trailing)
      }
      HStack(alignment: .bottom, spacing: 8) {
        Button {
          confirmingShare = true
        } label: {
          Image(systemName: "person.crop.circle.badge.plus")
            .font(.title2)
        }
        .accessibilityLabel("Share contact details")
        .disabled(model.isSending)

        TextField("Message", text: $model.draft, axis: .vertical)
          .lineLimit(1...5)
          .textFieldStyle(.roundedBorder)
          .focused($composerFocused)

        Button {
          Task { await model.send() }
        } label: {
          if model.isSending {
            ProgressView()
          } else {
            Image(systemName: "arrow.up.circle.fill")
              .font(.title)
          }
        }
        .accessibilityLabel("Send")
        .disabled(!model.canSend)
      }
    }
    .padding(.horizontal)
    .padding(.vertical, 8)
    .background(.bar)
  }

  private var shareDescription: String {
    let contact = model.shareableContact
    let parts = [contact.phone.map { "phone number (\($0))" }, contact.email.map { "email (\($0))" }].compactMap { $0 }
    if parts.isEmpty { return "Your profile doesn't allow sharing a phone number or email." }
    return "Everyone in this conversation will see your \(parts.joined(separator: " and "))."
  }

  private var errorBinding: Binding<Bool> {
    Binding(get: { model.errorMessage != nil }, set: { if !$0 { model.errorMessage = nil } })
  }

  private var noticeBinding: Binding<Bool> {
    Binding(get: { model.notice != nil }, set: { if !$0 { model.notice = nil } })
  }
}

private struct MessageBubble: View {
  let message: Message
  let isMine: Bool

  var body: some View {
    if message.kind == .system {
      Text(message.content)
        .font(.caption)
        .foregroundStyle(.secondary)
        .frame(maxWidth: .infinity)
    } else {
      HStack {
        if isMine { Spacer(minLength: 48) }
        VStack(alignment: isMine ? .trailing : .leading, spacing: 4) {
          if !isMine {
            Text(message.senderName)
              .font(.caption.weight(.semibold))
              .foregroundStyle(.secondary)
          }
          VStack(alignment: .leading, spacing: 6) {
            Text(message.content)
            if let contact = message.sharedContact {
              if let phone = contact.phone, let url = URL(string: "tel:\(phone.filter { $0.isNumber || $0 == "+" })") {
                Link(destination: url) { Label(phone, systemImage: "phone") }
              }
              if let email = contact.email, let url = URL(string: "mailto:\(email)") {
                Link(destination: url) { Label(email, systemImage: "envelope") }
              }
            }
          }
          .padding(.horizontal, 12)
          .padding(.vertical, 8)
          .foregroundStyle(isMine ? Color.white : Color.primary)
          .tint(isMine ? Color.white : Color.league)
          .background(
            isMine ? Color.league : Color(.secondarySystemBackground),
            in: RoundedRectangle(cornerRadius: 16)
          )
          if message.createdAt > 0 {
            Text(message.createdAt.dateFromMillis, format: .dateTime.hour().minute())
              .font(.caption2)
              .foregroundStyle(.secondary)
          }
        }
        if !isMine { Spacer(minLength: 48) }
      }
      .accessibilityElement(children: .combine)
    }
  }
}

private struct ReportMessageView: View {
  let message: Message
  let submit: (MessageReportReason, String) -> Void
  @State private var reason: MessageReportReason = .harassment
  @State private var note = ""
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    NavigationStack {
      Form {
        Section("Message from \(message.senderName)") {
          Text(message.content)
            .foregroundStyle(.secondary)
        }
        Section {
          Picker("Reason", selection: $reason) {
            ForEach(MessageReportReason.allCases, id: \.self) { reason in
              Text(reason.label).tag(reason)
            }
          }
          TextField("Anything else a division leader should know (optional)", text: $note, axis: .vertical)
            .lineLimit(2...6)
        } footer: {
          Text("A division leader reviews reports and can remove the message.")
        }
      }
      .navigationTitle("Report message")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancel") { dismiss() }
        }
        ToolbarItem(placement: .confirmationAction) {
          Button("Report") {
            submit(reason, String(note.prefix(1000)))
            dismiss()
          }
        }
      }
    }
  }
}
