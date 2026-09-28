import SwiftUI
import TennisAppModel
import TennisCore

struct ProfileView: View {
  let session: SessionModel
  let user: User
  let names: PlayerNameCache
  @State private var unblockError: String?

  var body: some View {
    List {
      Section {
        LabeledContent("Name", value: user.displayName)
        LabeledContent("Email", value: user.email)
        if let phone = user.phone {
          LabeledContent("Phone", value: phone)
        }
        LabeledContent("Role", value: roleName)
      }

      if let summary = user.rankingSummary, summary.divisionId == user.divisionId, summary.rank > 0 {
        Section("This season") {
          LabeledContent("Rank", value: "\(summary.rank)")
          LabeledContent("Record", value: "\(summary.matchesWon)-\(summary.matchesLost)")
        }
      }

      Section {
        LabeledContent("Scoring tips", value: user.tipsEnabled ? "On" : "Off")
      } footer: {
        Text("Edit your profile, availability, and tips on the web app.")
      }

      if !user.blockedUserIds.isEmpty {
        Section {
          ForEach(user.blockedUserIds, id: \.self) { blockedId in
            HStack {
              Text(names.name(for: blockedId) ?? "Player")
              Spacer()
              Button("Unblock") {
                Task {
                  do {
                    try await session.services.messaging.unblock(blockedId, by: user.id)
                  } catch {
                    unblockError = error.localizedDescription
                  }
                }
              }
              .buttonStyle(.borderless)
            }
          }
        } header: {
          Text("Blocked players")
        } footer: {
          Text("You don't see messages from blocked players.")
        }
      }

      Section {
        Button("Sign out", role: .destructive) { session.signOut() }
      }
    }
    .task(id: user.blockedUserIds) { await names.resolve(user.blockedUserIds) }
    .alert("Couldn't unblock", isPresented: Binding(get: { unblockError != nil }, set: { if !$0 { unblockError = nil } })) {
      Button("OK", role: .cancel) {}
    } message: {
      Text(unblockError ?? "")
    }
  }

  private var roleName: String {
    switch user.role {
    case .player: "Player"
    case .divisionLeader: "Division leader"
    case .admin: "Admin"
    case .appDeveloper: "App developer"
    }
  }
}
