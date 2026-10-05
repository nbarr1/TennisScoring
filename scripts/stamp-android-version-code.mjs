#!/usr/bin/env node
// Stamps expo.android.versionCode in apps/mobile/app.json for a CI release build.
//
// The value is VERSION_CODE_OFFSET + RUN_NUMBER (the EAS workflow's run number),
// which only grows. EAS's own autoIncrement bumped the runner's copy of app.json
// and nothing committed it back, so every production build reused one
// versionCode and Google Play rejects a repeat upload. Remote app versioning
// cannot replace it here: android/build.gradle reads versionCode from app.json,
// so EAS can neither seed a remote counter nor write one into the build.
//
// Usage: RUN_NUMBER=123 [VERSION_CODE_OFFSET=0] node scripts/stamp-android-version-code.mjs [app.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

function fail(message) {
  console.error(`stamp-android-version-code: ${message}`);
  process.exit(1);
}

const appJsonPath = resolve(process.argv[2] ?? 'app.json');
const runNumber = Number(process.env.RUN_NUMBER);
const offset = Number(process.env.VERSION_CODE_OFFSET ?? 0);
if (!Number.isSafeInteger(runNumber) || runNumber <= 0) {
  fail(`RUN_NUMBER must be a positive integer, got "${process.env.RUN_NUMBER ?? ''}".`);
}
if (!Number.isSafeInteger(offset) || offset < 0) {
  fail(`VERSION_CODE_OFFSET must be a non-negative integer, got "${process.env.VERSION_CODE_OFFSET}".`);
}

const raw = readFileSync(appJsonPath, 'utf8');
const current = JSON.parse(raw).expo?.android?.versionCode;
if (!Number.isInteger(current)) {
  fail(`${appJsonPath} has no integer expo.android.versionCode.`);
}

const next = offset + runNumber;
// Google Play only accepts a higher versionCode than any it has seen. If
// app.json was bumped past this scheme by hand (say, for a manual upload),
// stop here rather than build an upload Play would reject.
if (next <= current) {
  fail(
    `computed versionCode ${next} is not above app.json's ${current}. ` +
      'Raise VERSION_CODE_OFFSET in .github/workflows/eas-build.yml.',
  );
}
if (next > 2100000000 - 1000000) {
  // :wear ships 1000000 + this value, and Android caps versionCode at 2100000000.
  fail(`computed versionCode ${next} leaves no room for the watch app's offset.`);
}

// Rewrite only the number, so the file keeps its formatting.
const pattern = /("versionCode"\s*:\s*)\d+/;
if ((raw.match(new RegExp(pattern, 'g')) ?? []).length !== 1) {
  fail(`expected exactly one "versionCode" key in ${appJsonPath}.`);
}
const updated = raw.replace(pattern, `$1${next}`);
if (JSON.parse(updated).expo.android.versionCode !== next) {
  fail('the rewritten app.json does not carry the new versionCode.');
}
writeFileSync(appJsonPath, updated);
console.log(`Set expo.android.versionCode ${current} -> ${next} in ${appJsonPath}`);
