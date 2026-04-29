import { NativeEventEmitter, NativeModules } from 'react-native';
import type { LiveScore, MatchStatus } from '@tennis/shared';

const WearOsNative = NativeModules.WearOs;
const emitter = WearOsNative ? new NativeEventEmitter(WearOsNative) : null;

export type WearScoreInputEvent = { player: 'player1' | 'player2' };
export type WearSubscription = { remove: () => void };

export type WearScorePayload = {
  score: LiveScore;
  status: MatchStatus;
  player1Name: string;
  player2Name: string;
  feedbackTitle?: string;
  feedbackBody?: string;
  matchWinnerName?: string;
};

export async function sendScoreToWear(
  score: LiveScore,
  payload?: Omit<WearScorePayload, 'score'>,
): Promise<void> {
  if (!WearOsNative) return;
  await WearOsNative.sendScore(JSON.stringify({ score, ...payload }));
}

export async function isWearOsAvailable(): Promise<boolean> {
  if (!WearOsNative) return false;
  return (await WearOsNative.isWearOsAvailable()) ?? false;
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
