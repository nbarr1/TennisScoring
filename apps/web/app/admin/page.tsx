"use client";

export const dynamic = "force-dynamic";

import { AppNav, appNavStyles } from "../shared/AppNav";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { onSnapshot, getDoc, getDocs } from "firebase/firestore";
import {
  divisionsCol,
  userDoc,
  divisionDoc,
  matchesCol,
  rankingsCol,
  usersCol,
  createDivision as createDivisionShared,
  mergeDivisionPlayerRecords,
  recalculateDivisionRankings,
  updateDivisionPlayerEmail as updateDivisionPlayerEmailShared,
  upsertDivisionLevel,
  exportDivisionCsv,
  useAuthUser,
  useDivisionLevels,
  useDivisionMemberships,
  upsertDivisionMembership,
  removeDivisionMembership,
  useRankings,
  previewRoundRobinSchedule,
  publishRoundRobinSchedule,
  useDivisionMessageReports,
  resolveMessageReport,
} from "@tennis/firebase-client";
import {
  currentSeasonForDate,
  defaultSeasonOptions,
  formatDivisionLevelName,
  type Division,
  type DivisionMatchType,
  type DivisionSkillLevel,
  type DivisionMembership,
  type Match,
  type PlayerRanking,
  type User,
  type RoundRobinMatchup,
  type MessageReport,
  type MessageReportReason,
  isPrivilegedRole,
} from "@tennis/shared";
import { query, where } from "firebase/firestore";

const DIVISION_ACCESS_HINTS = [
  "You are signed in to Firebase Auth with the expected account.",
  "Your users/{uid}.role is admin or app_developer, OR your users/{uid}.divisionId matches this division.",
  "Your uid is listed in this division's leaderIds or playerIds roster.",
];

/** How long the transient "Saved" affordance stays visible next to a row control. */
const SAVED_FLASH_MS = 1800;

type AdminTab = "roster" | "divisions" | "tools";
type ToolPanel = "scheduler" | "reports" | null;

/** A roster row: the player, plus the season membership that places them in a level (if any). */
type RosterRow = { player: User; membership: DivisionMembership | null };

const TABS: Array<{ id: AdminTab; label: string }> = [
  { id: "roster", label: "Roster" },
  { id: "divisions", label: "Divisions" },
  { id: "tools", label: "Tools" },
];

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/** Parses pasted "Name, email" lines. Splits on the first comma only, so names may not contain one. */
function parseRosterPaste(text: string): Array<{ name: string; email: string }> {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const comma = line.indexOf(",");
      if (comma === -1) return { name: line, email: "" };
      return {
        name: line.slice(0, comma).trim(),
        email: line.slice(comma + 1).trim(),
      };
    })
    .filter((entry) => entry.name.length > 0);
}

function PermissionHints({
  hints,
  authDebug,
}: {
  hints: string[] | null;
  authDebug: { uid: string; email: string; roleClaim?: unknown } | null;
}): React.JSX.Element | null {
  if (!hints) return null;
  return (
    <>
      <ul style={styles.errorList}>
        {hints.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      {authDebug ? (
        <p style={styles.errorMeta}>
          Active Firebase Auth identity: uid <code>{authDebug.uid}</code>, email <code>{authDebug.email}</code>
          {authDebug.roleClaim !== undefined ? <> , token role claim <code>{String(authDebug.roleClaim)}</code></> : null}
        </p>
      ) : null}
    </>
  );
}

export default function AdminPage(): React.JSX.Element {
  const { firebaseUser } = useAuthUser();
  const router = useRouter();
  const [division, setDivision] = useState<Division | null>(null);
  const [players, setPlayers] = useState<User[]>([]);
  const [needsMergeForUserId, setNeedsMergeForUserId] = useState<string | null>(
    null,
  );
  const [mergeSourceUserId, setMergeSourceUserId] = useState("");
  const [merging, setMerging] = useState(false);
  const [candidateMatches, setCandidateMatches] = useState<Match[]>([]);
  const [candidateMatchRefreshKey, setCandidateMatchRefreshKey] = useState(0);
  const [selectedMatchIds, setSelectedMatchIds] = useState<string[]>([]);
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [newDivisionName, setNewDivisionName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [divisionAccessDenied, setDivisionAccessDenied] = useState(false);
  // Tracks whether the currently-displayed `error` was set by the division-listener effect
  // below, so a later successful snapshot only clears an error it owns (never one set by an
  // unrelated action handler, e.g. handleMergeRecords) and `divisionAccessDenied` can never
  // drift out of sync with `error` (every error-setting call site goes through setPageError).
  const divisionListenerErrorRef = useRef(false);
  function setPageError(
    message: string,
    options?: { permissionDenied?: boolean; fromDivisionListener?: boolean },
  ) {
    setError(message);
    setDivisionAccessDenied(Boolean(options?.permissionDenied));
    divisionListenerErrorRef.current = Boolean(options?.fromDivisionListener);
  }
  const [repairingRankings, setRepairingRankings] = useState(false);
  const [repairMessage, setRepairMessage] = useState("");
  const [expandedPlayerId, setExpandedPlayerId] = useState<string | null>(null);
  const currentSeason = currentSeasonForDate();
  const seasonOptions = defaultSeasonOptions();
  const {
    levels: divisionLevels,
    loading: loadingDivisionLevels,
    error: divisionLevelsError,
  } = useDivisionLevels(division?.id);
  const [levelName, setLevelName] = useState(formatDivisionLevelName("beginner", "singles"));
  const [levelSkill, setLevelSkill] = useState<DivisionSkillLevel>("beginner");
  const [levelMatchType, setLevelMatchType] = useState<DivisionMatchType>("singles");
  const [levelDescription, setLevelDescription] = useState("");
  const [levelFormOpen, setLevelFormOpen] = useState(false);
  const [savingLevel, setSavingLevel] = useState(false);
  const [levelMessage, setLevelMessage] = useState("");
  // The season is page-level context: every panel (roster, levels, scheduler, exports) reads it.
  const [adminSeasonId, setAdminSeasonId] = useState(currentSeason.id);
  const [viewAsUser, setViewAsUser] = useState(false);
  const [activeTab, setActiveTab] = useState<AdminTab>("roster");
  const { memberships: seasonMemberships } = useDivisionMemberships(
    division?.id,
    adminSeasonId,
  );
  const [exportingCsv, setExportingCsv] = useState(false);
  const [csvMessage, setCsvMessage] = useState("");
  const [openToolPanel, setOpenToolPanel] = useState<ToolPanel>(null);
  const [rrDivisionLevelId, setRrDivisionLevelId] = useState("");
  const [rrSelectedPlayerIds, setRrSelectedPlayerIds] = useState<string[]>([]);
  const [rrDoubleRoundRobin, setRrDoubleRoundRobin] = useState(false);
  const [rrIntervalDays, setRrIntervalDays] = useState(7);
  const [rrStartDate, setRrStartDate] = useState("");
  const [rrSeedByRankings, setRrSeedByRankings] = useState(true);
  const [rrClearExisting, setRrClearExisting] = useState(false);
  const [rrPreview, setRrPreview] = useState<RoundRobinMatchup[] | null>(null);
  const [rrPublishing, setRrPublishing] = useState(false);
  const [rrMessage, setRrMessage] = useState("");

  // `seasonOptions`/`currentSeason` are rebuilt every render, so this stays a plain lookup
  // rather than a memo whose dependencies could never be stable.
  const adminSeason =
    seasonOptions.find((season) => season.id === adminSeasonId) ?? currentSeason;
  const levelNameById = useMemo(
    () => new Map(divisionLevels.map((level) => [level.id, level.name] as const)),
    [divisionLevels],
  );
  const adminSeasonLevels = useMemo(
    () => divisionLevels.filter((level) => level.seasonId === adminSeasonId),
    [adminSeasonId, divisionLevels],
  );
  // The generator pairs individuals, so it cannot fill a doubles level yet.
  // publishRoundRobinSchedule rejects doubles server-side; this disables the UI
  // so a leader learns that before building a preview.
  const rrSelectedLevelIsDoubles =
    adminSeasonLevels.find((level) => level.id === rrDivisionLevelId)?.matchType === "doubles";
  const { memberships: rrMemberships } = useDivisionMemberships(
    division?.id,
    adminSeasonId,
    rrDivisionLevelId || null,
  );
  const { rankings: rrRankings } = useRankings(division?.id ?? null, {
    seasonId: adminSeasonId,
    divisionLevelId: rrDivisionLevelId,
  });
  const rrNameById = useMemo(
    () => new Map(rrMemberships.map((m) => [m.userId, m.displayNameSnapshot] as const)),
    [rrMemberships],
  );
  const [resolvingReportId, setResolvingReportId] = useState<string | null>(null);
  const { reports: messageReports } = useDivisionMessageReports(division?.id);
  const REPORT_REASON_LABELS: Record<MessageReportReason, string> = {
    harassment: "Harassment",
    spam: "Spam",
    inappropriate: "Inappropriate",
    other: "Other",
  };
  const [lastLinkAction, setLastLinkAction] = useState<{
    sourceUserId?: string;
    targetUserId: string;
    matchIds: string[];
  } | null>(null);
  const [linkActionMessage, setLinkActionMessage] = useState<{
    targetUserId: string;
    message: string;
    kind: "link" | "contact";
  } | null>(null);
  const [lastContactAction, setLastContactAction] = useState<{
    targetUserId: string;
    previousEmail: string;
    previousPhone?: string;
  } | null>(null);

  // ---- Roster tab state -------------------------------------------------
  const [rosterSearch, setRosterSearch] = useState("");
  const [rosterFilter, setRosterFilter] = useState<string>("all");
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [bulkLevelId, setBulkLevelId] = useState("");
  const [bulkApplying, setBulkApplying] = useState(false);
  // Level assignments already sent to the server but not yet reflected by the memberships
  // snapshot. `null` means "pending unassign"; a string is a pending level id.
  const [pendingLevels, setPendingLevels] = useState<Record<string, string | null>>({});
  const [savedFlashIds, setSavedFlashIds] = useState<string[]>([]);
  const savedFlashTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [hoveredRemoveId, setHoveredRemoveId] = useState<string | null>(null);
  // Players created here are prepended locally until the memberships snapshot catches up.
  const [pendingNewPlayers, setPendingNewPlayers] = useState<
    Array<{ userId: string; name: string; email: string; levelId: string }>
  >([]);
  const [addPlayerOpen, setAddPlayerOpen] = useState(false);
  const [addPlayerName, setAddPlayerName] = useState("");
  const [addPlayerEmail, setAddPlayerEmail] = useState("");
  const [addPlayerLevelId, setAddPlayerLevelId] = useState("");
  const [savingNewPlayer, setSavingNewPlayer] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importLevelId, setImportLevelId] = useState("");
  const [importing, setImporting] = useState(false);

  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState<'player' | 'division_leader'>('player');
  const [editStatus, setEditStatus] = useState<'active' | 'waitlisted'>('active');
  const [editDivisionLevelId, setEditDivisionLevelId] = useState('');
  const [authDebug, setAuthDebug] = useState<{
    uid: string;
    email: string;
    roleClaim?: unknown;
  } | null>(null);

  const divisionLevelsPermissionHint = useMemo(() => {
    if (divisionLevelsError?.code !== "permission-denied") return null;
    return DIVISION_ACCESS_HINTS;
  }, [divisionLevelsError?.code]);

  const flashSaved = useCallback((userId: string) => {
    setSavedFlashIds((current) =>
      current.includes(userId) ? current : [...current, userId],
    );
    clearTimeout(savedFlashTimers.current[userId]);
    savedFlashTimers.current[userId] = setTimeout(() => {
      delete savedFlashTimers.current[userId];
      setSavedFlashIds((current) => current.filter((id) => id !== userId));
    }, SAVED_FLASH_MS);
  }, []);

  useEffect(() => {
    const timers = savedFlashTimers.current;
    return () => {
      Object.values(timers).forEach((timer) => clearTimeout(timer));
    };
  }, []);

  // Changing the season resets the roster's filter, search, and selection.
  useEffect(() => {
    setRosterFilter("all");
    setRosterSearch("");
    setSelectedPlayerIds([]);
    setPendingLevels({});
    setPendingNewPlayers([]);
    setExpandedPlayerId(null);
    setAddPlayerOpen(false);
  }, [adminSeasonId]);

  // Drop an optimistic override as soon as the memberships snapshot reports the same value,
  // so a stale pending entry can never mask a change made from another device.
  useEffect(() => {
    setPendingLevels((current) => {
      const entries = Object.entries(current);
      if (entries.length === 0) return current;
      const settled = entries.filter(([userId, pending]) => {
        const snapshotLevel = seasonMemberships.find((m) => m.userId === userId)?.divisionLevelId ?? null;
        return (pending ?? null) === snapshotLevel;
      });
      if (settled.length === 0) return current;
      const next = { ...current };
      settled.forEach(([userId]) => delete next[userId]);
      return next;
    });
  }, [seasonMemberships]);

  useEffect(() => {
    if (addPlayerLevelId && adminSeasonLevels.some((level) => level.id === addPlayerLevelId)) return;
    setAddPlayerLevelId(adminSeasonLevels[0]?.id ?? "");
  }, [adminSeasonLevels, addPlayerLevelId]);

  useEffect(() => {
    if (!importOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setImportOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [importOpen]);

  useEffect(() => {
    if (importLevelId && adminSeasonLevels.some((level) => level.id === importLevelId)) return;
    setImportLevelId(adminSeasonLevels[0]?.id ?? "");
  }, [adminSeasonLevels, importLevelId]);

  useEffect(() => {
    if (bulkLevelId && adminSeasonLevels.some((level) => level.id === bulkLevelId)) return;
    setBulkLevelId(adminSeasonLevels[0]?.id ?? "");
  }, [adminSeasonLevels, bulkLevelId]);

  useEffect(() => {
    if (adminSeasonLevels.length === 0) {
      setRrDivisionLevelId("");
      return;
    }
    if (!adminSeasonLevels.some((level) => level.id === rrDivisionLevelId)) {
      setRrDivisionLevelId(adminSeasonLevels[0].id);
    }
  }, [adminSeasonLevels, rrDivisionLevelId]);

  useEffect(() => {
    setRrSelectedPlayerIds(rrMemberships.map((m) => m.userId));
    setRrPreview(null);
  }, [rrMemberships]);

  // Gate: redirect players who are not leaders/admins away from this page.
  useEffect(() => {
    if (!firebaseUser) return;
    getDoc(userDoc(firebaseUser.uid)).then((snap) => {
      const role = snap.data()?.role as string | undefined;
      if (!isPrivilegedRole(role)) {
        router.replace('/dashboard');
      }
    });
  }, [firebaseUser, router]);

  useEffect(() => {
    let cancelled = false;
    if (!firebaseUser) {
      setAuthDebug(null);
      return;
    }
    firebaseUser.getIdTokenResult()
      .then((token) => {
        if (cancelled) return;
        setAuthDebug({
          uid: firebaseUser.uid,
          email: firebaseUser.email ?? "(no email on auth user)",
          roleClaim: token.claims.role,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setAuthDebug({
          uid: firebaseUser.uid,
          email: firebaseUser.email ?? "(no email on auth user)",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [firebaseUser]);

  // Resolve the division context for leaders and admins.
  useEffect(() => {
    if (!firebaseUser) {
      setDivision(null);
      setPlayers([]);
      setLoading(false);
      setPageError("");
      return;
    }
    const leaderQuery = query(
      divisionsCol(),
      where("leaderIds", "array-contains", firebaseUser.uid),
    );
    let activeId = 0;
    // undefined = not yet resolved; distinguishes "first resolution" from "resolved to no division".
    let previousDivisionId: string | null | undefined;

    const unsubscribe = onSnapshot(
      leaderQuery,
      async (leaderSnap) => {
        // Prevent older async snapshot work from overwriting state after a newer snapshot arrives.
        const currentId = ++activeId;
        let div: Division | null = null;

        if (!leaderSnap.empty) {
          div = {
            id: leaderSnap.docs[0].id,
            ...(leaderSnap.docs[0].data() as Omit<Division, "id">),
          };
        } else {
          const profileSnap = await getDoc(userDoc(firebaseUser.uid));
          const profileDivisionId = profileSnap.data()?.divisionId;
          if (typeof profileDivisionId === "string" && profileDivisionId.trim()) {
            const divisionSnap = await getDoc(divisionDoc(profileDivisionId));
            if (divisionSnap.exists()) {
              div = {
                id: divisionSnap.id,
                ...(divisionSnap.data() as Omit<Division, "id">),
              };
            }
          }
        }

        if (currentId !== activeId) return;

        // Only flash "Loading…" and clear the roster when the resolved division actually
        // changes. Re-fires of the same division (e.g. from this admin's own edits) should
        // refresh players/rankings in place without blanking the whole panel.
        const divisionChanged = (div?.id ?? null) !== previousDivisionId;
        previousDivisionId = div?.id ?? null;
        if (divisionChanged) {
          setLoading(true);
          setPlayers([]);
        }

        setDivision(div);
        // A successful snapshot only proves the *listener itself* is healthy; only clear an
        // error/hint that this same listener previously set, so an unrelated in-flight error
        // from another action (e.g. handleMergeRecords) isn't silently wiped out.
        if (divisionListenerErrorRef.current) {
          setPageError("");
        }
        if (div) {
          const [divisionMemberProfiles, divisionProfileSnap, rankingSnap] =
            await Promise.all([
              div.playerIds.length
                ? Promise.all(div.playerIds.map((id) => getDoc(userDoc(id))))
                : Promise.resolve([]),
              getDocs(query(usersCol(), where("divisionId", "==", div.id))),
              getDocs(rankingsCol(div.id)),
            ]);
          const rankingFallbacks = rankingSnap.docs.map((d) => {
            const data = d.data() as PlayerRanking;
            return { ...data, userId: data.userId || d.id };
          });
          const byId = new Map<string, User>();
          const addProfile = (id: string, data: Omit<User, "id">) => {
            byId.set(id, { id, ...data });
          };
          divisionMemberProfiles.forEach((d) => {
            if (d.exists()) addProfile(d.id, d.data() as Omit<User, "id">);
          });
          divisionProfileSnap.docs.forEach((d) =>
            addProfile(d.id, d.data() as Omit<User, "id">),
          );
          rankingFallbacks.forEach((ranking) => {
            if (byId.has(ranking.userId)) return;
            byId.set(ranking.userId, {
              id: ranking.userId,
              displayName: ranking.displayName,
              email: "",
              contactPreferences: {
                allowEmail: false,
                allowSMS: false,
                allowInApp: true,
              },
              divisionId: div.id,
              role: "player",
              fcmTokens: [],
              tipsEnabled: true,
              isRegistered: false,
              inviteStatus: "none",
              createdAt: ranking.updatedAt ?? 0,
              updatedAt: ranking.updatedAt ?? 0,
            });
          });

          if (currentId !== activeId) return;

          setPlayers(
            [...byId.values()].sort((a, b) =>
              a.displayName.localeCompare(b.displayName),
            ),
          );
        } else {
          setPlayers([]);
        }
        setLoading(false);
      },
      (snapshotError) => {
        activeId++;
        // Surface Firestore rule denials in the UI instead of leaving an uncaught listener error in DevTools.
        setDivision(null);
        setPlayers([]);
        const isPermissionDenied = snapshotError.code === "permission-denied";
        setPageError(
          isPermissionDenied
            ? "Unable to load your admin division. Confirm your signed-in account is a division leader or app admin."
            : snapshotError.message,
          { permissionDenied: isPermissionDenied, fromDivisionListener: true },
        );
        setLoading(false);
      },
    );

    return () => {
      // Invalidate any in-flight async work from this effect instance so it can't
      // call setState after the component unmounts or the effect re-runs.
      activeId++;
      unsubscribe();
    };
  }, [firebaseUser]);

  async function createDivision() {
    if (!firebaseUser || !newDivisionName.trim()) return;
    await createDivisionShared(newDivisionName.trim(), firebaseUser.uid, {
      displayName: firebaseUser.displayName ?? undefined,
      email: firebaseUser.email ?? undefined,
    });
    setNewDivisionName("");
  }

  async function handleMergeRecords() {
    if (!division || !needsMergeForUserId) return;
    if (selectedMatchIds.length === 0) {
      setPageError("Please select at least one match to link.");
      return;
    }
    setMerging(true);
    setPageError("");
    setLevelMessage("");
    try {
      const updatedMatches = await mergeDivisionPlayerRecords(
        division.id,
        needsMergeForUserId,
        {
          sourceUserId: mergeSourceUserId || undefined,
          matchIds: selectedMatchIds,
          targetEmail: editEmail.trim() || undefined,
        },
      );
      setLinkActionMessage({
        targetUserId: needsMergeForUserId,
        message: `Linked records. Updated ${updatedMatches} historical match${updatedMatches === 1 ? "" : "es"} and refreshed rankings.`,
        kind: "link",
      });
      setLastLinkAction({
        sourceUserId: mergeSourceUserId || undefined,
        targetUserId: needsMergeForUserId,
        matchIds: [...selectedMatchIds],
      });
      setCandidateMatchRefreshKey((key) => key + 1);
      setSelectedMatchIds([]);
      setMergeSourceUserId("");
    } catch (e) {
      const message = (e as { message?: string; code?: string }).message;
      const code = (e as { code?: string }).code;
      setPageError(
        message
          ? `${code ?? "error"}: ${message}`
          : "Failed to link historical matches.",
      );
    } finally {
      setMerging(false);
    }
  }

  async function handleUpdatePlayerEmail() {
    if (!division || !needsMergeForUserId || !editEmail.trim()) return;
    setMerging(true);
    setPageError("");
    try {
      await updateDivisionPlayerEmailShared(
        division.id,
        needsMergeForUserId,
        editEmail,
        editPhone,
      );
      const previousPlayer = players.find((player) => player.id === needsMergeForUserId);
      setLastContactAction({
        targetUserId: needsMergeForUserId,
        previousEmail: previousPlayer?.email ?? "",
        previousPhone: previousPlayer?.phone,
      });
      setLinkActionMessage({
        targetUserId: needsMergeForUserId,
        message: "Contact information updated. Confirm or undo action below.",
        kind: "contact",
      });
    } catch (e) {
      const message = (e as { message?: string; code?: string }).message;
      const code = (e as { code?: string }).code;
      setPageError(
        message
          ? `${code ?? "error"}: ${message}`
          : "Failed to update player email.",
      );
    } finally {
      setMerging(false);
    }
  }

  async function undoLastLink() {
    if (!division || !lastLinkAction?.sourceUserId) return;
    setMerging(true);
    setPageError("");
    try {
      const reverted = await mergeDivisionPlayerRecords(
        division.id,
        lastLinkAction.sourceUserId,
        {
          sourceUserId: lastLinkAction.targetUserId,
          matchIds: lastLinkAction.matchIds,
        },
      );
      setLinkActionMessage({
        targetUserId: lastLinkAction.sourceUserId,
        message: `Undo complete. Reverted ${reverted} linked historical matches.`,
        kind: "link",
      });
      setLastLinkAction(null);
    } catch (e) {
      const message = (e as { message?: string; code?: string }).message;
      const code = (e as { code?: string }).code;
      setPageError(
        message
          ? `${code ?? "error"}: ${message}`
          : "Failed to undo the last link action.",
      );
    } finally {
      setMerging(false);
    }
  }


  async function undoLastContact() {
    if (!division || !lastContactAction || !lastContactAction.previousEmail) return;
    setMerging(true);
    setPageError("");
    try {
      await updateDivisionPlayerEmailShared(
        division.id,
        lastContactAction.targetUserId,
        lastContactAction.previousEmail,
        lastContactAction.previousPhone,
      );
      setEditEmail(lastContactAction.previousEmail);
      setEditPhone(lastContactAction.previousPhone ?? "");
      setLinkActionMessage({
        targetUserId: lastContactAction.targetUserId,
        message: "Undo complete. Contact information was restored.",
        kind: "contact",
      });
      setLastContactAction(null);
    } catch (e) {
      const message = (e as { message?: string; code?: string }).message;
      const code = (e as { code?: string }).code;
      setPageError(
        message
          ? `${code ?? "error"}: ${message}`
          : "Failed to undo contact update.",
      );
    } finally {
      setMerging(false);
    }
  }

  useEffect(() => {
    async function loadCandidateMatches() {
      if (!division?.id || !needsMergeForUserId) {
        setCandidateMatches([]);
        setSelectedMatchIds([]);
        return;
      }
      const snap = await getDocs(
        query(matchesCol(), where("divisionId", "==", division.id)),
      );
      const matches = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<Match, "id">) }))
        .filter((match) => {
          if (match.status !== "completed") return false;
          const attachedPlayerIds = new Set(
            (Array.isArray(match.playerIds) ? match.playerIds : []).filter(
              (id) => id && id !== "guest",
            ),
          );
          return (
            !attachedPlayerIds.has(needsMergeForUserId) &&
            attachedPlayerIds.size < 2
          );
        })
        .sort(
          (a, b) =>
            (b.completedAt ?? b.createdAt ?? 0) -
            (a.completedAt ?? a.createdAt ?? 0),
        );
      setCandidateMatches(matches);
      setSelectedMatchIds([]);
    }
    loadCandidateMatches();
  }, [division?.id, needsMergeForUserId, candidateMatchRefreshKey]);

  async function handleCreateLevel() {
    if (!division || !levelName.trim()) return;
    setSavingLevel(true);
    setPageError("");
    setLevelMessage("");
    try {
      await upsertDivisionLevel({
        divisionId: division.id,
        seasonId: adminSeason.id,
        year: adminSeason.year,
        seasonHalf: adminSeason.half,
        name: levelName,
        skillLevel: levelSkill,
        matchType: levelMatchType,
        description: levelDescription,
        rankingsEnabled: true,
        active: true,
        sortOrder: divisionLevels.length + 1,
      });
      setLevelDescription("");
      setLevelFormOpen(false);
      setLevelMessage("Division level saved. Rankings and CSV exports can now use this season/division option.");
    } catch (e) {
      setPageError((e as { message?: string }).message || "Failed to save division level.");
    } finally {
      setSavingLevel(false);
    }
  }

  async function handleExportCsv(exportType: "matches" | "rankings") {
    if (!division) return;
    setExportingCsv(true);
    setCsvMessage("");
    setPageError("");
    try {
      const result = await exportDivisionCsv({
        divisionId: division.id,
        exportType,
        seasonId: adminSeasonId,
      });
      const blob = new Blob([result.csv], { type: result.contentType });
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = result.filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(href);
      setCsvMessage(`Exported ${result.rowCount} ${exportType} row${result.rowCount === 1 ? "" : "s"}.`);
    } catch (e) {
      setPageError((e as { message?: string }).message || "Failed to export CSV.");
    } finally {
      setExportingCsv(false);
    }
  }

  function toggleRrPlayer(userId: string) {
    setRrPreview(null);
    setRrSelectedPlayerIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  }

  function handleRrGeneratePreview() {
    setRrMessage("");
    if (rrSelectedLevelIsDoubles) {
      setPageError(
        "Round-robin scheduling is not yet available for doubles levels. Create doubles matches from the Matches page instead.",
      );
      return;
    }
    if (rrSelectedPlayerIds.length < 2) {
      setPageError("Choose at least 2 players to generate a schedule.");
      return;
    }
    setPageError("");
    setRrPreview(
      previewRoundRobinSchedule({
        playerIds: rrSelectedPlayerIds,
        doubleRoundRobin: rrDoubleRoundRobin,
        seedByRankings: rrSeedByRankings,
        rankings: rrRankings,
      }),
    );
  }

  async function handleRrPublish() {
    if (!division || !adminSeasonId || !rrDivisionLevelId || !rrPreview) return;
    if (rrSelectedLevelIsDoubles) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rrStartDate)) {
      setPageError("Please enter the start date as YYYY-MM-DD.");
      return;
    }
    const startAt = Date.parse(`${rrStartDate}T18:00:00`);
    if (!startAt || Number.isNaN(startAt)) {
      setPageError("Could not parse that start date.");
      return;
    }
    const confirmed = window.confirm(
      `This will create ${rrPreview.length} match${rrPreview.length === 1 ? "" : "es"}${
        rrClearExisting ? " and remove the previously generated schedule for this level" : ""
      }. Continue?`,
    );
    if (!confirmed) return;
    setRrPublishing(true);
    setPageError("");
    setRrMessage("");
    try {
      const level = adminSeasonLevels.find((l) => l.id === rrDivisionLevelId);
      const result = await publishRoundRobinSchedule({
        divisionId: division.id,
        seasonId: adminSeasonId,
        divisionLevelId: rrDivisionLevelId,
        matchType: level?.matchType,
        playerIds: rrSelectedPlayerIds,
        doubleRoundRobin: rrDoubleRoundRobin,
        startAt,
        intervalDays: rrIntervalDays,
        clearExisting: rrClearExisting,
      });
      setRrPreview(null);
      setRrMessage(
        `Created ${result.matchesCreated} match${result.matchesCreated === 1 ? "" : "es"} across ${result.roundsCreated} round${result.roundsCreated === 1 ? "" : "s"}.`,
      );
    } catch (e) {
      setPageError((e as { message?: string }).message || "Could not publish schedule. Please try again.");
    } finally {
      setRrPublishing(false);
    }
  }

  async function handleResolveReport(
    report: MessageReport,
    action: "dismiss" | "remove",
  ) {
    if (!firebaseUser) return;
    setResolvingReportId(report.id);
    try {
      await resolveMessageReport(report, firebaseUser.uid, action);
    } catch (e) {
      setPageError((e as { message?: string }).message || "Could not resolve report. Please try again.");
    } finally {
      setResolvingReportId(null);
    }
  }

  async function repairRankings() {
    if (!division) return;
    setRepairingRankings(true);
    setPageError("");
    setRepairMessage("");
    try {
      const response = (await recalculateDivisionRankings(
        division.id,
        true,
      )) as {
        result?: {
          countedMatches?: number;
          guestMatchesCounted?: number;
          matchesNormalized?: number;
          rankingsWritten?: number;
          rankingsDeleted?: number;
        };
      };
      const result = response.result;
      setRepairMessage(
        result
          ? `Rankings repaired. Counted ${result.countedMatches ?? 0} match${
              result.countedMatches === 1 ? "" : "es"
            }, including ${result.guestMatchesCounted ?? 0} guest match${
              result.guestMatchesCounted === 1 ? "" : "es"
            }. Updated ${result.rankingsWritten ?? 0} ranking row${
              result.rankingsWritten === 1 ? "" : "s"
            } and removed ${result.rankingsDeleted ?? 0} stale row${
              result.rankingsDeleted === 1 ? "" : "s"
            }. Normalized ${result.matchesNormalized ?? 0} historic match${
              result.matchesNormalized === 1 ? "" : "es"
            }.`
          : "Rankings repaired.",
      );
    } catch (e) {
      const message = (e as { message?: string }).message;
      setPageError(message || "Failed to repair rankings. Please try again.");
    } finally {
      setRepairingRankings(false);
    }
  }

  async function handleSavePlayerRow() {
    if (!division || !editingPlayerId || !editName.trim() || !editDivisionLevelId) return;
    setMerging(true);
    setPageError('');
    try {
      await upsertDivisionMembership({
        divisionId: division.id,
        seasonId: adminSeasonId,
        divisionLevelId: editDivisionLevelId,
        userId: editingPlayerId,
        name: editName.trim(),
        email: editEmail.trim() || undefined,
        phone: editPhone.trim() || undefined,
        role: editRole,
        status: editStatus,
      });
      setExpandedPlayerId(null);
      setEditingPlayerId(null);
      flashSaved(editingPlayerId);
    } catch (e) {
      setPageError((e as { message?: string }).message || 'Failed to save player updates.');
    } finally {
      setMerging(false);
    }
  }

  // ---- Roster derivation ------------------------------------------------
  const playerById = useMemo(
    () => new Map(players.map((player) => [player.id, player] as const)),
    [players],
  );
  const membershipByUserId = useMemo(
    () => new Map(seasonMemberships.map((membership) => [membership.userId, membership] as const)),
    [seasonMemberships],
  );

  const rosterRows: RosterRow[] = useMemo(() => {
    const membershipRows: RosterRow[] = seasonMemberships.map((membership) => ({
      membership,
      player: playerById.get(membership.userId) ?? ({
        id: membership.userId,
        displayName: membership.displayNameSnapshot,
        email: membership.emailSnapshot ?? "",
        phone: membership.phoneSnapshot,
        contactPreferences: { allowEmail: true, allowSMS: true, allowInApp: true },
        divisionId: membership.divisionId,
        role: membership.role === "division_leader" ? "division_leader" : "player",
        fcmTokens: [],
        tipsEnabled: true,
        createdAt: membership.createdAt,
        updatedAt: membership.updatedAt,
      } satisfies User),
    }));
    const legacyRows: RosterRow[] = players
      .filter((player) => !membershipByUserId.has(player.id))
      .map((player) => ({ player, membership: null }));
    const known = new Set([
      ...membershipRows.map((row) => row.player.id),
      ...legacyRows.map((row) => row.player.id),
    ]);
    // Players added in this session sit at the top until the snapshot includes them.
    const optimisticRows: RosterRow[] = pendingNewPlayers
      .filter((entry) => !known.has(entry.userId))
      .map((entry) => ({
        membership: null,
        player: {
          id: entry.userId,
          displayName: entry.name,
          email: entry.email,
          contactPreferences: { allowEmail: true, allowSMS: false, allowInApp: true },
          divisionId: division?.id ?? "",
          role: "player",
          fcmTokens: [],
          tipsEnabled: true,
          isRegistered: false,
          inviteStatus: "none",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        } satisfies User,
      }));
    return [...optimisticRows, ...membershipRows, ...legacyRows];
  }, [division?.id, membershipByUserId, pendingNewPlayers, playerById, players, seasonMemberships]);

  /** The level a row should display: a pending write wins over the snapshot; "" means unassigned. */
  const effectiveLevelId = useCallback(
    (row: RosterRow): string => {
      const pending = pendingLevels[row.player.id];
      if (pending !== undefined) return pending ?? "";
      const optimisticNew = pendingNewPlayers.find((entry) => entry.userId === row.player.id);
      if (!row.membership && optimisticNew) return optimisticNew.levelId;
      return row.membership?.divisionLevelId ?? "";
    },
    [pendingLevels, pendingNewPlayers],
  );

  const unassignedCount = useMemo(
    () => rosterRows.filter((row) => !effectiveLevelId(row)).length,
    [effectiveLevelId, rosterRows],
  );

  const countByLevelId = useMemo(() => {
    const counts = new Map<string, number>();
    rosterRows.forEach((row) => {
      const levelId = effectiveLevelId(row);
      if (!levelId) return;
      counts.set(levelId, (counts.get(levelId) ?? 0) + 1);
    });
    return counts;
  }, [effectiveLevelId, rosterRows]);

  const visibleRows = useMemo(() => {
    const term = rosterSearch.trim().toLowerCase();
    return rosterRows.filter((row) => {
      const levelId = effectiveLevelId(row);
      if (rosterFilter === "unassigned" && levelId) return false;
      if (rosterFilter !== "all" && rosterFilter !== "unassigned" && levelId !== rosterFilter) {
        return false;
      }
      if (!term) return true;
      return (
        row.player.displayName.toLowerCase().includes(term) ||
        (row.player.email ?? "").toLowerCase().includes(term)
      );
    });
  }, [effectiveLevelId, rosterFilter, rosterRows, rosterSearch]);

  const visibleIds = useMemo(() => visibleRows.map((row) => row.player.id), [visibleRows]);
  const selectedVisibleIds = useMemo(
    () => selectedPlayerIds.filter((id) => visibleIds.includes(id)),
    [selectedPlayerIds, visibleIds],
  );
  const allVisibleSelected =
    visibleIds.length > 0 && selectedVisibleIds.length === visibleIds.length;
  const someVisibleSelected =
    selectedVisibleIds.length > 0 && selectedVisibleIds.length < visibleIds.length;
  const isFiltered = rosterFilter !== "all" || rosterSearch.trim().length > 0;

  // ---- Roster actions ---------------------------------------------------
  async function assignLevel(row: RosterRow, nextLevelId: string) {
    if (!division) return;
    const userId = row.player.id;
    const previous = effectiveLevelId(row);
    if (nextLevelId === previous) return;
    setPendingLevels((current) => ({ ...current, [userId]: nextLevelId || null }));
    setPageError("");
    try {
      if (nextLevelId) {
        await upsertDivisionMembership({
          divisionId: division.id,
          seasonId: adminSeasonId,
          divisionLevelId: nextLevelId,
          userId,
          name: row.player.displayName,
          email: row.player.email || undefined,
          phone: row.player.phone || undefined,
          role: row.membership?.role,
          status: row.membership?.status === "waitlisted" ? "waitlisted" : "active",
        });
      } else {
        await removeDivisionMembership({
          divisionId: division.id,
          seasonId: adminSeasonId,
          userId,
        });
      }
      flashSaved(userId);
    } catch (e) {
      // Roll the optimistic value back so the select never lies about what was saved.
      setPendingLevels((current) => {
        const next = { ...current };
        delete next[userId];
        return next;
      });
      setPageError(
        (e as { message?: string }).message ||
          `Could not update the division for ${row.player.displayName}.`,
      );
    }
  }

  async function removeFromRoster(row: RosterRow) {
    if (!division) return;
    const confirmed = window.confirm(
      `Remove ${row.player.displayName} from ${adminSeason.name}? Their match history is kept.`,
    );
    if (!confirmed) return;
    const userId = row.player.id;
    setPageError("");
    setPendingNewPlayers((current) => current.filter((entry) => entry.userId !== userId));
    setSelectedPlayerIds((current) => current.filter((id) => id !== userId));
    try {
      await removeDivisionMembership({
        divisionId: division.id,
        seasonId: adminSeasonId,
        userId,
      });
      setPendingLevels((current) => ({ ...current, [userId]: null }));
    } catch (e) {
      setPageError(
        (e as { message?: string }).message ||
          `Could not remove ${row.player.displayName} from this season.`,
      );
    }
  }

  async function applyBulkAssign() {
    if (!division || !bulkLevelId || selectedVisibleIds.length === 0) return;
    setBulkApplying(true);
    setPageError("");
    const targets = visibleRows.filter((row) => selectedVisibleIds.includes(row.player.id));
    try {
      for (const row of targets) {
        if (effectiveLevelId(row) === bulkLevelId) continue;
        setPendingLevels((current) => ({ ...current, [row.player.id]: bulkLevelId }));
        await upsertDivisionMembership({
          divisionId: division.id,
          seasonId: adminSeasonId,
          divisionLevelId: bulkLevelId,
          userId: row.player.id,
          name: row.player.displayName,
          email: row.player.email || undefined,
          phone: row.player.phone || undefined,
          role: row.membership?.role,
          status: row.membership?.status === "waitlisted" ? "waitlisted" : "active",
        });
        flashSaved(row.player.id);
      }
      setSelectedPlayerIds([]);
    } catch (e) {
      setPageError(
        (e as { message?: string }).message || "Could not assign every selected player.",
      );
    } finally {
      setBulkApplying(false);
    }
  }

  async function handleAddPlayer() {
    if (!division || !addPlayerName.trim() || !addPlayerLevelId) return;
    setSavingNewPlayer(true);
    setPageError("");
    try {
      const result = await upsertDivisionMembership({
        divisionId: division.id,
        seasonId: adminSeasonId,
        divisionLevelId: addPlayerLevelId,
        name: addPlayerName.trim(),
        email: addPlayerEmail.trim() || undefined,
      });
      setPendingNewPlayers((current) => [
        {
          userId: result.userId,
          name: addPlayerName.trim(),
          email: addPlayerEmail.trim(),
          levelId: addPlayerLevelId,
        },
        ...current.filter((entry) => entry.userId !== result.userId),
      ]);
      flashSaved(result.userId);
      setAddPlayerOpen(false);
      setAddPlayerName("");
      setAddPlayerEmail("");
    } catch (e) {
      setPageError((e as { message?: string }).message || "Failed to add the player.");
    } finally {
      setSavingNewPlayer(false);
    }
  }

  const importEntries = useMemo(() => parseRosterPaste(importText), [importText]);

  async function handleImportRoster() {
    if (!division || !importLevelId || importEntries.length === 0) return;
    setImporting(true);
    setPageError("");
    const created: Array<{ userId: string; name: string; email: string; levelId: string }> = [];
    try {
      for (const entry of importEntries) {
        const result = await upsertDivisionMembership({
          divisionId: division.id,
          seasonId: adminSeasonId,
          divisionLevelId: importLevelId,
          name: entry.name,
          email: entry.email || undefined,
        });
        created.push({
          userId: result.userId,
          name: entry.name,
          email: entry.email,
          levelId: importLevelId,
        });
      }
      setPendingNewPlayers((current) => [
        ...created,
        ...current.filter((existing) => !created.some((row) => row.userId === existing.userId)),
      ]);
      setImportOpen(false);
      setImportText("");
    } catch (e) {
      // Keep whatever landed before the failure so the roster reflects reality.
      if (created.length > 0) {
        setPendingNewPlayers((current) => [
          ...created,
          ...current.filter((existing) => !created.some((row) => row.userId === existing.userId)),
        ]);
      }
      setPageError(
        (e as { message?: string }).message ||
          `Imported ${created.length} of ${importEntries.length} players before failing.`,
      );
    } finally {
      setImporting(false);
    }
  }

  function openPlayerDetail(row: RosterRow) {
    const p = row.player;
    setNeedsMergeForUserId(p.id);
    setMergeSourceUserId("");
    setSelectedMatchIds([]);
    setEditName(p.displayName ?? "");
    setEditEmail(p.email ?? "");
    setEditPhone(p.phone ?? "");
    setEditRole(row.membership?.role === "division_leader" ? "division_leader" : "player");
    setEditStatus(row.membership?.status === "waitlisted" ? "waitlisted" : "active");
    setEditDivisionLevelId(effectiveLevelId(row) || adminSeasonLevels[0]?.id || "");
    setEditingPlayerId(p.id);
    setLinkActionMessage(null);
    setExpandedPlayerId((current) => (current === p.id ? null : p.id));
  }

  const noLevelsYet = adminSeasonLevels.length === 0;

  return (
    <div style={styles.page}>
      <AppNav active="admin" />

      <main style={styles.main}>
        <div style={styles.adminHeader}>
          <div style={styles.headerTitleGroup}>
            <h1 style={styles.pageTitle}>Division admin</h1>
            {division && !loading ? (
              <label style={styles.headerSeason}>
                <span style={styles.srOnly}>Season</span>
                <select
                  style={styles.headerSelect}
                  value={adminSeasonId}
                  onChange={(e) => setAdminSeasonId(e.target.value)}
                  aria-label="Season"
                >
                  {seasonOptions.map((season) => (
                    <option key={season.id} value={season.id}>
                      {season.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
          <button
            type="button"
            style={styles.btnSecondary}
            onClick={() => setViewAsUser((current) => !current)}
          >
            {viewAsUser ? "Exit user view" : "View as user"}
          </button>
        </div>

        {division && !loading && !viewAsUser ? (
          <p style={styles.headerSummary}>
            {rosterRows.length} player{rosterRows.length === 1 ? "" : "s"} ·{" "}
            {adminSeasonLevels.length} division level{adminSeasonLevels.length === 1 ? "" : "s"} ·{" "}
            {unassignedCount} unassigned
          </p>
        ) : null}

        {error ? (
          <div role="alert" style={styles.error}>
            <p style={{ margin: 0 }}>{error}</p>
            <PermissionHints
              hints={divisionAccessDenied ? DIVISION_ACCESS_HINTS : null}
              authDebug={authDebug}
            />
          </div>
        ) : null}

        {loading ? (
          <div style={styles.placeholder}>Loading…</div>
        ) : !division ? (
          <div style={styles.card}>
            <h2 style={styles.sectionTitle}>Create your division</h2>
            <p style={styles.hint}>
              You are not currently managing a division. Create one to get
              started.
            </p>
            <div style={styles.row}>
              <input
                style={styles.input}
                value={newDivisionName}
                onChange={(e) => setNewDivisionName(e.target.value)}
                placeholder="Division name (e.g. Office A)"
              />
              <button
                style={styles.btn}
                onClick={createDivision}
                disabled={!newDivisionName.trim()}
              >
                Create division
              </button>
            </div>
          </div>
        ) : viewAsUser ? (
          <div style={styles.card}>
            <h2 style={styles.sectionTitle}>{division.name}</h2>
            <p style={styles.hint}>User preview: admin-only setup, repair, export, and edit controls are hidden.</p>
            <p style={styles.hint}>
              {rosterRows.length} player{rosterRows.length !== 1 ? "s" : ""} visible to users in {adminSeason.name}.
            </p>
          </div>
        ) : (
          <>
            <div style={styles.tabBar} role="tablist" aria-label="Admin sections">
              {TABS.map((tab) => {
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    id={`admin-tab-${tab.id}`}
                    aria-selected={active}
                    aria-controls={`admin-panel-${tab.id}`}
                    style={{ ...styles.tab, ...(active ? styles.tabActive : {}) }}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {activeTab === "roster" ? (
              <div
                role="tabpanel"
                id="admin-panel-roster"
                aria-labelledby="admin-tab-roster"
              >
                {unassignedCount > 0 && rosterFilter !== "unassigned" ? (
                  <div style={styles.warnBanner}>
                    <span style={styles.warnBannerText}>
                      {unassignedCount} player{unassignedCount === 1 ? " has" : "s have"} no
                      division for {adminSeason.name}. They won&rsquo;t appear in any schedule.
                    </span>
                    <button
                      type="button"
                      style={styles.warnBannerBtn}
                      onClick={() => setRosterFilter("unassigned")}
                    >
                      Review them
                    </button>
                  </div>
                ) : null}

                <div style={styles.card}>
                  <div style={styles.toolbar}>
                    <input
                      style={styles.searchInput}
                      type="search"
                      value={rosterSearch}
                      onChange={(e) => setRosterSearch(e.target.value)}
                      placeholder="Search name or email"
                      aria-label="Search players by name or email"
                    />
                    <div style={styles.chipRow}>
                      <button
                        type="button"
                        style={{
                          ...styles.chip,
                          ...(rosterFilter === "all" ? styles.chipActive : {}),
                        }}
                        aria-pressed={rosterFilter === "all"}
                        onClick={() => setRosterFilter("all")}
                      >
                        All {rosterRows.length}
                      </button>
                      <button
                        type="button"
                        style={{
                          ...styles.chip,
                          ...(rosterFilter === "unassigned" ? styles.chipActive : {}),
                        }}
                        aria-pressed={rosterFilter === "unassigned"}
                        onClick={() => setRosterFilter("unassigned")}
                      >
                        Unassigned {unassignedCount}
                      </button>
                      {adminSeasonLevels.map((level) => (
                        <button
                          key={level.id}
                          type="button"
                          style={{
                            ...styles.chip,
                            ...(rosterFilter === level.id ? styles.chipActive : {}),
                          }}
                          aria-pressed={rosterFilter === level.id}
                          onClick={() => setRosterFilter(level.id)}
                        >
                          {level.name} {countByLevelId.get(level.id) ?? 0}
                        </button>
                      ))}
                    </div>
                    <div style={styles.toolbarActions}>
                      <button
                        type="button"
                        style={styles.btnSecondary}
                        onClick={() => setImportOpen(true)}
                        disabled={noLevelsYet}
                      >
                        Import roster
                      </button>
                      <button
                        type="button"
                        style={styles.btn}
                        onClick={() => setAddPlayerOpen((open) => !open)}
                        disabled={noLevelsYet}
                        aria-expanded={addPlayerOpen}
                      >
                        {addPlayerOpen ? "Close" : "Add player"}
                      </button>
                    </div>
                  </div>

                  {noLevelsYet ? (
                    <p style={styles.hint}>
                      {adminSeason.name} has no division levels yet. Create one on the Divisions
                      tab before adding players.
                    </p>
                  ) : null}

                  {addPlayerOpen ? (
                    <div style={styles.addPanel}>
                      <div style={styles.addField}>
                        <label style={styles.addLabel} htmlFor="add-player-name">
                          Name
                        </label>
                        <input
                          id="add-player-name"
                          style={styles.input}
                          value={addPlayerName}
                          onChange={(e) => setAddPlayerName(e.target.value)}
                          placeholder="Full name"
                        />
                      </div>
                      <div style={styles.addField}>
                        <label style={styles.addLabel} htmlFor="add-player-email">
                          Email
                        </label>
                        <input
                          id="add-player-email"
                          style={styles.input}
                          type="email"
                          value={addPlayerEmail}
                          onChange={(e) => setAddPlayerEmail(e.target.value)}
                          placeholder="Optional"
                        />
                      </div>
                      <div style={styles.addField}>
                        <label style={styles.addLabel} htmlFor="add-player-level">
                          Division
                        </label>
                        <select
                          id="add-player-level"
                          style={styles.input}
                          value={addPlayerLevelId}
                          onChange={(e) => setAddPlayerLevelId(e.target.value)}
                        >
                          {adminSeasonLevels.map((level) => (
                            <option key={level.id} value={level.id}>
                              {level.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div style={styles.addActions}>
                        <button
                          type="button"
                          style={styles.btn}
                          onClick={handleAddPlayer}
                          disabled={savingNewPlayer || !addPlayerName.trim() || !addPlayerLevelId}
                        >
                          {savingNewPlayer ? "Saving…" : "Save player"}
                        </button>
                        <button
                          type="button"
                          style={styles.btnSecondary}
                          onClick={() => setAddPlayerOpen(false)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <div style={styles.gridWrap}>
                    <div style={{ ...styles.gridRow, ...styles.gridHead }}>
                      <div style={styles.cellCheck}>
                        <input
                          type="checkbox"
                          ref={(node) => {
                            if (node) node.indeterminate = someVisibleSelected;
                          }}
                          checked={allVisibleSelected}
                          aria-label="Select all listed players"
                          disabled={visibleIds.length === 0}
                          onChange={(e) =>
                            setSelectedPlayerIds(e.target.checked ? [...visibleIds] : [])
                          }
                        />
                      </div>
                      <div style={styles.headCell}>Player</div>
                      <div style={styles.headCell}>Email</div>
                      <div style={styles.headCell}>Status</div>
                      <div style={styles.headCell}>Division</div>
                      <div style={styles.headCell} aria-hidden="true" />
                    </div>

                    {visibleRows.length === 0 ? (
                      <p style={styles.emptyState}>No players match this filter.</p>
                    ) : (
                      visibleRows.map((row) => {
                        const p = row.player;
                        const levelId = effectiveLevelId(row);
                        const selected = selectedPlayerIds.includes(p.id);
                        const registered = p.isRegistered !== false;
                        const removeHovered = hoveredRemoveId === p.id;
                        return (
                          <div key={p.id}>
                            <div
                              style={{
                                ...styles.gridRow,
                                ...(selected ? styles.gridRowSelected : {}),
                              }}
                            >
                              <div style={styles.cellCheck}>
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  aria-label={`Select ${p.displayName}`}
                                  onChange={(e) =>
                                    setSelectedPlayerIds((current) =>
                                      e.target.checked
                                        ? [...current, p.id]
                                        : current.filter((id) => id !== p.id),
                                    )
                                  }
                                />
                              </div>
                              <div style={styles.cell}>
                                <button
                                  type="button"
                                  style={styles.playerButton}
                                  onClick={() => openPlayerDetail(row)}
                                  aria-expanded={expandedPlayerId === p.id}
                                  title={`Open details for ${p.displayName}`}
                                >
                                  <span style={styles.avatar} aria-hidden="true">
                                    {initialsOf(p.displayName)}
                                  </span>
                                  <span style={styles.playerName}>{p.displayName}</span>
                                </button>
                              </div>
                              <div style={{ ...styles.cell, ...styles.cellTruncate }}>
                                {p.email && p.contactPreferences?.allowEmail !== false ? (
                                  <a href={`mailto:${p.email}`} style={styles.contactLink}>
                                    {p.email}
                                  </a>
                                ) : (
                                  "—"
                                )}
                              </div>
                              <div style={styles.cell}>
                                <span
                                  style={
                                    registered
                                      ? styles.registeredBadge
                                      : styles.unregisteredBadge
                                  }
                                >
                                  {registered
                                    ? "Registered"
                                    : p.inviteStatus === "invite_sent"
                                      ? "Invite sent"
                                      : "Unregistered"}
                                </span>
                              </div>
                              <div style={styles.cellDivision}>
                                <select
                                  style={{
                                    ...styles.rowSelect,
                                    ...(levelId ? {} : styles.rowSelectUnassigned),
                                  }}
                                  value={levelId}
                                  aria-label={`Division for ${p.displayName}`}
                                  onChange={(e) => assignLevel(row, e.target.value)}
                                >
                                  <option value="">Unassigned</option>
                                  {adminSeasonLevels.map((level) => (
                                    <option key={level.id} value={level.id}>
                                      {level.name}
                                    </option>
                                  ))}
                                  {levelId && !adminSeasonLevels.some((l) => l.id === levelId) ? (
                                    <option value={levelId}>
                                      {levelNameById.get(levelId) ?? "Other level"}
                                    </option>
                                  ) : null}
                                </select>
                                <span role="status" aria-live="polite" style={styles.savedFlag}>
                                  {savedFlashIds.includes(p.id) ? "Saved" : ""}
                                </span>
                              </div>
                              <div style={styles.cellRemove}>
                                <button
                                  type="button"
                                  style={{
                                    ...styles.removeBtn,
                                    ...(removeHovered ? styles.removeBtnHover : {}),
                                  }}
                                  title={`Remove ${p.displayName} from ${adminSeason.name}`}
                                  aria-label={`Remove ${p.displayName} from ${adminSeason.name}`}
                                  onMouseEnter={() => setHoveredRemoveId(p.id)}
                                  onMouseLeave={() => setHoveredRemoveId(null)}
                                  onFocus={() => setHoveredRemoveId(p.id)}
                                  onBlur={() => setHoveredRemoveId(null)}
                                  onClick={() => removeFromRoster(row)}
                                >
                                  ×
                                </button>
                              </div>
                            </div>

                            {expandedPlayerId === p.id ? (
                              <div style={styles.detailPanel}>
                                <div style={styles.inlineEditor}>
                                  <input
                                    style={{ ...styles.input, ...styles.editorInput }}
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    placeholder="Name"
                                    type="text"
                                    aria-label="Update player name"
                                  />
                                  <input
                                    style={{ ...styles.input, ...styles.editorInput }}
                                    value={editPhone}
                                    onChange={(e) => setEditPhone(e.target.value)}
                                    placeholder="Update player phone (optional)"
                                    type="tel"
                                    aria-label="Update player phone"
                                  />
                                  <select
                                    style={{ ...styles.input, ...styles.editorInput }}
                                    value={editRole}
                                    aria-label="Update player role"
                                    onChange={(e) =>
                                      setEditRole(e.target.value as "player" | "division_leader")
                                    }
                                  >
                                    <option value="player">Player</option>
                                    <option value="division_leader">Leader</option>
                                  </select>
                                  <select
                                    style={{ ...styles.input, ...styles.editorInput }}
                                    value={editStatus}
                                    aria-label="Update player status"
                                    onChange={(e) =>
                                      setEditStatus(e.target.value as "active" | "waitlisted")
                                    }
                                  >
                                    <option value="active">Active</option>
                                    <option value="waitlisted">Waitlisted</option>
                                  </select>
                                  <select
                                    style={{ ...styles.input, ...styles.editorInput }}
                                    value={editDivisionLevelId}
                                    aria-label="Update player division level"
                                    onChange={(e) => setEditDivisionLevelId(e.target.value)}
                                  >
                                    {adminSeasonLevels.map((level) => (
                                      <option key={level.id} value={level.id}>
                                        {level.name}
                                      </option>
                                    ))}
                                  </select>
                                  <input
                                    style={{ ...styles.input, ...styles.editorInput }}
                                    value={editEmail}
                                    onChange={(e) => setEditEmail(e.target.value)}
                                    placeholder="Update player email (optional)"
                                    aria-label="Update player email"
                                  />
                                  <p style={styles.linkPrompt}>
                                    Which of the recorded matches did {p.displayName} play in?
                                  </p>
                                  <div style={styles.editorActions}>
                                    <button
                                      style={styles.btn}
                                      onClick={handleSavePlayerRow}
                                      disabled={
                                        merging ||
                                        needsMergeForUserId !== p.id ||
                                        !editName.trim() ||
                                        !editDivisionLevelId
                                      }
                                    >
                                      {merging ? "Saving…" : "Save player"}
                                    </button>
                                    <button
                                      style={styles.btn}
                                      onClick={handleMergeRecords}
                                      disabled={
                                        selectedMatchIds.length === 0 ||
                                        merging ||
                                        needsMergeForUserId !== p.id
                                      }
                                    >
                                      {merging ? "Linking…" : "Link selected matches"}
                                    </button>
                                    <button
                                      style={styles.btnSecondary}
                                      onClick={handleUpdatePlayerEmail}
                                      disabled={
                                        merging ||
                                        !editEmail.trim() ||
                                        needsMergeForUserId !== p.id
                                      }
                                    >
                                      Update contact
                                    </button>
                                    <button
                                      style={styles.btnSecondary}
                                      onClick={undoLastLink}
                                      disabled={!lastLinkAction?.sourceUserId || merging}
                                    >
                                      Undo last link
                                    </button>
                                    {linkActionMessage?.targetUserId === p.id && (
                                      <div style={styles.confirmPrompt}>
                                        <p style={styles.inlineSuccess}>
                                          {linkActionMessage.message}
                                        </p>
                                        <button
                                          type="button"
                                          style={styles.btn}
                                          onClick={() => setLinkActionMessage(null)}
                                        >
                                          Confirm
                                        </button>
                                        <button
                                          type="button"
                                          style={styles.btnSecondary}
                                          onClick={
                                            linkActionMessage.kind === "contact"
                                              ? undoLastContact
                                              : undoLastLink
                                          }
                                          disabled={
                                            merging ||
                                            (linkActionMessage.kind === "link" &&
                                              !lastLinkAction?.sourceUserId)
                                          }
                                        >
                                          Undo action
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                  <div style={styles.matchChecklist}>
                                    {candidateMatches.length > 0 ? (
                                      candidateMatches.map((m) => (
                                        <label
                                          key={m.id}
                                          style={{ display: "block", marginBottom: 6 }}
                                        >
                                          <input
                                            type="checkbox"
                                            checked={selectedMatchIds.includes(m.id)}
                                            onChange={(e) =>
                                              setSelectedMatchIds((prev) =>
                                                e.target.checked
                                                  ? [...prev, m.id]
                                                  : prev.filter((id) => id !== m.id),
                                              )
                                            }
                                          />{" "}
                                          {m.player1Name || "P1"} vs {m.player2Name || "P2"}
                                        </label>
                                      ))
                                    ) : (
                                      <p style={styles.hint}>
                                        No recorded matches are available. Matches already linked
                                        to two player profiles are hidden.
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        );
                      })
                    )}
                  </div>

                  <p style={styles.tableFooter}>
                    {isFiltered
                      ? `Showing ${visibleRows.length} of ${rosterRows.length} players`
                      : `${rosterRows.length} player${rosterRows.length === 1 ? "" : "s"} in ${adminSeason.name}`}
                  </p>
                </div>
              </div>
            ) : null}

            {activeTab === "divisions" ? (
              <div
                role="tabpanel"
                id="admin-panel-divisions"
                aria-labelledby="admin-tab-divisions"
              >
                <div style={styles.card}>
                  <h2 style={styles.sectionTitle}>Division levels · {adminSeason.name}</h2>
                  <p style={styles.hint}>
                    Each level groups players for standings and scheduling within this season.
                  </p>
                  {divisionLevelsError ? (
                    <div role="alert" style={styles.error}>
                      <p style={{ margin: 0 }}>
                        Unable to load division levels for {division.name}.{" "}
                        {divisionLevelsError.message}
                      </p>
                      <PermissionHints hints={divisionLevelsPermissionHint} authDebug={authDebug} />
                    </div>
                  ) : null}
                  {loadingDivisionLevels ? (
                    <p style={styles.hint}>Loading division levels…</p>
                  ) : (
                    <div style={styles.levelGrid}>
                      {adminSeasonLevels.map((level) => (
                        <div key={level.id} style={styles.levelCard}>
                          <strong style={styles.levelCardName}>{level.name}</strong>
                          <span style={styles.levelCardMeta}>
                            {level.matchType === "doubles" ? "Doubles" : "Singles"}
                          </span>
                          <span style={styles.levelCardCount}>
                            {countByLevelId.get(level.id) ?? 0} player
                            {(countByLevelId.get(level.id) ?? 0) === 1 ? "" : "s"}
                          </span>
                          {level.description ? (
                            <span style={styles.levelCardMeta}>{level.description}</span>
                          ) : null}
                        </div>
                      ))}
                      <button
                        type="button"
                        style={styles.levelCardNew}
                        onClick={() => setLevelFormOpen((open) => !open)}
                        aria-expanded={levelFormOpen}
                      >
                        + New division level
                      </button>
                    </div>
                  )}

                  {levelFormOpen ? (
                    <div style={styles.addPanel}>
                      <div style={styles.addField}>
                        <label style={styles.addLabel} htmlFor="level-skill">
                          Skill level
                        </label>
                        <select
                          id="level-skill"
                          style={styles.input}
                          value={levelSkill}
                          onChange={(e) => {
                            const skill = e.target.value as DivisionSkillLevel;
                            setLevelSkill(skill);
                            setLevelName(formatDivisionLevelName(skill, levelMatchType));
                          }}
                        >
                          <option value="beginner">Beginner</option>
                          <option value="intermediate">Intermediate</option>
                          <option value="advanced">Advanced</option>
                          <option value="open">Open</option>
                        </select>
                      </div>
                      <div style={styles.addField}>
                        <label style={styles.addLabel} htmlFor="level-match-type">
                          Format
                        </label>
                        <select
                          id="level-match-type"
                          style={styles.input}
                          value={levelMatchType}
                          onChange={(e) => {
                            const matchType = e.target.value as DivisionMatchType;
                            setLevelMatchType(matchType);
                            setLevelName(formatDivisionLevelName(levelSkill, matchType));
                          }}
                        >
                          <option value="singles">Singles</option>
                          <option value="doubles">Doubles</option>
                        </select>
                      </div>
                      <div style={styles.addField}>
                        <label style={styles.addLabel} htmlFor="level-name">
                          Level name
                        </label>
                        <input
                          id="level-name"
                          style={styles.input}
                          value={levelName}
                          onChange={(e) => setLevelName(e.target.value)}
                        />
                      </div>
                      <div style={styles.addField}>
                        <label style={styles.addLabel} htmlFor="level-description">
                          Description
                        </label>
                        <input
                          id="level-description"
                          style={styles.input}
                          value={levelDescription}
                          onChange={(e) => setLevelDescription(e.target.value)}
                          placeholder="Eligibility notes (optional)"
                        />
                      </div>
                      <div style={styles.addActions}>
                        <button
                          type="button"
                          style={styles.btn}
                          onClick={handleCreateLevel}
                          disabled={savingLevel || !levelName.trim()}
                        >
                          {savingLevel ? "Saving…" : "Save level"}
                        </button>
                        <button
                          type="button"
                          style={styles.btnSecondary}
                          onClick={() => setLevelFormOpen(false)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : null}
                  {levelMessage && (
                    <p role="status" aria-live="polite" style={styles.success}>
                      {levelMessage}
                    </p>
                  )}
                </div>
              </div>
            ) : null}

            {activeTab === "tools" ? (
              <div role="tabpanel" id="admin-panel-tools" aria-labelledby="admin-tab-tools">
                <div style={styles.toolGrid}>
                  <div style={styles.toolCard}>
                    <h2 style={styles.toolTitle}>Round-robin scheduler</h2>
                    <p style={styles.toolDesc}>
                      Generate and publish a full fixture list for one division level.
                    </p>
                    <button
                      type="button"
                      style={styles.btn}
                      onClick={() =>
                        setOpenToolPanel((current) =>
                          current === "scheduler" ? null : "scheduler",
                        )
                      }
                      aria-expanded={openToolPanel === "scheduler"}
                    >
                      {openToolPanel === "scheduler" ? "Close scheduler" : "Open scheduler"}
                    </button>
                  </div>

                  <div style={styles.toolCard}>
                    <h2 style={styles.toolTitle}>Reported messages</h2>
                    <p style={styles.toolDesc}>
                      Review messages players flagged in your division.
                    </p>
                    <button
                      type="button"
                      style={styles.btn}
                      onClick={() =>
                        setOpenToolPanel((current) => (current === "reports" ? null : "reports"))
                      }
                      aria-expanded={openToolPanel === "reports"}
                    >
                      {openToolPanel === "reports" ? "Close queue" : `Review (${messageReports.length})`}
                    </button>
                  </div>

                  <div style={styles.toolCard}>
                    <h2 style={styles.toolTitle}>Ranking repair</h2>
                    <p style={styles.toolDesc}>
                      Rebuild standings and head-to-heads from completed matches.
                    </p>
                    <button
                      type="button"
                      style={styles.btn}
                      onClick={repairRankings}
                      disabled={repairingRankings}
                    >
                      {repairingRankings ? "Repairing…" : "Repair rankings"}
                    </button>
                  </div>

                  <div style={styles.toolCard}>
                    <h2 style={styles.toolTitle}>CSV exports</h2>
                    <p style={styles.toolDesc}>
                      Download {adminSeason.name} matches or standings as a spreadsheet.
                    </p>
                    <div style={styles.toolActions}>
                      <button
                        type="button"
                        style={styles.btn}
                        onClick={() => handleExportCsv("matches")}
                        disabled={exportingCsv}
                      >
                        Matches
                      </button>
                      <button
                        type="button"
                        style={styles.btnSecondary}
                        onClick={() => handleExportCsv("rankings")}
                        disabled={exportingCsv}
                      >
                        Rankings
                      </button>
                    </div>
                  </div>
                </div>

                {repairMessage && (
                  <p role="status" aria-live="polite" style={styles.success}>
                    {repairMessage}
                  </p>
                )}
                {csvMessage && (
                  <p role="status" aria-live="polite" style={styles.success}>
                    {csvMessage}
                  </p>
                )}

                {openToolPanel === "scheduler" ? (
                  <div style={styles.card}>
                    <h2 style={styles.sectionTitle}>Round-robin scheduler</h2>
                    <p style={styles.hint}>
                      Building a fixture list for {adminSeason.name}. Change the season in the
                      page header to schedule a different one.
                    </p>
                    <div style={styles.row}>
                      <label style={styles.filterLabel}>
                        Division level
                        <select
                          style={styles.input}
                          value={rrDivisionLevelId}
                          onChange={(e) => {
                            setRrDivisionLevelId(e.target.value);
                            setRrPreview(null);
                          }}
                          disabled={adminSeasonLevels.length === 0}
                        >
                          {adminSeasonLevels.length === 0 ? (
                            <option value="">No levels for this season</option>
                          ) : (
                            adminSeasonLevels.map((level) => (
                              <option key={level.id} value={level.id}>
                                {level.name}
                              </option>
                            ))
                          )}
                        </select>
                      </label>
                    </div>

                    <p style={styles.subTitle}>
                      Players ({rrSelectedPlayerIds.length} selected)
                    </p>
                    {rrMemberships.length === 0 ? (
                      <p style={styles.hint}>No active players in this season/level yet.</p>
                    ) : (
                      <div style={styles.levelGrid}>
                        {rrMemberships.map((m) => {
                          const selected = rrSelectedPlayerIds.includes(m.userId);
                          return (
                            <button
                              type="button"
                              key={m.userId}
                              style={{
                                ...styles.playerToggle,
                                ...(selected ? styles.playerToggleActive : {}),
                              }}
                              onClick={() => toggleRrPlayer(m.userId)}
                            >
                              {selected ? "✓ " : ""}
                              {m.displayNameSnapshot}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    <p style={styles.subTitle}>Format</p>
                    <div style={styles.row}>
                      <select
                        style={styles.input}
                        value={rrDoubleRoundRobin ? "double" : "single"}
                        onChange={(e) => {
                          setRrDoubleRoundRobin(e.target.value === "double");
                          setRrPreview(null);
                        }}
                        aria-label="Round-robin format"
                      >
                        <option value="single">Single round robin</option>
                        <option value="double">Double round robin</option>
                      </select>
                      <select
                        style={styles.input}
                        value={rrIntervalDays}
                        onChange={(e) => setRrIntervalDays(Number(e.target.value))}
                        aria-label="Round interval"
                      >
                        {[3, 7, 14].map((days) => (
                          <option key={days} value={days}>
                            Every {days} days
                          </option>
                        ))}
                      </select>
                      <input
                        style={styles.input}
                        type="text"
                        value={rrStartDate}
                        onChange={(e) => setRrStartDate(e.target.value)}
                        placeholder="Round 1 start date (YYYY-MM-DD)"
                        aria-label="Round 1 start date"
                      />
                    </div>
                    <label style={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        checked={rrSeedByRankings}
                        onChange={(e) => {
                          setRrSeedByRankings(e.target.checked);
                          setRrPreview(null);
                        }}
                      />
                      Seed pairings by current ranking
                    </label>
                    <label style={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        checked={rrClearExisting}
                        onChange={(e) => setRrClearExisting(e.target.checked)}
                      />
                      Clear previously generated schedule for this level
                    </label>

                    {rrSelectedLevelIsDoubles && (
                      <p style={styles.hint}>
                        Round-robin scheduling is not yet available for doubles levels. Create
                        doubles matches from the Matches page instead.
                      </p>
                    )}

                    <div style={styles.editorActions}>
                      <button
                        style={styles.btnSecondary}
                        onClick={handleRrGeneratePreview}
                        disabled={rrSelectedLevelIsDoubles}
                      >
                        Generate preview
                      </button>
                    </div>

                    {rrPreview && (
                      <div style={styles.mergeBox}>
                        <p style={styles.subTitle}>
                          Preview — {rrPreview.length} match{rrPreview.length === 1 ? "" : "es"}
                        </p>
                        {Array.from(new Set(rrPreview.map((m) => m.round))).map((round) => (
                          <div key={round} style={{ marginBottom: 10 }}>
                            <p
                              style={{
                                ...styles.hint,
                                fontWeight: 700,
                                color: "var(--green-dark)",
                                marginBottom: 4,
                              }}
                            >
                              Round {round}
                            </p>
                            {rrPreview
                              .filter((m) => m.round === round)
                              .map((m, idx) => (
                                <p key={idx} style={{ ...styles.hint, marginBottom: 2 }}>
                                  {rrNameById.get(m.player1Id) ?? m.player1Id} vs{" "}
                                  {rrNameById.get(m.player2Id) ?? m.player2Id}
                                </p>
                              ))}
                          </div>
                        ))}
                        <button style={styles.btn} onClick={handleRrPublish} disabled={rrPublishing}>
                          {rrPublishing ? "Publishing…" : "Publish schedule"}
                        </button>
                      </div>
                    )}
                    {rrMessage && (
                      <p role="status" aria-live="polite" style={styles.success}>
                        {rrMessage}
                      </p>
                    )}
                  </div>
                ) : null}

                {openToolPanel === "reports" ? (
                  <div style={styles.card}>
                    <h2 style={styles.sectionTitle}>Reported messages</h2>
                    {messageReports.length === 0 ? (
                      <p style={styles.hint}>No pending reports.</p>
                    ) : (
                      messageReports.map((report) => (
                        <div key={report.id} style={styles.mergeBox}>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              gap: 8,
                            }}
                          >
                            <strong>{report.messageSenderName}</strong>
                            <span style={styles.unregisteredBadge}>
                              {REPORT_REASON_LABELS[report.reason] ?? report.reason}
                            </span>
                          </div>
                          <p style={styles.hint}>&ldquo;{report.messageContent}&rdquo;</p>
                          {report.note && <p style={styles.hint}>Reporter note: {report.note}</p>}
                          <div style={styles.editorActions}>
                            <button
                              style={styles.dangerBtn}
                              onClick={() => handleResolveReport(report, "remove")}
                              disabled={resolvingReportId === report.id}
                            >
                              Remove message
                            </button>
                            <button
                              style={styles.btnSecondary}
                              onClick={() => handleResolveReport(report, "dismiss")}
                              disabled={resolvingReportId === report.id}
                            >
                              Dismiss
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </main>

      {activeTab === "roster" && !viewAsUser && selectedVisibleIds.length > 0 ? (
        <div style={styles.bulkBar}>
          <span style={styles.bulkCount}>
            {selectedVisibleIds.length} player{selectedVisibleIds.length === 1 ? "" : "s"} selected
          </span>
          <span style={styles.bulkDivider} aria-hidden="true" />
          <label style={styles.bulkAssign}>
            Assign to
            <select
              style={styles.bulkSelect}
              value={bulkLevelId}
              onChange={(e) => setBulkLevelId(e.target.value)}
              aria-label="Assign selected players to division"
            >
              {adminSeasonLevels.map((level) => (
                <option key={level.id} value={level.id}>
                  {level.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            style={styles.bulkApply}
            onClick={applyBulkAssign}
            disabled={bulkApplying || !bulkLevelId}
          >
            {bulkApplying ? "Applying…" : "Apply"}
          </button>
          <button
            type="button"
            style={styles.bulkClear}
            onClick={() => setSelectedPlayerIds([])}
          >
            Clear
          </button>
        </div>
      ) : null}

      {importOpen ? (
        <div style={styles.modalOverlay} role="dialog" aria-modal="true" aria-labelledby="import-title">
          <div style={styles.modal}>
            <h2 id="import-title" style={styles.sectionTitle}>
              Import roster
            </h2>
            <p style={styles.hint}>
              Paste one player per line as <code>Name, email</code>. The email is optional.
            </p>
            <label style={styles.addLabel} htmlFor="import-textarea">
              Players
            </label>
            <textarea
              id="import-textarea"
              style={styles.textarea}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={"Ann Smith, ann@example.com\nBob Jones, bob@example.com"}
              rows={9}
            />
            <div style={styles.addField}>
              <label style={styles.addLabel} htmlFor="import-level">
                Assign to
              </label>
              <select
                id="import-level"
                style={styles.input}
                value={importLevelId}
                onChange={(e) => setImportLevelId(e.target.value)}
              >
                {adminSeasonLevels.map((level) => (
                  <option key={level.id} value={level.id}>
                    {level.name}
                  </option>
                ))}
              </select>
            </div>
            <p style={styles.importCount} role="status" aria-live="polite">
              {importEntries.length} player{importEntries.length === 1 ? "" : "s"} detected
            </p>
            <div style={styles.addActions}>
              <button
                type="button"
                style={styles.btnSecondary}
                onClick={() => setImportOpen(false)}
                disabled={importing}
              >
                Cancel
              </button>
              <button
                type="button"
                style={styles.btn}
                onClick={handleImportRoster}
                disabled={importing || importEntries.length === 0 || !importLevelId}
              >
                {importing ? "Importing…" : "Import"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// The amber pair below (#fff3cd / #856404) is the warning tint this app already uses for the
// leader badge; the unassigned states reuse it rather than introducing a new state color.
const WARN_BG = "#fff3cd";
const WARN_FG = "#856404";
const DANGER = "#c0392b";

const styles: Record<string, React.CSSProperties> = {
  page: appNavStyles.page,
  main: { maxWidth: 1200, margin: "0 auto", padding: "40px 24px 120px" },
  adminHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 4, flexWrap: "wrap" as const },
  headerTitleGroup: { display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" as const },
  headerSeason: { display: "inline-flex", alignItems: "center" },
  headerSelect: {
    border: "1px solid #ddd",
    borderRadius: 10,
    padding: "8px 12px",
    fontSize: 14,
    fontWeight: 600,
    color: "var(--green-dark)",
    background: "#fff",
  },
  headerSummary: { fontSize: 14, color: "var(--muted)", marginBottom: 20 },
  srOnly: {
    position: "absolute" as const,
    width: 1,
    height: 1,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap" as const,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: 800,
    color: "var(--green-dark)",
    marginBottom: 0,
  },
  tabBar: {
    display: "flex",
    gap: 4,
    borderBottom: "1px solid #e7e7e7",
    marginBottom: 20,
    flexWrap: "wrap" as const,
  },
  tab: {
    background: "transparent",
    border: "none",
    borderBottom: "2px solid transparent",
    padding: "10px 16px",
    fontSize: 15,
    fontWeight: 600,
    color: "var(--muted)",
    cursor: "pointer",
    marginBottom: -1,
  },
  tabActive: {
    color: "var(--green-dark)",
    borderBottom: "2px solid var(--green-dark)",
  },
  placeholder: {
    color: "var(--muted)",
    padding: 40,
    textAlign: "center" as const,
  },
  card: {
    background: "#fff",
    borderRadius: 14,
    padding: 28,
    width: "100%",
    maxWidth: "none",
    marginBottom: 20,
    boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 700,
    color: "var(--green-dark)",
    marginBottom: 8,
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  subTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: "#444",
    margin: "20px 0 10px",
  },
  hint: { fontSize: 14, color: "var(--muted)", marginBottom: 16 },
  mergeBox: { marginTop: 12, borderTop: "1px solid #eee", paddingTop: 8 },

  warnBanner: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap" as const,
    background: WARN_BG,
    color: WARN_FG,
    borderRadius: 14,
    padding: "14px 20px",
    marginBottom: 16,
  },
  warnBannerText: { fontSize: 14, fontWeight: 600, flex: 1, minWidth: 220 },
  warnBannerBtn: {
    background: "transparent",
    color: WARN_FG,
    border: `1px solid ${WARN_FG}`,
    borderRadius: 10,
    padding: "8px 16px",
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
  },

  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap" as const,
    marginBottom: 16,
  },
  searchInput: {
    border: "1px solid #ddd",
    borderRadius: 10,
    padding: "10px 14px",
    fontSize: 14,
    minWidth: 200,
    flex: "0 1 240px",
  },
  chipRow: { display: "flex", gap: 8, flexWrap: "wrap" as const, flex: 1, minWidth: 0 },
  chip: {
    border: "1px solid #ddd",
    borderRadius: 999,
    padding: "7px 14px",
    fontSize: 13,
    fontWeight: 600,
    color: "#555",
    background: "#fff",
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
  },
  chipActive: {
    background: "var(--green-dark)",
    borderColor: "var(--green-dark)",
    color: "#fff",
  },
  toolbarActions: { display: "flex", gap: 10, flexWrap: "wrap" as const, marginLeft: "auto" },

  addPanel: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
    alignItems: "end",
    border: "1px solid #e7e7e7",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  addField: { display: "grid", gap: 6, minWidth: 0 },
  addLabel: { fontSize: 12, fontWeight: 700, color: "#555", textTransform: "uppercase" as const, letterSpacing: 0.4 },
  addActions: { display: "flex", gap: 10, flexWrap: "wrap" as const, alignItems: "center" },

  gridWrap: { width: "100%", minWidth: 0 },
  gridRow: {
    display: "grid",
    gridTemplateColumns:
      "40px minmax(0, 2fr) minmax(0, 2.2fr) minmax(0, 1fr) minmax(0, 1.6fr) 44px",
    alignItems: "center",
    gap: 12,
    padding: "10px 8px",
    borderBottom: "1px solid #f5f5f5",
  },
  gridHead: { borderBottom: "2px solid #f0f0f0", padding: "8px" },
  gridRowSelected: { background: "#f7fbf7" },
  headCell: {
    fontSize: 12,
    fontWeight: 700,
    color: "#999",
    textTransform: "uppercase" as const,
    minWidth: 0,
  },
  cell: { fontSize: 14, color: "#333", minWidth: 0 },
  cellTruncate: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const },
  cellCheck: { display: "flex", alignItems: "center", justifyContent: "center" },
  cellDivision: { display: "flex", alignItems: "center", gap: 8, minWidth: 0 },
  cellRemove: { display: "flex", justifyContent: "flex-end" },
  playerButton: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: "transparent",
    border: "none",
    padding: 0,
    textAlign: "left" as const,
    cursor: "pointer",
    minWidth: 0,
    width: "100%",
  },
  avatar: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 32,
    height: 32,
    flexShrink: 0,
    borderRadius: "50%",
    background: "#e8f5e9",
    color: "var(--green-dark)",
    fontSize: 12,
    fontWeight: 700,
  },
  playerName: {
    fontSize: 14,
    fontWeight: 600,
    color: "#333",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  rowSelect: {
    border: "1px solid #ddd",
    borderRadius: 10,
    padding: "7px 10px",
    fontSize: 13,
    background: "#fff",
    color: "#333",
    minWidth: 0,
    flex: 1,
  },
  rowSelectUnassigned: {
    border: `1px solid ${WARN_FG}`,
    background: WARN_BG,
    color: WARN_FG,
    fontWeight: 700,
  },
  savedFlag: { fontSize: 12, fontWeight: 700, color: "#1a7f37", whiteSpace: "nowrap" as const, minWidth: 38 },
  removeBtn: {
    background: "transparent",
    border: "none",
    color: "#bbb",
    fontSize: 20,
    lineHeight: 1,
    padding: "2px 8px",
    borderRadius: 8,
    cursor: "pointer",
  },
  removeBtnHover: { color: DANGER },
  emptyState: { fontSize: 14, color: "var(--muted)", padding: "28px 8px", textAlign: "center" as const },
  tableFooter: { fontSize: 13, color: "var(--muted)", marginTop: 14 },
  detailPanel: { background: "#fcfcfc", borderBottom: "1px solid #f5f5f5", padding: 16 },

  inlineEditor: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
    alignItems: "center",
    maxWidth: "100%",
  },
  editorInput: { boxSizing: "border-box" as const, minWidth: 0, width: "100%" },
  editorActions: {
    gridColumn: "1 / -1",
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
  },
  linkPrompt: { gridColumn: "1 / -1", margin: 0, fontSize: 14, color: "#444", alignSelf: "center" },
  matchChecklist: {
    gridColumn: "1 / -1",
    borderTop: "1px solid #eee",
    paddingTop: 8,
  },
  row: { display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 },
  filterLabel: { display: "grid", gap: 6, fontSize: 12, fontWeight: 700, color: "#555", textTransform: "uppercase" as const, letterSpacing: 0.4 },
  input: {
    flex: 1,
    border: "1px solid #ddd",
    borderRadius: 10,
    padding: "10px 14px",
    fontSize: 14,
    minWidth: 0,
  },
  textarea: {
    width: "100%",
    border: "1px solid #ddd",
    borderRadius: 10,
    padding: "10px 14px",
    fontSize: 14,
    fontFamily: "inherit",
    marginBottom: 12,
    resize: "vertical" as const,
  },
  importCount: { fontSize: 13, fontWeight: 600, color: "var(--muted)", margin: "10px 0 16px" },
  btn: {
    background: "var(--green-dark)",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    padding: "10px 20px",
    fontWeight: 600,
    fontSize: 14,
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
  },
  btnSecondary: {
    background: "#fff",
    color: "var(--green-dark)",
    border: "1px solid var(--green-dark)",
    borderRadius: 10,
    padding: "10px 20px",
    fontWeight: 600,
    fontSize: 14,
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
  },
  error: { marginTop: 10, marginBottom: 10, color: DANGER, fontSize: 13 },
  errorList: { margin: "6px 0 0 18px", padding: 0, display: "grid", gap: 4 },
  errorMeta: { margin: "8px 0 0", fontSize: 12, color: "#8b0000" },
  success: { marginTop: 10, color: "#1a7f37", fontSize: 13 },
  confirmPrompt: { flexBasis: "100%", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" },
  inlineSuccess: {
    flexBasis: "100%",
    margin: "0 0 4px",
    color: "#1a7f37",
    fontSize: 13,
    fontWeight: 600,
  },

  levelGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, margin: "14px 0" },
  levelCard: { border: "1px solid #e7e7e7", borderRadius: 12, padding: 16, display: "grid", gap: 6, fontSize: 13, color: "#555", alignContent: "start" },
  levelCardName: { fontSize: 15, color: "var(--green-dark)" },
  levelCardMeta: { fontSize: 13, color: "var(--muted)" },
  levelCardCount: { fontSize: 13, fontWeight: 700, color: "#444" },
  levelCardNew: {
    border: "1px dashed #bbb",
    borderRadius: 12,
    padding: 16,
    background: "transparent",
    color: "var(--green-dark)",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    minHeight: 96,
  },

  toolGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 20,
    marginBottom: 20,
  },
  toolCard: {
    background: "#fff",
    borderRadius: 14,
    padding: 24,
    boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
    display: "grid",
    gap: 10,
    alignContent: "start",
  },
  toolTitle: { fontSize: 17, fontWeight: 700, color: "var(--green-dark)", margin: 0 },
  toolDesc: { fontSize: 14, color: "var(--muted)", margin: 0, minHeight: 42 },
  toolActions: { display: "flex", gap: 10, flexWrap: "wrap" as const },

  bulkBar: {
    position: "fixed" as const,
    left: "50%",
    bottom: 24,
    transform: "translateX(-50%)",
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap" as const,
    maxWidth: "calc(100vw - 32px)",
    background: "var(--green-dark)",
    color: "#fff",
    borderRadius: 14,
    padding: "12px 20px",
    boxShadow: "0 6px 24px rgba(0,0,0,0.2)",
    zIndex: 40,
  },
  bulkCount: { fontSize: 14, fontWeight: 700, whiteSpace: "nowrap" as const },
  bulkDivider: { width: 1, height: 22, background: "rgba(255,255,255,0.3)" },
  bulkAssign: { display: "flex", alignItems: "center", gap: 8, fontSize: 14, whiteSpace: "nowrap" as const },
  bulkSelect: {
    border: "none",
    borderRadius: 10,
    padding: "8px 12px",
    fontSize: 13,
    fontWeight: 600,
    color: "var(--green-dark)",
    background: "#fff",
    maxWidth: 200,
  },
  bulkApply: {
    background: "#fff",
    color: "var(--green-dark)",
    border: "none",
    borderRadius: 10,
    padding: "9px 18px",
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
  },
  bulkClear: {
    background: "transparent",
    color: "#fff",
    border: "1px solid rgba(255,255,255,0.5)",
    borderRadius: 10,
    padding: "9px 16px",
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
  },

  modalOverlay: {
    position: "fixed" as const,
    inset: 0,
    background: "rgba(0,0,0,0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    zIndex: 50,
  },
  modal: {
    background: "#fff",
    borderRadius: 14,
    padding: 28,
    width: "100%",
    maxWidth: 520,
    maxHeight: "calc(100vh - 48px)",
    overflowY: "auto" as const,
    boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
  },

  contactLink: { color: "var(--green-dark)", fontWeight: 500 },
  registeredBadge: {
    background: "#e8f5e9",
    color: "var(--green-dark)",
    padding: "2px 10px",
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 700,
    whiteSpace: "nowrap" as const,
  },
  unregisteredBadge: {
    background: "#f0f0f0",
    color: "#555",
    padding: "2px 10px",
    borderRadius: 20,
    fontSize: 12,
    whiteSpace: "nowrap" as const,
  },
  playerToggle: {
    border: "1px solid #ddd",
    borderRadius: 999,
    padding: "8px 14px",
    fontSize: 13,
    fontWeight: 600,
    color: "#555",
    background: "#fff",
    cursor: "pointer",
  },
  playerToggleActive: {
    borderColor: "var(--green-dark)",
    background: "#e8f5e9",
    color: "var(--green-dark)",
  },
  checkboxLabel: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 14,
    color: "#444",
    padding: "8px 0",
    borderTop: "1px solid #f0f0f0",
  },
  dangerBtn: {
    background: DANGER,
    color: "#fff",
    border: "none",
    borderRadius: 10,
    padding: "10px 20px",
    fontWeight: 600,
    fontSize: 14,
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
  },
};
