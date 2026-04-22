import { NativeModulesProxy, EventEmitter, Subscription } from 'expo-modules-core';
import type { LiveScore } from '@tennis/shared';

const WearOsNative = NativeModulesProxy.WearOs;
const emitter = new EventEmitter(WearOsNative);

export type WearScoreInputEvent = { player: 'player1' | 'player2' };

export async function sendScoreToWear(score: LiveScore): Promise<void> {
  if (!WearOsNative) return;
  await WearOsNative.sendScore(JSON.stringify(score));
}

export function isWearOsAvailable(): boolean {
  if (!WearOsNative) return false;
  return WearOsNative.isWearOsAvailable() ?? false;
}

export function addWearScoreInputListener(handler: (event: WearScoreInputEvent) => void): Subscription {
  return emitter.addListener('onWearScoreInput', handler);
}
