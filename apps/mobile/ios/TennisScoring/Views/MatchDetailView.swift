import SwiftUI
import TennisAppModel
import TennisCore
import UIKit

struct MatchDetailView: View {
  @State private var model: MatchDetailModel
  @State private var choosingServer = false
  @State private var confirmingDispute = false
  @State private var confirmingDecline = false
  @State private var confirmingWithdraw = false

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
      for await incoming in PhoneWatchConnector.shared.commands() {
        // The watch confirms the tap only when this says the command applied.
        let applied = await model.handle(incoming.command)
        incoming.reply(applied)
      }
    }
    .onChange(of: model.watchSnapshot, initial: true) { _, snapshot in
      if let snapshot { PhoneWatchConnector.shared.publish(snapshot) }
    }
    .onChange(of: model.wasRemoved) { _, removed in
      if removed { PhoneWatchConnector.shared.publishRemoval(matchId: model.matchId) }
    }
    .onDisappear {
      // Leave the watch showing the score, but read-only: nothing on the phone is
      // listening for its commands any more.
      if var snapshot = model.watchSnapshot {
        snapshot.canScore = false
        snapshot.canUndo = false
        PhoneWatchConnector.shared.publish(snapshot)
      }
    }
    // Every point or undo the server applied, from this screen or the watch: a
    // tap that registered is felt, and VoiceOver hears the new score.
    .sensoryFeedback(trigger: model.lastFeedback) { _, feedback in
      switch feedback?.kind {
      case .point: return SensoryFeedback.success
      case .undo: return SensoryFeedback.impact(weight: .light)
      case nil: return nil
      }
    }
    // A write the server refused buzzes, as the watch's failure haptic does,
    // so a point that didn't count isn't mistaken for one that did. A load
    // error with no match on screen is the "Match not found" view, not a
    // refused tap, so it stays silent.
    .sensoryFeedback(.error, trigger: model.match == nil ? nil : model.errorMessage) { _, message in
      message != nil
    }
    .onChange(of: model.lastFeedback) { _, feedback in
      if let feedback { UIAccessibility.post(notification: .announcement, argument: feedback.announcement) }
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
          // Regular bordered buttons are about 34 points tall, under the 44-point
          // minimum, and these are pressed courtside between points.
          .controlSize(.large)
      }
      .padding()
      .readableContentWidth()
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
              // Black on the player colors, as on the watch: white on them is
              // under 3.5:1.
              .foregroundStyle(.black)
              .frame(maxWidth: .infinity, minHeight: 72)
            }
            .buttonStyle(.borderedProminent)
            // The same blue and orange the watch shows for each side, so a
            // player looking from wrist to phone finds the same button.
            .tint(Color.player(side))
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
            .foregroundStyle(Color.onLeague)
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
            Text("Accept")
              .foregroundStyle(Color.onLeague)
              .frame(maxWidth: .infinity)
          }
          .buttonStyle(.borderedProminent)
          Button(role: .destructive) {
            confirmingDecline = true
          } label: {
            Text("Decline").frame(maxWidth: .infinity)
          }
          .buttonStyle(.bordered)
          .confirmationDialog(
            "Decline this proposal?",
            isPresented: $confirmingDecline,
            titleVisibility: .visible
          ) {
            Button("Decline proposal", role: .destructive) {
              Task { await model.declineProposal() }
            }
          } message: {
            Text("The match is cancelled and \(match.sideDisplayName(.player1)) is notified.")
          }
        }
      }

      if model.canWithdrawProposal {
        note("Waiting for \(match.sideDisplayName(.player2)) to respond.", systemImage: "hourglass")
        Button(role: .destructive) {
          confirmingWithdraw = true
        } label: {
          Text("Withdraw proposal").frame(maxWidth: .infinity)
        }
        .buttonStyle(.bordered)
        .confirmationDialog(
          "Withdraw this proposal?",
          isPresented: $confirmingWithdraw,
          titleVisibility: .visible
        ) {
          Button("Withdraw proposal", role: .destructive) {
            Task { await model.declineProposal() }
          }
        } message: {
          Text("The match is cancelled, and \(match.sideDisplayName(.player2)) can no longer accept it.")
        }
      }

      if model.canSubmitReport {
        note("Check the score, then submit it. Your opponent confirms it before standings update.", systemImage: "doc.text")
        Button {
          Task { await model.submitReport() }
        } label: {
          Label("Submit report", systemImage: "paperplane.fill")
            .foregroundStyle(Color.onLeague)
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
      }

      if model.isAwaitingReportConfirmation {
        note(awaitingConfirmationText, systemImage: "hourglass")
      }

      if model.canRespondToReport {
        let windowClosed = model.isReportWindowClosed(now: Self.nowMillis)
        note(respondToReportText(windowClosed: windowClosed), systemImage: "checkmark.seal")
        HStack(spacing: 12) {
          Button {
            Task { await model.confirmReport() }
          } label: {
            Text("Confirm score")
              .foregroundStyle(Color.onLeague)
              .frame(maxWidth: .infinity)
          }
          .buttonStyle(.borderedProminent)
          // After the 48 hours the rules refuse a dispute, so offer only Confirm.
          if !windowClosed {
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

  private static var nowMillis: Int64 { Int64((Date().timeIntervalSince1970 * 1000).rounded()) }

  private static func formattedDeadline(_ millis: Int64) -> String {
    millis.dateFromMillis.formatted(date: .abbreviated, time: .shortened)
  }

  /// The submitter's side sees when the report confirms itself, as on web and in the Expo app.
  private var awaitingConfirmationText: String {
    let base = "Report submitted. Waiting for the other side to confirm it."
    guard let deadline = model.reportConfirmationDeadline else { return base }
    if model.isReportWindowClosed(now: Self.nowMillis) {
      return "\(base) The 48 hours to answer have passed, so it's being confirmed automatically."
    }
    return "\(base) If they don't answer by \(Self.formattedDeadline(deadline)), it's confirmed automatically."
  }

  private func respondToReportText(windowClosed: Bool) -> String {
    if windowClosed {
      return "Your opponent reported this score. The 48 hours to answer have passed, so it's being confirmed automatically."
    }
    let base = "Your opponent reported this score. Confirm it if it's right."
    guard let deadline = model.reportConfirmationDeadline else { return base }
    return "\(base) Answer by \(Self.formattedDeadline(deadline)), or it's confirmed automatically."
  }

  private func note(_ text: String, systemImage: String) -> some View {
    Label(text, systemImage: systemImage)
      .font(.subheadline)
      .foregroundStyle(.secondary)
      .frame(maxWidth: .infinity, alignment: .leading)
  }
}
