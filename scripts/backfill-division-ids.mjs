#!/usr/bin/env node
/**
 * Diagnose and repair mismatched divisionId values in the Firestore matches collection.
 *
 * Run from the repo root. firebase-admin is resolved from firebase/node_modules.
 *
 * Audit (identify all divisionIds in use):
 *   node scripts/backfill-division-ids.mjs
 *
 * Dry-run migration (no writes):
 *   node scripts/backfill-division-ids.mjs --from <oldId> --to <realId>
 *
 * Apply migration:
 *   node scripts/backfill-division-ids.mjs --from <oldId> --to <realId> --apply
 *
 * Credentials are read from environment variables:
 *   FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, FIREBASE_ADMIN_PRIVATE_KEY
 * If those are absent the script falls back to Application Default Credentials
 * (useful when pointed at the local emulator via FIRESTORE_EMULATOR_HOST).
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

// Resolve firebase-admin from the firebase/ workspace package so we don't need
// a separate install at the repo root.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(__dirname, '../firebase/package.json'));

const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

function initAdmin() {
  if (getApps().length) return;

  const projectId   = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey  = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (projectId && clientEmail && privateKey) {
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  } else {
    // Application Default Credentials — also works with the local emulator
    // when FIRESTORE_EMULATOR_HOST is set.
    initializeApp({ projectId: projectId ?? process.env.GCLOUD_PROJECT });
    if (!projectId) {
      console.warn(
        'No FIREBASE_ADMIN_* env vars found — using Application Default Credentials.\n' +
        'Set FIRESTORE_EMULATOR_HOST=localhost:8080 to target the local emulator.\n',
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

async function audit() {
  initAdmin();
  const db = getFirestore();

  console.log('Fetching all matches from Firestore…');
  const matchSnap = await db.collection('matches').get();
  console.log(`Total match documents: ${matchSnap.size}\n`);

  // Group by divisionId
  const byDivision = new Map();
  for (const doc of matchSnap.docs) {
    const d = doc.data();
    const divId  = d.divisionId ?? '(missing)';
    const status = d.status    ?? '(missing)';

    if (!byDivision.has(divId)) {
      byDivision.set(divId, { total: 0, byStatus: {} });
    }
    const entry = byDivision.get(divId);
    entry.total++;
    entry.byStatus[status] = (entry.byStatus[status] ?? 0) + 1;
  }

  console.log('divisionId breakdown:');
  console.log('─'.repeat(60));
  for (const [divId, info] of [...byDivision.entries()].sort((a, b) => b[1].total - a[1].total)) {
    const statusSummary = Object.entries(info.byStatus)
      .sort(([, a], [, b]) => b - a)
      .map(([s, n]) => `${s}:${n}`)
      .join('  ');
    console.log(`  ${divId}`);
    console.log(`    matches: ${info.total}   (${statusSummary})`);
  }
  console.log('─'.repeat(60));

  // Show divisions collection so user can identify the correct ID
  const divSnap = await db.collection('divisions').get();
  console.log(`\ndivisions collection (${divSnap.size} record${divSnap.size !== 1 ? 's' : ''}):`);
  console.log('─'.repeat(60));
  if (divSnap.empty) {
    console.log('  (empty)');
  } else {
    for (const doc of divSnap.docs) {
      const d = doc.data();
      console.log(`  ID:      ${doc.id}`);
      console.log(`  Name:    ${d.name ?? '(none)'}`);
      console.log(`  Players: ${(d.playerIds ?? []).length}`);
      console.log('');
    }
  }

  if (byDivision.size > 1) {
    console.log(
      'ACTION NEEDED: Multiple divisionIds found in matches.\n' +
      'Identify the correct division ID from the divisions list above,\n' +
      'then run:\n\n' +
      '  node scripts/backfill-division-ids.mjs --from <wrongId> --to <correctId>\n\n' +
      'to preview, then add --apply to commit changes.',
    );
  } else {
    console.log('\nOnly one divisionId in use — no migration needed.');
  }
}

// ---------------------------------------------------------------------------
// Migrate
// ---------------------------------------------------------------------------

async function migrate(fromId, toId, apply) {
  if (!fromId || !toId) {
    console.error('--from and --to are both required.');
    process.exit(1);
  }
  if (fromId === toId) {
    console.error('--from and --to must be different.');
    process.exit(1);
  }

  initAdmin();
  const db = getFirestore();

  // Verify the target division exists
  const divDoc = await db.collection('divisions').doc(toId).get();
  if (!divDoc.exists) {
    console.warn(`Warning: division "${toId}" not found in the divisions collection.`);
    if (!apply) {
      console.warn('Proceeding in dry-run. Recheck the ID before using --apply.\n');
    }
  } else {
    const d = divDoc.data();
    console.log(`Target division: "${d.name}" (${(d.playerIds ?? []).length} players)\n`);
  }

  // Fetch affected matches
  const snap = await db.collection('matches').where('divisionId', '==', fromId).get();

  if (snap.empty) {
    console.log(`No matches found with divisionId="${fromId}".`);
    return;
  }

  const completed = snap.docs.filter((d) => d.data().status === 'completed');
  console.log(
    `Found ${snap.size} match(es) with divisionId="${fromId}" ` +
    `(${completed.length} completed):\n`,
  );
  for (const doc of snap.docs) {
    const d = doc.data();
    const p1 = d.player1Name ?? d.player1Id ?? '?';
    const p2 = d.player2Name ?? d.player2Id ?? '?';
    console.log(`  [${d.status}] ${doc.id}  ${p1} vs ${p2}`);
  }

  if (!apply) {
    console.log(
      `\nDRY RUN — no changes written.\n` +
      `Re-run with --apply to migrate ${snap.size} match(es):\n\n` +
      `  node scripts/backfill-division-ids.mjs --from ${fromId} --to ${toId} --apply\n`,
    );
    return;
  }

  // Batch-update in chunks of 400 (Firestore limit is 500; leave headroom)
  console.log('\nApplying migration…');
  const CHUNK = 400;
  let migrated = 0;
  for (let i = 0; i < snap.docs.length; i += CHUNK) {
    const batch = db.batch();
    const chunk = snap.docs.slice(i, i + CHUNK);
    for (const doc of chunk) {
      batch.update(doc.ref, {
        divisionId: toId,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
    migrated += chunk.length;
    console.log(`  Wrote ${migrated} / ${snap.size}`);
  }

  console.log(`\nMigrated ${migrated} match(es) from "${fromId}" → "${toId}".`);
  console.log(
    '\nNext step: trigger a rankings recalculation so the standings reflect the\n' +
    'migrated matches. Use the admin panel "Recalculate Rankings" button, or run:\n\n' +
    '  firebase functions:shell\n' +
    '  > recalculateDivisionRankings({ data: { divisionId: "' + toId + '" } })\n',
  );
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

const fromId = args[args.indexOf('--from') + 1] ?? null;
const toId   = args[args.indexOf('--to')   + 1] ?? null;
const apply  = args.includes('--apply');

if (fromId || toId) {
  migrate(fromId, toId, apply).catch((e) => { console.error(e); process.exit(1); });
} else {
  audit().catch((e) => { console.error(e); process.exit(1); });
}
