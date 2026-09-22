import { NativeEventEmitter, NativeModules } from 'react-native';
import type { LiveScore, MatchStatus } from '@tennis/shared';

const WearOsNative = NativeModules.WearOs;
const emitter = WearOsNative ? new NativeEventEmitter(WearOsNative) : null;

export type WearScoreInputEvent = {
  player?: 'player1' | 'player2';
  action?: 'point' | 'undo';
  matchId: string;
  /** Absent on commands from a pre-v1 watch, which carry no event id or ordering. */
  eventId?: string;
  sequence?: number;
};
export type WearSubscription = { remove: () => void };

export type WearScorePayload = {
  matchId: string;
  score: LiveScore;
  status: MatchStatus;
  player1Name: string;
  player2Name: string;
  feedbackTitle?: string;
  feedbackBody?: string;
  matchWinnerName?: string;
};

/**
 * Pushes the current score to the paired watch. Watch sync is a peripheral
 * convenience and this call is awaited inside the scoring flow, so a transport
 * failure is logged rather than thrown: rejecting here would abort the tips and
 * match-completion handling that follow a score that already committed.
 */
export async function sendScoreToWear(
  score: LiveScore,
  payload?: Omit<WearScorePayload, 'score'>,
): Promise<void> {
  if (!WearOsNative) return;
  try {
    await WearOsNative.sendScore(JSON.stringify({ score, ...payload }));
  } catch (error) {
    console.warn('Could not send the score to Wear OS:', error);
  }
}

export async function isWearOsAvailable(): Promise<boolean> {
  if (!WearOsNative) return false;
  try {
    return (await WearOsNative.isWearOsAvailable()) ?? false;
  } catch (error) {
    console.warn('Could not check Wear OS availability:', error);
    return false;
  }
}

export function addWearScoreInputListener(
  handler: (event: WearScoreInputEvent) => void,
): WearSubscription {
  return (
    emitter?.addListener('onWearScoreInput', handler) ?? {
      remove: () => undefined,
    }
  );
}

export function addWearSyncRequestListener(
  handler: () => void,
): WearSubscription {
  return (
    emitter?.addListener('onWearSyncRequest', handler) ?? {
      remove: () => undefined,
    }
  );
}
