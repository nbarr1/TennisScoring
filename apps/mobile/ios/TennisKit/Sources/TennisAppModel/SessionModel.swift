import Foundation
import Observation
import TennisCore

/// Who is signed in and whether they can use the app yet.
///
/// The gate mirrors the React Native `AuthGuard`: signed out → sign in; signed in
/// without a division → join one; otherwise the main tabs. The tutorial step is
/// not part of the native client.
@MainActor
@Observable
public final class SessionModel {
  public enum State: Equatable, Sendable {
    case loading
    case signedOut
    case needsDivision(User)
    case ready(User)
    case failed(String)
  }

  public private(set) var state: State = .loading
  public private(set) var isSigningIn = false
  public var signInError: String?
  public private(set) var isJoiningDivision = false
  public var joinDivisionError: String?

  public let services: AppServices
  @ObservationIgnored private var userObservation: Task<Void, Never>?
  @ObservationIgnored private var observedUid: String?
  @ObservationIgnored private var hasAccountState = false

  public init(services: AppServices) {
    self.services = services
  }

  /// The signed-in player, once their profile has loaded.
  public var user: User? {
    switch state {
    case let .ready(user), let .needsDivision(user): user
    default: nil
    }
  }

  /// Follows the auth state for as long as the caller's task runs. Run it from the
  /// root view's `.task`, so it ends with the view.
  public func observe() async {
    defer {
      userObservation?.cancel()
      userObservation = nil
      observedUid = nil
      hasAccountState = false
    }
    for await account in services.auth.accountChanges() {
      accountChanged(account)
    }
  }

  public func signIn(email: String, password: String) async {
    let email = email.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !email.isEmpty, !password.isEmpty else {
      signInError = "Enter your email and password."
      return
    }
    isSigningIn = true
    signInError = nil
    defer { isSigningIn = false }
    do {
      try await services.auth.signIn(email: email, password: password)
    } catch {
      signInError = error.localizedDescription
    }
  }

  public func signOut() {
    do {
      try services.auth.signOut()
    } catch {
      state = .failed(error.localizedDescription)
    }
  }

  /// Joins a division by invite code. The profile listener moves the session to
  /// `.ready` once the server has written the new `divisionId`.
  @discardableResult
  public func joinDivision(inviteCode: String) async -> Bool {
    let code = inviteCode.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !code.isEmpty else {
      joinDivisionError = "Enter the invite code from your division leader."
      return false
    }
    isJoiningDivision = true
    joinDivisionError = nil
    defer { isJoiningDivision = false }
    do {
      try await services.divisions.joinDivision(inviteCode: code)
      return true
    } catch {
      joinDivisionError = error.localizedDescription
      return false
    }
  }

  private func accountChanged(_ account: AuthAccount?) {
    // Auth listeners repeat the current account on token refresh; only a change
    // of account restarts the profile listener.
    guard !hasAccountState || account?.uid != observedUid else { return }
    hasAccountState = true
    userObservation?.cancel()
    observedUid = account?.uid

    guard let account else {
      state = .signedOut
      return
    }
    state = .loading
    let stream = services.users.observeUser(id: account.uid)
    userObservation = Task { [weak self] in
      do {
        for try await user in stream {
          guard let self, !Task.isCancelled else { return }
          self.userChanged(user)
        }
      } catch {
        guard let self, !Task.isCancelled else { return }
        self.state = .failed(error.localizedDescription)
      }
    }
  }

  private func userChanged(_ user: User?) {
    guard let user else {
      state = .failed("Your player profile could not be found. Sign out and try again, or contact your division leader.")
      return
    }
    state = user.divisionId == nil ? .needsDivision(user) : .ready(user)
  }
}
