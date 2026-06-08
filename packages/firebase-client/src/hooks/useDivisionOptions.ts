import { useEffect, useState } from "react";
import { getDoc, getDocs, query, where } from "firebase/firestore";
import { divisionDoc, divisionsCol } from "../collections";

export interface DivisionOption {
  id: string;
  name: string;
}

export async function getUserDivisionOptions(
  userId: string,
  currentDivisionId?: string,
): Promise<DivisionOption[]> {
  const divisionById = new Map<string, DivisionOption>();
  const addDivisionOption = (id: string, name?: string) => {
    const trimmedName = name?.trim();
    divisionById.set(id, { id, name: trimmedName || id });
  };

  const [playerSnap, leaderSnap, currentDivisionSnap] = await Promise.all([
    getDocs(
      query(divisionsCol(), where("playerIds", "array-contains", userId)),
    ),
    getDocs(
      query(divisionsCol(), where("leaderIds", "array-contains", userId)),
    ),
    currentDivisionId ? getDoc(divisionDoc(currentDivisionId)) : null,
  ]);

  for (const docSnap of [...playerSnap.docs, ...leaderSnap.docs]) {
    addDivisionOption(docSnap.id, docSnap.data().name as string | undefined);
  }

  if (currentDivisionId) {
    addDivisionOption(
      currentDivisionId,
      currentDivisionSnap?.data()?.name as string | undefined,
    );
  }

  return Array.from(divisionById.values());
}

export function useDivisionOptions(
  userId: string | null | undefined,
  currentDivisionId?: string,
) {
  const [divisionOptions, setDivisionOptions] = useState<DivisionOption[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadDivisionOptions() {
      if (!userId) {
        setDivisionOptions([]);
        return;
      }

      try {
        const options = await getUserDivisionOptions(userId, currentDivisionId);
        if (!cancelled) setDivisionOptions(options);
      } catch (err) {
        console.error('Failed to load division options:', err);
        if (!cancelled) setDivisionOptions([]);
      }
    }

    void loadDivisionOptions();

    return () => {
      cancelled = true;
    };
  }, [userId, currentDivisionId]);

  return divisionOptions;
}
