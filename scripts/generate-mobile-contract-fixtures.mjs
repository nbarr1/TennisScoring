#!/usr/bin/env node
// Regenerates fixtures/mobile-contract/engine-parity.json from the built
// @tennis/shared package.
//
// The fixture records what the TypeScript engines actually return for a set of
// deterministic inputs: full matches played point by point, ranking tables,
// match-side queries, and doubles ids. Two suites replay it:
//
//   - packages/shared/src/scoring/__tests__/mobileContractFixture.test.ts, which
//     fails when the TypeScript engines change and the fixture was not
//     regenerated, and
//   - apps/mobile/ios/TennisKit/Tests/TennisCoreTests/ParityFixtureTests.swift,
//     which fails when the Swift port no longer matches.
//
// Run `pnpm fixtures:mobile-contract` after any intentional engine change, then
// port the change to Swift until both suites pass.
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const shared = await import(resolve(root, 'packages/shared/dist/index.mjs'));
const {
  applyPoint,
  createInitialScore,
  formatScoreDisplay,
  formatGameScore,
  computeRankings,
  computeDoublesRankings,
  extractMatchTotals,
  sidePlayerIds,
  sideDisplayName,
  sideOfPlayer,
  isDoublesMatch,
  isMatchParticipant,
  arePartners,
  canRespondToReport,
  doublesTeamId,
  doublesTeamPlayerIds,
  doublesHeadToHeadId,
  formatDoublesTeamName,
  getTipsForTriggers,
} = shared;

/** Small deterministic PRNG, so regenerating never churns the fixture. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STANDARD = { setsToWin: 2, gamesPerSet: 6, tiebreakAt: 6, finalSetTiebreak: true };

// Each strategy picks who wins the next point.
const strategies = {
  // player1 wins each point with probability `bias`.
  random: (rng, bias) => () => (rng() < bias ? 'player1' : 'player2'),
  // The server holds every game, which forces every set to a tiebreak (or, in an
  // advantage set, to a long deuce set). Inside tiebreaks, and once both players
  // pass the tiebreak threshold, points go random so the match can finish.
  holdServe: (rng, bias, format) => (score) => {
    const set = score.sets[score.currentSet];
    const pastThreshold =
      set.player1Games >= format.tiebreakAt && set.player2Games >= format.tiebreakAt;
    if (score.isTiebreak || pastThreshold) return rng() < bias ? 'player1' : 'player2';
    return score.server;
  },
};

const scenarios = [
  { name: 'best-of-3, even', format: STANDARD, strategy: 'random', seed: 7, bias: 0.5 },
  { name: 'best-of-3, lopsided', format: STANDARD, strategy: 'random', seed: 11, bias: 0.68 },
  { name: 'best-of-3, every set to a tiebreak', format: STANDARD, strategy: 'holdServe', seed: 3, bias: 0.5 },
  {
    name: 'best-of-3, deciding set without a tiebreak',
    format: { ...STANDARD, finalSetTiebreak: false },
    strategy: 'holdServe',
    seed: 19,
    bias: 0.5,
  },
  {
    name: 'best-of-5, even',
    format: { setsToWin: 3, gamesPerSet: 6, tiebreakAt: 6, finalSetTiebreak: true },
    strategy: 'random',
    seed: 23,
    bias: 0.52,
  },
  {
    name: 'eight-game pro set',
    format: { setsToWin: 1, gamesPerSet: 8, tiebreakAt: 8, finalSetTiebreak: true },
    strategy: 'holdServe',
    seed: 29,
    bias: 0.45,
  },
];

function playScenario({ name, format, strategy, seed, bias }) {
  const rng = mulberry32(seed);
  const pick = strategies[strategy](rng, bias, format);
  let score = createInitialScore(format);
  const initialScore = score;
  const points = [];

  for (let i = 0; i < 2000; i++) {
    const scorer = pick(score);
    const result = applyPoint(score, scorer, format);
    const next = result.nextScore;
    const step = {
      scorer,
      tips: result.tips,
      server: next.server,
      serviceSide: next.serviceSide,
      sets: formatScoreDisplay(next),
      game: formatGameScore(next),
    };
    if (result.matchWinner) step.matchWinner = result.matchWinner;
    if (result.setCompleted) step.setCompleted = result.setCompleted;
    if (result.gameCompleted) step.gameCompleted = result.gameCompleted;
    // Full snapshots at every game boundary keep the file small while still
    // pinning the whole LiveScore shape, including tiebreak bookkeeping.
    const gameBoundary =
      result.gameCompleted ||
      result.setCompleted ||
      result.matchWinner ||
      result.tips.includes('tiebreak_start');
    if (gameBoundary) step.score = next;
    points.push(step);
    score = next;
    if (result.matchWinner) break;
  }

  if (!points.at(-1)?.matchWinner) {
    throw new Error(`Scenario "${name}" did not finish; adjust its seed or bias.`);
  }
  return { name, format, initialScore, points };
}

const rankingInput = (userId, displayName, t) => ({
  userId,
  displayName,
  divisionId: 'd1',
  season: 'fall-2026',
  matchesWon: t[0],
  matchesLost: t[1],
  setsWon: t[2],
  setsLost: t[3],
  gamesWon: t[4],
  gamesLost: t[5],
});

function rankingCases() {
  // Every tiebreak layer is exercised: matches, sets, games, differential,
  // head-to-head, then display name (including case-only differences).
  const inputs = [
    rankingInput('u1', 'Cara', [3, 1, 6, 3, 40, 30]),
    rankingInput('u2', 'ann', [3, 1, 6, 3, 40, 30]),
    rankingInput('u3', 'Bob', [3, 1, 6, 3, 40, 30]),
    rankingInput('u4', 'Dan', [3, 1, 7, 3, 38, 30]),
    rankingInput('u5', 'Eve', [4, 0, 8, 1, 50, 20]),
    rankingInput('u6', 'Finn', [3, 1, 6, 3, 41, 35]),
    rankingInput('u7', 'Gus', [3, 1, 6, 3, 41, 33]),
    rankingInput('u8', 'Hal', [2, 2, 5, 4, 30, 30]),
    rankingInput('u9', 'Ida', [2, 2, 5, 4, 30, 30]),
    rankingInput('u10', 'Hal', [0, 4, 0, 8, 10, 48]),
  ];
  const headToHeads = [
    { id: 'h1', divisionId: 'd1', player1Id: 'u8', player2Id: 'u9', player1Wins: 0, player2Wins: 1 },
    { id: 'h2', divisionId: 'd1', player1Id: 'u1', player2Id: 'u3', player1Wins: 1, player2Wins: 1 },
  ];
  const singles = computeRankings(inputs.map((i) => ({ ...i })), headToHeads).map((r) => ({
    userId: r.userId,
    rank: r.rank,
    matchesPlayed: r.matchesPlayed,
    gameDifferential: r.gameDifferential,
  }));

  const team = (ids, name, t) => ({
    teamId: doublesTeamId(ids),
    playerIds: ids,
    displayName: name,
    divisionId: 'd1',
    season: 'fall-2026',
    matchesWon: t[0],
    matchesLost: t[1],
    setsWon: t[2],
    setsLost: t[3],
    gamesWon: t[4],
    gamesLost: t[5],
  });
  const teams = [
    team(['a', 'b'], 'Ann / Bob', [2, 0, 4, 0, 24, 6]),
    team(['c', 'd'], 'Cara / Dan', [2, 0, 4, 0, 24, 6]),
    team(['e', 'f'], 'Eve / Finn', [1, 1, 2, 2, 20, 20]),
  ];
  const teamH2h = [
    {
      id: 'x',
      divisionId: 'd1',
      player1Id: teams[0].teamId,
      player2Id: teams[1].teamId,
      player1Wins: 0,
      player2Wins: 1,
      matchType: 'doubles',
    },
  ];
  const doubles = computeDoublesRankings(teams.map((t) => ({ ...t })), teamH2h).map((r) => ({
    teamId: r.teamId,
    rank: r.rank,
  }));

  const setTotals = [
    [],
    [{ player1Games: 6, player2Games: 4 }, { player1Games: 3, player2Games: 6 }, { player1Games: 7, player2Games: 6 }],
    [{ player1Games: 6, player2Games: 5 }],
    [{ player1Games: 4, player2Games: 6, winner: 'player2' }, { player1Games: 2, player2Games: 2 }],
    [{ player1Games: 7, player2Games: 5 }, { player1Games: 5, player2Games: 7 }, { player1Games: 10, player2Games: 8 }],
    [{ player1Games: 8, player2Games: 6 }, { player1Games: 7, player2Games: 7 }],
  ].map((sets) => ({ sets, totals: extractMatchTotals(sets) }));

  return {
    singles: { inputs, headToHeads, expected: singles },
    doubles: { inputs: teams, headToHeads: teamH2h, expected: doubles },
    matchTotals: setTotals,
  };
}

function matchSideCases() {
  const base = {
    divisionId: 'd1',
    status: 'pending_report',
    createdBy: 'u1',
    createdAt: 1700000000000,
    format: STANDARD,
    liveScore: createInitialScore(STANDARD),
    tipsEnabled: true,
  };
  const matches = {
    singles: { ...base, id: 's1', player1Id: 'u1', player2Id: 'u2', player1Name: 'Ann', player2Name: 'Bob', playerIds: ['u1', 'u2'] },
    legacySingles: { ...base, id: 's2', player1Id: 'u1', player2Id: 'u2' },
    doubles: {
      ...base,
      id: 'd1',
      matchType: 'doubles',
      side1: { playerIds: ['u1', 'u2'], displayName: 'Ann / Bob' },
      side2: { playerIds: ['u3', 'u4'], displayName: 'Cara / Dan' },
      player1Id: 'u1',
      player2Id: 'u3',
      player1Name: 'Ann / Bob',
      player2Name: 'Cara / Dan',
      playerIds: ['u1', 'u2', 'u3', 'u4'],
    },
    // A two-player match in a doubles level: labelled doubles, shaped singles.
    doublesLabelledSingles: { ...base, id: 'd2', matchType: 'doubles', player1Id: 'u1', player2Id: 'u2', playerIds: ['u1', 'u2'] },
    // Side rosters with blank ids fall back to the flat fields.
    blankSides: {
      ...base,
      id: 'd3',
      side1: { playerIds: ['', '  '] },
      side2: { playerIds: [] },
      player1Id: 'u1',
      player2Id: 'u2',
      player1Name: '  ',
    },
  };
  const users = ['u1', 'u2', 'u3', 'u4', 'u5', ''];
  const cases = Object.entries(matches).map(([key, match]) => ({
    key,
    match,
    isDoubles: isDoublesMatch(match),
    side1PlayerIds: sidePlayerIds(match, 'player1'),
    side2PlayerIds: sidePlayerIds(match, 'player2'),
    side1Name: sideDisplayName(match, 'player1'),
    side2Name: sideDisplayName(match, 'player2'),
    users: users.map((userId) => ({
      userId,
      side: sideOfPlayer(match, userId) ?? null,
      participant: isMatchParticipant(match, userId),
      partnerOfU1: arePartners(match, userId, 'u1'),
      canRespondToU1: canRespondToReport(match, userId, 'u1'),
      canRespondToU3: canRespondToReport(match, userId, 'u3'),
      canRespondToU9: canRespondToReport(match, userId, 'u9'),
    })),
  }));
  return cases;
}

function doublesIdCases() {
  const rosters = [
    ['b', 'a'],
    ['a', 'b'],
    ['  a ', 'b', 'a'],
    ['user:1', 'user2'],
    ['12:ab', '3'],
    ['Zed', 'alpha'],
    // Precomposed and decomposed é are different strings to JavaScript.
    ['café', 'café'],
    // An astral character sorts by UTF-16 code unit and counts as two units.
    ['\u{1F3BE}x', '�y'],
    [],
    ['', '   '],
  ];
  return {
    teamIds: rosters.map((playerIds) => {
      const teamId = doublesTeamId(playerIds);
      return { playerIds, teamId, decoded: doublesTeamPlayerIds(teamId) };
    }),
    malformedTeamIds: ['3:ab', 'x:ab', '2:ab1', '', '1:a1:b'].map((teamId) => ({
      teamId,
      decoded: doublesTeamPlayerIds(teamId),
    })),
    headToHeadIds: [
      { a: doublesTeamId(['a', 'b']), b: doublesTeamId(['c', 'd']) },
      { a: doublesTeamId(['c', 'd']), b: doublesTeamId(['a', 'b']), seasonId: 'fall-2026' },
      { a: 't2', b: 't1', seasonId: ' fall-2026 ', divisionLevelId: 'lvl', divisionId: 'd1' },
      { a: 't1', b: 't2', seasonId: '  ', divisionLevelId: '', divisionId: 'd1' },
    ].map((c) => ({
      ...c,
      id: doublesHeadToHeadId(c.a, c.b, c.seasonId, c.divisionLevelId, c.divisionId),
    })),
    teamNames: [
      [['Ann Smith', 'Bob Jones'], formatDoublesTeamName(['Ann Smith', 'Bob Jones'])],
      [[' Ann ', '', 'Bob'], formatDoublesTeamName([' Ann ', '', 'Bob'])],
    ],
  };
}

function tipCases() {
  const sets = [
    ['service_change', 'game_point'],
    ['deuce', 'set_point'],
    ['service_change', 'tiebreak_start'],
    ['service_change', 'new_set', 'match_complete'],
    ['advantage', 'match_point'],
    [],
  ];
  return sets.map((triggers) => ({
    triggers,
    primary: getTipsForTriggers(triggers)[0]?.trigger ?? null,
  }));
}

const fixture = {
  schemaVersion: 1,
  generatedBy: 'scripts/generate-mobile-contract-fixtures.mjs',
  scoring: scenarios.map(playScenario),
  ranking: rankingCases(),
  matchSides: matchSideCases(),
  doublesIds: doublesIdCases(),
  tips: tipCases(),
};

// One point per line keeps diffs reviewable without inflating the file.
const rawSteps = [];
const printable = {
  ...fixture,
  scoring: fixture.scoring.map((scenario) => ({
    ...scenario,
    points: scenario.points.map((step) => `@@step${rawSteps.push(JSON.stringify(step)) - 1}@@`),
  })),
};
const json = JSON.stringify(printable, null, 1).replace(
  /"@@step(\d+)@@"/g,
  (_, index) => rawSteps[Number(index)],
);
const out = resolve(root, 'fixtures/mobile-contract/engine-parity.json');
writeFileSync(out, `${json}\n`);
const pointCount = fixture.scoring.reduce((n, s) => n + s.points.length, 0);
console.log(`Wrote ${out} (${fixture.scoring.length} matches, ${pointCount} points).`);
