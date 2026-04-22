import type { TipTrigger } from '../scoring/scoreEngine';

export interface Tip {
  trigger: TipTrigger;
  title: string;
  body: string;
}

export const TIPS: Record<TipTrigger, Tip> = {
  service_change: {
    trigger: 'service_change',
    title: 'Service Change',
    body: 'Server switches after each game. Remember to switch ends after odd-numbered games in each set.',
  },
  tiebreak_start: {
    trigger: 'tiebreak_start',
    title: 'Tiebreak!',
    body: 'First to 7 points, must win by 2. Server serves 1 point, then players alternate every 2 points. Switch ends every 6 points.',
  },
  deuce: {
    trigger: 'deuce',
    title: 'Deuce',
    body: 'Deuce — must win by 2 consecutive points to win the game.',
  },
  advantage: {
    trigger: 'advantage',
    title: 'Advantage',
    body: 'One player has advantage. Win the next point to win the game, or it returns to Deuce.',
  },
  game_point: {
    trigger: 'game_point',
    title: 'Game Point',
    body: 'One player has game point. Win the next point to win the game.',
  },
  set_point: {
    trigger: 'set_point',
    title: 'Set Point',
    body: 'One player has set point. Win the next game to win the set.',
  },
  match_point: {
    trigger: 'match_point',
    title: 'Match Point',
    body: 'Match point! Win the next game to win the match.',
  },
  new_set: {
    trigger: 'new_set',
    title: 'New Set',
    body: 'New set begins. Players switch ends. Score resets to 0-0.',
  },
  match_complete: {
    trigger: 'match_complete',
    title: 'Match Complete',
    body: 'The match is over. Great game!',
  },
};

export function getTipsForTriggers(triggers: TipTrigger[]): Tip[] {
  // Filter to only the most important tip when multiple fire simultaneously
  const priority: TipTrigger[] = [
    'match_complete',
    'tiebreak_start',
    'match_point',
    'set_point',
    'deuce',
    'advantage',
    'new_set',
    'service_change',
    'game_point',
  ];
  const filtered = priority.filter((t) => triggers.includes(t));
  return filtered.slice(0, 1).map((t) => TIPS[t]);
}
