import Foundation

/// Links the app opens. Both custom schemes the Expo client registered are kept,
/// so existing notification payloads and shared links still resolve.
public enum DeepLink: Equatable, Sendable {
  case match(id: String)

  public static let schemes: Set<String> = ["tennisleague", "com.companytennisleague.app"]

  /// Parses `tennisleague://match/<id>` (or the bundle-id scheme). Anything else,
  /// including a match link without an id, is nil.
  public init?(url: URL) {
    guard let scheme = url.scheme?.lowercased(), Self.schemes.contains(scheme) else { return nil }
    let components = url.pathComponents.filter { $0 != "/" }
    guard url.host?.lowercased() == "match",
          let id = components.first?.removingPercentEncoding?.trimmingCharacters(in: .whitespaces),
          !id.isEmpty
    else { return nil }
    self = .match(id: id)
  }
}
