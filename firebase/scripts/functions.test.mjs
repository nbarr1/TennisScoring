// Cloud Functions tests against the Firestore and Storage emulators. Run by
// `pnpm test:functions`, which builds lib/index.js first.
//
// These drive the built bundle's handlers directly through each function's
// `run()`, with the Admin SDK pointed at the emulators, so they exercise the
// same code that deploys. They cover the gaps the pre-release review listed:
// concurrent ranking recalculation, report PDFs for names outside Latin-1, and
// "record match on behalf" when sending notifications fails.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { after, before, beforeEach, describe, it } from 'node:test';

const PROJECT_ID = 'demo-tennis-functions';
process.env.GCLOUD_PROJECT = PROJECT_ID;
process.env.FIREBASE_CONFIG = JSON.stringify({
  projectId: PROJECT_ID,
  storageBucket: `${PROJECT_ID}.appspot.com`,
});
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.FIREBASE_STORAGE_EMULATOR_HOST ??= '127.0.0.1:9199';

const require = createRequire(import.meta.url);
// The bundle marks firebase-admin as external, so these resolve to the same
// module instances the functions use. That is what lets a test hold a query
// or fail a push send.
const { getFirestore, Query } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const { Messaging } = require('firebase-admin/messaging');
const functions = require('../lib/index.js');

// Marks a test that reproduces a bug the pre-release review found and that is
// not fixed yet. node:test still runs a `todo` test and prints its result, but
// a failure does not fail the run. Once the fix lands the test passes: delete
// the marker then, so a regression fails CI again.
const knownBug = (finding) => ({ todo: `known bug: ${finding}` });

const DIVISION = 'divA';
const SEASON = '2026-H2';
const db = getFirestore();

const set = (setNumber, player1Games, player2Games) => ({
  setNumber,
  player1Games,
  player2Games,
  winner: player1Games > player2Games ? 'player1' : 'player2',
});

const finalScore = {
  sets: [set(0, 6, 2), set(1, 6, 3)],
  currentSet: 1,
  currentGame: { player1: '0', player2: '0' },
  isTiebreak: false,
  server: 'player1',
  serviceSide: 'deuce',
  player1SetsWon: 2,
  player2SetsWon: 0,
};

function match(player1Id, player2Id, overrides = {}) {
  return {
    divisionId: DIVISION,
    seasonId: SEASON,
    player1Id,
    player2Id,
    player1Name: player1Id,
    player2Name: player2Id,
    player2IsGuest: false,
    playerIds: [player1Id, player2Id],
    format: { setsToWin: 2, gamesPerSet: 6, tiebreakAt: 6, finalSetTiebreak: true },
    status: 'pending_report',
    liveScore: finalScore,
    stats: { player1: {}, player2: {} },
    advancedStatsEnabled: false,
    tipsEnabled: false,
    source: 'live',
    isDivisionMatch: true,
    winner: 'player1',
    createdBy: player1Id,
    createdAt: 1,
    completedAt: 2,
    reportSubmission: { submittedBy: player1Id, submittedAt: 2, status: 'pending_confirmation' },
    ...overrides,
  };
}

const confirmed = (m) => ({
  ...m,
  status: 'completed',
  reportSubmission: { ...m.reportSubmission, status: 'confirmed', confirmedBy: m.player2Id, confirmedAt: 3 },
});

const snapshotOf = (data) => ({ data: () => data });
const writeEvent = (matchId, beforeData, afterData) => ({
  params: { matchId },
  data: { before: snapshotOf(beforeData), after: snapshotOf(afterData) },
});

async function clearFirestore() {
  const res = await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
  assert.ok(res.ok, `could not clear the Firestore emulator: ${res.status}`);
}

async function seedPlayers(ids, extra = {}) {
  const batch = db.batch();
  batch.set(db.collection('divisions').doc(DIVISION), {
    name: 'A',
    inviteCode: 'ABCDEFGH',
    leaderIds: ['leader'],
    playerIds: ids,
  });
  for (const id of [...ids, 'leader']) {
    const role = id === 'leader' ? 'division_leader' : 'player';
    batch.set(db.collection('users').doc(id), {
      id,
      displayName: extra[id]?.displayName ?? id,
      email: `${id}@example.com`,
      role,
      divisionId: DIVISION,
      fcmTokens: extra[id]?.fcmTokens ?? [],
    });
  }
  await batch.commit();
}

async function singlesRankings() {
  const snap = await db.collection('divisions').doc(DIVISION).collection('rankings').get();
  return Object.fromEntries(snap.docs.map((d) => [d.data().userId, d.data()]));
}

/**
 * Holds the next Query.get() after it has read, until `release()` runs. The
 * first query recalculateRankings issues is the division's completed matches,
 * so this freezes a recalculation between its read and its writes, which is
 * the window two confirmations seconds apart can land in.
 */
function holdNextQueryRead() {
  const original = Query.prototype.get;
  let release;
  let signalRead;
  const gate = new Promise((resolve) => (release = resolve));
  const read = new Promise((resolve) => (signalRead = resolve));
  Query.prototype.get = async function heldGet(...args) {
    Query.prototype.get = original;
    const snapshot = await original.apply(this, args);
    signalRead();
    await gate;
    return snapshot;
  };
  return { read, release, restore: () => (Query.prototype.get = original) };
}

before(async () => {
  assert.equal(typeof functions.onMatchUpdate?.run, 'function', 'build lib/index.js first (pnpm build)');
});

beforeEach(clearFirestore);

after(async () => {
  await clearFirestore();
});

describe('ranking recalculation', () => {
  it('counts one confirmation on its own', async () => {
    await seedPlayers(['p1', 'p2']);
    const m1 = match('p1', 'p2');
    await db.collection('matches').doc('m1').set(confirmed(m1));
    await functions.onMatchUpdate.run(writeEvent('m1', m1, confirmed(m1)));

    const rankings = await singlesRankings();
    assert.equal(rankings.p1?.matchesWon, 1);
    assert.equal(rankings.p2?.matchesLost, 1);
  });

  it(
    'keeps both results when two matches are confirmed back to back',
    knownBug('a slower recalculation overwrites a faster one with a stale read'),
    async () => {
      await seedPlayers(['p1', 'p2', 'p3', 'p4']);
      const m1 = match('p1', 'p2');
      const m2 = match('p3', 'p4');
      await db.collection('matches').doc('m1').set(confirmed(m1));
      await db.collection('matches').doc('m2').set(m2);

      // m1's recalculation reads the table while m2 is still awaiting
      // confirmation, then stalls before writing.
      const hold = holdNextQueryRead();
      let slow;
      try {
        slow = functions.onMatchUpdate.run(writeEvent('m1', m1, confirmed(m1)));
        await hold.read;
        // m2 is confirmed and its own recalculation runs to completion.
        await db.collection('matches').doc('m2').set(confirmed(m2));
        await functions.onMatchUpdate.run(writeEvent('m2', m2, confirmed(m2)));
      } finally {
        hold.release();
        hold.restore();
      }
      await slow;

      const rankings = await singlesRankings();
      assert.equal(rankings.p1?.matchesWon, 1, 'm1 is counted');
      assert.equal(rankings.p3?.matchesWon, 1, 'm2 is counted');
      assert.equal(rankings.p4?.matchesLost, 1, 'm2 is counted for the loser');
    },
  );
});

describe('match report PDF', () => {
  async function generateFor(matchId, names) {
    await seedPlayers(['p1', 'p2'], {
      p1: { displayName: names[0] },
      p2: { displayName: names[1] },
    });
    const m = match('p1', 'p2', { player1Name: names[0], player2Name: names[1] });
    await db.collection('matches').doc(matchId).set(confirmed(m));
    const file = getStorage().bucket().file(`reports/${matchId}.pdf`);
    await file.delete({ ignoreNotFound: true });

    // Signing the download link needs service-account credentials the
    // emulator run does not have, so the call can reject after the PDF is
    // stored. What matters here is whether the PDF was drawn and stored.
    const error = await functions.generateMatchReport
      .run(writeEvent(matchId, m, confirmed(m)))
      .then(() => undefined, (err) => err);
    const [exists] = await file.exists();
    return { exists, error };
  }

  it('stores a report for Latin-1 names', async () => {
    const { exists, error } = await generateFor('latin', ['José Núñez', 'Zoë Müller']);
    assert.ok(exists, `the PDF was not stored: ${error?.message}`);
  });

  it(
    'stores a report for names outside Latin-1',
    knownBug("pdf-lib's built-in Helvetica throws on characters outside WinAnsi"),
    async () => {
      const { exists, error } = await generateFor('unicode', ['Łukasz Wójcik', '李娜']);
      assert.ok(exists, `the PDF was not stored: ${error?.message}`);
    },
  );
});

describe('record match on behalf', () => {
  const request = {
    auth: { uid: 'leader', token: { email: 'leader@example.com', email_verified: true } },
    data: { divisionId: DIVISION, player1Id: 'p1', player2Id: 'p2', sets: [{ p1: 6, p2: 3 }, { p1: 6, p2: 4 }] },
    rawRequest: {},
  };

  async function recordedMatchCount() {
    const snap = await db.collection('matches').where('createdBy', '==', 'leader').get();
    return snap.size;
  }

  it('records the match and notifies when everything works', async () => {
    await seedPlayers(['p1', 'p2']);
    const result = await functions.recordMatchOnBehalf.run(request);
    assert.equal(result.success, true);
    assert.equal(await recordedMatchCount(), 1);
    const mail = await db.collection('mail').get();
    assert.equal(mail.size, 2, 'both players are emailed');
  });

  it(
    'succeeds with one match when the push send fails',
    knownBug('a notification error is returned as a failure after the match is saved, so a retry records it twice'),
    async () => {
      await seedPlayers(['p1', 'p2'], { p1: { fcmTokens: ['token-1'] } });
      const original = Messaging.prototype.sendEachForMulticast;
      Messaging.prototype.sendEachForMulticast = async () => {
        throw new Error('FCM unavailable');
      };
      try {
        const result = await functions.recordMatchOnBehalf.run(request);
        assert.equal(result.success, true);
      } finally {
        Messaging.prototype.sendEachForMulticast = original;
      }
      assert.equal(await recordedMatchCount(), 1);
    },
  );

  it(
    'succeeds with one match when the email link cannot be built',
    knownBug('APP_BASE_URL missing in production throws after the match is saved'),
    async () => {
      await seedPlayers(['p1', 'p2']);
      const saved = { NODE_ENV: process.env.NODE_ENV, APP_BASE_URL: process.env.APP_BASE_URL };
      process.env.NODE_ENV = 'production';
      delete process.env.APP_BASE_URL;
      try {
        const result = await functions.recordMatchOnBehalf.run(request);
        assert.equal(result.success, true);
      } finally {
        for (const [key, value] of Object.entries(saved)) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
      }
      assert.equal(await recordedMatchCount(), 1);
    },
  );
});
