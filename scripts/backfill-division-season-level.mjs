#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const VALID_MATCH_TYPES = new Set(['singles', 'doubles']);
const VALID_SEASON_ID = /^(spring|fall)-\d{4}$/;

function usage() {
  return `Usage:
  node scripts/backfill-division-season-level.mjs \\
    --division-id DIVISION_ID \\
    --season-id spring-2026 \\
    --division-level-id LEVEL_ID \\
    [--match-type singles|doubles] [--overwrite-existing] [--live] [--backup-file path]

Defaults to dry-run. Pass --live to write changes.

Authentication:
  Uses FIREBASE_SERVICE_ACCOUNT_JSON, or FIREBASE_ADMIN_PROJECT_ID +
  FIREBASE_ADMIN_CLIENT_EMAIL + FIREBASE_ADMIN_PRIVATE_KEY, or Application
  Default Credentials / GOOGLE_APPLICATION_CREDENTIALS.`;
}

function parseArgs(argv) {
  const options = {
    dryRun: true,
    overwriteExisting: false,
    backupFile: '',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      i += 1;
      return value;
    };

    switch (arg) {
      case '--division-id':
        options.divisionId = next().trim();
        break;
      case '--season-id':
        options.seasonId = next().trim();
        break;
      case '--division-level-id':
        options.divisionLevelId = next().trim();
        break;
      case '--match-type':
        options.matchType = next().trim();
        break;
      case '--backup-file':
        options.backupFile = next().trim();
        break;
      case '--overwrite-existing':
        options.overwriteExisting = true;
        break;
      case '--live':
        options.dryRun = false;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--help':
      case '-h':
        console.log(usage());
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function requireOptions(options) {
  const missing = ['divisionId', 'seasonId', 'divisionLevelId'].filter((key) => !options[key]);
  if (missing.length > 0) throw new Error(`Missing required option(s): ${missing.join(', ')}`);
  if (!VALID_SEASON_ID.test(options.seasonId)) {
    throw new Error('seasonId must look like spring-2026 or fall-2026.');
  }
  if (options.matchType && !VALID_MATCH_TYPES.has(options.matchType)) {
    throw new Error('matchType must be singles or doubles when provided.');
  }
}

function credentialFromEnv() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON));
  }

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (projectId && clientEmail && privateKey) {
    return cert({ projectId, clientEmail, privateKey });
  }

  return applicationDefault();
}

function initDb() {
  if (!getApps().length) {
    initializeApp({ credential: credentialFromEnv() });
  }
  return getFirestore();
}

function changedFields(current, update) {
  return Object.fromEntries(
    Object.entries(update).filter(([key, value]) => current[key] !== value),
  );
}

function cleanString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function membershipId(seasonId, divisionLevelId, userId) {
  return `${seasonId}_${divisionLevelId}_${userId}`;
}

function userSnapshotToMembershipUpdate({ userId, user, divisionId, seasonId, divisionLevelId, now }) {
  return {
    id: membershipId(seasonId, divisionLevelId, userId),
    divisionId,
    seasonId,
    divisionLevelId,
    userId,
    displayNameSnapshot: cleanString(user.displayName) || cleanString(user.email) || userId,
    ...(cleanString(user.email) ? { emailSnapshot: cleanString(user.email) } : {}),
    ...(cleanString(user.phone) ? { phoneSnapshot: cleanString(user.phone) } : {}),
    role: user.role === 'division_leader' ? 'division_leader' : 'player',
    status: 'active',
    source: 'migration',
    assignedBy: 'script:backfill-division-season-level',
    updatedAt: now,
  };
}

async function validateInputs(db, options) {
  const divisionRef = db.collection('divisions').doc(options.divisionId);
  const [divisionSnap, levelSnap] = await Promise.all([
    divisionRef.get(),
    divisionRef.collection('levels').doc(options.divisionLevelId).get(),
  ]);

  if (!divisionSnap.exists) throw new Error(`Division not found: divisions/${options.divisionId}`);
  if (!levelSnap.exists) {
    throw new Error(`Division level not found: divisions/${options.divisionId}/levels/${options.divisionLevelId}`);
  }

  const level = levelSnap.data();
  if (level?.seasonId !== options.seasonId) {
    throw new Error(
      `Level season mismatch: level has seasonId=${level?.seasonId ?? '(missing)'}, requested ${options.seasonId}`,
    );
  }
  if (options.matchType && level?.matchType && level.matchType !== options.matchType) {
    throw new Error(`Level matchType mismatch: level has ${level.matchType}, requested ${options.matchType}`);
  }

  return { divisionRef, division: divisionSnap.data(), level };
}

async function collectPlans(db, options, validation) {
  const now = Date.now();
  const backup = { generatedAt: new Date(now).toISOString(), options, documents: [] };
  const matchPlans = [];
  const affectedUserIds = new Set();

  const matchSnap = await db.collection('matches').where('divisionId', '==', options.divisionId).get();
  for (const docSnap of matchSnap.docs) {
    const data = docSnap.data();
    const update = {};

    if (options.overwriteExisting || !data.seasonId) update.seasonId = options.seasonId;
    if (options.overwriteExisting || !data.divisionLevelId) update.divisionLevelId = options.divisionLevelId;
    if ((options.overwriteExisting || !data.matchType) && (options.matchType || validation.level?.matchType)) {
      update.matchType = options.matchType || validation.level.matchType;
    }

    const diff = changedFields(data, update);
    if (Object.keys(diff).length > 0) {
      matchPlans.push({ ref: docSnap.ref, path: docSnap.ref.path, before: data, update: diff });
      backup.documents.push({ path: docSnap.ref.path, data });
      [data.player1Id, data.player2Id, ...(Array.isArray(data.playerIds) ? data.playerIds : [])]
        .filter((id) => typeof id === 'string' && id.trim())
        .forEach((id) => affectedUserIds.add(id));
    }
  }

  (Array.isArray(validation.division?.playerIds) ? validation.division.playerIds : [])
    .filter((id) => typeof id === 'string' && id.trim())
    .forEach((id) => affectedUserIds.add(id));

  const divisionUsersSnap = await db.collection('users').where('divisionId', '==', options.divisionId).get();
  divisionUsersSnap.docs.forEach((docSnap) => affectedUserIds.add(docSnap.id));

  const userSnaps = await Promise.all([...affectedUserIds].map((id) => db.collection('users').doc(id).get()));
  const membershipPlans = [];

  for (const userSnap of userSnaps) {
    if (!userSnap.exists) continue;
    const update = userSnapshotToMembershipUpdate({
      userId: userSnap.id,
      user: userSnap.data() || {},
      divisionId: options.divisionId,
      seasonId: options.seasonId,
      divisionLevelId: options.divisionLevelId,
      now,
    });
    const ref = validation.divisionRef.collection('memberships').doc(update.id);
    const existing = await ref.get();
    const current = existing.data() || {};
    const write = existing.exists ? changedFields(current, update) : { ...update, createdAt: now };
    if (Object.keys(write).length > 0) {
      membershipPlans.push({ ref, path: ref.path, before: existing.exists ? current : null, update: write });
      backup.documents.push({ path: ref.path, data: existing.exists ? current : null });
    }
  }

  return { matchPlans, membershipPlans, backup };
}

function writeBackup(backup, backupFile) {
  const resolved = resolve(backupFile || `firestore-backups/division-season-level-${Date.now()}.json`);
  mkdirSync(dirname(resolved), { recursive: true });
  writeFileSync(resolved, `${JSON.stringify(backup, null, 2)}\n`);
  return resolved;
}

async function commitPlans(db, plans) {
  const allPlans = [...plans.matchPlans, ...plans.membershipPlans];
  for (let i = 0; i < allPlans.length; i += 400) {
    const batch = db.batch();
    for (const plan of allPlans.slice(i, i + 400)) {
      batch.set(plan.ref, plan.update, { merge: true });
    }
    await batch.commit();
  }
}

function logPlans(plans) {
  for (const plan of plans.matchPlans) {
    console.log(`[match] ${plan.path}`);
    console.log(`  update: ${JSON.stringify(plan.update)}`);
  }
  for (const plan of plans.membershipPlans) {
    console.log(`[membership] ${plan.path}`);
    console.log(`  update: ${JSON.stringify(plan.update)}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  requireOptions(options);
  const db = initDb();
  const validation = await validateInputs(db, options);
  const plans = await collectPlans(db, options, validation);

  console.log(options.dryRun ? 'DRY RUN: no writes will be made.' : 'LIVE RUN: Firestore will be updated.');
  console.log(`Matches to update: ${plans.matchPlans.length}`);
  console.log(`Memberships to upsert/update: ${plans.membershipPlans.length}`);
  logPlans(plans);

  if (plans.matchPlans.length === 0 && plans.membershipPlans.length === 0) {
    console.log('No changes required.');
    return;
  }

  const backupPath = writeBackup(plans.backup, options.backupFile);
  console.log(`Backup written: ${backupPath}`);

  if (options.dryRun) {
    console.log('Dry run complete. Re-run with --live to apply these changes.');
    return;
  }

  await commitPlans(db, plans);
  console.log('Firestore update complete.');
}

main().catch((error) => {
  console.error(error.message || error);
  if (!process.argv.includes('--help') && !process.argv.includes('-h')) {
    console.error('\n' + usage());
  }
  process.exitCode = 1;
});
