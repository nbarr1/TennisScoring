# Android Build Reference

Curated notes from [developer.android.com/develop](https://developer.android.com/develop) and its
linked build/tooling pages, focused on what's relevant to this repo's Android surface:
`apps/mobile` (Expo/React Native, built both locally with Gradle and in the cloud via EAS) and the
`mobile_bundle`/`mobile_native` CI jobs in `.github/workflows/ci.yml`. This is reference material,
not a replacement for `CLAUDE.md`'s "Dependency constraints" section, which documents the
version pins this repo actually enforces.

Source pages crawled: `/develop`, `/build`, `/build/gradle-build-overview`, `/tools`,
`/guide/app-bundle`, `/build/build-for-release`, `/studio/build/shrink-code`,
`/studio/build/dependencies`, `/build/releases/gradle-plugin`.

## 1. The Gradle build pipeline

Every Gradle build runs in three phases:

1. **Initialization** — reads `settings.gradle(.kts)` to determine which projects/modules are
   included and sets up plugin/dependency repositories.
2. **Configuration** — executes each project's `build.gradle(.kts)`, registers tasks, and builds a
   Directed Acyclic Graph (DAG) of task dependencies. Configuration code cannot read files produced
   during execution.
3. **Execution** — runs tasks in DAG order; Gradle skips a task if none of its declared inputs
   changed since the last run (incremental build caching).

Key files:

| File | Purpose |
|---|---|
| `gradle/wrapper/gradle-wrapper.properties` | Pins the Gradle version via `distributionUrl` — this is what `gradlew`/`gradlew.bat` bootstrap from. |
| `settings.gradle(.kts)` | Declares included modules, plugin/dependency repositories (`pluginManagement`, `dependencyResolutionManagement`). |
| Root `build.gradle(.kts)` | Declares plugin versions shared across modules, usually with `apply false`. |
| Module `build.gradle(.kts)` (e.g. `apps/mobile/android/app/build.gradle`) | `android { }` block: `namespace`, `compileSdk`, `defaultConfig { applicationId, minSdk, targetSdk, versionCode, versionName }`, `buildTypes`, `productFlavors`, `dependencies`. |
| `gradle.properties` | Project-wide Gradle daemon/JVM settings (heap size, `org.gradle.jvmargs`, AndroidX flags). |
| `local.properties` | Machine-local paths (`sdk.dir`, `ndk.dir`, `cmake.dir`); never commit this file. On Windows, `ndk.symlinkdir` can shorten NDK paths to avoid `MAX_PATH` issues. |

## 2. Build variants

A **build variant** is the cross product of a **build type** (debug/release, controls
packaging/signing/shrinking) and a **product flavor** (e.g. free/paid, controls source code and
resources). Variant names follow `<flavor><BuildType>` — e.g. `demoRelease`, `fullDebug`.

Source set resolution priority (highest wins on conflict, but files/resources merge across all of
them):

```
build variant  >  build type  >  product flavor  >  main  >  library dependencies
```

Corresponding directories: `src/main/`, `src/<buildType>/`, `src/<productFlavor>/`,
`src/<productFlavor><BuildType>/`. Android manifest merging follows the same priority order.

This repo doesn't currently define custom product flavors in `apps/mobile/android/app/build.gradle`
(Expo's prebuild config generates it), so variants there are effectively just `debug`/`release`.

## 3. Dependencies

Preferred mechanism: a **version catalog** at `gradle/libs.versions.toml`:

```toml
[versions]
agp = "8.3.0"

[libraries]
androidx-core = { group = "androidx.core", name = "core-ktx", version = "1.13.0" }

[plugins]
androidApplication = { id = "com.android.application", version.ref = "agp" }
```

```kotlin
plugins { alias(libs.plugins.androidApplication) }
dependencies { implementation(libs.androidx.core) }
```

Dependency configurations:

| Configuration | Effect |
|---|---|
| `implementation` | Compiled + packaged; not exposed to modules that depend on this one. Default choice. |
| `api` | Compiled + packaged + transitively exposed to consumers. |
| `compileOnly` | Compile-time only, not packaged. |
| `runtimeOnly` | Packaged, not on the compile classpath. |
| `ksp` / `kapt` / `annotationProcessor` | Annotation processing (prefer `ksp` for Kotlin). |
| `testImplementation` | Local JVM unit tests only. |
| `androidTestImplementation` | Instrumented (on-device) tests only. |
| `lintChecks` / `lintPublish` | Include/publish custom lint checks. |

Avoid dynamic versions (`"3.+"`); this repo's Dependabot config + `pnpm.overrides` already encode
several hard-learned pins (see `CLAUDE.md`'s "Dependency constraints" section) — the same
"pin, don't float" philosophy applies to any native Android/Gradle dependency touched in
`apps/mobile/android/`.

## 4. Release builds, signing, and R8

### Generating a signed build

- Android Studio: **Build > Generate Signed Bundle / APK**, or
- CLI: `./gradlew bundleRelease` (AAB, the Play-required format) / `./gradlew assembleRelease` (APK,
  what `mobile_native` in this repo's CI runs for `arm64-v8a` only, unsigned, purely to prove the
  native code compiles).
- Output paths: `app/build/outputs/bundle/release/app-release.aab`,
  `app/build/outputs/apk/release/app-release.apk`.
- Debug builds are auto-signed with a generic debug key; release builds need an explicit
  `signingConfig` (keystore path, store/key passwords, key alias) or are left unsigned.

### R8 shrinking/obfuscation (legacy DSL, AGP < 9.3 — what this repo's AGP version uses)

```kotlin
android {
    buildTypes {
        release {
            isMinifyEnabled = true       // code shrinking + obfuscation
            isShrinkResources = true     // resource shrinking
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
}
```

- Keep rules (`proguard-rules.pro`) prevent R8 from stripping/renaming reflectively-used code:
  `-keep class com.example.MyClass { *; }`.
- R8 full mode has been the default since AGP 8.0; don't set
  `android.r8.enableFullMode=false` without a documented reason — it changes what optimizations run
  repo-wide.
- Only enable shrinking for release builds — it slows the build and makes stack traces
  unreadable without the mapping file (`retrace` CLI tool decodes them).
- AGP 8.12+ adds an opt-in `android.r8.optimizedResourceShrinking=true` gradle.properties flag;
  newer AGP majors (9.x) replace the whole DSL with an `optimization { enable = true }` block and
  `.keep`-suffixed rule files — not relevant here until an AGP major bump.

## 5. Android App Bundles (AAB) vs APK

- Google Play has required AABs for new apps since August 2021; this repo's EAS build profiles
  (`apps/mobile/eas.json`) should target `app-bundle` for any Play-bound production build.
- An AAB defers final APK generation/signing to Google Play, which then serves per-device
  "split" APKs (by ABI, screen density, language) — smaller downloads, no manual multi-APK
  management.
- `bundletool` (Google's CLI) is useful for local testing of what Play would generate:

  ```bash
  bundletool build-apks --bundle=app-release.aab --output=app.apks \
    --ks=keystore.jks --ks-pass=pass:<pw> --ks-key-alias=<alias> --key-pass=pass:<pw>
  bundletool install-apks --apks=app.apks
  bundletool dump manifest --bundle=app-release.aab
  ```

- Compressed download size limit: 4 GB per app/module (Play Asset Delivery for game-style assets
  is exempt). Not a practical concern for this app today, but worth knowing before adding large
  bundled assets (e.g. video, ML models) to `apps/mobile`.

## 6. AGP / Gradle / JDK compatibility

Each Android Gradle Plugin (AGP) release pins minimum Gradle and JDK versions (see
`/build/releases/gradle-plugin` for the authoritative table for whatever AGP version is in use).
As a general pattern: newer AGP majors require newer minimum Gradle and JDK versions, and cap the
maximum `compileSdk`/`targetSdk` API level they support.

This repo pins these explicitly rather than letting them drift independently:

- Node version: `.nvmrc` (see `CLAUDE.md` — this is the one Node source of truth; it does **not**
  cover JDK/Gradle/AGP, which are separate ecosystems).
- JDK: `mobile_bundle`/`mobile_native` CI jobs in `.github/workflows/ci.yml` set up JDK 17 (via
  Temurin) — this must stay aligned with whatever `apps/mobile/android`'s AGP version requires.
- NDK: pinned to `27.1.12297006` in CI (`mobile_native` job), matching react-native 0.86.2's
  version catalog — see the `react-native` pin note in `CLAUDE.md`'s dependency-constraints
  section. A react-native/Expo SDK bump can silently require a different NDK version; check
  `expo/bundledNativeModules.json` and RN's own Gradle version catalog when bumping.
- AGP itself is managed indirectly through the Expo SDK/RN version, not pinned directly in this
  repo's own Gradle files (Expo's prebuild step generates `apps/mobile/android/build.gradle`).

When bumping the Expo SDK or React Native version in this repo, cross-check the new AGP/Gradle/JDK
requirements against what CI's `mobile_native`/`mobile_bundle` jobs currently install — a mismatch
here is exactly the kind of EAS-only failure those two jobs exist to catch locally instead of on a
real EAS cloud build.

## 7. SDK command-line tools reference

| Tool | Location | Purpose |
|---|---|---|
| `sdkmanager` | `cmdline-tools/<version>/bin/` | Install/update/remove SDK packages, platforms, build-tools. |
| `avdmanager` | `cmdline-tools/<version>/bin/` | Create/manage Android Virtual Devices from the CLI. |
| `apkanalyzer` | `cmdline-tools/<version>/bin/` | Inspect a built APK's size/composition. |
| `lint` | `cmdline-tools/<version>/bin/` | Static analysis for code-quality/correctness issues. |
| `retrace` | `cmdline-tools/<version>/bin/` | Decode an R8/ProGuard-obfuscated stack trace using the mapping file. |
| `aapt2` | `build-tools/<version>/` | Compiles/links Android resources into the binary format packaged into APKs. |
| `apksigner` | `build-tools/<version>/` | Signs an APK and verifies signature validity across supported platform versions. |
| `zipalign` | `build-tools/<version>/` | Aligns uncompressed APK data for more efficient on-device access. |
| `adb` | `platform-tools/` | Device/emulator control, app install, shell access, logcat. |
| `fastboot` | `platform-tools/` | Flashes device system images (bootloader-level, not used for app development). |
| `bundletool` | standalone jar | Build/inspect/test `.aab` App Bundles (see §5). |
| `jetifier-standalone` | standalone | Rewrites a Support Library-based library to AndroidX. |

Typical `PATH` setup: add `$ANDROID_HOME/cmdline-tools/<version>/bin`, `$ANDROID_HOME/platform-tools`,
and `$ANDROID_HOME/emulator` — matching what `apps/mobile`'s native build tooling (Gradle, the
`mobile_native` CI job) expects to find on `PATH`/`ANDROID_HOME`.

## Further reading

- [Configure your build](https://developer.android.com/build)
- [Gradle build overview](https://developer.android.com/build/gradle-build-overview)
- [Android App Bundles](https://developer.android.com/guide/app-bundle)
- [Shrink, obfuscate, and optimize your app (R8)](https://developer.android.com/studio/build/shrink-code)
- [Add build dependencies](https://developer.android.com/studio/build/dependencies)
- [Android Gradle Plugin release notes](https://developer.android.com/build/releases/gradle-plugin)
- [Command-line tools](https://developer.android.com/tools)
