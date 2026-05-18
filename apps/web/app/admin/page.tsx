"use client";

export const dynamic = "force-dynamic";

import { AppNav, appNavStyles } from "../shared/AppNav";
import { useState, useEffect, useMemo } from "react";
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
  addDivisionMemberPlaceholder as addDivisionMemberPlaceholderShared,
  updateDivisionPlayerEmail as updateDivisionPlayerEmailShared,
  upsertDivisionLevel,
  exportDivisionCsv,
  backfillDivisionSeasonLevel,
  useAuthUser,
  useDivisionLevels,
  useDivisionMemberships,
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
} from "@tennis/shared";
import { query, where } from "firebase/firestore";

const PRIVILEGED_ROLES = new Set(['admin', 'division_leader', 'app_developer']);

export default function AdminPage(): React.JSX.Element {
  const { firebaseUser } = useAuthUser();
  const router = useRouter();
  const [division, setDivision] = useState<Division | null>(null);
  const [players, setPlayers] = useState<User[]>([]);
  const [memberName, setMemberName] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [memberSeasonId, setMemberSeasonId] = useState(currentSeasonForDate().id);
  const [memberLevelId, setMemberLevelId] = useState("");
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
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [inviteMessage, setInviteMessage] = useState("");
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
  const [levelSeasonId, setLevelSeasonId] = useState(currentSeason.id);
  const [levelName, setLevelName] = useState(formatDivisionLevelName("beginner", "singles"));
  const [levelSkill, setLevelSkill] = useState<DivisionSkillLevel>("beginner");
  const [levelMatchType, setLevelMatchType] = useState<DivisionMatchType>("singles");
  const [levelDescription, setLevelDescription] = useState("");
  const [savingLevel, setSavingLevel] = useState(false);
  const [levelMessage, setLevelMessage] = useState("");
  const [adminSeasonId, setAdminSeasonId] = useState(currentSeason.id);
  const [viewAsUser, setViewAsUser] = useState(false);
  const { memberships: seasonMemberships } = useDivisionMemberships(
    division?.id,
    adminSeasonId,
  );
  const [exportingCsv, setExportingCsv] = useState(false);
  const [csvMessage, setCsvMessage] = useState("");
  const [backfillMessage, setBackfillMessage] = useState("");
  const [backfillLevelId, setBackfillLevelId] = useState("");
  const [backfillingLevelId, setBackfillingLevelId] = useState<string | null>(null);
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

  const levelNameById = useMemo(
    () => new Map(divisionLevels.map((level) => [level.id, level.name] as const)),
    [divisionLevels],
  );
  const addMemberSeasonLevels = useMemo(
    () => divisionLevels.filter((level) => level.seasonId === memberSeasonId),
    [divisionLevels, memberSeasonId],
  );
  const adminSeasonLevels = useMemo(
    () => divisionLevels.filter((level) => level.seasonId === adminSeasonId),
    [adminSeasonId, divisionLevels],
  );
  const divisionLevelsPermissionHint = useMemo(() => {
    if (divisionLevelsError?.code !== "permission-denied") return null;
    return [
      "You are signed in to Firebase Auth with the expected account.",
      "Your users/{uid}.role is admin or app_developer, OR your users/{uid}.divisionId matches this division.",
      "Your uid is listed in this division's leaderIds or playerIds roster.",
    ];
  }, [divisionLevelsError?.code]);


  useEffect(() => {
    if (memberLevelId && addMemberSeasonLevels.some((level) => level.id === memberLevelId)) return;
    setMemberLevelId(addMemberSeasonLevels[0]?.id ?? "");
  }, [addMemberSeasonLevels, memberLevelId]);

  useEffect(() => {
    if (backfillLevelId && adminSeasonLevels.some((level) => level.id === backfillLevelId)) return;
    setBackfillLevelId(adminSeasonLevels[0]?.id ?? "");
  }, [adminSeasonLevels, backfillLevelId]);

  // Gate: redirect players who are not leaders/admins away from this page.
  useEffect(() => {
    if (!firebaseUser) return;
    getDoc(userDoc(firebaseUser.uid)).then((snap) => {
      const role = snap.data()?.role as string | undefined;
      if (!role || !PRIVILEGED_ROLES.has(role)) {
        router.replace('/dashboard');
      }
    });
  }, [firebaseUser, router]);

  // Resolve the division context for leaders and admins.
  useEffect(() => {
    if (!firebaseUser) {
      setDivision(null);
      setPlayers([]);
      setLoading(false);
      return;
    }
    const leaderQuery = query(
      divisionsCol(),
      where("leaderIds", "array-contains", firebaseUser.uid),
    );

    return onSnapshot(leaderQuery, async (leaderSnap) => {
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

      setDivision(div);
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
        setPlayers(
          [...byId.values()].sort((a, b) =>
            a.displayName.localeCompare(b.displayName),
          ),
        );
      } else {
        setPlayers([]);
      }
      setLoading(false);
    });
  }, [firebaseUser]);

  async function createDivision() {
    if (!firebaseUser || !newDivisionName.trim()) return;
    await createDivisionShared(newDivisionName.trim(), firebaseUser.uid, {
      displayName: firebaseUser.displayName ?? undefined,
      email: firebaseUser.email ?? undefined,
    });
    setNewDivisionName("");
  }

  async function addDivisionMember() {
    if (!firebaseUser || !division?.id || !memberName.trim() || !memberLevelId) return;
    setAdding(true);
    setError("");
    setInviteMessage("");
    try {
      const trimmedName = memberName.trim();
      const trimmedEmail = memberEmail.trim() || undefined;
      const memberResult = await addDivisionMemberPlaceholderShared(
        division.id,
        trimmedName,
        trimmedEmail,
        false,
        { seasonId: memberSeasonId, divisionLevelId: memberLevelId },
      );
      setNeedsMergeForUserId(memberResult.userId);
      setMergeSourceUserId("");
      setSelectedMatchIds([]);
      setCandidateMatches([]);
      setEditEmail(trimmedEmail ?? "");
      setEditPhone("");
      const baseMessage = memberResult.createdPlaceholder
        ? `Player added for ${memberName.trim()}.`
        : "Existing registered player added to division.";
      const linkedMessage = memberResult.linkedHistoricalMatches
        ? ` Automatically linked ${memberResult.linkedHistoricalMatches} historical match${
            memberResult.linkedHistoricalMatches === 1 ? "" : "es"
          } by player name.`
        : "";
      setInviteMessage(
        `${baseMessage}${linkedMessage} If anything is missing, link records below.`,
      );
      setMemberName("");
      setMemberEmail("");
    } catch (e) {
      const message = (e as { message?: string; code?: string }).message;
      const code = (e as { code?: string }).code;
      setError(
        message
          ? `${code ?? "error"}: ${message}`
          : "Failed to add division member. Please try again.",
      );
    } finally {
      setAdding(false);
    }
  }

  async function handleMergeRecords() {
    if (!division || !needsMergeForUserId) return;
    if (selectedMatchIds.length === 0) {
      setError("Please select at least one match to link.");
      return;
    }
    setMerging(true);
    setError("");
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
      setInviteMessage("");
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
      setError(
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
    setError("");
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
      setError(
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
    setError("");
    try {
      const reverted = await mergeDivisionPlayerRecords(
        division.id,
        lastLinkAction.sourceUserId,
        {
          sourceUserId: lastLinkAction.targetUserId,
          matchIds: lastLinkAction.matchIds,
        },
      );
      setInviteMessage("");
      setLinkActionMessage({
        targetUserId: lastLinkAction.sourceUserId,
        message: `Undo complete. Reverted ${reverted} linked historical matches.`,
        kind: "link",
      });
      setLastLinkAction(null);
    } catch (e) {
      const message = (e as { message?: string; code?: string }).message;
      const code = (e as { code?: string }).code;
      setError(
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
    setError("");
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
      setError(
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
    const selectedSeason = seasonOptions.find((season) => season.id === levelSeasonId) ?? currentSeason;
    setSavingLevel(true);
    setError("");
    setLevelMessage("");
    try {
      await upsertDivisionLevel({
        divisionId: division.id,
        seasonId: selectedSeason.id,
        year: selectedSeason.year,
        seasonHalf: selectedSeason.half,
        name: levelName,
        skillLevel: levelSkill,
        matchType: levelMatchType,
        description: levelDescription,
        rankingsEnabled: true,
        active: true,
        sortOrder: divisionLevels.length + 1,
      });
      setLevelDescription("");
      setLevelMessage("Division level saved. Rankings and CSV exports can now use this season/division option.");
    } catch (e) {
      setError((e as { message?: string }).message || "Failed to save division level.");
    } finally {
      setSavingLevel(false);
    }
  }

  async function handleExportCsv(exportType: "matches" | "rankings") {
    if (!division) return;
    setExportingCsv(true);
    setCsvMessage("");
    setError("");
    try {
      const result = await exportDivisionCsv({
        divisionId: division.id,
        exportType,
        seasonId: levelSeasonId,
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
      setError((e as { message?: string }).message || "Failed to export CSV.");
    } finally {
      setExportingCsv(false);
    }
  }


  async function handleBackfillLevel(levelId: string) {
    if (!division) return;
    const level = divisionLevels.find((item) => item.id === levelId);
    if (!level) return;
    const confirmed = window.confirm(
      `Link all legacy matches without a season/division level to ${level.name}? Existing season/level assignments will be left unchanged.`,
    );
    if (!confirmed) return;
    setBackfillingLevelId(levelId);
    setBackfillMessage("");
    setError("");
    try {
      const result = await backfillDivisionSeasonLevel({
        divisionId: division.id,
        seasonId: level.seasonId,
        divisionLevelId: level.id,
        matchType: level.matchType,
      });
      setBackfillMessage(
        `Linked ${result.updatedMatches} legacy match${result.updatedMatches === 1 ? "" : "es"} and upserted ${result.membershipsUpserted} roster membership${result.membershipsUpserted === 1 ? "" : "s"} for ${level.name}.`,
      );
    } catch (e) {
      setError((e as { message?: string }).message || "Failed to link legacy matches.");
    } finally {
      setBackfillingLevelId(null);
    }
  }


  async function handleBackfillSelectedLevel() {
    if (!backfillLevelId) {
      setError("Create or select a division level before linking legacy matches.");
      return;
    }
    await handleBackfillLevel(backfillLevelId);
  }

  async function repairRankings() {
    if (!division) return;
    setRepairingRankings(true);
    setError("");
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
      setError(message || "Failed to repair rankings. Please try again.");
    } finally {
      setRepairingRankings(false);
    }
  }

  const playerById = new Map(players.map((player) => [player.id, player] as const));
  const membershipByUserId = new Map(seasonMemberships.map((membership) => [membership.userId, membership] as const));
  const membershipRows = seasonMemberships.map((membership) => ({
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
  const legacyRows = players
    .filter((player) => !membershipByUserId.has(player.id))
    .map((player) => ({ player, membership: null }));
  const rosterRows = [...membershipRows, ...legacyRows];
  const rowsByLevel = rosterRows.reduce<
    Array<{ levelId: string; levelName: string; rows: Array<{ player: User; membership: DivisionMembership | null }> }>
  >((groups, row) => {
    const levelId = row.membership?.divisionLevelId ?? "unassigned";
    const levelName =
      levelId === "unassigned"
        ? "Unassigned / legacy roster"
        : levelNameById.get(levelId) ?? "Division level";
    let group = groups.find((item) => item.levelId === levelId);
    if (!group) {
      group = { levelId, levelName, rows: [] };
      groups.push(group);
    }
    group.rows.push(row);
    return groups;
  }, []);

  return (
    <div style={styles.page}>
      <AppNav active="admin" />

      <main style={styles.main}>
        <div style={styles.adminHeader}>
          <h1 style={styles.pageTitle}>Division Admin</h1>
          <button
            type="button"
            style={styles.btnSecondary}
            onClick={() => setViewAsUser((current) => !current)}
          >
            {viewAsUser ? "Exit user view" : "View as user"}
          </button>
        </div>

        {loading ? (
          <div style={styles.placeholder}>Loading…</div>
        ) : !division ? (
          <div style={styles.card}>
            <h2 style={styles.sectionTitle}>Create Your Division</h2>
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
                Create Division
              </button>
            </div>
          </div>
        ) : viewAsUser ? (
          <div style={styles.card}>
            <h2 style={styles.sectionTitle}>{division.name}</h2>
            <p style={styles.hint}>User preview: admin-only setup, repair, export, and edit controls are hidden.</p>
            <div style={styles.filterBar}>
              <label style={styles.filterLabel}>
                Season
                <select
                  style={styles.input}
                  value={adminSeasonId}
                  onChange={(e) => setAdminSeasonId(e.target.value)}
                >
                  {seasonOptions.map((season) => (
                    <option key={season.id} value={season.id}>
                      {season.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p style={styles.hint}>{players.length} player{players.length !== 1 ? "s" : ""} visible to users.</p>
          </div>
        ) : (
          <>
            <div style={styles.card}>
              <h2 style={styles.sectionTitle}>{division.name}</h2>
              <p style={styles.hint}>
                {players.length} player{players.length !== 1 ? "s" : ""}{" "}
                enrolled
              </p>

              <h3 style={styles.subTitle}>Add Division Member</h3>
              <p style={styles.hint}>
                One flow for existing players and placeholders. If the email
                belongs to a registered account, they are added directly.
                Otherwise, a placeholder is created.
              </p>
              <div style={styles.row}>
                <select
                  style={styles.input}
                  value={memberSeasonId}
                  onChange={(e) => {
                    setMemberSeasonId(e.target.value);
                    setMemberLevelId("");
                  }}
                  aria-label="Member season"
                >
                  {seasonOptions.map((season) => (
                    <option key={season.id} value={season.id}>
                      {season.name}
                    </option>
                  ))}
                </select>
                <select
                  style={styles.input}
                  value={memberLevelId}
                  onChange={(e) => setMemberLevelId(e.target.value)}
                  aria-label="Member division level"
                >
                  <option value="">Select division level</option>
                  {addMemberSeasonLevels.map((level) => (
                    <option key={level.id} value={level.id}>
                      {level.name}
                    </option>
                  ))}
                </select>
                <input
                  style={styles.input}
                  value={memberName}
                  onChange={(e) => setMemberName(e.target.value)}
                  placeholder="Player name"
                />
                <input
                  style={styles.input}
                  value={memberEmail}
                  onChange={(e) => setMemberEmail(e.target.value)}
                  placeholder="player@company.com (optional)"
                  type="email"
                />
                <button
                  style={styles.btn}
                  onClick={addDivisionMember}
                  disabled={adding || !memberName.trim() || !memberLevelId || !division?.id}
                >
                  {adding ? "Saving…" : "Add Member"}
                </button>
              </div>
              {inviteMessage && <p role="status" aria-live="polite" style={styles.success}>{inviteMessage}</p>}
              {error && <p role="alert" style={styles.error}>{error}</p>}
            </div>


            <div style={styles.card}>
              <h2 style={styles.sectionTitle}>Seasons & Division Levels</h2>
              <p style={styles.hint}>
                Document league levels by Spring/Fall season and mark whether each level is singles or doubles.
              </p>
              <div style={styles.row}>
                <select
                  style={styles.input}
                  value={levelSeasonId}
                  onChange={(e) => setLevelSeasonId(e.target.value)}
                  aria-label="Season"
                >
                  {seasonOptions.map((season) => (
                    <option key={season.id} value={season.id}>
                      {season.name}
                    </option>
                  ))}
                </select>
                <select
                  style={styles.input}
                  value={levelSkill}
                  onChange={(e) => {
                    const skill = e.target.value as DivisionSkillLevel;
                    setLevelSkill(skill);
                    setLevelName(formatDivisionLevelName(skill, levelMatchType));
                  }}
                  aria-label="Skill level"
                >
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                  <option value="open">Open</option>
                </select>
                <select
                  style={styles.input}
                  value={levelMatchType}
                  onChange={(e) => {
                    const matchType = e.target.value as DivisionMatchType;
                    setLevelMatchType(matchType);
                    setLevelName(formatDivisionLevelName(levelSkill, matchType));
                  }}
                  aria-label="Match type"
                >
                  <option value="singles">Singles</option>
                  <option value="doubles">Doubles</option>
                </select>
              </div>
              <div style={styles.row}>
                <input
                  style={styles.input}
                  value={levelName}
                  onChange={(e) => setLevelName(e.target.value)}
                  placeholder="Level name"
                />
                <input
                  style={styles.input}
                  value={levelDescription}
                  onChange={(e) => setLevelDescription(e.target.value)}
                  placeholder="Description or eligibility notes (optional)"
                />
                <button
                  style={styles.btn}
                  onClick={handleCreateLevel}
                  disabled={savingLevel || !levelName.trim()}
                >
                  {savingLevel ? "Saving…" : "Save Level"}
                </button>
              </div>
              {levelMessage && <p role="status" aria-live="polite" style={styles.success}>{levelMessage}</p>}
              {loadingDivisionLevels ? (
                <p style={styles.hint}>Loading division levels…</p>
              ) : divisionLevelsError ? (
                <div role="alert" style={styles.error}>
                  <p>
                    Unable to load division levels for {division?.name ?? "this division"}.
                    {" "}{divisionLevelsError.message}
                  </p>
                  {divisionLevelsPermissionHint ? (
                    <ul style={styles.errorList}>
                      {divisionLevelsPermissionHint.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : divisionLevels.length > 0 ? (
                <div style={styles.levelGrid}>
                  {divisionLevels.map((level) => (
                    <div key={level.id} style={styles.levelPill}>
                      <strong>{level.name}</strong>
                      <span>{level.seasonHalf === "spring" ? "Spring" : "Fall"} {level.year} · {level.matchType}</span>
                      {level.description ? <span>{level.description}</span> : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p style={styles.hint}>
                  No division levels documented for {division?.name ?? "this division"} yet.
                </p>
              )}
              <div style={styles.editorActions}>
                <button style={styles.btnSecondary} onClick={() => handleExportCsv("matches")} disabled={exportingCsv}>
                  Export matches CSV
                </button>
                <button style={styles.btnSecondary} onClick={() => handleExportCsv("rankings")} disabled={exportingCsv}>
                  Export rankings CSV
                </button>
                {csvMessage && <p role="status" style={styles.inlineSuccess}>{csvMessage}</p>}
              </div>
            </div>


            <div style={styles.card}>
              <h2 style={styles.sectionTitle}>Link Legacy Matches</h2>
              <p style={styles.hint}>
                Previously recorded matches may not have season/division-level fields yet.
                Choose the correct season and division level below to make those legacy matches
                appear in the filtered Matches and Standings views. Existing season/level assignments are not overwritten.
              </p>
              <div style={styles.row}>
                <select
                  style={styles.input}
                  value={adminSeasonId}
                  onChange={(e) => setAdminSeasonId(e.target.value)}
                  aria-label="Legacy match season"
                >
                  {seasonOptions.map((season) => (
                    <option key={season.id} value={season.id}>
                      {season.name}
                    </option>
                  ))}
                </select>
                <select
                  style={styles.input}
                  value={backfillLevelId}
                  onChange={(e) => setBackfillLevelId(e.target.value)}
                  aria-label="Legacy match division level"
                >
                  <option value="">Select division level</option>
                  {adminSeasonLevels.map((level) => (
                    <option key={level.id} value={level.id}>
                      {level.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  style={styles.btn}
                  onClick={handleBackfillSelectedLevel}
                  disabled={!backfillLevelId || !!backfillingLevelId}
                >
                  {backfillingLevelId === backfillLevelId ? "Linking…" : "Link legacy matches"}
                </button>
              </div>
              {adminSeasonLevels.length === 0 && (
                <p style={styles.hint}>Create a division level for this season before linking legacy matches.</p>
              )}
              {backfillMessage && <p role="status" style={styles.success}>{backfillMessage}</p>}
            </div>

            <div style={styles.card}>
              <h2 style={styles.sectionTitle}>Master Divisions</h2>
              <p style={styles.hint}>All division options configured for the selected season.</p>
              <div style={styles.filterBar}>
                <label style={styles.filterLabel}>
                  Season
                  <select
                    style={styles.input}
                    value={adminSeasonId}
                    onChange={(e) => setAdminSeasonId(e.target.value)}
                  >
                    {seasonOptions.map((season) => (
                      <option key={season.id} value={season.id}>
                        {season.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div style={styles.tableScroller}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Division</th>
                      <th style={styles.th}>Type</th>
                      <th style={styles.th}>Skill</th>
                      <th style={styles.th}>Description</th>
                      <th style={styles.th}>Legacy Data</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminSeasonLevels.map((level) => (
                      <tr key={level.id} style={styles.tr}>
                        <td style={styles.td}>{level.name}</td>
                        <td style={styles.td}>{level.matchType}</td>
                        <td style={styles.td}>{level.skillLevel}</td>
                        <td style={styles.td}>{level.description || "—"}</td>
                        <td style={styles.td}>
                          <button
                            type="button"
                            style={styles.btnSecondary}
                            onClick={() => handleBackfillLevel(level.id)}
                            disabled={backfillingLevelId === level.id}
                          >
                            {backfillingLevelId === level.id ? "Linking…" : "Link legacy matches"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {adminSeasonLevels.length === 0 && (
                <p style={styles.hint}>No divisions have been configured for this season.</p>
              )}
              {backfillMessage && <p role="status" style={styles.success}>{backfillMessage}</p>}
            </div>

            <div style={styles.card}>
              <h2 style={styles.sectionTitle}>Ranking Repair</h2>
              <p style={styles.hint}>
                Rebuild rankings and head-to-head records from completed matches
                without deleting match history.
              </p>
              <button
                style={styles.btn}
                onClick={repairRankings}
                disabled={repairingRankings}
              >
                {repairingRankings ? "Repairing..." : "Repair Rankings"}
              </button>
              {repairMessage && <p role="status" aria-live="polite" style={styles.success}>{repairMessage}</p>}
            </div>

            <div style={styles.card}>
              <h2 style={styles.sectionTitle}>Players</h2>
              <div style={styles.filterBar}>
                <label style={styles.filterLabel}>
                  Season
                  <select
                    style={styles.input}
                    value={adminSeasonId}
                    onChange={(e) => setAdminSeasonId(e.target.value)}
                  >
                    {seasonOptions.map((season) => (
                      <option key={season.id} value={season.id}>
                        {season.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {rosterRows.length === 0 ? (
                <p style={styles.hint}>No players yet. Add players above.</p>
              ) : (
                <div style={styles.tableScroller}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Name</th>
                        <th style={styles.th}>Email</th>
                        <th style={styles.th}>Phone</th>
                        <th style={styles.th}>Role</th>
                        <th style={styles.th}>Status</th>
                        <th style={styles.th}>Options</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rowsByLevel.flatMap((group) => [
                        <tr key={`${group.levelId}-group`} style={styles.groupHeaderRow}>
                          <td style={styles.groupHeaderCell} colSpan={6}>
                            {group.levelName} · {group.rows.length} player{group.rows.length === 1 ? "" : "s"}
                          </td>
                        </tr>,
                        ...group.rows.flatMap(({ player: p }) => {
                        const rows: React.JSX.Element[] = [
                          <tr key={`${p.id}-row`} style={styles.tr}>
                            <td style={styles.td}>{p.displayName}</td>
                            <td style={styles.td}>
                              {p.contactPreferences?.allowEmail !== false ? (
                                <a
                                  href={`mailto:${p.email}`}
                                  style={styles.contactLink}
                                >
                                  {p.email}
                                </a>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td style={styles.td}>
                              {p.phone && p.contactPreferences?.allowSMS ? (
                                <a
                                  href={`tel:${p.phone}`}
                                  style={styles.contactLink}
                                >
                                  {p.phone}
                                </a>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td style={styles.td}>
                              <span
                                style={
                                  division.leaderIds.includes(p.id)
                                    ? styles.leaderBadge
                                    : styles.playerBadge
                                }
                              >
                                {division.leaderIds.includes(p.id)
                                  ? "Leader"
                                  : "Player"}
                              </span>
                            </td>
                            <td style={styles.td}>
                              {p.isRegistered === false
                                ? p.inviteStatus === "invite_sent"
                                  ? "Invite Sent"
                                  : "Unregistered"
                                : "Registered"}
                            </td>
                            <td style={styles.td}>
                              <button
                                style={styles.btnSecondary}
                                onClick={() => {
                                  setNeedsMergeForUserId(p.id);
                                  setMergeSourceUserId("");
                                  setSelectedMatchIds([]);
                                  setEditEmail(p.email ?? "");
                                  setEditPhone(p.phone ?? "");
                                  setLinkActionMessage(null);
                                  setExpandedPlayerId((current) =>
                                    current === p.id ? null : p.id,
                                  );
                                }}
                              >
                                ⋯
                              </button>
                            </td>
                          </tr>,
                        ];
                        if (expandedPlayerId === p.id) {
                          rows.push(
                            <tr key={`${p.id}-editor`}>
                              <td
                                style={{ ...styles.td, ...styles.editorCell }}
                                colSpan={6}
                              >
                                <div style={styles.inlineEditor}>
                                  <input
                                    style={{
                                      ...styles.input,
                                      ...styles.editorInput,
                                    }}
                                    value={editEmail}
                                    onChange={(e) =>
                                      setEditEmail(e.target.value)
                                    }
                                    placeholder="Update player email (optional)"
                                    type="email"
                                    aria-label="Update player email"
                                  />
                                  <input
                                    style={{
                                      ...styles.input,
                                      ...styles.editorInput,
                                    }}
                                    value={editPhone}
                                    onChange={(e) =>
                                      setEditPhone(e.target.value)
                                    }
                                    placeholder="Update player phone (optional)"
                                    type="tel"
                                    aria-label="Update player phone"
                                  />
                                  <p style={styles.linkPrompt}>
                                    Which of the recorded matches did{" "}
                                    {p.displayName} play in?
                                  </p>
                                  <div style={styles.editorActions}>
                                    <button
                                      style={styles.btn}
                                      onClick={handleMergeRecords}
                                      disabled={
                                        selectedMatchIds.length === 0 ||
                                        merging ||
                                        needsMergeForUserId !== p.id
                                      }
                                    >
                                      {merging
                                        ? "Linking…"
                                        : "Link Selected Matches"}
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
                                      Update Contact
                                    </button>
                                    <button
                                      style={styles.btnSecondary}
                                      onClick={undoLastLink}
                                      disabled={
                                        !lastLinkAction?.sourceUserId || merging
                                      }
                                    >
                                      Undo Last Link
                                    </button>
                                    {linkActionMessage?.targetUserId === p.id && (
                                      <div style={styles.confirmPrompt}>
                                        <p style={styles.inlineSuccess}>
                                          {linkActionMessage.message}
                                        </p>
                                        <button type="button" style={styles.btn} onClick={() => setLinkActionMessage(null)}>
                                          Confirm
                                        </button>
                                        <button
                                          type="button"
                                          style={styles.btnSecondary}
                                          onClick={linkActionMessage.kind === "contact" ? undoLastContact : undoLastLink}
                                          disabled={merging || (linkActionMessage.kind === "link" && !lastLinkAction?.sourceUserId)}
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
                                          style={{
                                            display: "block",
                                            marginBottom: 6,
                                          }}
                                        >
                                          <input
                                            type="checkbox"
                                            checked={selectedMatchIds.includes(
                                              m.id,
                                            )}
                                            onChange={(e) =>
                                              setSelectedMatchIds((prev) =>
                                                e.target.checked
                                                  ? [...prev, m.id]
                                                  : prev.filter(
                                                      (id) => id !== m.id,
                                                    ),
                                              )
                                            }
                                          />{" "}
                                          {m.player1Name || "P1"} vs{" "}
                                          {m.player2Name || "P2"}
                                        </label>
                                      ))
                                    ) : (
                                      <p style={styles.hint}>
                                        No recorded matches are available.
                                        Matches already linked to two player
                                        profiles are hidden.
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>,
                          );
                        }
                        return rows;
                      }),
                      ])}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: appNavStyles.page,
  main: { maxWidth: 900, margin: "0 auto", padding: "40px 24px" },
  adminHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 24, flexWrap: "wrap" as const },
  pageTitle: {
    fontSize: 28,
    fontWeight: 800,
    color: "var(--green-dark)",
    marginBottom: 0,
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
  inlineEditor: {
    display: "grid",
    gridTemplateColumns: "minmax(180px, 1fr) minmax(240px, 2fr)",
    gap: 12,
    alignItems: "center",
    maxWidth: "100%",
  },
  editorCell: { background: "#fcfcfc" },
  editorInput: { boxSizing: "border-box" as const, minWidth: 0, width: "100%" },
  editorActions: {
    gridColumn: "1 / -1",
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
  },
  linkPrompt: { margin: 0, fontSize: 14, color: "#444", alignSelf: "center" },
  matchChecklist: {
    gridColumn: "1 / -1",
    borderTop: "1px solid #eee",
    paddingTop: 8,
  },
  row: { display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 },
  filterBar: { display: "flex", gap: 12, flexWrap: "wrap", margin: "10px 0 16px" },
  filterLabel: { display: "grid", gap: 6, fontSize: 12, fontWeight: 700, color: "#555", textTransform: "uppercase" as const, letterSpacing: 0.4 },
  input: {
    flex: 1,
    border: "1px solid #ddd",
    borderRadius: 10,
    padding: "10px 14px",
    fontSize: 14,
  },
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
  error: { marginTop: 10, color: "#c0392b", fontSize: 13 },
  errorList: { margin: "6px 0 0 18px", padding: 0, display: "grid", gap: 4 },
  success: { marginTop: 10, color: "#1a7f37", fontSize: 13 },
  confirmPrompt: { flexBasis: "100%", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" },
  inlineSuccess: {
    flexBasis: "100%",
    margin: "0 0 4px",
    color: "#1a7f37",
    fontSize: 13,
    fontWeight: 600,
  },
  levelGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, margin: "14px 0" },
  levelPill: { border: "1px solid #e7e7e7", borderRadius: 12, padding: 12, display: "grid", gap: 4, fontSize: 13, color: "#555" },
  tableScroller: { overflowX: "auto" as const, width: "100%" },
  table: {
    width: "100%",
    minWidth: 760,
    borderCollapse: "collapse" as const,
    marginTop: 8,
  },
  th: {
    textAlign: "left" as const,
    fontSize: 12,
    fontWeight: 700,
    color: "#999",
    padding: "10px 14px",
    borderBottom: "2px solid #f0f0f0",
    textTransform: "uppercase" as const,
  },
  tr: { borderBottom: "1px solid #f5f5f5" },
  groupHeaderRow: { background: "#f7fbf7" },
  groupHeaderCell: { padding: "10px 14px", fontSize: 13, fontWeight: 800, color: "var(--green-dark)", borderTop: "1px solid #e6f2e6", borderBottom: "1px solid #e6f2e6" },
  td: { padding: "12px 14px", fontSize: 14, color: "#333" },
  contactLink: { color: "var(--green-dark)", fontWeight: 500 },
  leaderBadge: {
    background: "#fff3cd",
    color: "#856404",
    padding: "2px 10px",
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 700,
  },
  playerBadge: {
    background: "#f0f0f0",
    color: "#555",
    padding: "2px 10px",
    borderRadius: 20,
    fontSize: 12,
  },
};
