# Google Play Console Submission & Android App Audit Report

**Target Repository / App:** `@tennis/mobile` (`tennis-scoring`)  
**Audit Date:** May 2024  
**Audit Status:** ⚠️ **BLOCKED / ACTION REQUIRED** (Requires key policy and manifest corrections before Play Store submission)

---

## Executive Summary

The project provides a modern Expo/React Native setup with cross-platform targets (including a Wear OS module). However, **the release manifest contains critical policy violations that will cause immediate rejection or policy warnings on the Google Play Console.** 

Key issues include production declaration of system overlays (`SYSTEM_ALERT_WINDOW`), deprecated broad storage permissions, missing `versionCode` build configurations, and unverified Target SDK levels.

---

## Detailed Audit Findings

### 1. Target API Level (SDK)
* **Status:** ⚠️ **Unverified / Action Needed**
* **Analysis:**
  * No `build.gradle` or Expo configuration file (`app.json` / `app.config.js`) was provided in the file list to verify explicit `targetSdkVersion`.
  * **Google Play Policy Requirement:** Google Play requires all new app submissions to target **API Level 34 (Android 14)** or higher (API 35 required starting late 2024/2025).
  * **Recommendation:** Ensure your `app.json` or `android/app/build.gradle` explicitly specifies `targetSdkVersion = 34` (or 35).

---

### 2. Permissions & Security
* **Status:** 🛑 **CRITICAL BLOCKER**

#### Critical Issues:
1. **`SYSTEM_ALERT_WINDOW` in Production Manifest (`apps/mobile/android/app/src/main/AndroidManifest.xml`)**:
   * **Problem:** This permission allows drawing over other apps. It is declared in `src/main/AndroidManifest.xml` (Production). 
   * **Play Store Policy Impact:** Google Play heavily restricts `SYSTEM_ALERT_WINDOW`. Apps using it must submit a justification or special permission declaration. In React Native / Expo, this permission is only needed in development for debugging overlays (`src/debug/AndroidManifest.xml`).
   * **Fix:** Remove `SYSTEM_ALERT_WINDOW` completely from `apps/mobile/android/app/src/main/AndroidManifest.xml`. Keep it strictly in `src/debug/AndroidManifest.xml`.

2. **Legacy & Excessive Storage Permissions (`READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`)**:
   * **Problem:** Declared in `src/main/AndroidManifest.xml`. On Android 13+ (API 33+), broad storage permissions are deprecated and forbidden unless your app is a specialized File Manager (`MANAGE_EXTERNAL_STORAGE`).
   * **Play Store Policy Impact:** Requesting `READ_EXTERNAL_STORAGE` / `WRITE_EXTERNAL_STORAGE` without using granular media permissions (`READ_MEDIA_IMAGES`, `READ_MEDIA_AUDIO`, `READ_MEDIA_VIDEO`) or standard system photo pickers (e.g., `expo-image-picker`) will lead to immediate Play Store rejection.
   * **Fix:** Remove `READ_EXTERNAL_STORAGE` and `WRITE_EXTERNAL_STORAGE` from `AndroidManifest.xml`. Rely on `expo-image-picker`'s native system picker which requires zero storage permissions on API 33+.

3. **Dangerous Permission: `RECORD_AUDIO`**:
   * **Problem:** Declared in `src/main/AndroidManifest.xml`.
   * **Play Store Policy Impact:** Google Play classifies `RECORD_AUDIO` as a dangerous permission.
   * **Fix:** You must:
     1. Prompt for runtime permissions in application code.
     2. Declare Audio recording usage in the **Data Safety** section on Google Play Console.
     3. Provide a clear in-app disclosure prior to triggering the permission request.

4. **Insecure Cloud Backup Default (`android:allowBackup="true"`)**:
   * **Problem:** Defaulting `android:allowBackup="true"` allows raw app data (such as stored session tokens or cached state) to be uploaded to unencrypted Google Cloud backups.
   * **Fix:** Set `android:allowBackup="false"` or configure explicit `android:fullBackupContent` rules in `AndroidManifest.xml`.

---

### 3. App Bundle (.aab) & Build Pipeline
* **Status:** ✅ **PASS (with verification required)**
* **Analysis:**
  * `apps/mobile/package.json` uses Expo Application Services (`eas build --platform android`).
  * EAS builds default to the `.aab` (Android App Bundle) format as mandated by Google Play.
* **Recommendation:** Ensure your `eas.json` specifies `buildType: "app-bundle"` for production profiles and that production keystores are securely managed via EAS Credentials or Play App Signing.

---

### 4. Versioning Strategy
* **Status:** ⚠️ **Action Needed**
* **Analysis:**
  * All `package.json` files define semantic versioning (`"version": "1.0.1"`).
  * **Google Play Policy Requirement:** Google Play requires an internal integer `versionCode` (e.g., `1`, `2`, `3`) that increments with every build upload, alongside the human-readable `versionName` ("1.0.1").
* **Fix:** Ensure `versionCode` is configured in `app.json` under `expo.android.versionCode` or in `android/app/build.gradle` under `android.defaultConfig.versionCode`.

---

### 5. Privacy Policy & Compliance
* **Status:** ⚠️ **Action Needed**
* **Analysis:**
  * The application includes core dependencies on Firebase (`@tennis/firebase-client`, `firebase-auth`, `expo-notifications`) and sensitive permissions (`RECORD_AUDIO`).
  * **Google Play Requirement:** Any app collecting user authentication data, push tokens, or using runtime permissions MUST link an accessible Privacy Policy in:
    1. Google Play Console (**App Content > Privacy Policy**).
    2. Within the mobile app itself (e.g., Settings or About screen).

---

## Wear OS Module Considerations (`apps/mobile/android/wear`)

* `android.hardware.type.watch` is correctly declared as `required="true"`.
* **Play Store Deployment Note:** Wear OS apps cannot be published under standard phone tracks without enrolling in the **Wear OS track** on Google Play Console and meeting specific Wear OS quality guidelines (e.g., rotary input, ambient mode support, circular layouts).

---

## Action Checklist (Pre-Submission Checklist)

### 🚨 Blockers (Must Fix Before Submission)
- [ ] **Clean Manifest Permissions**:
  - Remove `<uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW"/>` from `apps/mobile/android/app/src/main/AndroidManifest.xml`.
  - Remove `READ_EXTERNAL_STORAGE` and `WRITE_EXTERNAL_STORAGE` from `apps/mobile/android/app/src/main/AndroidManifest.xml`.
- [ ] **Security Hardening**:
  - Update `apps/mobile/android/app/src/main/AndroidManifest.xml` to set `android:allowBackup="false"`.

### ⚠️ High Priority (Play Console Configuration)
- [ ] **Target API Compliance**: Verify that `targetSdkVersion` is explicitly set to **34** (Android 14) or higher.
- [ ] **Version Code Alignment**: Verify `versionCode` (integer) is configured and incremented in `app.json` / `build.gradle`.
- [ ] **Data Safety Declarations**:
  - Fill out Google Play Console **Data Safety Form** for:
    - User Identity / Accounts (Firebase Auth)
    - Audio Data (`RECORD_AUDIO`)
    - Device identifiers & Crash Data (Firebase / Expo)
- [ ] **Privacy Policy**: Create and publish a Privacy Policy URL covering Firebase authentication, push notifications, and audio recordings.

### 📋 Final Quality Assurance
- [ ] Run release build generation via EAS: `eas build --platform android --profile production`.
- [ ] Test the production `.aab` on an Android 14+ device using Google Play Internal Testing.
- [ ] Verify runtime permission prompts for microphone access (`RECORD_AUDIO`) function smoothly with clear rationale screens.