import { useEffect, useState } from 'react';
import { getDoc, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { divisionDoc, divisionLevelsCol, divisionMembershipsQuery, divisionsCol, usersCol } from './collections';
import { functions } from './config';
import type { CsvExportResult, Division, DivisionLevel, DivisionMembership, DivisionMatchType, DivisionSkillLevel, SeasonHalf, User } from '@tennis/shared';

export function useDivisionLevels(
  divisionId: string | null | undefined,
): { levels: DivisionLevel[]; loading: boolean } {
  const [levels, setLevels] = useState<DivisionLevel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!divisionId) {
      setLevels([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    return onSnapshot(
      divisionLevelsCol(divisionId),
      (snap) => {
        setLevels(
          snap.docs
            .map((docSnap) => ({ ...docSnap.data(), id: docSnap.id }))
            .sort((a, b) => (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name)),
        );
        setLoading(false);
      },
      () => {
        setLevels([]);
        setLoading(false);
      },
    );
  }, [divisionId]);

  return { levels, loading };
}


export function useDivisionMemberships(
  divisionId: string | null | undefined,
  seasonId: string | null | undefined,
  divisionLevelId?: string | null,
): { memberships: DivisionMembership[]; loading: boolean } {
  const [memberships, setMemberships] = useState<DivisionMembership[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!divisionId || !seasonId) {
      setMemberships([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    return onSnapshot(
      divisionMembershipsQuery(
        divisionId,
        seasonId,
        ...(divisionLevelId ? [where('divisionLevelId', '==', divisionLevelId)] : []),
      ),
      (snap) => {
        setMemberships(
          snap.docs
            .map((docSnap) => ({ ...docSnap.data(), id: docSnap.id }))
            .sort((a, b) => a.displayNameSnapshot.localeCompare(b.displayNameSnapshot)),
        );
        setLoading(false);
      },
      () => {
        setMemberships([]);
        setLoading(false);
      },
    );
  }, [divisionId, divisionLevelId, seasonId]);

  return { memberships, loading };
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

export async function searchDivisionPlayers(
  divisionId: string,
  searchText: string,
): Promise<User[]> {
  const q = query(usersCol(), where('divisionId', '==', divisionId));
  const snap = await getDocs(q);
  const lower = searchText.toLowerCase().trim();
  return snap.docs
    .map((d): User => ({ ...d.data(), id: d.id }))
    .filter(
      (u) =>
        u.displayName.toLowerCase().includes(lower) ||
        u.email.toLowerCase().includes(lower),
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
