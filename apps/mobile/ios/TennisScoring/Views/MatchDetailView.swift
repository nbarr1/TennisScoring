import SwiftUI
import TennisAppModel
import TennisCore

struct MatchDetailView: View {
  @State private var model: MatchDetailModel
  @State private var choosingServer = false
  @State private var confirmingDispute = false

  init(matchId: String, user: User, services: AppServices) {
    _model = State(initialValue: MatchDetailModel(
      matchId: matchId,
      userId: user.id,
      tipsEnabled: user.tipsEnabled,
      repository: services.matches
    ))
  }

  var body: some View {
    Group {
      if let match = model.match {
        content(match)
      } else if model.isLoading {
        ProgressView()
      } else {
        ContentUnavailableView(
          "Match not found",
          systemImage: "questionmark.circle",
          description: Text(model.errorMessage ?? "It may have been deleted.")
        )
      }
    }
    .navigationTitle(model.match?.titleForNavigation ?? "Match")
    .navigationBarTitleDisplayMode(.inline)
    .task { await model.observe() }
    .task {
      for await command in PhoneWatchConnector.shared.commands() {
        await model.handle(command)
      }
    }
    .onChange(of: model.watchSnapshot, initial: true) { _, snapshot in
      if let snapshot { PhoneWatchConnector.shared.publish(snapshot) }
    }
    .onDisappear {
      // Leave the watch showing the score, but read-only: nothing on the phone is
      // listening for its commands any more.
      if var snapshot = model.watchSnapshot {
        snapshot.canScore = false
        PhoneWatchConnector.shared.publish(snapshot)
      }
    }
    .alert("Couldn't update the match", isPresented: showingError) {
      Button("OK", role: .cancel) {}
    } message: {
      Text(model.errorMessage ?? "")
    }
  }

  private var showingError: Binding<Bool> {
    Binding(
      get: { model.errorMessage != nil && model.match != nil },
      set: { if !$0 { model.errorMessage = nil } }
    )
  }

  @ViewBuilder
  private func content(_ match: Match) -> some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 16) {
        HStack {
          StatusBadge(status: match.status)
          Spacer()
          if let scheduledAt = match.scheduledAt, match.status == .scheduled || match.status == .proposed {
            Label(scheduledAt.dateFromMillis.formatted(date: .abbreviated, time: .shortened), systemImage: "calendar")
              .font(.subheadline)
              .foregroundStyle(.secondary)
          }
        }

        Scoreboard(match: match)

        if let tip = model.currentTip {
          TipCard(tip: tip) { model.currentTip = nil }
            .transition(.opacity)
        }

        actions(match)
          .disabled(model.isWorking)
      }
      .padding()
      .animation(.default, value: model.currentTip)
    }
  }

  @ViewBuilder
  private func actions(_ match: Match) -> some View {
    VStack(spacing: 12) {
      if model.canScore {
        HStack(spacing: 12) {
          ForEach(Player.allCases, id: \.self) { side in
            Button {
              Task { await model.score(side) }
            } label: {
              VStack(spacing: 4) {
                Text("Point").font(.caption)
                Text(match.sideDisplayName(side))
                  .font(.headline)
                  .lineLimit(2)
                  .multilineTextAlignment(.center)
              }
              .frame(maxWidth: .infinity, minHeight: 72)
            }
            .buttonStyle(.borderedProminent)
            .tint(side == .player1 ? Color.league : .blue)
            .accessibilityLabel("Point to \(match.sideDisplayName(side))")
          }
        }
      }

      if model.canUndo {
        Button {
          Task { await model.undo() }
        } label: {
          Label("Undo last point", systemImage: "arrow.uturn.backward")
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.bordered)
      }

      if model.canStart {
        Button {
          choosingServer = true
        } label: {
          Label("Start match", systemImage: "play.fill")
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
        .confirmationDialog("Who serves first?", isPresented: $choosingServer, titleVisibility: .visible) {
          ForEach(Player.allCases, id: \.self) { side in
            Button(match.sideDisplayName(side)) {
              Task { await model.start(server: side) }
            }
          }
        }
      }

      if model.canRespondToProposal {
        HStack(spacing: 12) {
          Button {
            Task { await model.acceptProposal() }
          } label: {
            Text("Accept").frame(maxWidth: .infinity)
          }
          .buttonStyle(.borderedProminent)
          Button(role: .destructive) {
            Task { await model.declineProposal() }
          } label: {
            Text("Decline").frame(maxWidth: .infinity)
          }
          .buttonStyle(.bordered)
        }
      }

      if model.canWithdrawProposal {
        note("Waiting for \(match.sideDisplayName(.player2)) to respond.", systemImage: "hourglass")
        Button(role: .destructive) {
          Task { await model.declineProposal() }
        } label: {
          Text("Withdraw proposal").frame(maxWidth: .infinity)
        }
        .buttonStyle(.bordered)
      }

      if model.canSubmitReport {
        note("Check the score, then submit it. Your opponent confirms it before standings update.", systemImage: "doc.text")
        Button {
          Task { await model.submitReport() }
        } label: {
          Label("Submit result", systemImage: "paperplane.fill")
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
      }

      if model.isAwaitingReportConfirmation {
        note("Result submitted. Waiting for the other side to confirm.", systemImage: "hourglass")
      }

      if model.canRespondToReport {
        note("Your opponent submitted this result. Confirm it if it's right.", systemImage: "checkmark.seal")
        HStack(spacing: 12) {
          Button {
            Task { await model.confirmReport() }
          } label: {
            Text("Confirm").frame(maxWidth: .infinity)
          }
          .buttonStyle(.borderedProminent)
          Button(role: .destructive) {
            confirmingDispute = true
          } label: {
            Text("Dispute").frame(maxWidth: .infinity)
          }
          .buttonStyle(.bordered)
          .confirmationDialog(
            "Dispute this result?",
            isPresented: $confirmingDispute,
            titleVisibility: .visible
          ) {
            Button("Dispute result", role: .destructive) {
              Task { await model.disputeReport() }
            }
          } message: {
            Text("Your division leader is notified and decides the final score.")
          }
        }
      }

      if match.status == .disputed {
        note("This result is disputed. Your division leader will resolve it.", systemImage: "exclamationmark.bubble")
      }

      if let reportUrl = match.reportUrl, let url = URL(string: reportUrl) {
        Link(destination: url) {
          Label("Match report (PDF)", systemImage: "doc.richtext")
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.bordered)
      }

      if model.isWorking {
        ProgressView()
      }
    }
  }

  private func note(_ text: String, systemImage: String) -> some View {
    Label(text, systemImage: systemImage)
      .font(.subheadline)
      .foregroundStyle(.secondary)
      .frame(maxWidth: .infinity, alignment: .leading)
  }
}
