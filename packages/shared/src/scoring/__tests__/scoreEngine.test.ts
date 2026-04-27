import { applyPoint, createInitialScore, formatGameScore, formatScoreDisplay } from '../scoreEngine';
import { DEFAULT_FORMAT } from '../../types/match';

describe('scoreEngine', () => {
  describe('basic game progression', () => {
    it('advances from 0 to 15', () => {
      const score = createInitialScore(DEFAULT_FORMAT);
      const result = applyPoint(score, 'player1', DEFAULT_FORMAT);
      expect(result.nextScore.currentGame.player1).toBe('15');
      expect(result.nextScore.currentGame.player2).toBe('0');
    });

    it('advances from 15 to 30 to 40', () => {
      let score = createInitialScore(DEFAULT_FORMAT);
      score = applyPoint(score, 'player1', DEFAULT_FORMAT).nextScore;
      score = applyPoint(score, 'player1', DEFAULT_FORMAT).nextScore;
      expect(score.currentGame.player1).toBe('30');
      score = applyPoint(score, 'player1', DEFAULT_FORMAT).nextScore;
      expect(score.currentGame.player1).toBe('40');
    });

    it('wins game from 40-0', () => {
      let score = createInitialScore(DEFAULT_FORMAT);
      for (let i = 0; i < 3; i++) score = applyPoint(score, 'player1', DEFAULT_FORMAT).nextScore;
      const result = applyPoint(score, 'player1', DEFAULT_FORMAT);
      expect(result.nextScore.sets[0].player1Games).toBe(1);
      expect(result.nextScore.sets[0].player2Games).toBe(0);
      expect(result.nextScore.currentGame.player1).toBe('0');
    });
  });

  describe('deuce and advantage', () => {
    it('reaches deuce at 40-40', () => {
      let score = createInitialScore(DEFAULT_FORMAT);
      // Each player reaches 40
      for (let i = 0; i < 3; i++) score = applyPoint(score, 'player1', DEFAULT_FORMAT).nextScore;
      for (let i = 0; i < 3; i++) score = applyPoint(score, 'player2', DEFAULT_FORMAT).nextScore;
      expect(score.currentGame.player1).toBe('40');
      expect(score.currentGame.player2).toBe('40');
    });

    it('gives advantage from deuce', () => {
      let score = createInitialScore(DEFAULT_FORMAT);
      for (let i = 0; i < 3; i++) score = applyPoint(score, 'player1', DEFAULT_FORMAT).nextScore;
      for (let i = 0; i < 3; i++) score = applyPoint(score, 'player2', DEFAULT_FORMAT).nextScore;
      const result = applyPoint(score, 'player1', DEFAULT_FORMAT);
      expect(result.nextScore.currentGame.player1).toBe('Ad');
    });

    it('returns to deuce from advantage', () => {
      let score = createInitialScore(DEFAULT_FORMAT);
      for (let i = 0; i < 3; i++) score = applyPoint(score, 'player1', DEFAULT_FORMAT).nextScore;
      for (let i = 0; i < 3; i++) score = applyPoint(score, 'player2', DEFAULT_FORMAT).nextScore;
      score = applyPoint(score, 'player1', DEFAULT_FORMAT).nextScore; // Ad for p1
      const result = applyPoint(score, 'player2', DEFAULT_FORMAT); // back to deuce
      expect(result.nextScore.currentGame.player1).toBe('40');
      expect(result.nextScore.currentGame.player2).toBe('40');
    });

    it('wins game from advantage', () => {
      let score = createInitialScore(DEFAULT_FORMAT);
      for (let i = 0; i < 3; i++) score = applyPoint(score, 'player1', DEFAULT_FORMAT).nextScore;
      for (let i = 0; i < 3; i++) score = applyPoint(score, 'player2', DEFAULT_FORMAT).nextScore;
      score = applyPoint(score, 'player1', DEFAULT_FORMAT).nextScore; // Ad p1
      const result = applyPoint(score, 'player1', DEFAULT_FORMAT); // wins
      expect(result.nextScore.sets[0].player1Games).toBe(1);
    });
  });

  describe('set completion', () => {
    function winGames(score: ReturnType<typeof createInitialScore>, player: 'player1' | 'player2', count: number) {
      let s = score;
      for (let g = 0; g < count; g++) {
        for (let p = 0; p < 4; p++) {
          const r = applyPoint(s, player, DEFAULT_FORMAT);
          s = r.nextScore;
          if (r.setCompleted) break;
        }
      }
      return s;
    }

    it('wins set at 6-0', () => {
      let score = createInitialScore(DEFAULT_FORMAT);
      score = winGames(score, 'player1', 6);
      expect(score.sets[0].winner).toBe('player1');
      expect(score.player1SetsWon).toBe(1);
    });

    it('requires win by 2 (7-5)', () => {
      let score = createInitialScore(DEFAULT_FORMAT);
      score = winGames(score, 'player1', 5);
      score = winGames(score, 'player2', 5);
      // 5-5, no winner yet
      expect(score.sets[0].winner).toBeUndefined();
      score = winGames(score, 'player1', 1); // 6-5
      expect(score.sets[0].winner).toBeUndefined();
      score = winGames(score, 'player1', 1); // 7-5
      expect(score.sets[0].winner).toBe('player1');
    });

    it('triggers tiebreak at 6-6', () => {
      let score = createInitialScore(DEFAULT_FORMAT);
      for (let i = 0; i < 5; i++) {
        score = winGames(score, 'player1', 1);
        score = winGames(score, 'player2', 1);
      }
      score = winGames(score, 'player1', 1); // 6-5
      score = winGames(score, 'player2', 1); // 6-6 → tiebreak
      expect(score.isTiebreak).toBe(true);
    });
  });

  describe('tiebreak', () => {
    function reachTiebreak() {
      let score = createInitialScore(DEFAULT_FORMAT);
      const winOneGame = (s: typeof score, p: 'player1' | 'player2') => {
        for (let j = 0; j < 4; j++) {
          const r = applyPoint(s, p, DEFAULT_FORMAT);
          s = r.nextScore;
          if (r.gameCompleted || r.setCompleted || s.isTiebreak) break;
        }
        return s;
      };
      for (let i = 0; i < 5; i++) {
        score = winOneGame(score, 'player1');
        score = winOneGame(score, 'player2');
      }
      score = winOneGame(score, 'player1'); // 6-5
      score = winOneGame(score, 'player2'); // 6-6 → tiebreak
      return score;
    }

    it('enters tiebreak at 6-6', () => {
      const score = reachTiebreak();
      expect(score.isTiebreak).toBe(true);
      expect(score.tiebreakScore).toEqual({ player1Points: 0, player2Points: 0 });
    });

    it('wins tiebreak at 7-0', () => {
      let score = reachTiebreak();
      for (let i = 0; i < 7; i++) {
        score = applyPoint(score, 'player1', DEFAULT_FORMAT).nextScore;
      }
      expect(score.player1SetsWon).toBe(1);
    });

    it('requires win by 2 in tiebreak', () => {
      let score = reachTiebreak();
      for (let i = 0; i < 6; i++) score = applyPoint(score, 'player1', DEFAULT_FORMAT).nextScore;
      for (let i = 0; i < 6; i++) score = applyPoint(score, 'player2', DEFAULT_FORMAT).nextScore;
      // 6-6 in tiebreak, no winner
      expect(score.isTiebreak).toBe(true);
      score = applyPoint(score, 'player1', DEFAULT_FORMAT).nextScore; // 7-6
      expect(score.isTiebreak).toBe(true);
      score = applyPoint(score, 'player1', DEFAULT_FORMAT).nextScore; // 8-6, should win
      expect(score.player1SetsWon).toBe(1);
    });
  });

  describe('match completion', () => {
    it('wins match best-of-3', () => {
      const winSet = (score: ReturnType<typeof createInitialScore>, p: 'player1' | 'player2') => {
        let s = score;
        for (let g = 0; g < 6; g++) {
          for (let pt = 0; pt < 4; pt++) {
            const r = applyPoint(s, p, DEFAULT_FORMAT);
            s = r.nextScore;
            if (r.matchWinner) return { s, winner: r.matchWinner };
            if (r.setCompleted) break;
          }
        }
        return { s, winner: undefined };
      };

      let score = createInitialScore(DEFAULT_FORMAT);
      const r1 = winSet(score, 'player1');
      score = r1.s;
      const r2 = winSet(score, 'player1');
      expect(r2.winner).toBe('player1');
    });
  });

  describe('tip timing', () => {
    function winGames(score: ReturnType<typeof createInitialScore>, player: 'player1' | 'player2', count: number) {
      let s = score;
      for (let g = 0; g < count; g++) {
        for (let p = 0; p < 4; p++) {
          const r = applyPoint(s, player, DEFAULT_FORMAT);
          s = r.nextScore;
          if (r.setCompleted || r.matchWinner) break;
        }
      }
      return s;
    }

    it('does not show set point at 5-5', () => {
      let score = createInitialScore(DEFAULT_FORMAT);
      score = winGames(score, 'player1', 5);
      score = winGames(score, 'player2', 5);

      // 5-5, player1 wins first point in game (15-0) — should not be set point yet
      const result = applyPoint(score, 'player1', DEFAULT_FORMAT);
      expect(result.tips).not.toContain('set_point');
      expect(result.tips).not.toContain('match_point');
    });

    it('does not show match point at 5-5 in deciding set', () => {
      let score = createInitialScore(DEFAULT_FORMAT);
      score = winGames(score, 'player1', 6); // player1 wins set 1
      score = winGames(score, 'player2', 6); // player2 wins set 2
      score = winGames(score, 'player1', 5);
      score = winGames(score, 'player2', 5);

      // Final set at 5-5: this is not match point yet
      const result = applyPoint(score, 'player1', DEFAULT_FORMAT);
      expect(result.tips).not.toContain('match_point');
      expect(result.tips).not.toContain('set_point');
    });
  });

  describe('finalSetTiebreak config', () => {
    const NO_FINAL_TB_FORMAT = { ...DEFAULT_FORMAT, finalSetTiebreak: false };

    function winGames(
      score: ReturnType<typeof createInitialScore>,
      player: 'player1' | 'player2',
      count: number,
      fmt = DEFAULT_FORMAT
    ) {
      let s = score;
      for (let g = 0; g < count; g++) {
        for (let p = 0; p < 4; p++) {
          const r = applyPoint(s, player, fmt);
          s = r.nextScore;
          if (r.setCompleted || r.matchWinner) break;
        }
      }
      return s;
    }

    function winSet(
      score: ReturnType<typeof createInitialScore>,
      player: 'player1' | 'player2',
      fmt = DEFAULT_FORMAT
    ) {
      return winGames(score, player, fmt.gamesPerSet, fmt);
    }

    it('does not trigger tiebreak at 6-6 in deciding set when finalSetTiebreak is false', () => {
      let score = createInitialScore(NO_FINAL_TB_FORMAT);
      score = winSet(score, 'player1', NO_FINAL_TB_FORMAT); // p1 wins set 1
      score = winSet(score, 'player2', NO_FINAL_TB_FORMAT); // p2 wins set 2
      // Bring deciding set to 6-6
      for (let i = 0; i < 6; i++) {
        score = winGames(score, 'player1', 1, NO_FINAL_TB_FORMAT);
        score = winGames(score, 'player2', 1, NO_FINAL_TB_FORMAT);
      }
      expect(score.isTiebreak).toBe(false);
      expect(score.sets[2].player1Games).toBe(6);
      expect(score.sets[2].player2Games).toBe(6);
    });

    it('continues play past 6-6 in deciding set when finalSetTiebreak is false', () => {
      let score = createInitialScore(NO_FINAL_TB_FORMAT);
      score = winSet(score, 'player1', NO_FINAL_TB_FORMAT);
      score = winSet(score, 'player2', NO_FINAL_TB_FORMAT);
      for (let i = 0; i < 6; i++) {
        score = winGames(score, 'player1', 1, NO_FINAL_TB_FORMAT);
        score = winGames(score, 'player2', 1, NO_FINAL_TB_FORMAT);
      }
      // 6-6 in final set, no tiebreak — player1 wins two more games to take the set
      score = winGames(score, 'player1', 1, NO_FINAL_TB_FORMAT); // 7-6
      expect(score.sets[2].winner).toBeUndefined();
      score = winGames(score, 'player1', 1, NO_FINAL_TB_FORMAT); // 8-6 — set won
      expect(score.sets[2].winner).toBe('player1');
      expect(score.player1SetsWon).toBe(2);
    });

    it('still triggers tiebreak at 6-6 in non-deciding sets when finalSetTiebreak is false', () => {
      let score = createInitialScore(NO_FINAL_TB_FORMAT);
      // Bring first set to 6-6
      for (let i = 0; i < 6; i++) {
        score = winGames(score, 'player1', 1, NO_FINAL_TB_FORMAT);
        score = winGames(score, 'player2', 1, NO_FINAL_TB_FORMAT);
      }
      expect(score.isTiebreak).toBe(true);
    });

    it('triggers tiebreak at 6-6 in deciding set when finalSetTiebreak is true', () => {
      let score = createInitialScore(DEFAULT_FORMAT);
      score = winSet(score, 'player1');
      score = winSet(score, 'player2');
      for (let i = 0; i < 6; i++) {
        score = winGames(score, 'player1', 1);
        score = winGames(score, 'player2', 1);
      }
      expect(score.isTiebreak).toBe(true);
    });
  });

  describe('formatScoreDisplay', () => {
    it('formats single set score', () => {
      let score = createInitialScore(DEFAULT_FORMAT);
      score.sets[0].player1Games = 3;
      score.sets[0].player2Games = 2;
      expect(formatScoreDisplay(score)).toBe('3-2');
    });
  });

  describe('formatGameScore', () => {
    it('shows deuce', () => {
      const score = createInitialScore(DEFAULT_FORMAT);
      score.currentGame = { player1: '40', player2: '40' };
      expect(formatGameScore(score)).toBe('Deuce');
    });

    it('shows Ad In', () => {
      const score = createInitialScore(DEFAULT_FORMAT);
      score.currentGame = { player1: 'Ad', player2: '40' };
      expect(formatGameScore(score)).toBe('Ad In');
    });
  });
});
