// Cloud Functions tests against the Firestore and Storage emulators. Run by
// `pnpm test:functions`, which builds lib/index.js first.
//
// These drive the built bundle's handlers directly through each function's
// `run()`, with the Admin SDK pointed at the emulators, so they exercise the
// same code that deploys. They cover the gaps the pre-release review listed:
// concurrent ranking recalculation, report PDFs for names outside Latin-1, and
// "record match on behalf" when sending notifications fails. They also cover the
// roster callables leaders use to assign, move, and remove players.
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

describe('season-scoped ranking recalculation', () => {
  const OTHER_SEASON = '2026-H1';

  async function seasonRankings(seasonId) {
    const snap = await db
      .collection('divisions')
      .doc(DIVISION)
      .collection('rankings')
      .where('seasonId', '==', seasonId)
      .get();
    return Object.fromEntries(snap.docs.map((d) => [d.data().userId, d.data()]));
  }

  async function setDivisionFields(fields) {
    await db.collection('divisions').doc(DIVISION).set(fields, { merge: true });
  }

  it('leaves other seasons alone when a confirmation is scoped to its season', async () => {
    await seedPlayers(['p1', 'p2', 'p3', 'p4']);
    await setDivisionFields({ activeSeasonId: SEASON, rankingsUnseasonedMatchCount: 0 });
    // A row no completed match supports. A whole-division pass would prune it;
    // a pass scoped to SEASON must not touch it.
    await db.collection('divisions').doc(DIVISION).collection('rankings').doc('stale-other').set({
      userId: 'p3',
      seasonId: OTHER_SEASON,
      matchesWon: 9,
    });
    await db.collection('users').doc('p3').set(
      { rankingSummary: { divisionId: DIVISION, seasonId: SEASON, rank: 1, matchesPlayed: 4 } },
      { merge: true },
    );
    const old = match('p3', 'p4', { seasonId: OTHER_SEASON });
    await db.collection('matches').doc('old').set(confirmed(old));

    const m1 = match('p1', 'p2');
    await db.collection('matches').doc('m1').set(confirmed(m1));
    await functions.onMatchUpdate.run(writeEvent('m1', m1, confirmed(m1)));

    const current = await seasonRankings(SEASON);
    assert.equal(current.p1?.matchesWon, 1);
    assert.equal(current.p2?.matchesLost, 1);
    const other = await seasonRankings(OTHER_SEASON);
    assert.equal(other.p3?.matchesWon, 9, 'the other season was not rewritten or pruned');
  });

  it('keeps the active-season summary when another season is recalculated', async () => {
    await seedPlayers(['p1', 'p2']);
    await setDivisionFields({ activeSeasonId: SEASON, rankingsUnseasonedMatchCount: 0 });
    const summary = { divisionId: DIVISION, seasonId: SEASON, rank: 1, matchesPlayed: 3 };
    await db.collection('users').doc('p1').set({ rankingSummary: summary }, { merge: true });

    const old = match('p1', 'p2', { seasonId: OTHER_SEASON });
    await db.collection('matches').doc('old').set(confirmed(old));
    await functions.onMatchUpdate.run(writeEvent('old', old, confirmed(old)));

    assert.equal((await seasonRankings(OTHER_SEASON)).p1?.matchesWon, 1);
    const user = (await db.collection('users').doc('p1').get()).data();
    assert.deepEqual(user.rankingSummary, summary, 'an other-season pass leaves the summary as it was');
  });

  it('recalculates the whole division while unseasoned matches may exist', async () => {
    await seedPlayers(['p1', 'p2', 'p3', 'p4']);
    // No rankingsUnseasonedMatchCount yet: the active season is not scoped.
    await setDivisionFields({ activeSeasonId: SEASON });
    const legacy = match('p3', 'p4');
    delete legacy.seasonId;
    await db.collection('matches').doc('legacy').set(confirmed(legacy));

    const m1 = match('p1', 'p2');
    await db.collection('matches').doc('m1').set(confirmed(m1));
    await functions.onMatchUpdate.run(writeEvent('m1', m1, confirmed(m1)));

    const current = await seasonRankings(SEASON);
    assert.equal(current.p1?.matchesWon, 1);
    assert.equal(current.p3?.matchesWon, 1, 'the unseasoned match still counts in the active season');
    const division = (await db.collection('divisions').doc(DIVISION).get()).data();
    assert.equal(division.rankingsUnseasonedMatchCount, 1);

    // With an unseasoned match on record, the next confirmation is also a
    // whole-division pass, so it cannot prune the legacy result's row.
    const m2 = match('p1', 'p2', { winner: 'player2' });
    await db.collection('matches').doc('m2').set(confirmed(m2));
    await functions.onMatchUpdate.run(writeEvent('m2', m2, confirmed(m2)));
    assert.equal((await seasonRankings(SEASON)).p3?.matchesWon, 1);
  });

  it('recalculates both seasons when a result moves between them', async () => {
    await seedPlayers(['p1', 'p2']);
    await setDivisionFields({ activeSeasonId: SEASON, rankingsUnseasonedMatchCount: 0 });
    const m1 = confirmed(match('p1', 'p2', { seasonId: OTHER_SEASON }));
    await db.collection('matches').doc('m1').set(m1);
    await functions.onMatchUpdate.run(writeEvent('m1', match('p1', 'p2', { seasonId: OTHER_SEASON }), m1));
    assert.equal((await seasonRankings(OTHER_SEASON)).p1?.matchesWon, 1);

    const moved = { ...m1, seasonId: SEASON };
    await db.collection('matches').doc('m1').set(moved);
    await functions.onMatchUpdate.run(writeEvent('m1', m1, moved));
    assert.equal((await seasonRankings(SEASON)).p1?.matchesWon, 1);
    assert.equal((await seasonRankings(OTHER_SEASON)).p1, undefined, 'the old season row is pruned');
  });
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

describe('division roster callables', () => {
  const leaderAuth = { uid: 'leader', token: { email: 'leader@example.com', email_verified: true } };
  const call = (fn, data, auth = leaderAuth) => functions[fn].run({ auth, data, rawRequest: {} });
  const membershipsCol = () => db.collection('divisions').doc(DIVISION).collection('memberships');
  const membershipId = (seasonId, levelId, userId) => `${seasonId}_${levelId}_${userId}`;

  async function seedRoster() {
    await seedPlayers(['p1', 'p2']);
    const batch = db.batch();
    for (const [seasonId, levelId] of [[SEASON, 'L1'], [SEASON, 'L2'], ['2027-H1', 'L3']]) {
      batch.set(db.collection('divisions').doc(DIVISION).collection('levels').doc(levelId), {
        id: levelId,
        divisionId: DIVISION,
        seasonId,
        name: levelId,
        matchType: 'singles',
      });
    }
    batch.set(db.collection('channels').doc('chat'), {
      type: 'division',
      divisionId: DIVISION,
      participantIds: ['leader', 'p1', 'p2'],
    });
    await batch.commit();
  }

  async function seedMembership(userId, levelId, status = 'active', seasonId = SEASON) {
    const id = membershipId(seasonId, levelId, userId);
    await membershipsCol().doc(id).set({
      id,
      divisionId: DIVISION,
      seasonId,
      divisionLevelId: levelId,
      userId,
      role: 'player',
      status,
      source: 'registered_user',
      assignedBy: 'leader',
    });
  }

  async function rosteredLevels(userId, seasonId = SEASON) {
    const snap = await membershipsCol()
      .where('userId', '==', userId)
      .where('seasonId', '==', seasonId)
      .where('status', 'in', ['active', 'waitlisted'])
      .get();
    return snap.docs.map((d) => d.data().divisionLevelId).sort();
  }

  const userDoc = async (uid) => (await db.collection('users').doc(uid).get()).data();
  const divisionDoc = async () => (await db.collection('divisions').doc(DIVISION).get()).data();
  const chatParticipants = async () => (await db.collection('channels').doc('chat').get()).data().participantIds;

  it('moves a player between levels without leaving two rostered memberships', async () => {
    await seedRoster();
    await seedMembership('p1', 'L1');
    await call('upsertDivisionMembership', { divisionId: DIVISION, seasonId: SEASON, divisionLevelId: 'L2', userId: 'p1' });
    assert.deepEqual(await rosteredLevels('p1'), ['L2']);
    const old = (await membershipsCol().doc(membershipId(SEASON, 'L1', 'p1')).get()).data();
    assert.equal(old.status, 'removed', 'the earlier membership is archived, not deleted');
  });

  it('archives a waitlisted membership when the player is moved', async () => {
    await seedRoster();
    await seedMembership('p1', 'L1', 'waitlisted');
    await call('upsertDivisionMembership', { divisionId: DIVISION, seasonId: SEASON, divisionLevelId: 'L2', userId: 'p1' });
    assert.deepEqual(await rosteredLevels('p1'), ['L2']);
    const old = (await membershipsCol().doc(membershipId(SEASON, 'L1', 'p1')).get()).data();
    assert.equal(old?.status, 'removed', 'the waitlisted membership is archived, not deleted');
  });

  it('rejects a level that belongs to another season', async () => {
    await seedRoster();
    await assert.rejects(
      call('upsertDivisionMembership', { divisionId: DIVISION, seasonId: SEASON, divisionLevelId: 'L3', userId: 'p1' }),
      { code: 'failed-precondition' },
    );
  });

  it('refuses callers who do not lead the division', async () => {
    await seedRoster();
    const p2Auth = { uid: 'p2', token: { email: 'p2@example.com', email_verified: true } };
    await assert.rejects(
      call('upsertDivisionMembership', { divisionId: DIVISION, seasonId: SEASON, divisionLevelId: 'L1', userId: 'p1' }, p2Auth),
      { code: 'permission-denied' },
    );
    await assert.rejects(
      call('removeDivisionMembership', { divisionId: DIVISION, seasonId: SEASON, userId: 'p1' }, p2Auth),
      { code: 'permission-denied' },
    );
    await assert.rejects(
      call('addPlayerToDivisionByEmail', { divisionId: DIVISION, email: 'p1@example.com' }, p2Auth),
      { code: 'permission-denied' },
    );
  });

  describe('a registered account that belongs to another division', () => {
    async function seedOutsider() {
      await seedRoster();
      await db.collection('users').doc('outsider').set({
        id: 'outsider',
        displayName: 'Outsider',
        email: 'outsider@example.com',
        phone: '555-0100',
        role: 'player',
        divisionId: 'divB',
        isRegistered: true,
        fcmTokens: ['outsider-token'],
      });
    }

    it('keeps its active division when added by email', async () => {
      await seedOutsider();
      await call('addPlayerToDivisionByEmail', { divisionId: DIVISION, email: 'Outsider@Example.com' });
      assert.equal((await userDoc('outsider')).divisionId, 'divB');
      assert.ok((await divisionDoc()).playerIds.includes('outsider'), 'it is still put on the roster');
    });

    it('keeps its division and contact details when given a membership', async () => {
      await seedOutsider();
      await call('upsertDivisionMembership', {
        divisionId: DIVISION,
        seasonId: SEASON,
        divisionLevelId: 'L1',
        userId: 'outsider',
        email: 'changed@example.com',
        phone: '555-0199',
      });
      const user = await userDoc('outsider');
      assert.equal(user.divisionId, 'divB');
      assert.equal(user.email, 'outsider@example.com');
      assert.equal(user.phone, '555-0100');
      assert.deepEqual(await rosteredLevels('outsider'), ['L1']);
    });
  });

  it('adopts the division for an account that has none', async () => {
    await seedRoster();
    await db.collection('users').doc('newcomer').set({
      id: 'newcomer',
      displayName: 'Newcomer',
      email: 'newcomer@example.com',
      role: 'player',
      divisionId: null,
    });
    await call('addPlayerToDivisionByEmail', { divisionId: DIVISION, email: 'newcomer@example.com' });
    assert.equal((await userDoc('newcomer')).divisionId, DIVISION);
  });

  describe('removeDivisionMembership', () => {
    it('archives a waitlisted membership and detaches the player', async () => {
      await seedRoster();
      await seedMembership('p1', 'L1', 'waitlisted');
      const result = await call('removeDivisionMembership', { divisionId: DIVISION, seasonId: SEASON, userId: 'p1' });
      assert.deepEqual(result, { removed: 1, detachedFromDivision: true });
      assert.deepEqual(await rosteredLevels('p1'), []);
      const membership = (await membershipsCol().doc(membershipId(SEASON, 'L1', 'p1')).get()).data();
      assert.equal(membership.status, 'removed');
      assert.equal(membership.assignedBy, 'leader', 'the audit trail keeps who assigned the player');
      assert.equal(membership.removedBy, 'leader');
      assert.ok(!(await divisionDoc()).playerIds.includes('p1'));
      assert.equal((await userDoc('p1')).divisionId, null);
      assert.ok(!(await chatParticipants()).includes('p1'), 'the player leaves the division chat');
    });

    it('keeps the player in the division while another season still rosters them', async () => {
      await seedRoster();
      await seedMembership('p1', 'L1');
      // Waitlisted, so the check for a remaining membership must count waitlisted ones.
      await seedMembership('p1', 'L3', 'waitlisted', '2027-H1');
      const result = await call('removeDivisionMembership', { divisionId: DIVISION, seasonId: SEASON, userId: 'p1' });
      assert.deepEqual(result, { removed: 1, detachedFromDivision: false });
      assert.ok((await divisionDoc()).playerIds.includes('p1'));
      assert.equal((await userDoc('p1')).divisionId, DIVISION);
      assert.ok((await chatParticipants()).includes('p1'), 'the player stays in the division chat');
    });

    it('removes only the named level when one is given', async () => {
      await seedRoster();
      // Written directly: every callable path would archive one of the two.
      await seedMembership('p1', 'L1');
      await seedMembership('p1', 'L2');
      const result = await call('removeDivisionMembership', {
        divisionId: DIVISION,
        seasonId: SEASON,
        userId: 'p1',
        divisionLevelId: 'L1',
      });
      assert.deepEqual(result, { removed: 1, detachedFromDivision: false });
      assert.deepEqual(await rosteredLevels('p1'), ['L2']);
    });

    it('reports nothing removed for a player already off the roster', async () => {
      await seedRoster();
      const result = await call('removeDivisionMembership', { divisionId: DIVISION, seasonId: SEASON, userId: 'p2' });
      assert.deepEqual(result, { removed: 0, detachedFromDivision: false });
      assert.ok((await divisionDoc()).playerIds.includes('p2'), 'a player never removed through this flow is left alone');
    });

    it('finishes a detach that an earlier call left undone', async () => {
      await seedRoster();
      await seedMembership('p1', 'L1', 'removed');
      const result = await call('removeDivisionMembership', { divisionId: DIVISION, seasonId: SEASON, userId: 'p1' });
      assert.deepEqual(result, { removed: 0, detachedFromDivision: false });
      assert.ok(!(await divisionDoc()).playerIds.includes('p1'));
      assert.equal((await userDoc('p1')).divisionId, null);
      assert.ok(!(await chatParticipants()).includes('p1'));
    });

    it('leaves the active division alone when it names another division', async () => {
      await seedRoster();
      await seedMembership('p1', 'L1');
      await db.collection('users').doc('p1').set({ divisionId: 'divB' }, { merge: true });
      const result = await call('removeDivisionMembership', { divisionId: DIVISION, seasonId: SEASON, userId: 'p1' });
      assert.equal(result.detachedFromDivision, true);
      assert.equal((await userDoc('p1')).divisionId, 'divB');
    });
  });
});

describe('report confirmation timeout', () => {
  const HOUR = 60 * 60 * 1000;
  const WINDOW = 48 * HOUR;
  const pendingWithDeadline = (deadline) =>
    match('p1', 'p2', {
      reportSubmission: {
        submittedBy: 'p1',
        submittedAt: 2,
        status: 'pending_confirmation',
        ...(deadline !== undefined && { confirmationDeadline: deadline }),
      },
    });
  const read = async (id) => (await db.collection('matches').doc(id).get()).data();
  const unsubmittedMatch = () => {
    const { reportSubmission, ...rest } = match('p1', 'p2');
    return rest;
  };
  const runJob = () => functions.autoConfirmExpiredReports.run({ scheduleTime: new Date().toISOString() });

  it('starts a 48-hour window from the server clock when a report is submitted', async () => {
    await seedPlayers(['p1', 'p2']);
    const unsubmitted = unsubmittedMatch();
    // A backdated submittedAt must not shorten the window.
    const submitted = match('p1', 'p2', {
      reportSubmission: { submittedBy: 'p1', submittedAt: 1, status: 'pending_confirmation' },
    });
    await db.collection('matches').doc('m1').set(submitted);
    const before = Date.now();
    await functions.onMatchUpdate.run(writeEvent('m1', unsubmitted, submitted));
    const deadline = (await read('m1')).reportSubmission.confirmationDeadline;
    assert.ok(deadline >= before + WINDOW, 'the deadline is 48 hours from now');
    assert.ok(deadline <= Date.now() + WINDOW);
  });

  it('confirms a report nobody answered within 48 hours, and it counts in the standings', async () => {
    await seedPlayers(['p1', 'p2']);
    const expired = pendingWithDeadline(Date.now() - 1);
    await db.collection('matches').doc('m1').set(expired);
    await runJob();

    const confirmedMatch = await read('m1');
    assert.equal(confirmedMatch.status, 'completed');
    assert.equal(confirmedMatch.reportSubmission.status, 'confirmed');
    assert.equal(confirmedMatch.reportSubmission.autoConfirmed, true);
    assert.equal(confirmedMatch.reportSubmission.confirmedBy, undefined, 'nobody is named as confirming it');

    await functions.onMatchUpdate.run(writeEvent('m1', expired, confirmedMatch));
    const rankings = await singlesRankings();
    assert.equal(rankings.p1?.matchesWon, 1);
    assert.equal(rankings.p2?.matchesLost, 1);
  });

  it('leaves a report alone while its window is open', async () => {
    await seedPlayers(['p1', 'p2']);
    await db.collection('matches').doc('m1').set(pendingWithDeadline(Date.now() + HOUR));
    await runJob();
    const stillPending = await read('m1');
    assert.equal(stillPending.status, 'pending_report');
    assert.equal(stillPending.reportSubmission.status, 'pending_confirmation');
  });

  it('gives a report without a deadline a full window instead of confirming it', async () => {
    await seedPlayers(['p1', 'p2']);
    await db.collection('matches').doc('m1').set(pendingWithDeadline(undefined));
    const before = Date.now();
    await runJob();
    const stamped = await read('m1');
    assert.equal(stamped.status, 'pending_report');
    assert.ok(stamped.reportSubmission.confirmationDeadline >= before + WINDOW);
  });

  it('never confirms a disputed report or one awaiting submission', async () => {
    await seedPlayers(['p1', 'p2']);
    await db.collection('matches').doc('disputed').set(
      match('p1', 'p2', {
        status: 'disputed',
        reportSubmission: {
          submittedBy: 'p1',
          submittedAt: 2,
          status: 'disputed',
          confirmationDeadline: Date.now() - 1,
          disputedBy: 'p2',
          disputedAt: 3,
        },
      }),
    );
    await db.collection('matches').doc('unsubmitted').set(unsubmittedMatch());
    await runJob();
    assert.equal((await read('disputed')).status, 'disputed');
    assert.equal((await read('unsubmitted')).status, 'pending_report');
  });
});

describe('result appeals', () => {
  const auth = (uid) => ({ uid, token: { email: `${uid}@example.com`, email_verified: true } });
  const call = (fn, uid, data) => functions[fn].run({ auth: auth(uid), data, rawRequest: {} });
  const read = async () => (await db.collection('matches').doc('m1').get()).data();

  async function seedConfirmed(overrides = {}) {
    await seedPlayers(['p1', 'p2', 'p3']);
    await db.collection('users').doc('admin').set({
      id: 'admin',
      displayName: 'admin',
      email: 'admin@example.com',
      role: 'admin',
      divisionId: 'elsewhere',
    });
    await db.collection('matches').doc('m1').set({ ...confirmed(match('p1', 'p2')), ...overrides });
  }

  const pendingAppeal = (extra = {}) => ({
    appeal: { requestedBy: 'p2', requestedAt: 1, reason: 'The second set was 4-6', status: 'pending', ...extra },
  });

  describe('requesting', () => {
    it('lets a player appeal a confirmed result once', async () => {
      await seedConfirmed();
      await call('requestMatchAppeal', 'p2', { matchId: 'm1', reason: ' Wrong score ', sets: [{ p1: 6, p2: 2 }, { p1: 4, p2: 6 }, { p1: 10, p2: 8, matchTiebreak: true }] });
      const { appeal, liveScore } = await read();
      assert.equal(appeal.status, 'pending');
      assert.equal(appeal.requestedBy, 'p2');
      assert.equal(appeal.reason, 'Wrong score');
      assert.equal(appeal.proposedSets.length, 3);
      assert.deepEqual(liveScore, finalScore, 'the result is unchanged until a reviewer approves');

      await assert.rejects(call('requestMatchAppeal', 'p1', { matchId: 'm1', reason: 'Me too' }), {
        code: 'already-exists',
      });
    });

    it('refuses anyone who did not play in the match', async () => {
      await seedConfirmed();
      await assert.rejects(call('requestMatchAppeal', 'p3', { matchId: 'm1', reason: 'x' }), {
        code: 'permission-denied',
      });
    });

    it('refuses a result that is not confirmed yet', async () => {
      await seedConfirmed({ status: 'pending_report' });
      await assert.rejects(call('requestMatchAppeal', 'p2', { matchId: 'm1', reason: 'x' }), {
        code: 'failed-precondition',
      });
    });

    it('refuses an appeal without a reason or with an impossible score', async () => {
      await seedConfirmed();
      await assert.rejects(call('requestMatchAppeal', 'p2', { matchId: 'm1', reason: '  ' }), {
        code: 'invalid-argument',
      });
      await assert.rejects(call('requestMatchAppeal', 'p2', { matchId: 'm1', reason: 'x', sets: [{ p1: 6, p2: 6 }] }), {
        code: 'invalid-argument',
      });
      assert.equal((await read()).appeal, undefined);
    });
  });

  describe('deciding (the admin gate)', () => {
    it('refuses a player who is neither a leader nor an admin', async () => {
      await seedConfirmed(pendingAppeal());
      await assert.rejects(call('decideMatchAppeal', 'p3', { matchId: 'm1', decision: 'approve', sets: [{ p1: 2, p2: 6 }, { p1: 2, p2: 6 }] }), {
        code: 'permission-denied',
      });
      await assert.rejects(call('decideMatchAppeal', 'p2', { matchId: 'm1', decision: 'approve' }), {
        code: 'permission-denied',
      });
      assert.equal((await read()).appeal.status, 'pending');
    });

    it('refuses a leader who played in the match', async () => {
      await seedConfirmed({
        ...confirmed(match('leader', 'p2')),
        ...pendingAppeal(),
      });
      await assert.rejects(call('decideMatchAppeal', 'leader', { matchId: 'm1', decision: 'reject' }), {
        code: 'permission-denied',
      });
      assert.equal((await read()).appeal.status, 'pending');
    });

    it('lets the division leader approve with the proposed score', async () => {
      const proposedSets = [{ p1: 2, p2: 6 }, { p1: 3, p2: 6 }];
      await seedConfirmed({ ...pendingAppeal({ proposedSets }), reportUrl: 'https://example.com/old.pdf' });
      await call('decideMatchAppeal', 'leader', { matchId: 'm1', decision: 'approve', note: 'Checked with both players' });
      const decided = await read();
      assert.equal(decided.status, 'completed');
      assert.equal(decided.winner, 'player2');
      assert.equal(decided.liveScore.player2SetsWon, 2);
      assert.equal(decided.appeal.status, 'approved');
      assert.equal(decided.appeal.decidedBy, 'leader');
      assert.equal(decided.appeal.decisionNote, 'Checked with both players');
      assert.deepEqual(decided.appeal.appliedSets, proposedSets);
      assert.equal(decided.reportUrl, undefined, 'the old PDF is dropped so a new one is built');
    });

    it('lets an admin from outside the division approve with their own score', async () => {
      await seedConfirmed(pendingAppeal({ proposedSets: [{ p1: 2, p2: 6 }, { p1: 3, p2: 6 }] }));
      await call('decideMatchAppeal', 'admin', { matchId: 'm1', decision: 'approve', sets: [{ p1: 6, p2: 2 }, { p1: 4, p2: 6 }, { p1: 6, p2: 4 }] });
      const decided = await read();
      assert.equal(decided.winner, 'player1');
      assert.equal(decided.liveScore.sets.length, 3);
      assert.equal(decided.appeal.status, 'approved');
    });

    it('requires a score to approve when the player proposed none', async () => {
      await seedConfirmed(pendingAppeal());
      await assert.rejects(call('decideMatchAppeal', 'leader', { matchId: 'm1', decision: 'approve' }), {
        code: 'invalid-argument',
      });
      assert.equal((await read()).appeal.status, 'pending');
    });

    it('leaves the result as it was when the appeal is rejected, and closes the appeal', async () => {
      await seedConfirmed(pendingAppeal({ proposedSets: [{ p1: 2, p2: 6 }, { p1: 3, p2: 6 }] }));
      await call('decideMatchAppeal', 'leader', { matchId: 'm1', decision: 'reject' });
      const decided = await read();
      assert.equal(decided.appeal.status, 'rejected');
      assert.equal(decided.winner, 'player1');
      assert.deepEqual(decided.liveScore, finalScore);

      await assert.rejects(call('decideMatchAppeal', 'leader', { matchId: 'm1', decision: 'approve' }), {
        code: 'failed-precondition',
      });
      await assert.rejects(call('requestMatchAppeal', 'p2', { matchId: 'm1', reason: 'Again' }), {
        code: 'already-exists',
      });
    });
  });
});
