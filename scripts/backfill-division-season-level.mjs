#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const VALID_MATCH_TYPES = new Set(['singles', 'doubles']);
const VALID_HALVES = new Set(['spring', 'fall']);
const WRITE_LIMIT = 450;

function usage() {
  return `Usage:
  pnpm backfill:season-level --division <divisionId> --season <spring-2026> --level <levelId> [options]

Also supported:
  pnpm run backfill:season-level -- --division <divisionId> --season <spring-2026> --level <levelId> [options]
  pnpm backfill:season-level -- --division <divisionId> --season <spring-2026> --level <levelId> [options]
  node scripts/backfill-division-season-level.mjs --division-id <divisionId> --season-id <spring-2026> --division-level-id <levelId> [options]

Note:
  This package script includes an internal -- separator, and the parser skips any
  additional -- separators. If -- or --division is reported as unknown, you are
  running an older copy of this script; pull the latest branch and rerun --help.

Options:
  --write, --live            Apply changes. Omit for dry-run mode.
  --dry-run                  Force dry-run mode.
  --overwrite-existing       Replace existing seasonId/divisionLevelId values on division matches.
  --match-type <type>        singles or doubles. Defaults to the selected division level's matchType.
  --assigned-by <userId>     assignedBy value for newly-created membership docs. Defaults to script:backfill.
  --backup-dir <path>        Directory for generated backup JSON files. Defaults to ./backups/firestore.
  --backup-file <path>       Exact backup JSON file path to write instead of generating one in --backup-dir.
  --project, --project-id    Firebase project ID. Usually inferred from credentials.
  --help                     Show this message.

Credentials:
  Set GOOGLE_APPLICATION_CREDENTIALS to a service-account JSON path, or set
  FIREBASE_SERVICE_ACCOUNT_KEY / FIREBASE_SERVICE_ACCOUNT_JSON to a JSON string
  or JSON file path. FIREBASE_ADMIN_PROJECT_ID + FIREBASE_ADMIN_CLIENT_EMAIL +
  FIREBASE_ADMIN_PRIVATE_KEY are also supported.

Dry-run is the default and logs every document that would change.`;
}

function parseArgs(argv) {
  const args = {
    dryRun: true,
    overwriteExisting: false,
    assignedBy: 'script:backfill',
    backupDir: path.resolve(process.cwd(), 'backups/firestore'),
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') continue;
    const next = () => {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      i += 1;
      return value;
    };
    switch (arg) {
      case '--division':
      case '--division-id':
        args.divisionId = next().trim();
        break;
      case '--season':
      case '--season-id':
        args.seasonId = next().trim();
        break;
      case '--level':
      case '--division-level':
      case '--division-level-id':
        args.divisionLevelId = next().trim();
        break;
      case '--match-type':
        args.matchType = next().trim();
        break;
      case '--assigned-by':
        args.assignedBy = next().trim();
        break;
      case '--backup-dir':
        args.backupDir = path.resolve(process.cwd(), next());
        break;
      case '--backup-file':
        args.backupFile = path.resolve(process.cwd(), next());
        break;
      case '--project':
      case '--project-id':
        args.projectId = next().trim();
        break;
      case '--write':
      case '--live':
        args.dryRun = false;
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--overwrite-existing':
        args.overwriteExisting = true;
        break;
      case '--help':
      case '-h':
        args.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function assertArgs(args) {
  if (args.help) return;
  const required = ['divisionId', 'seasonId', 'divisionLevelId'];
  const missing = required.filter((field) => !args[field]);
  if (missing.length) throw new Error(`Missing required argument(s): ${missing.join(', ')}`);
  if (!/^(spring|fall)-\d{4}$/.test(args.seasonId)) {
    throw new Error('season must use the app season ID format, e.g. spring-2026 or fall-2026.');
  }
  if (args.matchType && !VALID_MATCH_TYPES.has(args.matchType)) {
    throw new Error('match-type must be singles or doubles.');
  }
}

function serviceAccountFromEnvVars() {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  if (!projectId || !clientEmail || !privateKey) return null;
  return {
    projectId,
    clientEmail,
    privateKey: privateKey.replace(/\\n/g, '\n'),
  };
}

function initializeFirebase(projectId) {
  if (getApps().length) return;
  const credentialSource = process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (credentialSource) {
    const rawJson = existsSync(credentialSource)
      ? readFileSync(credentialSource, 'utf8')
      : credentialSource;
    initializeApp({ credential: cert(JSON.parse(rawJson)), ...(projectId ? { projectId } : {}) });
    return;
  }
  const serviceAccount = serviceAccountFromEnvVars();
  if (serviceAccount) {
    initializeApp({ credential: cert(serviceAccount), ...(projectId ? { projectId } : {}) });
    return;
  }
  initializeApp({ credential: applicationDefault(), ...(projectId ? { projectId } : {}) });
}

function normalizeName(name) {
  return String(name ?? '').trim().toLowerCase();
}

function cleanString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function jsonSafe(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'object') return value;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (Array.isArray(value)) return value.map(jsonSafe);
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, child]) => [key, jsonSafe(child)])
      .filter(([, child]) => child !== undefined),
  );
}

function diff(before, update) {
  const changed = {};
  for (const [key, value] of Object.entries(update)) {
    if (JSON.stringify(jsonSafe(before[key])) !== JSON.stringify(jsonSafe(value))) {
      changed[key] = value;
    }
  }
  return changed;
}

function membershipId(seasonId, divisionLevelId, userId) {
  return `${seasonId}_${divisionLevelId}_${userId}`;
}

function matchUpdateForRosterLookup(data, rosterByName) {
  const updateData = {};
  const linkedUserIds = new Set();
  const existingPlayerIds = Array.isArray(data.playerIds)
    ? data.playerIds.filter((id) => typeof id === 'string' && id.trim() && id !== 'guest')
    : [];
  const nextPlayerIds = new Set(existingPlayerIds);

  const maybeLinkSide = (idField, nameField) => {
    const currentId = cleanString(data[idField]);
    if (currentId && currentId !== 'guest') {
      linkedUserIds.add(currentId);
      nextPlayerIds.add(currentId);
      return;
    }
    const name = normalizeName(data[nameField]);
    const rosterUser = name ? rosterByName.get(name) : undefined;
    if (!rosterUser) return;
    updateData[idField] = rosterUser.userId;
    linkedUserIds.add(rosterUser.userId);
    nextPlayerIds.add(rosterUser.userId);
  };

  maybeLinkSide('player1Id', 'player1Name');
  if (data.player2IsGuest !== true) maybeLinkSide('player2Id', 'player2Name');

  const nextIds = [...nextPlayerIds];
  if (nextIds.length !== existingPlayerIds.length || nextIds.some((id) => !existingPlayerIds.includes(id))) {
    updateData.playerIds = nextIds;
  }

  return { updateData, linkedUserIds: [...linkedUserIds] };
}

function validateMatchUpdate(docId, data, update) {
  if (!isPlainObject(data)) return [`matches/${docId}: document data is not an object.`];
  const errors = [];
  if (data.divisionId && typeof data.divisionId !== 'string') errors.push(`matches/${docId}: divisionId is not a string.`);
  if (update.seasonId && typeof update.seasonId !== 'string') errors.push(`matches/${docId}: update seasonId is not a string.`);
  if (update.divisionLevelId && typeof update.divisionLevelId !== 'string') errors.push(`matches/${docId}: update divisionLevelId is not a string.`);
  if (update.matchType && !VALID_MATCH_TYPES.has(update.matchType)) errors.push(`matches/${docId}: update matchType is invalid.`);
  if (update.playerIds && (!Array.isArray(update.playerIds) || update.playerIds.some((id) => typeof id !== 'string' || !id.trim()))) {
    errors.push(`matches/${docId}: update playerIds must be a non-empty string array.`);
  }
  return errors;
}

async function loadRoster(db, divisionId, divisionData) {
  const rosterUserIds = new Set(
    Array.isArray(divisionData.playerIds)
      ? divisionData.playerIds.filter((id) => typeof id === 'string' && id.trim())
      : [],
  );
  const usersByDivisionSnap = await db.collection('users').where('divisionId', '==', divisionId).get();
  usersByDivisionSnap.docs.forEach((doc) => rosterUserIds.add(doc.id));

  const userSnapById = new Map();
  const rosterByName = new Map();
  const ids = [...rosterUserIds];
  for (let i = 0; i < ids.length; i += 100) {
    const snaps = await Promise.all(ids.slice(i, i + 100).map((id) => db.collection('users').doc(id).get()));
    for (const snap of snaps) {
      if (!snap.exists) continue;
      const user = snap.data();
      userSnapById.set(snap.id, snap);
      const displayName = cleanString(user.displayName);
      if (displayName) rosterByName.set(normalizeName(displayName), { userId: snap.id, displayName, email: cleanString(user.email), phone: cleanString(user.phone) });
    }
  }
  usersByDivisionSnap.docs.forEach((snap) => {
    if (!snap.exists) return;
    const user = snap.data();
    userSnapById.set(snap.id, snap);
    const displayName = cleanString(user.displayName);
    if (displayName) rosterByName.set(normalizeName(displayName), { userId: snap.id, displayName, email: cleanString(user.email), phone: cleanString(user.phone) });
  });

  return { rosterUserIds, userSnapById, rosterByName };
}

async function commitInBatches(db, operations) {
  let writes = 0;
  for (let i = 0; i < operations.length; i += WRITE_LIMIT) {
    const batch = db.batch();
    operations.slice(i, i + WRITE_LIMIT).forEach((operation) => {
      if (operation.kind === 'update') batch.update(operation.ref, operation.updateData);
      if (operation.kind === 'set') batch.set(operation.ref, operation.data, { merge: true });
      writes += 1;
    });
    await batch.commit();
  }
  return writes;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  assertArgs(args);
  initializeFirebase(args.projectId);
  const db = getFirestore();
  const now = Date.now();
  const [seasonHalf, seasonYear] = args.seasonId.split('-');
  if (!VALID_HALVES.has(seasonHalf)) throw new Error(`Invalid season half: ${seasonHalf}`);

  const divisionRef = db.collection('divisions').doc(args.divisionId);
  const levelRef = divisionRef.collection('levels').doc(args.divisionLevelId);
  const [divisionSnap, levelSnap] = await Promise.all([divisionRef.get(), levelRef.get()]);
  if (!divisionSnap.exists) throw new Error(`Division not found: divisions/${args.divisionId}`);
  if (!levelSnap.exists) throw new Error(`Division level not found: divisions/${args.divisionId}/levels/${args.divisionLevelId}`);

  const divisionData = divisionSnap.data() ?? {};
  const levelData = levelSnap.data() ?? {};
  if (levelData.seasonId !== args.seasonId) {
    throw new Error(`Level ${args.divisionLevelId} belongs to ${levelData.seasonId ?? 'unknown season'}, not ${args.seasonId}.`);
  }
  const effectiveMatchType = args.matchType ?? (VALID_MATCH_TYPES.has(levelData.matchType) ? levelData.matchType : undefined);
  if (!effectiveMatchType) throw new Error('No valid match type supplied and selected division level has no valid matchType.');

  const { rosterUserIds, userSnapById, rosterByName } = await loadRoster(db, args.divisionId, divisionData);
  const matchesSnap = await db.collection('matches').where('divisionId', '==', args.divisionId).get();
  const matchChanges = [];
  const validationErrors = [];

  for (const doc of matchesSnap.docs) {
    const data = doc.data();
    const seasonLevelUpdate = args.overwriteExisting || !data.seasonId || !data.divisionLevelId
      ? { seasonId: args.seasonId, divisionLevelId: args.divisionLevelId, matchType: effectiveMatchType }
      : {};
    const { updateData: identityUpdate, linkedUserIds } = matchUpdateForRosterLookup(data, rosterByName);
    linkedUserIds.forEach((id) => rosterUserIds.add(id));
    const updateData = diff(data, { ...seasonLevelUpdate, ...identityUpdate });
    validationErrors.push(...validateMatchUpdate(doc.id, data, updateData));
    if (Object.keys(updateData).length > 0) {
      matchChanges.push({ path: `matches/${doc.id}`, ref: doc.ref, before: jsonSafe(data), updateData: jsonSafe(updateData), rawUpdateData: updateData });
    }
  }

  const missingLinkedIds = [...rosterUserIds].filter((id) => !userSnapById.has(id));
  for (let i = 0; i < missingLinkedIds.length; i += 100) {
    const snaps = await Promise.all(missingLinkedIds.slice(i, i + 100).map((id) => db.collection('users').doc(id).get()));
    snaps.forEach((snap) => { if (snap.exists) userSnapById.set(snap.id, snap); });
  }

  const membershipChanges = [];
  for (const [userId, userSnap] of userSnapById.entries()) {
    const user = userSnap.data() ?? {};
    const displayName = cleanString(user.displayName) ?? userId;
    const id = membershipId(args.seasonId, args.divisionLevelId, userId);
    const ref = divisionRef.collection('memberships').doc(id);
    const existing = await ref.get();
    const baseMembershipData = {
      divisionId: args.divisionId,
      seasonId: args.seasonId,
      divisionLevelId: args.divisionLevelId,
      userId,
      displayNameSnapshot: displayName,
      ...(cleanString(user.email) ? { emailSnapshot: cleanString(user.email) } : {}),
      ...(cleanString(user.phone) ? { phoneSnapshot: cleanString(user.phone) } : {}),
      role: 'player',
      status: 'active',
      source: existing.exists ? (existing.data().source ?? 'migration') : 'migration',
      assignedBy: existing.exists ? (existing.data().assignedBy ?? args.assignedBy) : args.assignedBy,
      createdAt: existing.exists ? (existing.data().createdAt ?? now) : now,
    };
    const baseUpdateData = existing.exists ? diff(existing.data() ?? {}, baseMembershipData) : baseMembershipData;
    const updateData = Object.keys(baseUpdateData).length > 0
      ? { ...baseUpdateData, updatedAt: now }
      : {};
    const membershipData = Object.keys(updateData).length > 0
      ? { ...baseMembershipData, updatedAt: now }
      : baseMembershipData;
    if (Object.keys(updateData).length > 0) {
      membershipChanges.push({
        path: `divisions/${args.divisionId}/memberships/${id}`,
        ref,
        before: existing.exists ? jsonSafe(existing.data()) : null,
        data: membershipData,
        updateData: jsonSafe(updateData),
        exists: existing.exists,
      });
    }
  }

  if (validationErrors.length) {
    validationErrors.forEach((error) => console.error(`VALIDATION: ${error}`));
    throw new Error(`Validation failed for ${validationErrors.length} issue(s); no writes were performed.`);
  }

  const backupPath = args.backupFile ?? path.join(args.backupDir, `${args.divisionId}-${args.seasonId}-${args.divisionLevelId}-${now}.json`);
  mkdirSync(path.dirname(backupPath), { recursive: true });
  const backup = {
    generatedAt: new Date(now).toISOString(),
    mode: args.dryRun ? 'dry-run' : 'write',
    options: { ...args, backupDir: undefined, backupFile: undefined, help: undefined },
    division: { path: `divisions/${args.divisionId}`, data: jsonSafe(divisionData) },
    level: { path: `divisions/${args.divisionId}/levels/${args.divisionLevelId}`, data: jsonSafe(levelData) },
    matchChanges: matchChanges.map(({ path: changePath, before, updateData }) => ({ path: changePath, before, updateData })),
    membershipChanges: membershipChanges.map(({ path: changePath, before, updateData, exists }) => ({ path: changePath, before, updateData, exists })),
  };
  writeFileSync(backupPath, `${JSON.stringify(backup, null, 2)}\n`);

  console.log(`${args.dryRun ? 'DRY RUN' : 'WRITE'}: ${matchChanges.length} match document(s), ${membershipChanges.length} membership document(s) queued.`);
  console.log(`Backup/export written to ${backupPath}`);
  matchChanges.forEach((change) => console.log(`${args.dryRun ? 'WOULD UPDATE' : 'UPDATE'} ${change.path}: ${JSON.stringify(change.updateData)}`));
  membershipChanges.forEach((change) => console.log(`${args.dryRun ? 'WOULD UPSERT' : 'UPSERT'} ${change.path}: ${JSON.stringify(change.updateData)}`));

  if (args.dryRun) {
    console.log('Dry-run complete. Re-run with --write to apply these exact classes of changes after reviewing the backup JSON.');
    return;
  }

  const operations = [
    ...matchChanges.map((change) => ({ kind: 'update', ref: change.ref, updateData: change.rawUpdateData })),
    ...membershipChanges.map((change) => ({ kind: 'set', ref: change.ref, data: change.data })),
  ];
  const writes = await commitInBatches(db, operations);
  if (writes > 0) {
    await divisionRef.update({ updatedAt: now, lastSeasonLevelBackfillAt: now, lastSeasonLevelBackfill: FieldValue.serverTimestamp() });
  }
  console.log(`Write complete. ${writes} document write(s) committed.`);
  console.log('If rankings are stale, run the existing ranking repair/recalculation workflow for this division. Firestore field updates do not require a web redeploy.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
