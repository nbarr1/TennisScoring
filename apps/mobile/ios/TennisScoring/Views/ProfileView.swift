import SwiftUI
import TennisAppModel
import TennisCore

struct ProfileView: View {
  let session: SessionModel
  let user: User

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

      Section {
        Button("Sign out", role: .destructive) { session.signOut() }
      }
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
