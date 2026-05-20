import { NativeModulesProxy, EventEmitter, type EventSubscription } from 'expo-modules-core';
import type { LiveScore } from '@tennis/shared';

type WatchEvents = {
  onWatchScoreInput: (event: WatchScoreInputEvent) => void;
  onWatchConnected: (event: { paired: boolean; installed: boolean }) => void;
};

const AppleWatchNative = NativeModulesProxy.AppleWatch;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const emitter = new EventEmitter<WatchEvents>(AppleWatchNative as any);

export type WatchScoreInputEvent = { player: 'player1' | 'player2' };

export function sendScoreToWatch(score: LiveScore): void {
  if (!AppleWatchNative) return;
  AppleWatchNative.sendScore(JSON.stringify(score));
}

export function isAppleWatchConnected(): boolean {
  if (!AppleWatchNative) return false;
  return AppleWatchNative.isWatchConnected() ?? false;
}

export function addWatchScoreInputListener(
  handler: (event: WatchScoreInputEvent) => void
): EventSubscription {
  return emitter.addListener('onWatchScoreInput', handler);
}

export function addWatchConnectedListener(handler: (event: { paired: boolean; installed: boolean }) => void): EventSubscription {
  return emitter.addListener('onWatchConnected', handler);
}
