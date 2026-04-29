import { getDoc, getDocs, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { divisionDoc, usersCol } from './collections';
import { functions } from './config';
import type { Division, User } from '@tennis/shared';

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
): Promise<{ userId: string; createdPlaceholder: boolean }> {
  const callable = httpsCallable<
    { divisionId: string; name: string; email?: string; sendInvite?: boolean },
    { success: boolean; userId: string; createdPlaceholder: boolean }
  >(functions, 'addDivisionMemberPlaceholder');
  const result = await callable({
    divisionId,
    name: name.trim(),
    email: email?.trim().toLowerCase() || undefined,
    sendInvite,
  });
  return {
    userId: result.data.userId,
    createdPlaceholder: result.data.createdPlaceholder,
  };
}

export async function mergeDivisionPlayerRecords(
  divisionId: string,
  sourceUserId: string,
  targetUserId: string,
): Promise<number> {
  const callable = httpsCallable<
    { divisionId: string; sourceUserId: string; targetUserId: string },
    { success: boolean; updatedMatches: number }
  >(functions, 'mergeDivisionPlayerRecords');
  const result = await callable({
    divisionId,
    sourceUserId,
    targetUserId,
  });
  return result.data.updatedMatches;
}
