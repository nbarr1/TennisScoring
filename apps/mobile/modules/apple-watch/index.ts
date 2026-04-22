import { NativeModulesProxy, EventEmitter, Subscription } from 'expo-modules-core';
import type { LiveScore } from '@tennis/shared';

const AppleWatchNative = NativeModulesProxy.AppleWatch;
const emitter = new EventEmitter(AppleWatchNative);

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
): Subscription {
  return emitter.addListener('onWatchScoreInput', handler);
}

export function addWatchConnectedListener(handler: (event: { paired: boolean; installed: boolean }) => void): Subscription {
  return emitter.addListener('onWatchConnected', handler);
}
