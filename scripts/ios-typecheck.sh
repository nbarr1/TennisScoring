#!/usr/bin/env bash
# Typechecks the Swift sources of the native iOS client against the Apple SDKs.
#
# There is no Xcode project yet, so this is how the app and watch targets are
# checked: the TennisKit package's TennisCore and TennisAppModel modules are
# emitted for each simulator SDK, then each target's sources are typechecked
# against them. It compiles nothing and runs no tests; the package's tests run
# through `swift test --package-path apps/mobile/ios/TennisKit`.
#
# FirebaseServices.swift is wrapped in `#if canImport(Firebase…)`, and no
# Firebase modules exist here, so it is skipped. It is checked only once an
# Xcode project links the Firebase packages. Replace this script with
# `xcodebuild test` when apps/mobile/ios/TennisScoring.xcodeproj exists.
set -euo pipefail

if ! command -v xcrun > /dev/null 2>&1; then
  echo "This check needs macOS with the Xcode command line tools (xcrun not found)." >&2
  exit 1
fi

arch="$(uname -m)"
ios_target="${arch}-apple-ios${IOS_DEPLOYMENT_TARGET:-17.0}-simulator"
watchos_target="${arch}-apple-watchos${WATCHOS_DEPLOYMENT_TARGET:-10.0}-simulator"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ios="${root}/apps/mobile/ios"
kit="${ios}/TennisKit/Sources"
modules="$(mktemp -d)"
trap 'rm -rf "${modules}"' EXIT

# emit_module <sdk> <target> <output dir> <module name> [sources...]
emit_module() {
  local sdk="$1" target="$2" out="$3" name="$4"
  shift 4
  mkdir -p "${out}"
  xcrun --sdk "${sdk}" swiftc -emit-module -parse-as-library -swift-version 6 \
    -target "${target}" -module-name "${name}" -I "${out}" \
    -emit-module-path "${out}/${name}.swiftmodule" "$@"
}

# Sorted, so the file order (and so any diagnostics) are stable across runs.
sources() { find "$1" -name '*.swift' | LC_ALL=C sort; }

echo "Emitting TennisKit modules for the iOS simulator SDK"
emit_module iphonesimulator "${ios_target}" "${modules}/ios" TennisCore $(sources "${kit}/TennisCore")
emit_module iphonesimulator "${ios_target}" "${modules}/ios" TennisAppModel $(sources "${kit}/TennisAppModel")

echo "Typechecking TennisScoring against the iOS simulator SDK"
xcrun --sdk iphonesimulator swiftc -typecheck -parse-as-library \
  -target "${ios_target}" -I "${modules}/ios" \
  $(sources "${ios}/TennisScoring")

echo "Emitting TennisCore for the watchOS simulator SDK"
emit_module watchsimulator "${watchos_target}" "${modules}/watchos" TennisCore $(sources "${kit}/TennisCore")

echo "Typechecking TennisScoringWatch against the watchOS simulator SDK"
xcrun --sdk watchsimulator swiftc -typecheck -parse-as-library \
  -target "${watchos_target}" -I "${modules}/watchos" \
  $(sources "${ios}/TennisScoringWatch")

echo "Swift sources typecheck cleanly."
