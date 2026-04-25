import {
  addDoc,
  updateDoc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  arrayUnion,
} from 'firebase/firestore';
import { divisionsCol, divisionDoc, usersCol, userDoc } from './collections';
import type { Division, User } from '@tennis/shared';

function randomInviteCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export async function createDivision(
  name: string,
  creatorId: string,
  creatorProfile?: { displayName?: string; email?: string },
): Promise<string> {
  const inviteCode = randomInviteCode();
  const now = Date.now();
  const divData: Omit<Division, 'id'> = {
    name: name.trim(),
    inviteCode,
    leaderIds: [creatorId],
    playerIds: [creatorId],
    createdAt: now,
    updatedAt: now,
  };
  const ref = await addDoc(divisionsCol(), divData as Division);
  await setDoc(userDoc(creatorId), {
    ...(creatorProfile?.displayName && { displayName: creatorProfile.displayName }),
    ...(creatorProfile?.email && { email: creatorProfile.email }),
    divisionId: ref.id,
    role: 'division_leader',
    updatedAt: now,
  }, { merge: true });
  return ref.id;
}

export async function joinDivisionByCode(
  inviteCode: string,
  userId: string
): Promise<{ divisionId: string; divisionName: string }> {
  const q = query(divisionsCol(), where('inviteCode', '==', inviteCode.trim().toUpperCase()));
  const snap = await getDocs(q);
  if (snap.empty) throw new Error('Invalid invite code.');

  const divSnap = snap.docs[0];
  const division: Division = { ...divSnap.data(), id: divSnap.id };

  if (division.playerIds.includes(userId)) {
    return { divisionId: division.id, divisionName: division.name };
  }

  await updateDoc(divisionDoc(division.id), {
    playerIds: arrayUnion(userId),
    updatedAt: Date.now(),
  });
  await updateDoc(userDoc(userId), {
    divisionId: division.id,
    updatedAt: Date.now(),
  });

  return { divisionId: division.id, divisionName: division.name };
}

export async function getDivision(divisionId: string): Promise<Division | null> {
  const snap = await getDoc(divisionDoc(divisionId));
  if (!snap.exists()) return null;
  return { ...snap.data(), id: snap.id };
}

export async function searchDivisionPlayers(
  divisionId: string,
  searchText: string
): Promise<User[]> {
  const q = query(usersCol(), where('divisionId', '==', divisionId));
  const snap = await getDocs(q);
  const lower = searchText.toLowerCase().trim();
  return snap.docs
    .map((d): User => ({ ...d.data(), id: d.id }))
    .filter(
      (u) =>
        u.displayName.toLowerCase().includes(lower) ||
        u.email.toLowerCase().includes(lower)
    );
}
