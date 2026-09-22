#!/usr/bin/env bash
# Typechecks the Swift sources of the native iOS migration.
#
# There is no Xcode project yet, so this is the only signal available for this
# code: swiftc typechecks each target's sources as a module against the SDK that
# target ships on. It compiles nothing and runs no tests. Replace it with
# `xcodebuild test` once apps/mobile/ios/TennisScoring.xcodeproj exists and
# carries test targets.
set -euo pipefail

if ! command -v xcrun > /dev/null 2>&1; then
  echo "This check needs macOS with the Xcode command line tools (xcrun not found)." >&2
  exit 1
fi

arch="$(uname -m)"
ios_target="${IOS_DEPLOYMENT_TARGET:-17.0}"
watchos_target="${WATCHOS_DEPLOYMENT_TARGET:-10.0}"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "Typechecking TennisScoring against the iOS simulator SDK"
xcrun --sdk iphonesimulator swiftc -typecheck \
  -target "${arch}-apple-ios${ios_target}-simulator" \
  "${root}"/apps/mobile/ios/TennisScoring/*.swift

echo "Typechecking TennisScoringWatch against the watchOS simulator SDK"
xcrun --sdk watchsimulator swiftc -typecheck \
  -target "${arch}-apple-watchos${watchos_target}-simulator" \
  "${root}"/apps/mobile/ios/TennisScoringWatch/*.swift

echo "Swift sources typecheck cleanly."
