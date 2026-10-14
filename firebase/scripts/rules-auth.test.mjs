// Authenticated Firestore rules tests. Run inside the emulator by `pnpm test:rules`.
//
// rules-smoke.mjs only proves that signed-out requests are denied. These cases cover
// what a signed-in participant may and may not do to a match, which is where the
// rules have to stop one player from settling a result without the other.
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, describe, it } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  addDoc,
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');

const DIVISION = 'divA';

// Marks a test that reproduces a bug the pre-release review found and that is
// not fixed yet. node:test still runs a `todo` test and prints its result, but
// a failure does not fail the run. Once the fix lands the test passes: delete
// the marker then, so a regression fails CI again.
const knownBug = (finding) => ({ todo: `known bug: ${finding}` });

const set = (setNumber, player1Games, player2Games) => ({
  setNumber,
  player1Games,
  player2Games,
  ...(player1Games !== player2Games && Math.max(player1Games, player2Games) >= 6
    ? { winner: player1Games > player2Games ? 'player1' : 'player2' }
    : {}),
});

const score = (sets, setsWon = [0, 0]) => ({
  sets,
  currentSet: sets.length - 1,
  currentGame: { player1: '0', player2: '0' },
  isTiebreak: false,
  server: 'player1',
  serviceSide: 'deuce',
  player1SetsWon: setsWon[0],
  player2SetsWon: setsWon[1],
});

const blankScore = score([set(0, 0, 0)]);
const midScore = score([set(0, 3, 2)]);
const finalScore = score([set(0, 6, 0), set(1, 6, 0)], [2, 0]);
const stats = { player1: { aces: 0 }, player2: { aces: 0 } };
const laterStats = { player1: { aces: 1 }, player2: { aces: 0 } };

function baseMatch(overrides = {}) {
  return {
    divisionId: DIVISION,
    player1Id: 'p1',
    player2Id: 'p2',
    player1Name: 'Player One',
    player2Name: 'Player Two',
    player2IsGuest: false,
    playerIds: ['p1', 'p2'],
    format: { setsToWin: 2, gamesPerSet: 6, tiebreakAt: 6, finalSetTiebreak: true },
    status: 'scheduled',
    liveScore: blankScore,
    stats,
    advancedStatsEnabled: false,
    tipsEnabled: true,
    source: 'live',
    isDivisionMatch: true,
    createdBy: 'p1',
    createdAt: 1,
    ...overrides,
  };
}

let env;

async function seed(fn) {
  await env.withSecurityRulesDisabled(async (context) => fn(context.firestore()));
}

const as = (uid) =>
  env.authenticatedContext(uid, { email: `${uid}@example.com`, email_verified: true }).firestore();
const asUnverified = (uid) =>
  env.authenticatedContext(uid, { email: `${uid}@example.com`, email_verified: false }).firestore();

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-tennis-rules-auth',
    firestore: { rules, host, port: Number(port) },
  });
});

after(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await seed(async (db) => {
    await setDoc(doc(db, 'divisions', DIVISION), {
      name: 'A',
      inviteCode: 'ABCDEFGH',
      leaderIds: ['leader'],
      playerIds: ['p1', 'p2', 'leader'],
    });
    const users = [
      ['p1', 'player', DIVISION],
      ['p2', 'player', DIVISION],
      ['leader', 'division_leader', DIVISION],
      ['outsider', 'player', 'divB'],
      ['loner1', 'player', null],
      ['loner2', 'player', null],
    ];
    for (const [id, role, divisionId] of users) {
      await setDoc(doc(db, 'users', id), { id, displayName: id, role, divisionId });
      await setDoc(doc(db, 'profiles', id), { id, displayName: id, role, divisionId });
    }
  });
});

describe('match create', () => {
  it('allows a participant to schedule a match', async () => {
    await assertSucceeds(addDoc(collection(as('p1'), 'matches'), baseMatch()));
  });

  for (const [field, value] of [
    ['undoSnapshot', { liveScore: finalScore, status: 'completed', stats }],
    ['reportSubmission', { submittedBy: 'p2', submittedAt: 1, status: 'pending_confirmation' }],
    ['reportUrl', 'https://example.com/report.pdf'],
    ['winner', 'player1'],
    ['completedAt', 1],
  ]) {
    it(`denies a new match that carries ${field}`, async () => {
      await assertFails(addDoc(collection(as('p1'), 'matches'), baseMatch({ [field]: value })));
    });
  }

  it('allows a guest match only against the guest placeholder id', async () => {
    const guest = { player2IsGuest: true, playerIds: ['p1'], player2Name: 'Guest' };
    await assertSucceeds(
      addDoc(collection(as('p1'), 'matches'), baseMatch({ ...guest, player2Id: 'guest' })),
    );
    await assertFails(
      addDoc(collection(as('p1'), 'matches'), baseMatch({ ...guest, player2Id: 'p2' })),
    );
  });
});

describe('undo', () => {
  const serverSnapshot = { liveScore: blankScore, status: 'in_progress', stats };

  async function seedLive(id, overrides = {}) {
    await seed((db) =>
      setDoc(
        doc(db, 'matches', id),
        baseMatch({ status: 'in_progress', liveScore: midScore, stats: laterStats, undoSnapshot: serverSnapshot, ...overrides }),
      ),
    );
  }

  it('restores the server snapshot and consumes it', async () => {
    await seedLive('m');
    await assertSucceeds(
      updateDoc(doc(as('p2'), 'matches', 'm'), {
        liveScore: blankScore,
        status: 'in_progress',
        stats,
        undoSnapshot: deleteField(),
      }),
    );
  });

  it('denies an undo that plants a new snapshot', async () => {
    await seedLive('m');
    await assertFails(
      updateDoc(doc(as('p1'), 'matches', 'm'), {
        liveScore: blankScore,
        status: 'in_progress',
        stats,
        undoSnapshot: { liveScore: finalScore, status: 'completed', stats },
      }),
    );
  });

  it('denies landing on a snapshot that reads completed', async () => {
    await seedLive('m', { undoSnapshot: { liveScore: finalScore, status: 'completed', stats } });
    await assertFails(
      updateDoc(doc(as('p1'), 'matches', 'm'), {
        liveScore: finalScore,
        status: 'completed',
        stats,
        winner: 'player1',
        undoSnapshot: deleteField(),
      }),
    );
  });

  it('denies an undo that changes the winner', async () => {
    await seedLive('m');
    await assertFails(
      updateDoc(doc(as('p1'), 'matches', 'm'), {
        liveScore: blankScore,
        status: 'in_progress',
        stats,
        winner: 'player1',
        undoSnapshot: deleteField(),
      }),
    );
  });

  it('denies an undo on a completed match', async () => {
    await seedLive('m', { status: 'completed', winner: 'player1', liveScore: finalScore });
    await assertFails(
      updateDoc(doc(as('p2'), 'matches', 'm'), {
        liveScore: blankScore,
        status: 'in_progress',
        stats,
        winner: deleteField(),
        undoSnapshot: deleteField(),
      }),
    );
  });

  it('requires a pending report to be cleared with the undo', async () => {
    const submitted = {
      status: 'pending_report',
      winner: 'player1',
      completedAt: 5,
      liveScore: finalScore,
      reportSubmission: { submittedBy: 'p1', submittedAt: 6, status: 'pending_confirmation' },
    };
    const restore = {
      liveScore: blankScore,
      status: 'in_progress',
      stats,
      winner: deleteField(),
      completedAt: deleteField(),
      undoSnapshot: deleteField(),
    };
    await seedLive('keep', submitted);
    await assertFails(updateDoc(doc(as('p1'), 'matches', 'keep'), restore));
    await seedLive('clear', submitted);
    await assertSucceeds(
      updateDoc(doc(as('p1'), 'matches', 'clear'), { ...restore, reportSubmission: deleteField() }),
    );
  });

  it('denies a non-participant', async () => {
    await seedLive('m');
    await assertFails(
      updateDoc(doc(as('outsider'), 'matches', 'm'), {
        liveScore: blankScore,
        status: 'in_progress',
        stats,
        undoSnapshot: deleteField(),
      }),
    );
  });
});

describe('report confirmation', () => {
  beforeEach(async () => {
    await seed((db) =>
      setDoc(
        doc(db, 'matches', 'm'),
        baseMatch({
          status: 'pending_report',
          winner: 'player1',
          liveScore: finalScore,
          reportSubmission: { submittedBy: 'p1', submittedAt: 6, status: 'pending_confirmation' },
        }),
      ),
    );
  });

  const confirm = (uid) => ({
    status: 'completed',
    'reportSubmission.status': 'confirmed',
    'reportSubmission.confirmedBy': uid,
    'reportSubmission.confirmedAt': 7,
  });

  it('lets the opponent confirm', async () => {
    await assertSucceeds(updateDoc(doc(as('p2'), 'matches', 'm'), confirm('p2')));
  });

  it('denies the submitter confirming their own report', async () => {
    await assertFails(updateDoc(doc(as('p1'), 'matches', 'm'), confirm('p1')));
  });
});

describe('linking a guest opponent', () => {
  const guestMatch = (status) =>
    baseMatch({
      player2Id: 'guest',
      player2Name: 'Guest',
      player2IsGuest: true,
      playerIds: ['p1'],
      status,
      winner: 'player1',
      liveScore: finalScore,
      reportUrl: 'https://example.com/guest-report.pdf',
      reportSubmission: { submittedBy: 'p1', submittedAt: 1, status: 'confirmed', confirmedBy: 'p1', confirmedAt: 1 },
    });
  const link = { player2Id: 'p2', player2Name: 'Player Two', player2IsGuest: false, playerIds: ['p1', 'p2'] };

  it('denies re-attributing a completed guest result without reopening it', async () => {
    await seed((db) => setDoc(doc(db, 'matches', 'm'), guestMatch('completed')));
    await assertFails(updateDoc(doc(as('p1'), 'matches', 'm'), link));
  });

  it('reopens a completed guest result for the linked opponent to confirm', async () => {
    await seed((db) => setDoc(doc(db, 'matches', 'm'), guestMatch('completed')));
    await assertSucceeds(
      updateDoc(doc(as('p1'), 'matches', 'm'), {
        ...link,
        status: 'pending_report',
        reportSubmission: { submittedBy: 'p1', submittedAt: 9, status: 'pending_confirmation' },
        reportUrl: deleteField(),
      }),
    );
    await assertFails(
      updateDoc(doc(as('p1'), 'matches', 'm'), {
        status: 'completed',
        'reportSubmission.status': 'confirmed',
        'reportSubmission.confirmedBy': 'p1',
        'reportSubmission.confirmedAt': 10,
      }),
    );
    await assertSucceeds(
      updateDoc(doc(as('p2'), 'matches', 'm'), {
        status: 'completed',
        'reportSubmission.status': 'confirmed',
        'reportSubmission.confirmedBy': 'p2',
        'reportSubmission.confirmedAt': 10,
      }),
    );
  });

  it('links an unfinished guest match without changing its status', async () => {
    await seed((db) => setDoc(doc(db, 'matches', 'm'), guestMatch('in_progress')));
    await assertSucceeds(updateDoc(doc(as('p1'), 'matches', 'm'), link));
  });
});

describe('other match updates', () => {
  it('lets a participant toggle tips but not an outsider', async () => {
    await seed((db) => setDoc(doc(db, 'matches', 'm'), baseMatch({ status: 'in_progress' })));
    await assertSucceeds(updateDoc(doc(as('p2'), 'matches', 'm'), { tipsEnabled: false }));
    await assertFails(updateDoc(doc(as('outsider'), 'matches', 'm'), { tipsEnabled: true }));
  });

  it('requires a score edit to clear the old report link', async () => {
    const reported = baseMatch({
      status: 'pending_report',
      winner: 'player1',
      liveScore: finalScore,
      reportUrl: 'https://example.com/report.pdf',
    });
    const edit = {
      liveScore: score([set(0, 6, 4), set(1, 6, 4)], [2, 0]),
      winner: 'player1',
      status: 'pending_report',
      completedAt: deleteField(),
    };
    await seed((db) => setDoc(doc(db, 'matches', 'keep'), reported));
    await assertFails(updateDoc(doc(as('p2'), 'matches', 'keep'), edit));
    await seed((db) => setDoc(doc(db, 'matches', 'clear'), reported));
    await assertSucceeds(
      updateDoc(doc(as('p2'), 'matches', 'clear'), { ...edit, reportUrl: deleteField() }),
    );
    await seed((db) =>
      setDoc(doc(db, 'matches', 'confirmed'), { ...reported, status: 'completed' }),
    );
    await assertFails(
      updateDoc(doc(as('p2'), 'matches', 'confirmed'), { ...edit, reportUrl: deleteField() }),
    );
  });

  it('denies writes to the unused actions subcollection', async () => {
    await seed((db) => setDoc(doc(db, 'matches', 'm'), baseMatch()));
    await assertFails(
      addDoc(collection(as('p1'), 'matches', 'm', 'actions'), {
        type: 'point',
        createdBy: 'p1',
        createdAt: 1,
      }),
    );
  });
});

describe('accounts without a division', () => {
  it('can read a division-mate profile but not another division-less profile', async () => {
    await assertSucceeds(getDoc(doc(as('p1'), 'profiles', 'p2')));
    await assertFails(getDoc(doc(as('loner1'), 'profiles', 'loner2')));
    await assertFails(
      getDocs(query(collection(as('loner1'), 'profiles'), where('divisionId', '==', null))),
    );
  });

  it('cannot open a direct message with another division-less account', async () => {
    const dm = (a, b) => ({ type: 'direct', participantIds: [a, b], createdAt: 1 });
    await assertSucceeds(setDoc(doc(as('p1'), 'channels', 'ok'), dm('p1', 'p2')));
    await assertFails(setDoc(doc(as('loner1'), 'channels', 'no'), dm('loner1', 'loner2')));
  });
});

describe('accounts with an unverified email address', () => {
  it('can read and edit only their own users document', async () => {
    await assertSucceeds(getDoc(doc(asUnverified('p1'), 'users', 'p1')));
    await assertSucceeds(
      updateDoc(doc(asUnverified('p1'), 'users', 'p1'), { displayName: 'Pat', updatedAt: 2 }),
    );
    await assertFails(getDoc(doc(asUnverified('p1'), 'users', 'p2')));
  });

  it('cannot read division data, profiles, or matches', async () => {
    await seed((db) => setDoc(doc(db, 'matches', 'm1'), baseMatch()));
    await assertFails(getDoc(doc(asUnverified('p1'), 'divisions', DIVISION)));
    await assertFails(getDoc(doc(asUnverified('p1'), 'profiles', 'p2')));
    await assertFails(getDoc(doc(asUnverified('p1'), 'matches', 'm1')));
    await assertSucceeds(getDoc(doc(as('p1'), 'matches', 'm1')));
  });

  it('cannot open a direct message', async () => {
    await assertFails(
      setDoc(doc(asUnverified('p1'), 'channels', 'dm'), {
        type: 'direct',
        participantIds: ['p1', 'p2'],
        createdAt: 1,
      }),
    );
  });
});

describe('onboarding', () => {
  // Mirrors updateUserProfile(uid, { tutorialDone: true }), which the web and
  // mobile tutorials call on "Get Started" and "Skip".
  function finishTutorial(uid, value = true) {
    const db = as(uid);
    const batch = writeBatch(db);
    batch.update(doc(db, 'users', uid), { tutorialDone: value, updatedAt: 2 });
    batch.set(doc(db, 'profiles', uid), { id: uid, tutorialDone: value, updatedAt: 2 }, { merge: true });
    return batch.commit();
  }

  it(
    'lets a new player finish the tutorial',
    async () => {
      await assertSucceeds(finishTutorial('p1'));
    },
  );

  it('rejects a tutorialDone that is not a boolean', async () => {
    await assertFails(finishTutorial('p1', 'yes'));
  });
});

describe('editing a score', () => {
  const edit = {
    liveScore: score([set(0, 0, 6), set(1, 0, 6)], [0, 2]),
    winner: 'player2',
    status: 'pending_report',
    completedAt: deleteField(),
    reportSubmission: deleteField(),
  };

  const seedMatch = (status) =>
    seed((db) =>
      setDoc(
        doc(db, 'matches', 'm'),
        baseMatch({
          status,
          winner: 'player1',
          liveScore: finalScore,
          completedAt: 5,
          reportSubmission: {
            submittedBy: 'p1',
            submittedAt: 5,
            status: status === 'completed' ? 'confirmed' : 'pending_confirmation',
          },
        }),
      ),
    );

  it('lets a participant correct a report that is still awaiting confirmation', async () => {
    await seedMatch('pending_report');
    await assertSucceeds(updateDoc(doc(as('p1'), 'matches', 'm'), edit));
  });

  it(
    "denies a participant rewriting a confirmed result",
    async () => {
      await seedMatch('completed');
      await assertFails(updateDoc(doc(as('p2'), 'matches', 'm'), edit));
    },
  );

  it('lets a division leader correct a confirmed result', async () => {
    await seedMatch('completed');
    await assertSucceeds(updateDoc(doc(as('leader'), 'matches', 'm'), edit));
  });
});

describe('leader authority', () => {
  const completed = {
    status: 'completed',
    winner: 'player1',
    liveScore: finalScore,
    completedAt: 5,
  };

  it('stops a leader from moving a match into another division', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'divisions', 'divB'), {
        name: 'B',
        inviteCode: 'BCDEFGHJ',
        leaderIds: ['outsider'],
        playerIds: ['outsider'],
      });
      await setDoc(doc(db, 'matches', 'm'), baseMatch());
    });
    await assertFails(
      updateDoc(doc(as('leader'), 'matches', 'm'), { ...completed, divisionId: 'divB' }),
    );
  });

  it('stops a leader from re-attributing a match to another season, level, side, or player', async () => {
    await seed((db) => setDoc(doc(db, 'matches', 'm'), baseMatch({ seasonId: 's1' })));
    const leader = doc(as('leader'), 'matches', 'm');
    await assertFails(updateDoc(leader, { seasonId: 's2' }));
    await assertFails(updateDoc(leader, { divisionLevelId: 'lvl' }));
    await assertFails(updateDoc(leader, { side1: { playerIds: ['p1', 'p2'] } }));
    await assertFails(
      updateDoc(leader, { ...completed, player2Id: 'leader', playerIds: ['p1', 'leader'] }),
    );
    await assertSucceeds(updateDoc(leader, completed));
  });

  it('lets a leader rename their division but not change its leaders or roster', async () => {
    const division = doc(as('leader'), 'divisions', DIVISION);
    await assertSucceeds(updateDoc(division, { name: 'Renamed', updatedAt: 2 }));
    await assertFails(updateDoc(division, { leaderIds: ['leader', 'outsider'] }));
    await assertFails(updateDoc(division, { playerIds: ['p1', 'p2', 'leader', 'outsider'] }));
  });
});
