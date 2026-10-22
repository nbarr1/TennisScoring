"use client";

export const dynamic = "force-dynamic";

import { AppNav } from "../shared/AppNav";
import { useState, useEffect, useMemo, useRef, useCallback, useDeferredValue } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
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
  useDivisionRosteredSeasons,
  upsertDivisionMembership,
  removeDivisionMembership,
  useRankings,
  previewRoundRobinSchedule,
  publishRoundRobinSchedule,
  useDivisionMessageReports,
  useReportsAwaitingResolution,
  useAppealsAwaitingDecision,
  resolveMessageReport,
  readableUserDoc,
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
  isPrivilegedRole,
  isFailure,
  mapWithConcurrency,
  parseRosterPaste,
  isMatchParticipant,
} from "@tennis/shared";
import { query, where } from "firebase/firestore";
import {
  Button,
  ConfirmDialog,
  InlineAlert,
  LoadingBlock,
  describeError,
  useAnnounce,
  useAsyncAction,
} from "../shared/ui";
import { CountPill, DIVISION_ACCESS_HINTS, Field, PermissionHints, plural } from "./AdminParts";
import {
  LEVEL_COMMIT_DELAY_MS,
  OTHER_SEASONS_FILTER,
  PartialWriteError,
  ROSTER_UNAVAILABLE_MESSAGE,
  ROSTER_MEMBERSHIP_STATUSES,
  ROSTER_WRITE_CONCURRENCY,
  SAVED_FLASH_MS,
  TABS,
  normalizedName,
  rosterLine,
  seasonNameFromId,
  timestampMillis,
  type AdminTab,
  type FocusTarget,
  type RosterAlert,
  type RosterRow,
  type ToolPanel,
} from "./adminModel";
import { DivisionsPanel, LevelFormDialog } from "./DivisionsPanel";
import { PlayerDetailDialog } from "./PlayerDetailDialog";
import { AddPlayerDialog, ImportRosterDialog } from "./RosterDialogs";
import { RosterPanel } from "./RosterPanel";
import { ToolsPanel } from "./ToolsPanel";
import { styles } from "./adminStyles";
import css from "./admin.module.css";

/*
 * The admin page owns every piece of admin state (the page-level season, the
 * roster's optimistic level writes, the scheduler's choices, the open dialog)
 * and every handler. The tab panels and dialogs in this folder only render
 * it, so switching tabs never resets a half-built schedule or a pending row,
 * exactly as when they were one file.
 */
export default function AdminPage(): React.JSX.Element {
  const { firebaseUser, loading: authLoading } = useAuthUser();
  const router = useRouter();
  const announce = useAnnounce();
  const [division, setDivision] = useState<Division | null>(null);
  const [players, setPlayers] = useState<User[]>([]);
  const [needsMergeForUserId, setNeedsMergeForUserId] = useState<string | null>(
    null,
  );
  // No control sets this yet; it stays in the link payload so the callable contract is unchanged.
  const [mergeSourceUserId, setMergeSourceUserId] = useState("");
  const [candidateMatches, setCandidateMatches] = useState<Match[]>([]);
  const [candidateMatchRefreshKey, setCandidateMatchRefreshKey] = useState(0);
  const [candidateMatchState, setCandidateMatchState] = useState<"loading" | "ready" | "error">("ready");
  const [selectedMatchIds, setSelectedMatchIds] = useState<string[]>([]);
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [newDivisionName, setNewDivisionName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [divisionAccessDenied, setDivisionAccessDenied] = useState(false);
  // Tracks whether the currently-displayed `error` was set by the division-listener effect
  // below, so a later successful snapshot only clears an error it owns and
  // `divisionAccessDenied` can never drift out of sync with `error` (every error-setting call
  // site goes through setPageError).
  const divisionListenerErrorRef = useRef(false);
  function setPageError(
    message: string,
    options?: { permissionDenied?: boolean; fromDivisionListener?: boolean },
  ) {
    setError(message);
    setDivisionAccessDenied(Boolean(options?.permissionDenied));
    divisionListenerErrorRef.current = Boolean(options?.fromDivisionListener);
  }
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
  const [levelMessage, setLevelMessage] = useState("");
  // The season is page-level context: every panel (roster, levels, scheduler, exports) reads it.
  const [adminSeasonId, setAdminSeasonId] = useState(currentSeason.id);
  const [viewAsUser, setViewAsUser] = useState(false);
  const [activeTab, setActiveTab] = useState<AdminTab>("roster");
  // The roster shows every player on the season, waitlisted included — leaving them out
  // rendered them as unassigned and let the next assignment quietly flip them to active.
  // The round-robin scheduler below keeps the active-only default on purpose.
  const {
    memberships: seasonMemberships,
    loading: loadingSeasonMemberships,
    error: seasonMembershipsError,
    retry: retrySeasonMemberships,
  } = useDivisionMemberships(division?.id, adminSeasonId, null, ROSTER_MEMBERSHIP_STATUSES);
  // Players move between divisions from one season to the next, so a player rostered only in
  // another season is not on this one: listing them here as unassigned is what put Fall-only
  // players on the Spring roster and the other way around.
  const {
    seasonsByUserId: rosteredSeasonsByUserId,
    loading: loadingRosteredSeasons,
    error: rosteredSeasonsError,
    retry: retryRosteredSeasons,
  } = useDivisionRosteredSeasons(division?.id);
  // Until both snapshots land, every player looks unassigned: the banner fired, rows went
  // amber, and an assignment made in that window wrote a waitlisted player back as active.
  const rosterReady = !loadingSeasonMemberships && !loadingRosteredSeasons;
  // A failed snapshot hands back an empty list, which is not a roster: it reads the same way,
  // every player unassigned. The Roster tab shows the error instead of the grid, the
  // unassigned banner and badge stay hidden, and level writes refuse to run until it loads.
  const rosterLoadError = seasonMembershipsError ?? rosteredSeasonsError;
  const retryRosterLoad = useCallback(() => {
    retrySeasonMemberships();
    retryRosteredSeasons();
  }, [retryRosteredSeasons, retrySeasonMemberships]);
  // Whether the signed-in account may use this page. The admin UI waits for the answer, so a
  // player who lands here sees a loading state, not the roster, before being redirected.
  const [accessChecked, setAccessChecked] = useState(false);
  const [csvMessage, setCsvMessage] = useState("");
  const [exportingType, setExportingType] = useState<"matches" | "rankings" | null>(null);
  const [openToolPanel, setOpenToolPanel] = useState<ToolPanel>(null);
  const [rrDivisionLevelId, setRrDivisionLevelId] = useState("");
  const [rrSelectedPlayerIds, setRrSelectedPlayerIds] = useState<string[]>([]);
  const [rrDoubleRoundRobin, setRrDoubleRoundRobin] = useState(false);
  const [rrIntervalDays, setRrIntervalDays] = useState(7);
  const [rrStartDate, setRrStartDate] = useState("");
  const [rrSeedByRankings, setRrSeedByRankings] = useState(true);
  const [rrClearExisting, setRrClearExisting] = useState(false);
  const [rrPreview, setRrPreview] = useState<RoundRobinMatchup[] | null>(null);
  const [rrMessage, setRrMessage] = useState("");
  const [rrFormError, setRrFormError] = useState("");
  const [rrDateError, setRrDateError] = useState("");
  const [rrConfirm, setRrConfirm] = useState<{ startAt: number } | null>(null);
  const [focusRequest, setFocusRequest] = useState<FocusTarget>(null);
  const reportsHeadingRef = useRef<HTMLHeadingElement>(null);
  const resultsHeadingRef = useRef<HTMLHeadingElement>(null);
  const rosterHeadingRef = useRef<HTMLHeadingElement>(null);
  const schedulerHeadingRef = useRef<HTMLHeadingElement>(null);
  const tabRefs = useRef<Record<AdminTab, HTMLButtonElement | null>>({
    roster: null,
    divisions: null,
    tools: null,
  });

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
  const {
    memberships: rrMemberships,
    error: rrMembershipsError,
    retry: retryRrMemberships,
  } = useDivisionMemberships(
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
  const [reportErrors, setReportErrors] = useState<Record<string, string>>({});
  const [removeReportTarget, setRemoveReportTarget] = useState<MessageReport | null>(null);
  const { reports: messageReports } = useDivisionMessageReports(division?.id);
  const { matches: reportsAwaitingResolution } = useReportsAwaitingResolution(division?.id);
  const { matches: allPendingAppeals } = useAppealsAwaitingDecision(division?.id);
  // A reviewer who played in the match cannot decide its appeal, so it is not theirs to act on.
  const appealsAwaitingDecision = allPendingAppeals.filter(
    (m) => !firebaseUser || !isMatchParticipant(m, firebaseUser.uid),
  );
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
  // The roster filters on a deferred copy, so the field keeps up with typing while the rows
  // catch up a beat behind on a large division.
  const deferredRosterSearch = useDeferredValue(rosterSearch);
  const [rosterFilter, setRosterFilter] = useState<string>("all");
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [bulkLevelId, setBulkLevelId] = useState("");
  // Level assignments already sent to the server but not yet reflected by the memberships
  // snapshot. `null` means "pending unassign"; a string is a pending level id.
  const [pendingLevels, setPendingLevels] = useState<Record<string, string | null>>({});
  // Rows whose single-row write is still in flight (drives the row spinner).
  const [savingRowIds, setSavingRowIds] = useState<string[]>([]);
  const [savedFlashIds, setSavedFlashIds] = useState<string[]>([]);
  const savedFlashTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [rosterAlert, setRosterAlert] = useState<RosterAlert>(null);
  // What a row's level select shows while its choice settles (see LEVEL_COMMIT_DELAY_MS).
  const [draftLevels, setDraftLevels] = useState<Record<string, string>>({});
  const draftTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  // Each pending draft's commit, so a season change can write it now instead of dropping it.
  const draftCommits = useRef<Record<string, (flushing: boolean) => void>>({});
  const [removeTarget, setRemoveTarget] = useState<{ row: RosterRow; viaSelect: boolean } | null>(null);
  // Players created here are prepended locally until the memberships snapshot catches up.
  const [pendingNewPlayers, setPendingNewPlayers] = useState<
    Array<{ userId: string; name: string; email: string; levelId: string }>
  >([]);
  const [addPlayerOpen, setAddPlayerOpen] = useState(false);
  const [addPlayerName, setAddPlayerName] = useState("");
  const [addPlayerEmail, setAddPlayerEmail] = useState("");
  const [addPlayerLevelId, setAddPlayerLevelId] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importLevelId, setImportLevelId] = useState("");

  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState<'player' | 'division_leader'>('player');
  const [editStatus, setEditStatus] = useState<'active' | 'waitlisted'>('active');
  const [editDivisionLevelId, setEditDivisionLevelId] = useState('');
  // What the detail form held when it opened (or was last saved), for the discard guard.
  const [detailBaseline, setDetailBaseline] = useState({
    name: "",
    email: "",
    phone: "",
    role: "player",
    status: "active",
    levelId: "",
  });
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
    const drafts = draftTimers.current;
    return () => {
      Object.values(timers).forEach((timer) => clearTimeout(timer));
      Object.values(drafts).forEach((timer) => clearTimeout(timer));
    };
  }, []);

  const clearDraftLevel = useCallback((userId: string) => {
    clearTimeout(draftTimers.current[userId]);
    delete draftTimers.current[userId];
    delete draftCommits.current[userId];
    setDraftLevels((current) => {
      if (!(userId in current)) return current;
      const next = { ...current };
      delete next[userId];
      return next;
    });
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
    setRosterAlert(null);
    Object.values(draftTimers.current).forEach((timer) => clearTimeout(timer));
    draftTimers.current = {};
    draftCommits.current = {};
    setDraftLevels({});
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

  // Move focus to the section a shortcut opened, once it has rendered.
  useEffect(() => {
    if (!focusRequest) return;
    const target = {
      reports: reportsHeadingRef,
      results: resultsHeadingRef,
      roster: rosterHeadingRef,
      scheduler: schedulerHeadingRef,
    }[focusRequest].current;
    if (!target) return;
    target.focus();
    target.scrollIntoView({ block: "start" });
    setFocusRequest(null);
  }, [focusRequest, activeTab, openToolPanel]);

  // Gate: redirect players who are not leaders/admins away from this page.
  useEffect(() => {
    if (!firebaseUser) {
      if (!authLoading) setAccessChecked(true);
      return;
    }
    let cancelled = false;
    getDoc(userDoc(firebaseUser.uid))
      .then((snap) => {
        if (cancelled) return;
        const role = snap.data()?.role as string | undefined;
        if (!isPrivilegedRole(role)) {
          router.replace('/dashboard');
          return;
        }
        setAccessChecked(true);
      })
      .catch(() => {
        // The role read failing is not a reason to lock a leader out: the Firestore rules
        // still decide what loads, and any denial is reported below.
        if (!cancelled) setAccessChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [authLoading, firebaseUser, router]);

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
        // error/hint that this same listener previously set.
        if (divisionListenerErrorRef.current) {
          setPageError("");
        }
        if (div) {
          const [divisionMemberProfiles, divisionProfileSnap, rankingSnap] =
            await Promise.all([
              div.playerIds.length
                ? Promise.all(div.playerIds.map((id) => readableUserDoc(id)))
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
            if (d?.exists()) addProfile(d.id, d.data() as Omit<User, "id">);
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
            ? "Couldn't load your division. Confirm your signed-in account is a division leader or app admin."
            : describeError(snapshotError, "Couldn't load your division. Refresh the page to try again."),
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

  // ---- Division creation -------------------------------------------------
  const createDivisionAction = useAsyncAction(
    async () => {
      if (!firebaseUser || !newDivisionName.trim()) return "";
      const name = newDivisionName.trim();
      await createDivisionShared(name, firebaseUser.uid, {
        displayName: firebaseUser.displayName ?? undefined,
        email: firebaseUser.email ?? undefined,
      });
      setNewDivisionName("");
      return name;
    },
    {
      successMessage: (name) => (name ? `${name} created. Loading its admin tools.` : ""),
      errorMessage: "Couldn't create the division. Try again.",
    },
  );

  // ---- Player detail: link matches, contact, undo ------------------------
  const linkMatches = useAsyncAction(
    async () => {
      if (!division || !needsMergeForUserId || selectedMatchIds.length === 0) return null;
      const updatedMatches = await mergeDivisionPlayerRecords(
        division.id,
        needsMergeForUserId,
        {
          sourceUserId: mergeSourceUserId || undefined,
          matchIds: selectedMatchIds,
          targetEmail: editEmail.trim() || undefined,
        },
      );
      const message = `Linked ${plural(updatedMatches, "recorded match", "recorded matches")} and refreshed rankings.`;
      setLinkActionMessage({ targetUserId: needsMergeForUserId, message, kind: "link" });
      setLastLinkAction({
        sourceUserId: mergeSourceUserId || undefined,
        targetUserId: needsMergeForUserId,
        matchIds: [...selectedMatchIds],
      });
      setCandidateMatchRefreshKey((key) => key + 1);
      setSelectedMatchIds([]);
      setMergeSourceUserId("");
      return message;
    },
    {
      successMessage: (message) => message ?? "",
      toastSuccess: false,
      errorMessage: "Couldn't link those matches. Try again.",
    },
  );

  const updateContact = useAsyncAction(
    async () => {
      if (!division || !needsMergeForUserId || !editEmail.trim()) return false;
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
        message: "Contact details updated.",
        kind: "contact",
      });
      setDetailBaseline((current) => ({ ...current, email: editEmail, phone: editPhone }));
      return true;
    },
    {
      successMessage: (done) => (done ? "Contact details updated." : ""),
      toastSuccess: false,
      errorMessage: "Couldn't update the contact details. Try again.",
    },
  );

  const undoLink = useAsyncAction(
    async () => {
      if (!division || !lastLinkAction?.sourceUserId) return null;
      const reverted = await mergeDivisionPlayerRecords(
        division.id,
        lastLinkAction.sourceUserId,
        {
          sourceUserId: lastLinkAction.targetUserId,
          matchIds: lastLinkAction.matchIds,
        },
      );
      const message = `Undo complete. Unlinked ${plural(reverted, "match", "matches")}.`;
      setLinkActionMessage({
        targetUserId: lastLinkAction.sourceUserId,
        message,
        kind: "link",
      });
      setLastLinkAction(null);
      return message;
    },
    {
      successMessage: (message) => message ?? "",
      toastSuccess: false,
      errorMessage: "Couldn't undo the last link. Try again.",
    },
  );

  const undoContact = useAsyncAction(
    async () => {
      if (!division || !lastContactAction || !lastContactAction.previousEmail) return false;
      await updateDivisionPlayerEmailShared(
        division.id,
        lastContactAction.targetUserId,
        lastContactAction.previousEmail,
        lastContactAction.previousPhone,
      );
      setEditEmail(lastContactAction.previousEmail);
      setEditPhone(lastContactAction.previousPhone ?? "");
      setDetailBaseline((current) => ({
        ...current,
        email: lastContactAction.previousEmail,
        phone: lastContactAction.previousPhone ?? "",
      }));
      setLinkActionMessage({
        targetUserId: lastContactAction.targetUserId,
        message: "Undo complete. The previous contact details are back.",
        kind: "contact",
      });
      setLastContactAction(null);
      return true;
    },
    {
      successMessage: (done) => (done ? "Previous contact details restored." : ""),
      toastSuccess: false,
      errorMessage: "Couldn't undo the contact change. Try again.",
    },
  );

  const savePlayer = useAsyncAction(
    async () => {
      if (!division || !editingPlayerId || !editName.trim() || !editDivisionLevelId) return "";
      // The status field was filled from a membership the failed snapshot never delivered.
      if (rosterLoadError) throw new Error(ROSTER_UNAVAILABLE_MESSAGE);
      const savedId = editingPlayerId;
      await upsertDivisionMembership({
        divisionId: division.id,
        seasonId: adminSeasonId,
        divisionLevelId: editDivisionLevelId,
        userId: savedId,
        name: editName.trim(),
        email: editEmail.trim() || undefined,
        phone: editPhone.trim() || undefined,
        role: editRole,
        status: editStatus,
      });
      setExpandedPlayerId(null);
      setEditingPlayerId(null);
      flashSaved(savedId);
      return editName.trim();
    },
    {
      successMessage: (name) => (name ? `${name} saved.` : ""),
      errorMessage: "Couldn't save this player. Try again.",
    },
  );

  const detailBusy =
    savePlayer.pending ||
    linkMatches.pending ||
    updateContact.pending ||
    undoLink.pending ||
    undoContact.pending;

  useEffect(() => {
    let cancelled = false;
    async function loadCandidateMatches() {
      if (!division?.id || !needsMergeForUserId) {
        setCandidateMatches([]);
        setSelectedMatchIds([]);
        setCandidateMatchState("ready");
        return;
      }
      setCandidateMatchState("loading");
      const snap = await getDocs(
        query(matchesCol(), where("divisionId", "==", division.id)),
      );
      if (cancelled) return;
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
      setCandidateMatchState("ready");
    }
    loadCandidateMatches().catch(() => {
      if (cancelled) return;
      setCandidateMatches([]);
      setCandidateMatchState("error");
    });
    return () => {
      cancelled = true;
    };
  }, [division?.id, needsMergeForUserId, candidateMatchRefreshKey]);

  // ---- Division levels ----------------------------------------------------
  const levelFormDefaultName = formatDivisionLevelName(levelSkill, levelMatchType);
  const levelFormDirty = levelDescription.trim().length > 0 || levelName !== levelFormDefaultName;
  // Two levels with one name are indistinguishable in every roster and scheduler select.
  const levelNameTaken = adminSeasonLevels.some(
    (level) => normalizedName(level.name) === normalizedName(levelName),
  );

  function openLevelForm() {
    setLevelSkill("beginner");
    setLevelMatchType("singles");
    setLevelName(formatDivisionLevelName("beginner", "singles"));
    setLevelDescription("");
    saveLevel.reset();
    setLevelFormOpen(true);
  }

  const saveLevel = useAsyncAction(
    async () => {
      if (!division || !levelName.trim()) return "";
      const savedName = levelName.trim();
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
      setLevelMessage(
        `${savedName} added to ${adminSeason.name}. You can now assign players to it, schedule it, and export it.`,
      );
      return savedName;
    },
    {
      successMessage: (name) => (name ? `${name} added to ${adminSeason.name}.` : ""),
      toastSuccess: false,
      errorMessage: "Couldn't save the division level. Try again.",
    },
  );

  // ---- Invite code (read-only) ---------------------------------------------
  const [codeCopied, setCodeCopied] = useState(false);
  const copyInviteCode = useAsyncAction(
    async () => {
      if (!division?.inviteCode) return;
      await navigator.clipboard.writeText(division.inviteCode);
      setCodeCopied(true);
      window.setTimeout(() => setCodeCopied(false), SAVED_FLASH_MS);
    },
    {
      successMessage: "Copied. Invite code is on your clipboard.",
      mapError: () => "Couldn't copy the code. Select it and copy it yourself.",
    },
  );

  // ---- Tools ---------------------------------------------------------------
  const exportCsv = useAsyncAction(
    async (exportType: "matches" | "rankings") => {
      if (!division) return "";
      setCsvMessage("");
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
      const message = `Downloaded ${result.filename}: ${plural(result.rowCount, `${exportType === "matches" ? "match" : "ranking"} row`, `${exportType === "matches" ? "match" : "ranking"} rows`)}.`;
      setCsvMessage(message);
      return message;
    },
    {
      successMessage: (message) => message,
      toastSuccess: false,
      errorMessage: "Couldn't export the CSV. Try again.",
      onSuccess: () => setExportingType(null),
    },
  );

  function runExport(exportType: "matches" | "rankings") {
    if (exportCsv.pending) return;
    setExportingType(exportType);
    void exportCsv.run(exportType);
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
      setRrFormError(
        "Round-robin scheduling isn't available for doubles levels yet. Create doubles matches from the Matches page instead.",
      );
      return;
    }
    if (rrSelectedPlayerIds.length < 2) {
      setRrFormError("Choose at least 2 players to build a schedule.");
      return;
    }
    setRrFormError("");
    setRrPreview(
      previewRoundRobinSchedule({
        playerIds: rrSelectedPlayerIds,
        doubleRoundRobin: rrDoubleRoundRobin,
        seedByRankings: rrSeedByRankings,
        rankings: rrRankings,
      }),
    );
  }

  // Same arithmetic the publish callable uses, so the preview's dates match what it creates.
  const rrPreviewStartAt = /^\d{4}-\d{2}-\d{2}$/.test(rrStartDate)
    ? Date.parse(`${rrStartDate}T18:00:00`) || null
    : null;

  /** Validates the start date, then asks for confirmation before anything is written. */
  function requestRrPublish() {
    if (!division || !adminSeasonId || !rrDivisionLevelId || !rrPreview) return;
    if (rrSelectedLevelIsDoubles) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rrStartDate)) {
      setRrDateError("Choose the date round 1 starts.");
      document.getElementById("rr-start-date")?.focus();
      return;
    }
    const startAt = Date.parse(`${rrStartDate}T18:00:00`);
    if (!startAt || Number.isNaN(startAt)) {
      setRrDateError("That date isn't valid. Choose it again.");
      document.getElementById("rr-start-date")?.focus();
      return;
    }
    setRrDateError("");
    setRrConfirm({ startAt });
  }

  async function confirmRrPublish() {
    if (!division || !rrConfirm || !rrPreview) return;
    const level = adminSeasonLevels.find((l) => l.id === rrDivisionLevelId);
    const result = await publishRoundRobinSchedule({
      divisionId: division.id,
      seasonId: adminSeasonId,
      divisionLevelId: rrDivisionLevelId,
      matchType: level?.matchType,
      playerIds: rrSelectedPlayerIds,
      doubleRoundRobin: rrDoubleRoundRobin,
      startAt: rrConfirm.startAt,
      intervalDays: rrIntervalDays,
      clearExisting: rrClearExisting,
    });
    setRrConfirm(null);
    setRrPreview(null);
    const message = `Published ${plural(result.matchesCreated, "match", "matches")} across ${plural(result.roundsCreated, "round", "rounds")}${level ? ` in ${level.name}` : ""}.`;
    setRrMessage(message);
    announce(message, { toast: true });
  }

  async function dismissReport(report: MessageReport) {
    if (!firebaseUser || resolvingReportId) return;
    setResolvingReportId(report.id);
    setReportErrors((current) => {
      const next = { ...current };
      delete next[report.id];
      return next;
    });
    try {
      await resolveMessageReport(report, firebaseUser.uid, "dismiss");
      announce(`Report on ${report.messageSenderName}'s message dismissed. The message stays.`, { toast: true });
    } catch (e) {
      setReportErrors((current) => ({
        ...current,
        [report.id]: describeError(e, "Couldn't dismiss this report. Try again."),
      }));
    } finally {
      setResolvingReportId(null);
    }
  }

  async function confirmRemoveReportedMessage() {
    if (!firebaseUser || !removeReportTarget) return;
    const report = removeReportTarget;
    setResolvingReportId(report.id);
    try {
      await resolveMessageReport(report, firebaseUser.uid, "remove");
      setRemoveReportTarget(null);
      announce(`${report.messageSenderName}'s message removed and the report resolved.`, { toast: true });
    } finally {
      setResolvingReportId(null);
    }
  }

  const repairRankings = useAsyncAction(
    async () => {
      if (!division) return "";
      setRepairMessage("");
      const response = (await recalculateDivisionRankings(
        division.id,
        true,
      )) as {
        result?: {
          countedMatches?: number;
          guestMatchesSkipped?: number;
          matchesNormalized?: number;
          rankingsWritten?: number;
          rankingsDeleted?: number;
        };
      };
      const result = response.result;
      const message = result
        ? `Rankings rebuilt. Counted ${plural(result.countedMatches ?? 0, "match", "matches")} and left out ${plural(result.guestMatchesSkipped ?? 0, "guest match", "guest matches")}. Updated ${plural(result.rankingsWritten ?? 0, "ranking row", "ranking rows")} and removed ${plural(result.rankingsDeleted ?? 0, "stale row", "stale rows")}. Brought ${plural(result.matchesNormalized ?? 0, "historic match", "historic matches")} up to the current format.`
        : "Rankings rebuilt.";
      setRepairMessage(message);
      return message;
    },
    {
      successMessage: "Rankings rebuilt.",
      errorMessage: "Couldn't rebuild the rankings. Try again.",
    },
  );

  // ---- Roster derivation ------------------------------------------------
  const playerById = useMemo(
    () => new Map(players.map((player) => [player.id, player] as const)),
    [players],
  );
  // One membership per player, never one row per document. A player holding two live
  // memberships for a season would otherwise render twice under the same React key and leave
  // the select-all checkbox permanently indeterminate. The server now archives prior
  // memberships on every write path, so this keeps legacy data rendering sanely.
  const membershipByUserId = useMemo(() => {
    const byUser = new Map<string, DivisionMembership>();
    seasonMemberships.forEach((membership) => {
      const existing = byUser.get(membership.userId);
      if (!existing || timestampMillis(membership.updatedAt) > timestampMillis(existing.updatedAt)) {
        byUser.set(membership.userId, membership);
      }
    });
    return byUser;
  }, [seasonMemberships]);

  const rosterRows: RosterRow[] = useMemo(() => {
    const membershipRows: RosterRow[] = [...membershipByUserId.values()].map((membership) => ({
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
    // Division players with no membership this season are unassigned only when they hold none
    // in any season; the rest belong to other seasons and are listed under their own filter.
    const legacyRows: RosterRow[] = players
      .filter(
        (player) =>
          !membershipByUserId.has(player.id) && !(rosteredSeasonsByUserId.get(player.id)?.size),
      )
      .map((player) => ({ player, membership: null }));
    const known = new Set([
      ...membershipRows.map((row) => row.player.id),
      ...legacyRows.map((row) => row.player.id),
      ...rosteredSeasonsByUserId.keys(),
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
  }, [division?.id, membershipByUserId, pendingNewPlayers, playerById, players, rosteredSeasonsByUserId]);

  /** Division players rostered in another season but not this one, offered for carrying over. */
  const otherSeasonRows: RosterRow[] = useMemo(() => {
    const onRoster = new Set(rosterRows.map((row) => row.player.id));
    return players
      .filter((player) => !onRoster.has(player.id) && rosteredSeasonsByUserId.get(player.id)?.size)
      .map((player) => ({ player, membership: null }));
  }, [players, rosterRows, rosteredSeasonsByUserId]);

  const otherSeasonIds = useMemo(
    () => new Set(otherSeasonRows.map((row) => row.player.id)),
    [otherSeasonRows],
  );

  /** The seasons an other-season row is rostered in, by name. */
  function otherSeasonNames(userId: string): string {
    return [...(rosteredSeasonsByUserId.get(userId) ?? [])].sort().map(seasonNameFromId).join(", ");
  }

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
    const term = deferredRosterSearch.trim().toLowerCase();
    if (rosterFilter === OTHER_SEASONS_FILTER) {
      return otherSeasonRows.filter(
        (row) =>
          !term ||
          row.player.displayName.toLowerCase().includes(term) ||
          (row.player.email ?? "").toLowerCase().includes(term),
      );
    }
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
  }, [effectiveLevelId, otherSeasonRows, rosterFilter, rosterRows, deferredRosterSearch]);

  const visibleIds = useMemo(() => visibleRows.map((row) => row.player.id), [visibleRows]);
  const selectedVisibleIds = useMemo(
    () => selectedPlayerIds.filter((id) => visibleIds.includes(id)),
    [selectedPlayerIds, visibleIds],
  );
  const allVisibleSelected =
    visibleIds.length > 0 && selectedVisibleIds.length === visibleIds.length;
  const someVisibleSelected =
    selectedVisibleIds.length > 0 && selectedVisibleIds.length < visibleIds.length;
  const isFiltered = rosterFilter !== "all" || deferredRosterSearch.trim().length > 0;

  function levelLabel(levelId: string): string {
    return levelNameById.get(levelId) ?? "that division level";
  }

  /**
   * The division player an add or import line resolves to, mirroring the server: an email
   * match first, then the same name with no conflicting email. The server reuses that player
   * and moves them to the chosen level instead of creating a new one, so the forms say so.
   */
  function findExistingPlayer(name: string, email: string): { player: User; levelId: string } | null {
    const safeEmail = email.trim().toLowerCase();
    const safeName = normalizedName(name);
    const byEmail = safeEmail
      ? players.find((player) => (player.email ?? "").trim().toLowerCase() === safeEmail)
      : undefined;
    const byName =
      !byEmail && safeName
        ? players.find((player) => {
            if (normalizedName(player.displayName) !== safeName) return false;
            const recordEmail = (player.email ?? "").trim().toLowerCase();
            return !safeEmail || !recordEmail || recordEmail === safeEmail;
          })
        : undefined;
    const player = byEmail ?? byName;
    if (!player) return null;
    const row = rosterRows.find((candidate) => candidate.player.id === player.id);
    return { player, levelId: row ? effectiveLevelId(row) : "" };
  }

  // ---- Roster actions ---------------------------------------------------
  async function assignLevel(row: RosterRow, nextLevelId: string) {
    if (!division) return;
    if (rosterLoadError) {
      // Without the membership the write cannot keep a waitlisted player waitlisted.
      setRosterAlert({ tone: "error", message: ROSTER_UNAVAILABLE_MESSAGE, retry: retryRosterLoad });
      return;
    }
    const userId = row.player.id;
    const previous = effectiveLevelId(row);
    if (nextLevelId === previous) return;
    if (!nextLevelId) {
      // "Unassigned" takes the player off this season's roster, which can also take them off
      // the division. That is the same write as Remove, so it gets the same confirmation; an
      // arrow key on a focused select must never remove someone.
      setRemoveTarget({ row, viaSelect: true });
      return;
    }
    setPendingLevels((current) => ({ ...current, [userId]: nextLevelId }));
    setSavingRowIds((current) => (current.includes(userId) ? current : [...current, userId]));
    setRosterAlert(null);
    try {
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
      flashSaved(userId);
      announce(`${row.player.displayName} moved to ${levelLabel(nextLevelId)}.`);
    } catch (e) {
      // Roll the optimistic value back so the select never lies about what was saved.
      setPendingLevels((current) => {
        const next = { ...current };
        delete next[userId];
        return next;
      });
      setRosterAlert({
        tone: "error",
        message: `Couldn't move ${row.player.displayName} to ${levelLabel(nextLevelId)}. ${describeError(e, "Try again.")}`,
        retry: () => void assignLevel(row, nextLevelId),
      });
    } finally {
      setSavingRowIds((current) => current.filter((id) => id !== userId));
    }
  }

  // The timer below fires after later renders, so it calls the latest assignLevel, which
  // reads the latest pending state.
  const assignLevelRef = useRef(assignLevel);
  assignLevelRef.current = assignLevel;
  const effectiveLevelRef = useRef(effectiveLevelId);
  effectiveLevelRef.current = effectiveLevelId;

  function onRowLevelChange(row: RosterRow, nextLevelId: string) {
    const userId = row.player.id;
    setDraftLevels((current) => ({ ...current, [userId]: nextLevelId }));
    clearTimeout(draftTimers.current[userId]);
    const commit = (flushing: boolean) => {
      delete draftTimers.current[userId];
      delete draftCommits.current[userId];
      if (nextLevelId === effectiveLevelRef.current(row)) {
        // Arrowed away and back again: nothing to write.
        clearDraftLevel(userId);
        return;
      }
      if (!nextLevelId) {
        // The draft keeps showing "Unassigned" until the confirmation is answered. A season
        // change drops it instead, since the confirmation would name the wrong season.
        if (flushing) clearDraftLevel(userId);
        else setRemoveTarget({ row, viaSelect: true });
        return;
      }
      clearDraftLevel(userId);
      void assignLevelRef.current(row, nextLevelId);
    };
    draftCommits.current[userId] = commit;
    draftTimers.current[userId] = setTimeout(() => commit(false), LEVEL_COMMIT_DELAY_MS);
  }

  /** Writes every pending row change now, for the season they were made in. */
  function flushDraftLevels() {
    Object.entries(draftCommits.current).forEach(([userId, commit]) => {
      clearTimeout(draftTimers.current[userId]);
      commit(true);
    });
  }

  function cancelRemove() {
    if (removeTarget) clearDraftLevel(removeTarget.row.player.id);
    setRemoveTarget(null);
  }

  /** Runs inside the remove confirmation; a rejection keeps the dialog open with the error. */
  async function confirmRemoveFromRoster() {
    if (!division || !removeTarget) return;
    const { row } = removeTarget;
    const userId = row.player.id;
    clearDraftLevel(userId);
    const name = row.player.displayName;
    setRosterAlert(null);
    setPendingNewPlayers((current) => current.filter((entry) => entry.userId !== userId));
    setSelectedPlayerIds((current) => current.filter((id) => id !== userId));
    // Set the override *before* the await. Writing it afterwards raced the memberships
    // snapshot: if the snapshot landed during the call, the settle effect ran with no entry
    // to clear and the one written next was stranded, masking later remote changes forever.
    setPendingLevels((current) => ({ ...current, [userId]: null }));
    const rollback = () =>
      setPendingLevels((current) => {
        const next = { ...current };
        delete next[userId];
        return next;
      });
    try {
      const { removed, detachedFromDivision } = await removeDivisionMembership({
        divisionId: division.id,
        seasonId: adminSeasonId,
        userId,
      });
      setRemoveTarget(null);
      if (removed === 0) {
        // Nothing to archive — the player was already off this season's roster. Say so
        // instead of leaving the button looking broken.
        rollback();
        const message = `${name} was already off the ${adminSeason.name} roster. Nothing changed.`;
        setRosterAlert({ tone: "info", message });
        announce(message);
        return;
      }
      flashSaved(userId);
      setFocusRequest("roster");
      announce(
        detachedFromDivision
          ? `${name} removed from ${adminSeason.name} and from the division. Their match history is kept.`
          : `${name} removed from the ${adminSeason.name} roster. Their match history is kept.`,
        { toast: true },
      );
    } catch (e) {
      rollback();
      throw e;
    }
  }

  const bulkAssign = useAsyncAction(
    async () => {
      if (!division || !bulkLevelId || selectedVisibleIds.length === 0) return 0;
      if (rosterLoadError) throw new Error(ROSTER_UNAVAILABLE_MESSAGE);
      setRosterAlert(null);
      const targets = visibleRows
        .filter((row) => selectedVisibleIds.includes(row.player.id))
        .filter((row) => effectiveLevelId(row) !== bulkLevelId);
      if (targets.length === 0) {
        // Every selected player is already on that level. Treat it as done.
        setSelectedPlayerIds([]);
        return 0;
      }
      setPendingLevels((current) => {
        const next = { ...current };
        targets.forEach((row) => {
          next[row.player.id] = bulkLevelId;
        });
        return next;
      });
      try {
        const results = await mapWithConcurrency(targets, ROSTER_WRITE_CONCURRENCY, (row) =>
          upsertDivisionMembership({
            divisionId: division.id,
            seasonId: adminSeasonId,
            divisionLevelId: bulkLevelId,
            userId: row.player.id,
            name: row.player.displayName,
            email: row.player.email || undefined,
            phone: row.player.phone || undefined,
            role: row.membership?.role,
            status: row.membership?.status === "waitlisted" ? "waitlisted" : "active",
          }),
        );
        const failures = results.filter(isFailure);
        results.forEach((result) => {
          if (!isFailure(result)) flashSaved(result.item.player.id);
        });
        if (failures.length > 0) {
          // Roll back only the rows that did not land, so no select keeps showing a division
          // that was never saved. Without this the stale override never settles, because the
          // snapshot it is compared against still holds the player's old level.
          setPendingLevels((current) => {
            const next = { ...current };
            failures.forEach(({ item }) => delete next[item.player.id]);
            return next;
          });
          setSelectedPlayerIds(failures.map(({ item }) => item.player.id));
          const [first] = failures;
          throw new PartialWriteError(
            `Assigned ${results.length - failures.length} of ${results.length} players. ` +
              `${describeError(first.error, "The rest couldn't be saved.")} ` +
              "The players that weren't assigned are still selected.",
          );
        }
        setSelectedPlayerIds([]);
        return targets.length;
      } catch (e) {
        if (!(e instanceof PartialWriteError)) {
          setPendingLevels((current) => {
            const next = { ...current };
            targets.forEach((row) => delete next[row.player.id]);
            return next;
          });
        }
        throw e;
      }
    },
    {
      successMessage: (count) =>
        count === 0
          ? `Everyone selected is already in ${levelLabel(bulkLevelId)}.`
          : `${plural(count, "player", "players")} assigned to ${levelLabel(bulkLevelId)}.`,
      errorMessage: "Couldn't assign the selected players. Try again.",
    },
  );

  const addPlayer = useAsyncAction(
    async () => {
      if (!division || !addPlayerName.trim() || !addPlayerLevelId) return null;
      const name = addPlayerName.trim();
      const result = await upsertDivisionMembership({
        divisionId: division.id,
        seasonId: adminSeasonId,
        divisionLevelId: addPlayerLevelId,
        name,
        email: addPlayerEmail.trim() || undefined,
      });
      setPendingNewPlayers((current) => [
        {
          userId: result.userId,
          name,
          email: addPlayerEmail.trim(),
          levelId: addPlayerLevelId,
        },
        ...current.filter((entry) => entry.userId !== result.userId),
      ]);
      flashSaved(result.userId);
      setAddPlayerOpen(false);
      setAddPlayerName("");
      setAddPlayerEmail("");
      return { name, createdPlaceholder: result.createdPlaceholder, levelId: addPlayerLevelId };
    },
    {
      successMessage: (result) =>
        result
          ? `${result.name} added to ${levelLabel(result.levelId)}${result.createdPlaceholder ? " as a placeholder" : ""}.`
          : "",
      errorMessage: "Couldn't add the player. Try again.",
    },
  );

  const importEntries = useMemo(() => parseRosterPaste(importText), [importText]);
  const importPreview = importEntries.map((entry) => ({
    entry,
    existing: findExistingPlayer(entry.name, entry.email),
  }));
  const importMoves = importPreview.filter(
    ({ existing }) => existing?.levelId && existing.levelId !== importLevelId,
  ).length;
  const addPlayerExisting =
    addPlayerOpen && (addPlayerName.trim() || addPlayerEmail.trim())
      ? findExistingPlayer(addPlayerName, addPlayerEmail)
      : null;

  const importRoster = useAsyncAction(
    async () => {
      if (!division || !importLevelId || importEntries.length === 0) return 0;
      const levelId = importLevelId;
      const results = await mapWithConcurrency(
        importEntries,
        ROSTER_WRITE_CONCURRENCY,
        (entry) =>
          upsertDivisionMembership({
            divisionId: division.id,
            seasonId: adminSeasonId,
            divisionLevelId: levelId,
            name: entry.name || undefined,
            email: entry.email || undefined,
          }),
      );
      // Keep whatever landed, whether or not the rest failed, so the roster reflects reality.
      const created = results.flatMap((result) =>
        isFailure(result)
          ? []
          : [
              {
                userId: result.value.userId,
                // An email-only line has no name; the server names the placeholder after the
                // address, so mirror that rather than showing a blank row.
                name: result.item.name || result.item.email,
                email: result.item.email,
                levelId,
              },
            ],
      );
      if (created.length > 0) {
        setPendingNewPlayers((current) => [
          ...created,
          ...current.filter((existing) => !created.some((row) => row.userId === existing.userId)),
        ]);
      }
      const failures = results.filter(isFailure);
      if (failures.length > 0) {
        // Leave only the lines that failed, so importing again cannot add anyone twice.
        setImportText(failures.map(({ item }) => rosterLine(item)).join("\n"));
        const [first] = failures;
        throw new PartialWriteError(
          `Imported ${created.length} of ${results.length} players. ` +
            `${describeError(first.error, "The rest couldn't be added.")} ` +
            `The ${failures.length === 1 ? "line that failed is" : `${failures.length} lines that failed are`} still in the box; fix and import again.`,
        );
      }
      setImportOpen(false);
      setImportText("");
      return created.length;
    },
    {
      successMessage: (count) => `${plural(count, "player", "players")} imported into ${levelLabel(importLevelId)}.`,
      errorMessage: "Couldn't import this roster. Try again.",
    },
  );

  function openPlayerDetail(row: RosterRow) {
    const p = row.player;
    const levelId = effectiveLevelId(row) || adminSeasonLevels[0]?.id || "";
    const role = row.membership?.role === "division_leader" ? "division_leader" : "player";
    const status = row.membership?.status === "waitlisted" ? "waitlisted" : "active";
    setNeedsMergeForUserId(p.id);
    setMergeSourceUserId("");
    setSelectedMatchIds([]);
    setEditName(p.displayName ?? "");
    setEditEmail(p.email ?? "");
    setEditPhone(p.phone ?? "");
    setEditRole(role);
    setEditStatus(status);
    setEditDivisionLevelId(levelId);
    setDetailBaseline({
      name: p.displayName ?? "",
      email: p.email ?? "",
      phone: p.phone ?? "",
      role,
      status,
      levelId,
    });
    setEditingPlayerId(p.id);
    setLinkActionMessage(null);
    savePlayer.reset();
    linkMatches.reset();
    updateContact.reset();
    undoLink.reset();
    undoContact.reset();
    setExpandedPlayerId(p.id);
  }

  function closePlayerDetail() {
    setExpandedPlayerId(null);
  }

  function selectTab(tab: AdminTab) {
    setActiveTab(tab);
  }

  function onTabKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % TABS.length;
    else if (event.key === "ArrowLeft") nextIndex = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = TABS.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const next = TABS[nextIndex].id;
    selectTab(next);
    tabRefs.current[next]?.focus();
  }

  function goToReports() {
    setActiveTab("tools");
    setOpenToolPanel("reports");
    setFocusRequest("reports");
  }

  function goToResults() {
    setActiveTab("tools");
    setFocusRequest("results");
  }

  function showLevelOnRoster(levelId: string) {
    setActiveTab("roster");
    setRosterSearch("");
    setRosterFilter(levelId);
    setFocusRequest("roster");
  }

  function goToUnassigned() {
    setActiveTab("roster");
    setRosterFilter("unassigned");
    setFocusRequest("roster");
  }

  function toggleToolPanel(panel: Exclude<ToolPanel, null>) {
    const next = openToolPanel === panel ? null : panel;
    setOpenToolPanel(next);
    if (next) setFocusRequest(next);
  }

  const noLevelsYet = adminSeasonLevels.length === 0;
  const detailRow = expandedPlayerId
    ? [...rosterRows, ...otherSeasonRows].find((row) => row.player.id === expandedPlayerId) ?? null
    : null;
  // Registered players manage their own email and phone; the server keeps theirs whatever is
  // typed here, so the detail fields are read-only rather than silently ignored.
  const detailRegistered = detailRow ? detailRow.player.isRegistered !== false : false;
  const detailDirty =
    detailRow !== null &&
    (editName !== detailBaseline.name ||
      editEmail !== detailBaseline.email ||
      editPhone !== detailBaseline.phone ||
      editRole !== detailBaseline.role ||
      editStatus !== detailBaseline.status ||
      editDivisionLevelId !== detailBaseline.levelId ||
      selectedMatchIds.length > 0);
  const disputedCount = reportsAwaitingResolution.filter((m) => m.status === "disputed").length;
  const unansweredCount = reportsAwaitingResolution.length - disputedCount;
  const toolsAttentionCount =
    messageReports.length + reportsAwaitingResolution.length + appealsAwaitingDecision.length;
  const pageLoading = loading || !accessChecked;
  // Counted only once the roster snapshots have landed; before that everyone reads as unassigned.
  const knownUnassignedCount = rosterReady && !rosterLoadError ? unassignedCount : 0;
  const showAttention =
    Boolean(division) &&
    !pageLoading &&
    !viewAsUser &&
    (messageReports.length > 0 ||
      reportsAwaitingResolution.length > 0 ||
      appealsAwaitingDecision.length > 0 ||
      knownUnassignedCount > 0);
  const bulkBarVisible = activeTab === "roster" && !viewAsUser && selectedVisibleIds.length > 0;

  return (
    <div style={styles.page}>
      <AppNav active="admin" />

      <main style={{ ...styles.main, ...(bulkBarVisible ? { paddingBottom: 220 } : {}) }}>
        <div style={styles.adminHeader}>
          <div style={styles.headerTitleGroup}>
            <h1 style={styles.pageTitle}>Division admin</h1>
            {division && !pageLoading ? (
              <div style={styles.headerSeason}>
                <label htmlFor="admin-season" style={styles.headerSeasonLabel}>
                  Season
                </label>
                <select
                  id="admin-season"
                  style={styles.headerSelect}
                  value={adminSeasonId}
                  onChange={(e) => {
                    flushDraftLevels();
                    setAdminSeasonId(e.target.value);
                  }}
                >
                  {seasonOptions.map((season) => (
                    <option key={season.id} value={season.id}>
                      {season.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
          {division && !pageLoading ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setViewAsUser((current) => !current)}
            >
              {viewAsUser ? "Exit user view" : "View as user"}
            </Button>
          ) : null}
        </div>

        {division && !pageLoading && !viewAsUser ? (
          <p style={styles.headerSummary}>
            <strong style={{ color: styles.pageTitle.color }}>{division.name}</strong>
            {rosterReady && !rosterLoadError ? (
              <>
                {" · "}
                {plural(rosterRows.length, "player", "players")} ·{" "}
                {plural(adminSeasonLevels.length, "division level", "division levels")} ·{" "}
                {unassignedCount} unassigned
              </>
            ) : null}
          </p>
        ) : null}

        {error ? (
          <InlineAlert tone="error" title="Couldn't load the admin page." style={styles.blockGap}>
            <p style={{ margin: 0 }}>{error}</p>
            <PermissionHints
              hints={divisionAccessDenied ? DIVISION_ACCESS_HINTS : null}
              authDebug={authDebug}
            />
          </InlineAlert>
        ) : null}

        {showAttention ? (
          <section aria-labelledby="admin-attention-title" style={styles.attention}>
            <h2 id="admin-attention-title" style={styles.attentionTitle}>
              Needs your attention
            </h2>
            <ul style={styles.attentionList}>
              {messageReports.length > 0 ? (
                <li style={styles.attentionItem}>
                  <span style={styles.attentionText}>
                    <strong>{plural(messageReports.length, "reported message", "reported messages")}</strong>{" "}
                    {messageReports.length === 1 ? "is" : "are"} waiting for review.
                  </span>
                  <Button size="sm" variant="secondary" onClick={goToReports}>
                    Review reports
                  </Button>
                </li>
              ) : null}
              {reportsAwaitingResolution.length > 0 ? (
                <li style={styles.attentionItem}>
                  <span style={styles.attentionText}>
                    {disputedCount > 0 && unansweredCount > 0 ? (
                      <>
                        <strong>{plural(reportsAwaitingResolution.length, "result", "results")} to resolve</strong>:{" "}
                        {disputedCount} disputed, {unansweredCount} not confirmed by the opposing side.
                      </>
                    ) : disputedCount > 0 ? (
                      <>
                        <strong>{plural(disputedCount, "disputed result", "disputed results")}</strong> to resolve.
                      </>
                    ) : (
                      <>
                        <strong>{plural(unansweredCount, "reported result", "reported results")}</strong>{" "}
                        the opposing side hasn&rsquo;t confirmed.
                      </>
                    )}
                  </span>
                  <Button size="sm" variant="secondary" onClick={goToResults}>
                    Review results
                  </Button>
                </li>
              ) : null}
              {appealsAwaitingDecision.length > 0 ? (
                <li style={styles.attentionItem}>
                  <span style={styles.attentionText}>
                    <strong>{plural(appealsAwaitingDecision.length, "result appeal", "result appeals")}</strong>{" "}
                    {appealsAwaitingDecision.length === 1 ? "is" : "are"} waiting for a decision.
                  </span>
                  <Button size="sm" variant="secondary" onClick={goToResults}>
                    Review appeals
                  </Button>
                </li>
              ) : null}
              {knownUnassignedCount > 0 ? (
                <li style={{ ...styles.attentionItem, ...styles.attentionItemUnassigned }}>
                  <span style={styles.attentionText}>
                    <strong>{plural(unassignedCount, "player has", "players have")}</strong> no division level
                    for {adminSeason.name}. They won&rsquo;t appear in any schedule or standings.
                  </span>
                  <Button size="sm" variant="secondary" onClick={goToUnassigned} className="tl-tint" style={styles.unassignedButton}>
                    Show unassigned
                  </Button>
                </li>
              ) : null}
            </ul>
          </section>
        ) : null}

        {pageLoading ? (
          <LoadingBlock label="Loading division…" rows={6} rowHeight={28} style={styles.placeholder} />
        ) : !division ? (
          <section style={styles.card} aria-labelledby="create-division-title">
            <h2 id="create-division-title" style={styles.sectionTitle}>Create your division</h2>
            <p style={styles.hint}>
              You aren&rsquo;t managing a division yet. Create one to set up seasons, division
              levels, and your roster.
            </p>
            <form
              style={styles.formRow}
              onSubmit={(event) => {
                event.preventDefault();
                void createDivisionAction.run();
              }}
            >
              <Field id="new-division-name" label="Division name" style={{ flex: "1 1 240px" }}>
                <input
                  id="new-division-name"
                  style={styles.input}
                  value={newDivisionName}
                  onChange={(e) => setNewDivisionName(e.target.value)}
                  placeholder="e.g. Office A"
                  autoComplete="off"
                />
              </Field>
              <Button
                type="submit"
                pending={createDivisionAction.pending}
                pendingLabel="Creating…"
                disabled={!newDivisionName.trim()}
              >
                Create division
              </Button>
            </form>
            {createDivisionAction.error ? (
              <InlineAlert tone="error" style={styles.blockGap}>
                {createDivisionAction.error}
              </InlineAlert>
            ) : null}
          </section>
        ) : viewAsUser ? (
          <section style={styles.card}>
            <h2 style={styles.sectionTitle}>{division.name}</h2>
            <p style={styles.hint}>User preview: admin-only setup, repair, export, and edit controls are hidden.</p>
            <p style={styles.hint}>
              {plural(rosterRows.length, "player", "players")} visible to users in {adminSeason.name}.
            </p>
          </section>
        ) : (
          <>
            <div style={styles.tabBar} role="tablist" aria-label="Admin sections">
              {TABS.map((tab, index) => {
                const active = activeTab === tab.id;
                const badge =
                  tab.id === "tools" && toolsAttentionCount > 0 ? (
                    <>
                      <CountPill count={toolsAttentionCount} />
                      <span className="sr-only">, {toolsAttentionCount} to review</span>
                    </>
                  ) : tab.id === "roster" && knownUnassignedCount > 0 ? (
                    <>
                      <CountPill count={unassignedCount} tone="unassigned" />
                      <span className="sr-only">, {unassignedCount} unassigned</span>
                    </>
                  ) : null;
                return (
                  <button
                    key={tab.id}
                    ref={(node) => {
                      tabRefs.current[tab.id] = node;
                    }}
                    type="button"
                    role="tab"
                    id={`admin-tab-${tab.id}`}
                    aria-selected={active}
                    aria-controls={`admin-panel-${tab.id}`}
                    tabIndex={active ? 0 : -1}
                    className={`${css.tab} ${active ? css.tabActive : ""}`}
                    onClick={() => selectTab(tab.id)}
                    onKeyDown={(event) => onTabKeyDown(event, index)}
                  >
                    {tab.label}
                    {badge}
                  </button>
                );
              })}
            </div>

            {activeTab === "roster" ? (
              <RosterPanel
                adminSeason={adminSeason}
                adminSeasonLevels={adminSeasonLevels}
                levelNameById={levelNameById}
                noLevelsYet={noLevelsYet}
                rosterReady={rosterReady}
                rosterLoadError={rosterLoadError}
                retryRosterLoad={retryRosterLoad}
                rosterRows={rosterRows}
                otherSeasonRows={otherSeasonRows}
                otherSeasonIds={otherSeasonIds}
                otherSeasonNames={otherSeasonNames}
                visibleRows={visibleRows}
                visibleIds={visibleIds}
                allVisibleSelected={allVisibleSelected}
                someVisibleSelected={someVisibleSelected}
                isFiltered={isFiltered}
                unassignedCount={unassignedCount}
                countByLevelId={countByLevelId}
                effectiveLevelId={effectiveLevelId}
                draftLevels={draftLevels}
                savingRowIds={savingRowIds}
                savedFlashIds={savedFlashIds}
                removeTarget={removeTarget}
                setRemoveTarget={setRemoveTarget}
                rosterSearch={rosterSearch}
                setRosterSearch={setRosterSearch}
                rosterFilter={rosterFilter}
                setRosterFilter={setRosterFilter}
                rosterAlert={rosterAlert}
                setRosterAlert={setRosterAlert}
                selectedPlayerIds={selectedPlayerIds}
                setSelectedPlayerIds={setSelectedPlayerIds}
                rosterHeadingRef={rosterHeadingRef}
                addPlayer={addPlayer}
                importRoster={importRoster}
                setAddPlayerOpen={setAddPlayerOpen}
                setImportOpen={setImportOpen}
                selectTab={selectTab}
                onRowLevelChange={onRowLevelChange}
                openPlayerDetail={openPlayerDetail}
              />
            ) : null}

            {activeTab === "divisions" ? (
              <DivisionsPanel
                division={division}
                adminSeason={adminSeason}
                adminSeasonLevels={adminSeasonLevels}
                countByLevelId={countByLevelId}
                loadingDivisionLevels={loadingDivisionLevels}
                divisionLevelsError={divisionLevelsError}
                divisionLevelsPermissionHint={divisionLevelsPermissionHint}
                authDebug={authDebug}
                levelMessage={levelMessage}
                setLevelMessage={setLevelMessage}
                codeCopied={codeCopied}
                copyInviteCode={copyInviteCode}
                openLevelForm={openLevelForm}
                showLevelOnRoster={showLevelOnRoster}
              />
            ) : null}

            {activeTab === "tools" ? (
              <ToolsPanel
                adminSeason={adminSeason}
                adminSeasonLevels={adminSeasonLevels}
                openToolPanel={openToolPanel}
                toggleToolPanel={toggleToolPanel}
                reportsHeadingRef={reportsHeadingRef}
                resultsHeadingRef={resultsHeadingRef}
                schedulerHeadingRef={schedulerHeadingRef}
                messageReports={messageReports}
                reportErrors={reportErrors}
                resolvingReportId={resolvingReportId}
                removeReportTarget={removeReportTarget}
                setRemoveReportTarget={setRemoveReportTarget}
                dismissReport={dismissReport}
                reportsAwaitingResolution={reportsAwaitingResolution}
                appealsAwaitingDecision={appealsAwaitingDecision}
                repairRankings={repairRankings}
                repairMessage={repairMessage}
                setRepairMessage={setRepairMessage}
                exportCsv={exportCsv}
                exportingType={exportingType}
                runExport={runExport}
                csvMessage={csvMessage}
                setCsvMessage={setCsvMessage}
                rrDivisionLevelId={rrDivisionLevelId}
                setRrDivisionLevelId={setRrDivisionLevelId}
                rrSelectedLevelIsDoubles={rrSelectedLevelIsDoubles}
                rrMemberships={rrMemberships}
                rrMembershipsError={rrMembershipsError}
                retryRrMemberships={retryRrMemberships}
                rrSelectedPlayerIds={rrSelectedPlayerIds}
                setRrSelectedPlayerIds={setRrSelectedPlayerIds}
                toggleRrPlayer={toggleRrPlayer}
                rrDoubleRoundRobin={rrDoubleRoundRobin}
                setRrDoubleRoundRobin={setRrDoubleRoundRobin}
                rrIntervalDays={rrIntervalDays}
                setRrIntervalDays={setRrIntervalDays}
                rrStartDate={rrStartDate}
                setRrStartDate={setRrStartDate}
                rrDateError={rrDateError}
                setRrDateError={setRrDateError}
                rrSeedByRankings={rrSeedByRankings}
                setRrSeedByRankings={setRrSeedByRankings}
                rrClearExisting={rrClearExisting}
                setRrClearExisting={setRrClearExisting}
                rrFormError={rrFormError}
                setRrFormError={setRrFormError}
                rrPreview={rrPreview}
                setRrPreview={setRrPreview}
                rrPreviewStartAt={rrPreviewStartAt}
                rrNameById={rrNameById}
                rrMessage={rrMessage}
                setRrMessage={setRrMessage}
                handleRrGeneratePreview={handleRrGeneratePreview}
                requestRrPublish={requestRrPublish}
              />
            ) : null}
          </>
        )}
      </main>

      {bulkBarVisible ? (
        <div style={styles.bulkBar} role="region" aria-label="Bulk actions for selected players">
          {bulkAssign.error ? (
            <InlineAlert tone="error" style={styles.bulkError} onDismiss={() => bulkAssign.setError(null)}>
              {bulkAssign.error}
            </InlineAlert>
          ) : null}
          <span style={styles.bulkCount}>
            {plural(selectedVisibleIds.length, "player", "players")} selected
          </span>
          <span style={styles.bulkDivider} aria-hidden="true" />
          <label htmlFor="bulk-level" style={styles.bulkAssign}>
            Assign to
          </label>
          <select
            id="bulk-level"
            style={styles.bulkSelect}
            value={bulkLevelId}
            onChange={(e) => setBulkLevelId(e.target.value)}
          >
            {adminSeasonLevels.map((level) => (
              <option key={level.id} value={level.id}>
                {level.name}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="secondary"
            pending={bulkAssign.pending}
            pendingLabel="Assigning…"
            disabled={!bulkLevelId}
            onClick={() => void bulkAssign.run()}
          >
            {bulkAssign.error ? "Try again" : `Assign ${selectedVisibleIds.length}`}
          </Button>
          <button
            type="button"
            className={css.bulkClear}
            disabled={bulkAssign.pending}
            onClick={() => {
              bulkAssign.setError(null);
              setSelectedPlayerIds([]);
            }}
          >
            Clear selection
          </button>
        </div>
      ) : null}

      {/* ---- Dialogs ---------------------------------------------------- */}

      <AddPlayerDialog
        division={division}
        adminSeason={adminSeason}
        adminSeasonLevels={adminSeasonLevels}
        levelLabel={levelLabel}
        addPlayer={addPlayer}
        addPlayerOpen={addPlayerOpen}
        setAddPlayerOpen={setAddPlayerOpen}
        addPlayerName={addPlayerName}
        setAddPlayerName={setAddPlayerName}
        addPlayerEmail={addPlayerEmail}
        setAddPlayerEmail={setAddPlayerEmail}
        addPlayerLevelId={addPlayerLevelId}
        setAddPlayerLevelId={setAddPlayerLevelId}
        addPlayerExisting={addPlayerExisting}
      />

      <ImportRosterDialog
        adminSeason={adminSeason}
        adminSeasonLevels={adminSeasonLevels}
        levelLabel={levelLabel}
        importRoster={importRoster}
        importOpen={importOpen}
        setImportOpen={setImportOpen}
        importText={importText}
        setImportText={setImportText}
        importEntries={importEntries}
        importPreview={importPreview}
        importMoves={importMoves}
        importLevelId={importLevelId}
        setImportLevelId={setImportLevelId}
      />

      <LevelFormDialog
        adminSeason={adminSeason}
        levelFormOpen={levelFormOpen}
        setLevelFormOpen={setLevelFormOpen}
        saveLevel={saveLevel}
        levelFormDirty={levelFormDirty}
        levelName={levelName}
        setLevelName={setLevelName}
        levelNameTaken={levelNameTaken}
        levelSkill={levelSkill}
        setLevelSkill={setLevelSkill}
        levelMatchType={levelMatchType}
        setLevelMatchType={setLevelMatchType}
        levelDescription={levelDescription}
        setLevelDescription={setLevelDescription}
      />

      <PlayerDetailDialog
        detailRow={detailRow}
        closePlayerDetail={closePlayerDetail}
        adminSeason={adminSeason}
        adminSeasonLevels={adminSeasonLevels}
        noLevelsYet={noLevelsYet}
        effectiveLevelId={effectiveLevelId}
        levelLabel={levelLabel}
        otherSeasonIds={otherSeasonIds}
        otherSeasonNames={otherSeasonNames}
        detailDirty={detailDirty}
        detailBusy={detailBusy}
        detailRegistered={detailRegistered}
        editName={editName}
        setEditName={setEditName}
        editDivisionLevelId={editDivisionLevelId}
        setEditDivisionLevelId={setEditDivisionLevelId}
        editRole={editRole}
        setEditRole={setEditRole}
        editStatus={editStatus}
        setEditStatus={setEditStatus}
        editEmail={editEmail}
        setEditEmail={setEditEmail}
        editPhone={editPhone}
        setEditPhone={setEditPhone}
        savePlayer={savePlayer}
        updateContact={updateContact}
        undoContact={undoContact}
        linkMatches={linkMatches}
        undoLink={undoLink}
        linkActionMessage={linkActionMessage}
        setLinkActionMessage={setLinkActionMessage}
        lastContactAction={lastContactAction}
        lastLinkAction={lastLinkAction}
        candidateMatchState={candidateMatchState}
        candidateMatches={candidateMatches}
        setCandidateMatchRefreshKey={setCandidateMatchRefreshKey}
        selectedMatchIds={selectedMatchIds}
        setSelectedMatchIds={setSelectedMatchIds}
      />

      <ConfirmDialog
        open={removeTarget !== null}
        title={
          removeTarget
            ? `Remove ${removeTarget.row.player.displayName} from ${adminSeason.name}?`
            : ""
        }
        message={
          removeTarget ? (
            <>
              {removeTarget.viaSelect ? (
                <p style={styles.confirmPara}>
                  Choosing Unassigned takes a player off this season&rsquo;s roster.
                </p>
              ) : null}
              <p style={styles.confirmPara}>
                {removeTarget.row.player.displayName} comes off the {adminSeason.name} roster and out of
                every division level this season, so they won&rsquo;t be in new schedules.
              </p>
              <p style={styles.confirmPara}>
                Their match history and standings are kept. If they aren&rsquo;t on any other season
                in this division, they&rsquo;re also taken off the division.
              </p>
            </>
          ) : null
        }
        confirmLabel="Remove player"
        pendingLabel="Removing…"
        onConfirm={confirmRemoveFromRoster}
        onCancel={cancelRemove}
      />

      <ConfirmDialog
        open={removeReportTarget !== null}
        title={
          removeReportTarget ? `Remove ${removeReportTarget.messageSenderName}'s message?` : ""
        }
        message={
          removeReportTarget ? (
            <>
              <blockquote style={styles.reportQuote}>{removeReportTarget.messageContent}</blockquote>
              <p style={styles.confirmPara}>
                The message is deleted from the conversation for everyone, and this report and any
                other pending reports of it are resolved. This can&rsquo;t be undone.
              </p>
            </>
          ) : null
        }
        confirmLabel="Remove message"
        pendingLabel="Removing…"
        onConfirm={confirmRemoveReportedMessage}
        onCancel={() => setRemoveReportTarget(null)}
      />

      <ConfirmDialog
        open={rrConfirm !== null}
        tone={rrClearExisting ? "danger" : "primary"}
        title={
          rrPreview
            ? `Publish ${plural(rrPreview.length, "match", "matches")} to ${levelLabel(rrDivisionLevelId)}?`
            : "Publish schedule?"
        }
        message={
          rrPreview && rrConfirm ? (
            <>
              <p style={styles.confirmPara}>
                This creates {plural(rrPreview.length, "scheduled match", "scheduled matches")} for{" "}
                {adminSeason.name}, one round every {rrIntervalDays} days starting{" "}
                {new Date(rrConfirm.startAt).toLocaleDateString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
                . Players can still postpone or cancel individual matches.
              </p>
              {rrClearExisting ? (
                <p style={styles.confirmPara}>
                  It first deletes the round-robin matches published earlier for this level that are
                  still scheduled. Matches players arranged themselves are kept.
                </p>
              ) : null}
            </>
          ) : null
        }
        confirmLabel={
          rrPreview ? `Publish ${plural(rrPreview.length, "match", "matches")}` : "Publish schedule"
        }
        pendingLabel="Publishing…"
        onConfirm={confirmRrPublish}
        onCancel={() => setRrConfirm(null)}
      />
    </div>
  );
}
