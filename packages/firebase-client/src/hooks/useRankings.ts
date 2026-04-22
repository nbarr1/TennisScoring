import { useState, useEffect } from 'react';
import { onSnapshot } from 'firebase/firestore';
import { rankingsQuery } from '../collections';
import type { PlayerRanking } from '@tennis/shared';

export function useRankings(divisionId: string | null) {
  const [rankings, setRankings] = useState<PlayerRanking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!divisionId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = onSnapshot(
      rankingsQuery(divisionId),
      (snap) => {
        setRankings(snap.docs.map((d) => d.data() as PlayerRanking));
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
      }
    );
    return unsub;
  }, [divisionId]);

  return { rankings, loading, error };
}
