import Foundation

protocol AuthRepository: Sendable { var userId: String? { get async }; func signIn(email: String, password: String) async throws; func signOut() throws }
protocol UserRepository: Sendable { func user(id: String) -> AsyncThrowingStream<User?, Error>; func registerNotificationToken(_ token: String, userId: String) async throws }
protocol CallableRepository: Sendable { func call<Response: Decodable>(_ name: String, payload: [String: Sendable], as: Response.Type) async throws -> Response }

@MainActor final class SessionViewModel: ObservableObject {
  enum State { case loading, signedOut, onboarding(User), ready(User), failed(String) }
  @Published private(set) var state: State = .loading
  private var observation: Task<Void, Never>?
  func observe(userId: String, repository: UserRepository) {
    observation?.cancel()
    observation = Task { do { for try await user in repository.user(id: userId) { guard let user else { state = .signedOut; continue }; state = user.divisionId == nil || user.tutorialDone != true ? .onboarding(user) : .ready(user) } } catch { state = .failed(error.localizedDescription) } }
  }
  deinit { observation?.cancel() }
}
