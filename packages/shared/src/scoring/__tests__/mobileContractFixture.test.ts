import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  applyPoint,
  createInitialScore,
  formatGameScore,
  formatScoreDisplay,
} from '../scoreEngine';
import { computeDoublesRankings, computeRankings, extractMatchTotals } from '../rankingEngine';
import {
  arePartners,
  canRespondToReport,
  isDoublesMatch,
  isMatchParticipant,
  sideDisplayName,
  sideOfPlayer,
  sidePlayerIds,
  type MatchSidesLike,
} from '../../match/matchSides';
import {
  doublesHeadToHeadId,
  doublesTeamId,
  doublesTeamPlayerIds,
  formatDoublesTeamName,
} from '../../doubles/doublesTeam';
import { getTipsForTriggers } from '../../tips/tips';
import type { LiveScore, MatchFormat_Config, Player } from '../../types/match';

/**
 * Replays fixtures/mobile-contract/engine-parity.json against the TypeScript
 * engines. The native iOS suite replays the same file against the Swift port, so
 * this test is what keeps the fixture truthful: when an engine change makes it
 * fail, run `pnpm fixtures:mobile-contract` and port the change to Swift.
 */
const fixturePath = resolve(__dirname, '../../../../../fixtures/mobile-contract/engine-parity.json');
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));

interface FixtureStep {
  scorer: Player;
  tips: string[];
  server: Player;
  serviceSide: string;
  sets: string;
  game: string;
  matchWinner?: Player;
  setCompleted?: { setIndex: number; winner: Player };
  gameCompleted?: { winner: Player };
  score?: LiveScore;
}

interface FixtureScenario {
  name: string;
  format: MatchFormat_Config;
  initialScore: LiveScore;
  points: FixtureStep[];
}

describe('mobile contract fixture', () => {
  describe.each((fixture.scoring as FixtureScenario[]).map((s) => [s.name, s] as const))(
    'scoring: %s',
    (_name, scenario) => {
      it('replays point by point', () => {
        let score = createInitialScore(scenario.format);
        expect(score).toEqual(scenario.initialScore);

        scenario.points.forEach((step, index) => {
          const result = applyPoint(score, step.scorer, scenario.format);
          const at = `point ${index + 1}`;
          expect([at, result.tips]).toEqual([at, step.tips]);
          expect([at, result.matchWinner]).toEqual([at, step.matchWinner]);
          expect([at, result.setCompleted]).toEqual([at, step.setCompleted]);
          expect([at, result.gameCompleted]).toEqual([at, step.gameCompleted]);
          expect([at, result.nextScore.server, result.nextScore.serviceSide]).toEqual([
            at,
            step.server,
            step.serviceSide,
          ]);
          expect([at, formatScoreDisplay(result.nextScore), formatGameScore(result.nextScore)]).toEqual([
            at,
            step.sets,
            step.game,
          ]);
          if (step.score) expect([at, result.nextScore]).toEqual([at, step.score]);
          score = result.nextScore;
        });
      });
    },
  );

  it('ranks singles players in the recorded order', () => {
    const { inputs, headToHeads, expected } = fixture.ranking.singles;
    const actual = computeRankings(inputs, headToHeads).map((r) => ({
      userId: r.userId,
      rank: r.rank,
      matchesPlayed: r.matchesPlayed,
      gameDifferential: r.gameDifferential,
    }));
    expect(actual).toEqual(expected);
  });

  it('ranks doubles teams in the recorded order', () => {
    const { inputs, headToHeads, expected } = fixture.ranking.doubles;
    const actual = computeDoublesRankings(inputs, headToHeads).map((r) => ({
      teamId: r.teamId,
      rank: r.rank,
    }));
    expect(actual).toEqual(expected);
  });

  it('extracts the recorded match totals', () => {
    for (const { sets, totals } of fixture.ranking.matchTotals) {
      expect(extractMatchTotals(sets)).toEqual(totals);
    }
  });

  it('answers the recorded match-side queries', () => {
    for (const c of fixture.matchSides) {
      const match = c.match as MatchSidesLike;
      expect([c.key, isDoublesMatch(match)]).toEqual([c.key, c.isDoubles]);
      expect([c.key, sidePlayerIds(match, 'player1'), sidePlayerIds(match, 'player2')]).toEqual([
        c.key,
        c.side1PlayerIds,
        c.side2PlayerIds,
      ]);
      expect([c.key, sideDisplayName(match, 'player1'), sideDisplayName(match, 'player2')]).toEqual([
        c.key,
        c.side1Name,
        c.side2Name,
      ]);
      for (const u of c.users) {
        const label = `${c.key}/${u.userId || '(empty)'}`;
        expect([
          label,
          sideOfPlayer(match, u.userId) ?? null,
          isMatchParticipant(match, u.userId),
          arePartners(match, u.userId, 'u1'),
          canRespondToReport(match, u.userId, 'u1'),
          canRespondToReport(match, u.userId, 'u3'),
          canRespondToReport(match, u.userId, 'u9'),
        ]).toEqual([
          label,
          u.side,
          u.participant,
          u.partnerOfU1,
          u.canRespondToU1,
          u.canRespondToU3,
          u.canRespondToU9,
        ]);
      }
    }
  });

  it('encodes and decodes the recorded doubles ids', () => {
    const { teamIds, malformedTeamIds, headToHeadIds, teamNames } = fixture.doublesIds;
    for (const c of teamIds) {
      expect(doublesTeamId(c.playerIds)).toBe(c.teamId);
      expect(doublesTeamPlayerIds(c.teamId)).toEqual(c.decoded);
    }
    for (const c of malformedTeamIds) {
      expect(doublesTeamPlayerIds(c.teamId)).toEqual(c.decoded);
    }
    for (const c of headToHeadIds) {
      expect(doublesHeadToHeadId(c.a, c.b, c.seasonId, c.divisionLevelId, c.divisionId)).toBe(c.id);
    }
    for (const [names, expected] of teamNames) {
      expect(formatDoublesTeamName(names)).toBe(expected);
    }
  });

  it('picks the recorded primary tip', () => {
    for (const c of fixture.tips) {
      expect(getTipsForTriggers(c.triggers)[0]?.trigger ?? null).toBe(c.primary);
    }
  });
});
