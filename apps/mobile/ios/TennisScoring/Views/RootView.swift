import SwiftUI
import TennisAppModel
import TennisCore

/// Routes between sign-in, joining a division, and the main tabs, following
/// `SessionModel.state`.
struct RootView: View {
  let session: SessionModel
  /// A match to open once the player is signed in, from a `tennisleague://` link.
  @State private var pendingMatchId: String?

  var body: some View {
    Group {
      switch session.state {
      case .loading:
        ProgressView("Loading…")
      case .signedOut:
        SignInView(session: session)
      case let .needsDivision(user):
        JoinDivisionView(session: session, user: user)
      case let .ready(user):
        MainTabView(session: session, user: user, pendingMatchId: $pendingMatchId)
          // A new division means new standings; rebuild the tabs' models.
          .id("\(user.id)|\(user.divisionId ?? "")")
      case let .failed(message):
        VStack(spacing: 16) {
          ContentUnavailableView("Something went wrong", systemImage: "exclamationmark.triangle", description: Text(message))
          Button("Sign out") { session.signOut() }
            .buttonStyle(.bordered)
        }
        .padding()
      }
    }
    .safeAreaInset(edge: .top, spacing: 0) {
      if session.services.isDemo { DemoBanner() }
    }
    .tint(Color.league)
    .task { await session.observe() }
    .onOpenURL { url in
      if case let .match(id) = DeepLink(url: url) { pendingMatchId = id }
    }
  }
}

struct SignInView: View {
  let session: SessionModel
  @State private var email = ""
  @State private var password = ""
  @FocusState private var focusedField: Field?

  private enum Field { case email, password }

  var body: some View {
    NavigationStack {
      Form {
        Section {
          TextField("Email", text: $email)
            .textContentType(.username)
            .keyboardType(.emailAddress)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .focused($focusedField, equals: .email)
            .submitLabel(.next)
            .onSubmit { focusedField = .password }
          SecureField("Password", text: $password)
            .textContentType(.password)
            .focused($focusedField, equals: .password)
            .submitLabel(.go)
            .onSubmit(signIn)
        } footer: {
          if session.services.isDemo {
            Text("Demo mode: sign in as \(DemoBackend.demoEmail) with any password.")
          }
        }

        if let error = session.signInError {
          Section {
            Label(error, systemImage: "exclamationmark.circle")
              .foregroundStyle(.red)
          }
        }

        Section {
          Button(action: signIn) {
            HStack {
              Spacer()
              if session.isSigningIn { ProgressView() } else { Text("Sign in").bold() }
              Spacer()
            }
          }
          .disabled(session.isSigningIn)
        }
      }
      .navigationTitle("Tennis League")
    }
  }

  private func signIn() {
    focusedField = nil
    Task { await session.signIn(email: email, password: password) }
  }
}

struct JoinDivisionView: View {
  let session: SessionModel
  let user: User
  @State private var inviteCode = ""

  var body: some View {
    NavigationStack {
      Form {
        Section {
          TextField("Invite code", text: $inviteCode)
            .textInputAutocapitalization(.characters)
            .autocorrectionDisabled()
            .onSubmit(join)
        } header: {
          Text("Join your division")
        } footer: {
          Text(session.services.isDemo
            ? "Demo mode: the invite code is \(DemoBackend.demoInviteCode)."
            : "Your division leader can give you the code.")
        }

        if let error = session.joinDivisionError {
          Section {
            Label(error, systemImage: "exclamationmark.circle")
              .foregroundStyle(.red)
          }
        }

        Section {
          Button(action: join) {
            HStack {
              Spacer()
              if session.isJoiningDivision { ProgressView() } else { Text("Join division").bold() }
              Spacer()
            }
          }
          .disabled(session.isJoiningDivision)
        }
      }
      .navigationTitle("Welcome, \(user.displayName)")
      .toolbar {
        Button("Sign out") { session.signOut() }
      }
    }
  }

  private func join() {
    Task { await session.joinDivision(inviteCode: inviteCode) }
  }
}
