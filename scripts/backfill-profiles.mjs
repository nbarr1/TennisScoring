#!/usr/bin/env node
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import process from 'node:process';

const WRITE_LIMIT = 450;

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

function initializeFirebase() {
  if (getApps().length) return;
  const serviceAccount = serviceAccountFromEnvVars();
  if (serviceAccount) {
    initializeApp({ credential: cert(serviceAccount) });
    return;
  }
  initializeApp({ credential: applicationDefault() });
}

async function main() {
  const isDryRun = !process.argv.includes('--write');
  initializeFirebase();
  const db = getFirestore();
  const now = Date.now();

  console.log(`Starting profile backfill (${isDryRun ? 'DRY RUN' : 'WRITE MODE'})...`);

  const usersSnap = await db.collection('users').get();
  console.log(`Found ${usersSnap.size} user(s).`);

  const operations = [];

  for (const userSnap of usersSnap.docs) {
    const user = userSnap.data();
    const uid = userSnap.id;

    const profileData = {
      id: uid,
      displayName: user.displayName || 'Player',
      avatarUrl: user.avatarUrl || null,
      divisionId: user.divisionId || null,
      role: user.role || 'player',
      updatedAt: now,
    };

    if (user.rankingSummary) {
      profileData.rankingSummary = user.rankingSummary;
    }

    operations.push({
      ref: db.collection('profiles').doc(uid),
      data: profileData
    });
  }

  console.log(`Queued ${operations.length} profile document(s).`);

  if (isDryRun) {
    console.log('Dry run complete. Use --write to apply changes.');
    return;
  }

  let writes = 0;
  for (let i = 0; i < operations.length; i += WRITE_LIMIT) {
    const batch = db.batch();
    operations.slice(i, i + WRITE_LIMIT).forEach((op) => {
      batch.set(op.ref, op.data, { merge: true });
      writes += 1;
    });
    await batch.commit();
    console.log(`Committed batch of ${Math.min(WRITE_LIMIT, operations.length - i)} writes...`);
  }

  console.log(`Backfill complete. ${writes} profile(s) created/updated.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
