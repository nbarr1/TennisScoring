import Foundation
import XCTest

/// Waits for asynchronous observation to deliver, failing after two seconds.
@MainActor
func eventually(
  _ description: String = "condition",
  file: StaticString = #filePath,
  line: UInt = #line,
  _ condition: @MainActor () -> Bool
) async {
  let deadline = Date().addingTimeInterval(2)
  while !condition() {
    if Date() > deadline {
      XCTFail("Timed out waiting for \(description)", file: file, line: line)
      return
    }
    try? await Task.sleep(nanoseconds: 1_000_000)
  }
}

/// The first value a listener delivers (its current state), or nil.
func firstValue<T>(_ stream: AsyncThrowingStream<T, Error>) async -> T? {
  var iterator = stream.makeAsyncIterator()
  return try? await iterator.next() ?? nil
}
