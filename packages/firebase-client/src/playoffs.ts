import { useEffect, useState } from 'react';
import { onSnapshot, query, where, type FirestoreError } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { playoffBracketsCol } from './collections';
import { functions } from './config';
import type { PlayoffBracket } from '@tennis/shared';

/**
 * Subscribes to one season's playoff brackets in a division, newest first.
 * Sorted on the device, so the query needs no composite index.
 */
export function usePlayoffBrackets(
  divisionId: string | null | undefined,
  seasonId: string | null | undefined,
): { brackets: PlayoffBracket[]; loading: boolean; error: FirestoreError | null } {
  const [brackets, setBrackets] = useState<PlayoffBracket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<FirestoreError | null>(null);

  useEffect(() => {
    if (!divisionId || !seasonId) {
      setBrackets([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    return onSnapshot(
      query(playoffBracketsCol(divisionId), where('seasonId', '==', seasonId)),
      (snap) => {
        setBrackets(
          snap.docs
            .map((docSnap) => ({ ...docSnap.data(), id: docSnap.id }))
            .sort((a, b) => b.createdAt - a.createdAt),
        );
        setError(null);
        setLoading(false);
      },
      (snapshotError) => {
        setBrackets([]);
        setError(snapshotError);
        setLoading(false);
      },
    );
  }, [divisionId, seasonId]);

  return { brackets, loading, error };
}

/**
 * Publishes a single-elimination playoff. `playerIds` is the seed order, seed 1
 * first. The server creates round 1's matches and the later rounds as results
 * are confirmed.
 */
export async function publishPlayoffBracket(params: {
  divisionId: string;
  seasonId: string;
  divisionLevelId: string;
  name: string;
  playerIds: string[];
  startAt?: number;
  intervalDays: number;
}): Promise<{ bracketId: string; matchesCreated: number; totalRounds: number }> {
  const callable = httpsCallable<
    typeof params,
    { success: boolean; bracketId: string; matchesCreated: number; totalRounds: number }
  >(functions, 'publishPlayoffBracket');
  const { data } = await callable(params);
  return { bracketId: data.bracketId, matchesCreated: data.matchesCreated, totalRounds: data.totalRounds };
}

/** Cancels a playoff's unplayed matches and marks it cancelled. Played results are kept. */
export async function cancelPlayoffBracket(params: {
  divisionId: string;
  bracketId: string;
}): Promise<{ matchesCancelled: number }> {
  const callable = httpsCallable<typeof params, { success: boolean; matchesCancelled: number }>(
    functions,
    'cancelPlayoffBracket',
  );
  const { data } = await callable(params);
  return { matchesCancelled: data.matchesCancelled };
}
