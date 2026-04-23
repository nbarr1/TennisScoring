import {
  addDoc,
  updateDoc,
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

export async function createDivision(name: string, creatorId: string): Promise<string> {
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
  await updateDoc(userDoc(creatorId), {
    divisionId: ref.id,
    role: 'division_leader',
    updatedAt: now,
  });
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
  const division = { id: divSnap.id, ...divSnap.data() } as Division;

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
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Division) : null;
}

export async function searchDivisionPlayers(
  divisionId: string,
  searchText: string
): Promise<User[]> {
  const q = query(usersCol(), where('divisionId', '==', divisionId));
  const snap = await getDocs(q);
  const lower = searchText.toLowerCase().trim();
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as User)
    .filter(
      (u) =>
        u.displayName.toLowerCase().includes(lower) ||
        u.email.toLowerCase().includes(lower)
    );
}
