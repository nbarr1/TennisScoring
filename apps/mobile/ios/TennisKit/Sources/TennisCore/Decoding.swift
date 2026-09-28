import Foundation

// Firestore documents in this project are written by three clients and a set of
// Cloud Functions over several years, so fields go missing, and a timestamp that
// is usually `Date.now()` milliseconds is sometimes a `serverTimestamp()`. These
// helpers let the models decode what is actually stored instead of rejecting a
// whole document over one field. Each model documents its own defaults.

extension KeyedDecodingContainer {
  /// A millisecond timestamp stored as an integer, a floating-point number, or a
  /// Firestore `Timestamp` (which Firestore's decoder surfaces as a `Date`).
  /// Anything else reads as `nil`.
  func decodeMillis(_ key: Key) -> Int64? {
    if let value = try? decodeIfPresent(Int64.self, forKey: key) { return value }
    if let value = try? decodeIfPresent(Double.self, forKey: key), value.isFinite {
      return Int64(value)
    }
    if let date = try? decodeIfPresent(Date.self, forKey: key) {
      return Int64((date.timeIntervalSince1970 * 1000).rounded())
    }
    return nil
  }

  /// A value that is replaced by `fallback` when missing, null, or of the wrong type.
  func decode<T: Decodable>(_ key: Key, default fallback: @autoclosure () -> T) -> T {
    (try? decodeIfPresent(T.self, forKey: key)) ?? fallback()
  }

  /// An optional value that reads as `nil` when it is present but malformed.
  func decodeLenient<T: Decodable>(_ type: T.Type, _ key: Key) -> T? {
    (try? decodeIfPresent(T.self, forKey: key)) ?? nil
  }

  /// A string whose blank values count as missing.
  func decodeNonBlank(_ key: Key) -> String? {
    guard let value = decodeLenient(String.self, key) else { return nil }
    return value.trimmedForId.isEmpty ? nil : value
  }
}

extension String {
  /// Whitespace-trimmed, matching JavaScript's `String.prototype.trim()` closely
  /// enough for ids and display names.
  var trimmedForId: String { trimmingCharacters(in: .whitespacesAndNewlines) }
}
