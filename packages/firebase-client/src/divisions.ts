import { useCallback, useEffect, useState } from 'react';
import {
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  type FirestoreError,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { divisionDoc, divisionLevelsCol, divisionMembershipsCol, divisionMembershipsQuery, divisionsCol, profilesCol } from './collections';
import { functions } from './config';
import type { CsvExportResult, Division, DivisionLevel, DivisionMembership, DivisionMembershipStatus, DivisionMatchType, DivisionSkillLevel, SeasonHalf, PublicProfile } from '@tennis/shared';

export function useDivisionLevels(
  divisionId: string | null | undefined,
): { levels: DivisionLevel[]; loading: boolean; error: FirestoreError | null } {
  const [levels, setLevels] = useState<DivisionLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<FirestoreError | null>(null);

  useEffect(() => {
    if (!divisionId) {
      setLevels([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    return onSnapshot(
      divisionLevelsCol(divisionId),
      (snap) => {
        setLevels(
          snap.docs
            .map((docSnap) => ({ ...docSnap.data(), id: docSnap.id }))
            .sort((a, b) => (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name)),
        );
        setError(null);
        setLoading(false);
      },
      (snapshotError) => {
        setLevels([]);
        setError(snapshotError);
        setLoading(false);
      },
    );
  }, [divisionId]);

  return { levels, loading, error };
}


/**
 * Subscribes to a season's memberships.
 *
 * `statuses` defaults to active-only, which is what schedulers want. A roster view must pass
 * `['active', 'waitlisted']`: a waitlisted player left out of the snapshot renders as
 * unassigned, is counted in the "no division" warning, and gets silently flipped back to
 * active by the next assignment, because the caller can no longer see their real status.
 *
 * A failed query reports `error` and leaves `memberships` empty. That empty list is not a
 * roster: a caller must show the error (and offer `retry`) rather than render every player as
 * unassigned, and must not write memberships based on it, for the same waitlist reason.
 */
export function useDivisionMemberships(
  divisionId: string | null | undefined,
  seasonId: string | null | undefined,
  divisionLevelId?: string | null,
  statuses: readonly DivisionMembershipStatus[] = ['active'],
): { memberships: DivisionMembership[]; loading: boolean; error: FirestoreError | null; retry: () => void } {
  const [memberships, setMemberships] = useState<DivisionMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<FirestoreError | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  // Callers pass an array literal, so depend on its contents rather than its identity or the
  // subscription tears down and rebuilds on every render. An empty list falls back to the
  // default: Firestore rejects an empty `in`, and a caller asking for no statuses at all is
  // a mistake, not a request for an empty roster.
  const statusKey = (statuses.length > 0 ? [...statuses] : ['active']).sort().join(',');

  useEffect(() => {
    if (!divisionId || !seasonId) {
      setMemberships([]);
      setError(null);
      setLoading(false);
      return;
    }
    const statusFilter = statusKey.split(',') as DivisionMembershipStatus[];
    setLoading(true);
    setError(null);
    return onSnapshot(
      divisionMembershipsQuery(
        divisionId,
        seasonId,
        where('status', 'in', statusFilter),
        ...(divisionLevelId ? [where('divisionLevelId', '==', divisionLevelId)] : []),
      ),
      (snap) => {
        setMemberships(
          snap.docs
            .map((docSnap) => ({ ...docSnap.data(), id: docSnap.id }))
            .sort((a, b) => a.displayNameSnapshot.localeCompare(b.displayNameSnapshot)),
        );
        setError(null);
        setLoading(false);
      },
      (snapshotError) => {
        setMemberships([]);
        setError(snapshotError);
        setLoading(false);
      },
    );
  }, [divisionId, divisionLevelId, seasonId, statusKey, retryCount]);

  const retry = useCallback(() => setRetryCount((count) => count + 1), []);
  return { memberships, loading, error, retry };
}

/**
 * The seasons each player is rostered in (active or waitlisted), across every season of a
 * division.
 *
 * Players move between divisions from one season to the next. An admin roster uses this to
 * tell a player who is new to the division (no rostered season anywhere, so genuinely
 * unassigned) from one who belongs to another season and must not be listed on this one.
 *
 * Like `useDivisionMemberships`, a failed query reports `error` with an empty map, which
 * callers must not read as "nobody is rostered anywhere".
 */
export function useDivisionRosteredSeasons(
  divisionId: string | null | undefined,
): { seasonsByUserId: Map<string, Set<string>>; loading: boolean; error: FirestoreError | null; retry: () => void } {
  const [seasonsByUserId, setSeasonsByUserId] = useState<Map<string, Set<string>>>(() => new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<FirestoreError | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!divisionId) {
      setSeasonsByUserId(new Map());
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    return onSnapshot(
      query(divisionMembershipsCol(divisionId), where('status', 'in', ['active', 'waitlisted'])),
      (snap) => {
        const next = new Map<string, Set<string>>();
        snap.docs.forEach((docSnap) => {
          const { userId, seasonId } = docSnap.data();
          if (!userId || !seasonId) return;
          const seasons = next.get(userId) ?? new Set<string>();
          seasons.add(seasonId);
          next.set(userId, seasons);
        });
        setSeasonsByUserId(next);
        setError(null);
        setLoading(false);
      },
      (snapshotError) => {
        setSeasonsByUserId(new Map());
        setError(snapshotError);
        setLoading(false);
      },
    );
  }, [divisionId, retryCount]);

  const retry = useCallback(() => setRetryCount((count) => count + 1), []);
  return { seasonsByUserId, loading, error, retry };
}

export async function upsertDivisionLevel(input: {
  divisionId: string;
  levelId?: string;
  seasonId: string;
  year: number;
  seasonHalf: SeasonHalf;
  name: string;
  skillLevel: DivisionSkillLevel;
  matchType: DivisionMatchType;
  description?: string;
  rankingsEnabled?: boolean;
  active?: boolean;
  sortOrder?: number;
}): Promise<{ levelId: string }> {
  const callable = httpsCallable<typeof input, { levelId: string }>(functions, 'upsertDivisionLevel');
  const result = await callable({
    ...input,
    name: input.name.trim(),
    description: input.description?.trim() || undefined,
  });
  return result.data;
}


export async function upsertDivisionMembership(input: {
  divisionId: string;
  seasonId: string;
  divisionLevelId: string;
  userId?: string;
  name?: string;
  email?: string;
  phone?: string;
  sendInvite?: boolean;
  role?: 'player' | 'division_leader';
  status?: 'active' | 'waitlisted';
}): Promise<{ membershipId: string; userId: string; createdPlaceholder: boolean }> {
  const callable = httpsCallable<typeof input, { membershipId: string; userId: string; createdPlaceholder: boolean }>(
    functions,
    'upsertDivisionMembership',
  );
  const result = await callable({
    ...input,
    name: input.name?.trim() || undefined,
    email: input.email?.trim().toLowerCase() || undefined,
    phone: input.phone?.trim() || undefined,
  });
  return result.data;
}


/**
 * Archives a player's active memberships for a season (all levels, or one level when
 * `divisionLevelId` is supplied). Used by the roster's remove action and by moving a
 * player back to "Unassigned"; the membership document is kept with `status: 'removed'`.
 */
export async function removeDivisionMembership(input: {
  divisionId: string;
  seasonId: string;
  userId: string;
  divisionLevelId?: string;
}): Promise<{ removed: number; detachedFromDivision: boolean }> {
  const callable = httpsCallable<
    typeof input,
    { removed: number; detachedFromDivision?: boolean }
  >(functions, 'removeDivisionMembership');
  const result = await callable(input);
  return {
    removed: result.data.removed,
    detachedFromDivision: result.data.detachedFromDivision ?? false,
  };
}


export async function backfillDivisionSeasonLevel(input: {
  divisionId: string;
  seasonId: string;
  divisionLevelId: string;
  matchType?: DivisionMatchType;
  overwriteExisting?: boolean;
}): Promise<{ updatedMatches: number; membershipsUpserted: number }> {
  const callable = httpsCallable<
    typeof input,
    { success: boolean; updatedMatches: number; membershipsUpserted: number }
  >(functions, 'backfillDivisionSeasonLevel');
  const result = await callable(input);
  return {
    updatedMatches: result.data.updatedMatches,
    membershipsUpserted: result.data.membershipsUpserted,
  };
}

export async function backfillMissingProfiles(input: {
  divisionId: string;
}): Promise<{ backfilled: number; skipped: number }> {
  const callable = httpsCallable<
    typeof input,
    { success: boolean; backfilled: number; skipped: number }
  >(functions, 'backfillMissingProfiles');
  const result = await callable(input);
  return { backfilled: result.data.backfilled, skipped: result.data.skipped };
}

export async function exportDivisionCsv(input: {
  divisionId: string;
  exportType: 'matches' | 'rankings';
  seasonId?: string;
  divisionLevelId?: string;
}): Promise<CsvExportResult> {
  const callable = httpsCallable<typeof input, CsvExportResult>(functions, 'exportDivisionCsv');
  const result = await callable(input);
  return result.data;
}

export function useActiveDivisionId(
  userId: string | null,
  profileDivisionId?: string | null,
): { divisionId: string | null; loading: boolean } {
  const [divisionId, setDivisionId] = useState<string | null>(
    profileDivisionId ?? null,
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setDivisionId(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    let profileDivisionExists = false;
    let profileReady = !profileDivisionId;
    let leaderDivisionIds: string[] = [];
    let playerDivisionIds: string[] = [];
    let leadersReady = false;
    let playersReady = false;

    const syncDivisionId = () => {
      if (!profileReady || !leadersReady || !playersReady) return;

      const fallbackDivisionId =
        leaderDivisionIds[0] ?? playerDivisionIds[0] ?? null;
      setDivisionId(
        profileDivisionId && profileDivisionExists
          ? profileDivisionId
          : fallbackDivisionId,
      );
      setLoading(false);
    };

    const unsubProfile = profileDivisionId
      ? onSnapshot(
          divisionDoc(profileDivisionId),
          (snap) => {
            profileDivisionExists = snap.exists();
            profileReady = true;
            syncDivisionId();
          },
          () => {
            profileDivisionExists = false;
            profileReady = true;
            syncDivisionId();
          },
        )
      : undefined;

    const unsubLeaders = onSnapshot(
      query(divisionsCol(), where('leaderIds', 'array-contains', userId)),
      (snap) => {
        leaderDivisionIds = snap.docs.map((docSnap) => docSnap.id);
        leadersReady = true;
        syncDivisionId();
      },
      () => {
        leaderDivisionIds = [];
        leadersReady = true;
        syncDivisionId();
      },
    );

    const unsubPlayers = onSnapshot(
      query(divisionsCol(), where('playerIds', 'array-contains', userId)),
      (snap) => {
        playerDivisionIds = snap.docs.map((docSnap) => docSnap.id);
        playersReady = true;
        syncDivisionId();
      },
      () => {
        playerDivisionIds = [];
        playersReady = true;
        syncDivisionId();
      },
    );

    return () => {
      unsubProfile?.();
      unsubLeaders();
      unsubPlayers();
    };
  }, [userId, profileDivisionId]);

  return { divisionId, loading };
}

export async function createDivision(
  name: string,
  creatorId: string,
  creatorProfile?: { displayName?: string; email?: string },
): Promise<string> {
  const callable = httpsCallable<
    { name: string; displayName?: string; email?: string; creatorId?: string },
    { divisionId: string }
  >(functions, 'createDivision');
  const result = await callable({
    name: name.trim(),
    creatorId,
    ...(creatorProfile?.displayName && {
      displayName: creatorProfile.displayName,
    }),
    ...(creatorProfile?.email && { email: creatorProfile.email }),
  });
  return result.data.divisionId;
}

export async function joinDivisionByCode(
  inviteCode: string,
  userId: string,
): Promise<{ divisionId: string; divisionName: string }> {
  const callable = httpsCallable<
    { inviteCode: string; userId?: string },
    { divisionId: string; divisionName: string }
  >(functions, 'joinDivisionByCode');
  const result = await callable({
    inviteCode: inviteCode.trim(),
    userId,
  });
  return result.data;
}

export async function getDivision(
  divisionId: string,
): Promise<Division | null> {
  const snap = await getDoc(divisionDoc(divisionId));
  if (!snap.exists()) return null;
  return { ...snap.data(), id: snap.id };
}

/**
 * Players in a division whose display name contains `searchText`.
 *
 * `profiles/{uid}.divisionId` names a player's *active* division only, and leader-side
 * callables never move a registered account's active division. A player rostered here
 * whose active division is another one therefore has no profile matching this division,
 * so by default the division's rostered season memberships are searched too. Match
 * writes accept any roster member (`divisions.playerIds`), so those players are valid
 * opponents.
 *
 * Pass `profilesOnly` where the result feeds a write that requires a shared *active*
 * division, such as starting a direct conversation.
 */
export async function searchDivisionPlayers(
  divisionId: string,
  searchText: string,
  options: { profilesOnly?: boolean } = {},
): Promise<PublicProfile[]> {
  const [profilesResult, membershipsResult] = await Promise.allSettled([
    getDocs(query(profilesCol(), where('divisionId', '==', divisionId))),
    options.profilesOnly
      ? Promise.resolve(null)
      : getDocs(
          query(
            divisionMembershipsCol(divisionId),
            where('status', 'in', ['active', 'waitlisted']),
          ),
        ),
  ]);
  // The profiles query is rejected when the caller's own active division is another one;
  // the roster is still readable to them, so that alone must not empty the results.
  if (profilesResult.status === 'rejected' && (options.profilesOnly || membershipsResult.status === 'rejected')) {
    throw profilesResult.reason;
  }

  const byId = new Map<string, PublicProfile>();
  if (profilesResult.status === 'fulfilled') {
    for (const d of profilesResult.value.docs) {
      byId.set(d.id, { ...d.data(), id: d.id });
    }
  }
  if (membershipsResult.status === 'fulfilled' && membershipsResult.value) {
    // Newest first, so a player rostered in several seasons gets their latest name.
    const memberships = membershipsResult.value.docs
      .map((d) => d.data())
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
    for (const m of memberships) {
      if (!m.userId || !m.displayNameSnapshot || byId.has(m.userId)) continue;
      byId.set(m.userId, {
        id: m.userId,
        displayName: m.displayNameSnapshot,
        divisionId,
        role: m.role === 'division_leader' ? 'division_leader' : 'player',
        updatedAt: m.updatedAt ?? 0,
      });
    }
  }

  const lower = searchText.toLowerCase().trim();
  return [...byId.values()].filter((u) =>
    (u.displayName ?? '').toLowerCase().includes(lower),
  );
}

export async function addPlayerToDivisionByEmail(
  divisionId: string,
  email: string,
): Promise<string> {
  const callable = httpsCallable<
    { divisionId: string; email: string },
    { success: boolean; userId: string }
  >(functions, 'addPlayerToDivisionByEmail');
  const result = await callable({
    divisionId,
    email: email.trim().toLowerCase(),
  });
  return result.data.userId;
}

export async function addDivisionMemberPlaceholder(
  divisionId: string,
  name: string,
  email?: string,
  sendInvite = true,
  membership?: { seasonId: string; divisionLevelId: string },
): Promise<{
  userId: string;
  createdPlaceholder: boolean;
  linkedHistoricalMatches: number;
}> {
  const callable = httpsCallable<
    { divisionId: string; name: string; email?: string; sendInvite?: boolean; seasonId?: string; divisionLevelId?: string },
    {
      success: boolean;
      userId: string;
      createdPlaceholder: boolean;
      linkedHistoricalMatches?: number;
    }
  >(functions, 'addDivisionMemberPlaceholder');
  const result = await callable({
    divisionId,
    name: name.trim(),
    email: email?.trim().toLowerCase() || undefined,
    sendInvite,
    seasonId: membership?.seasonId,
    divisionLevelId: membership?.divisionLevelId,
  });
  return {
    userId: result.data.userId,
    createdPlaceholder: result.data.createdPlaceholder,
    linkedHistoricalMatches: result.data.linkedHistoricalMatches ?? 0,
  };
}

export async function mergeDivisionPlayerRecords(
  divisionId: string,
  targetUserId: string,
  options?: { sourceUserId?: string; matchIds?: string[]; targetEmail?: string },
): Promise<number> {
  const callable = httpsCallable<
    {
      divisionId: string;
      sourceUserId?: string;
      targetUserId: string;
      matchIds?: string[];
      targetEmail?: string;
    },
    { success: boolean; updatedMatches: number }
  >(functions, 'mergeDivisionPlayerRecords');
  const result = await callable({
    divisionId,
    sourceUserId: options?.sourceUserId,
    targetUserId,
    matchIds: options?.matchIds,
    targetEmail: options?.targetEmail?.trim().toLowerCase() || undefined,
  });
  return result.data.updatedMatches;
}

export async function updateDivisionPlayerEmail(
  divisionId: string,
  userId: string,
  email: string,
  phone?: string,
): Promise<void> {
  const callable = httpsCallable<
    { divisionId: string; userId: string; email: string; phone?: string },
    { success: boolean }
  >(functions, 'updateDivisionPlayerEmail');
  await callable({
    divisionId,
    userId,
    email: email.trim().toLowerCase(),
    phone: phone?.trim() || undefined,
  });
}
