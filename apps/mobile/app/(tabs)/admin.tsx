import React, { useState, useEffect, useMemo } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useRouter } from "expo-router";
import { onSnapshot, getDoc, getDocs, query, where } from "firebase/firestore";
import {
  divisionsCol,
  usersCol,
  divisionDoc,
  matchesCol,
  rankingsCol,
  createDivision,
  addDivisionMemberPlaceholder,
  mergeDivisionPlayerRecords,
  recalculateDivisionRankings,
  updateDivisionPlayerEmail,
  upsertDivisionLevel,
  exportDivisionCsv,
  useDivisionLevels,
  useDivisionMemberships,
  useDivisionMessageReports,
  useReportsAwaitingResolution,
  resolveMessageReport,
  readableUserDoc,
} from "@tennis/firebase-client";
import { useAppStore } from "../../store/appStore";
import { KeyboardAwareScrollView } from "../../components/KeyboardSafeView";
import { AppIcon, ICON_SIZE } from "../../components/AppIcon";
import { FormField } from "../../components/FormField";
import { StatusBadge } from "../../components/StatusBadge";
import {
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  InlineAlert,
  LoadingState,
  MIN_TOUCH_TARGET,
  colors,
  confirmAction,
  confirmDestructive,
  radii,
  spacing,
  typography,
  useAsyncAction,
} from "../../theme";
import {
  currentSeasonForDate,
  defaultSeasonOptions,
  formatDivisionLevelName,
  type Division,
  type DivisionMatchType,
  type DivisionMembershipStatus,
  type DivisionSkillLevel,
  type Match,
  type MessageReport,
  type PlayerRanking,
  type User,
  isPrivilegedRole,
} from "@tennis/shared";

const REPORT_REASON_LABELS: Record<string, string> = {
  harassment: "Harassment",
  spam: "Spam",
  inappropriate: "Inappropriate",
  other: "Other",
};

const SKILL_LEVELS: DivisionSkillLevel[] = [
  "beginner",
  "intermediate",
  "advanced",
  "open",
];

/** A roster view must see waitlisted players too (see CLAUDE.md). */
const ROSTER_STATUSES: readonly DivisionMembershipStatus[] = [
  "active",
  "waitlisted",
];

type RepairResult = {
  result?: {
    countedMatches?: number;
    guestMatchesSkipped?: number;
    matchesNormalized?: number;
    rankingsWritten?: number;
    rankingsDeleted?: number;
  };
};

function plural(n: number, word: string, many = `${word}s`) {
  return `${n} ${n === 1 ? word : many}`;
}

export default function AdminScreen() {
  const router = useRouter();
  const { user } = useAppStore();
  const [division, setDivision] = useState<Division | null>(null);
  const [players, setPlayers] = useState<User[]>([]);
  const [newPlayerName, setNewPlayerName] = useState("");
  const [newPlayerEmail, setNewPlayerEmail] = useState("");
  const [needsMergeForUserId, setNeedsMergeForUserId] = useState<string | null>(
    null,
  );
  const [mergeSourceUserId, setMergeSourceUserId] = useState<string | null>(
    null,
  );
  const [candidateMatches, setCandidateMatches] = useState<Match[]>([]);
  const [candidateMatchRefreshKey, setCandidateMatchRefreshKey] = useState(0);
  const [selectedMatchIds, setSelectedMatchIds] = useState<string[]>([]);
  const [editEmail, setEditEmail] = useState("");
  const [newDivisionName, setNewDivisionName] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadRetryKey, setLoadRetryKey] = useState(0);
  const currentSeason = currentSeasonForDate();
  const seasonOptions = useMemo(() => defaultSeasonOptions(), []);
  // Page-level season: the level editor, roster levels, exports, and the
  // scheduler all work on this one season, like the web admin page.
  const [seasonId, setSeasonId] = useState(currentSeason.id);
  const selectedSeason =
    seasonOptions.find((season) => season.id === seasonId) ?? currentSeason;
  const { levels: divisionLevels } = useDivisionLevels(division?.id);
  const levelsForSeason = divisionLevels.filter((l) => l.seasonId === seasonId);
  const { memberships, loading: membershipsLoading } = useDivisionMemberships(
    division?.id,
    seasonId,
    null,
    ROSTER_STATUSES,
  );
  const {
    reports: messageReports,
    loading: reportsLoading,
    error: reportsError,
  } = useDivisionMessageReports(division?.id);
  const { matches: awaitingResolution } = useReportsAwaitingResolution(
    division?.id,
  );
  const [levelSkill, setLevelSkill] = useState<DivisionSkillLevel>("beginner");
  const [levelMatchType, setLevelMatchType] =
    useState<DivisionMatchType>("singles");
  const [levelName, setLevelName] = useState(
    formatDivisionLevelName("beginner", "singles"),
  );
  const [levelDescription, setLevelDescription] = useState("");

  // Post-action feedback that stays on screen (also announced).
  const [addNotice, setAddNotice] = useState<string | null>(null);
  const [mergeNotice, setMergeNotice] = useState<string | null>(null);
  const [levelNotice, setLevelNotice] = useState<string | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [repairMessage, setRepairMessage] = useState("");
  const [exportingType, setExportingType] = useState<
    "matches" | "rankings" | null
  >(null);
  const [lastExportType, setLastExportType] = useState<
    "matches" | "rankings"
  >("matches");
  const [activeReport, setActiveReport] = useState<{
    id: string;
    action: "dismiss" | "remove";
  } | null>(null);

  const isAdmin = isPrivilegedRole(user?.role);

  useEffect(() => {
    if (!user?.id) {
      setDivision(null);
      setPlayers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    const q = query(
      divisionsCol(),
      where("leaderIds", "array-contains", user.id),
    );
    let activeId = 0;
    const unsub = onSnapshot(
      q,
      async (snap) => {
        // Prevent older async snapshot work from overwriting state after a newer snapshot arrives.
        const currentId = ++activeId;
        try {
          let div: Division | null = null;

          if (!snap.empty) {
            div = {
              id: snap.docs[0].id,
              ...(snap.docs[0].data() as Omit<Division, "id">),
            };
          } else if (user.divisionId) {
            const divisionSnap = await getDoc(divisionDoc(user.divisionId));
            if (divisionSnap.exists()) {
              div = {
                id: divisionSnap.id,
                ...(divisionSnap.data() as Omit<Division, "id">),
              };
            }
          }

          if (currentId !== activeId) return;

          setDivision(div);
          if (div) {
            const activeDivision = div;
            const [divisionMemberProfiles, divisionProfileSnap, rankingSnap] =
              await Promise.all([
                activeDivision.playerIds.length
                  ? Promise.all(
                      activeDivision.playerIds.map((id) => readableUserDoc(id)),
                    )
                  : Promise.resolve([]),
                getDocs(
                  query(
                    usersCol(),
                    where("divisionId", "==", activeDivision.id),
                  ),
                ),
                getDocs(rankingsCol(activeDivision.id)),
              ]);
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
            rankingSnap.docs.forEach((d) => {
              const ranking = d.data() as PlayerRanking;
              const userId = ranking.userId || d.id;
              if (byId.has(userId)) return;
              byId.set(userId, {
                id: userId,
                displayName: ranking.displayName,
                email: "",
                contactPreferences: {
                  allowEmail: false,
                  allowSMS: false,
                  allowInApp: true,
                },
                divisionId: activeDivision.id,
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
        } catch (err) {
          if (currentId !== activeId) return;
          console.error("[AdminScreen] failed to load division data:", err);
          setLoadError(
            "Could not load division data. Check your connection and try again.",
          );
          setLoading(false);
        }
      },
      (err) => {
        console.error("[AdminScreen] division listener error:", err);
        setLoadError(
          "Could not load division data. Check your connection and try again.",
        );
        setLoading(false);
      },
    );
    return () => {
      activeId++;
      unsub();
    };
  }, [user?.id, user?.divisionId, loadRetryKey]);

  const create = useAsyncAction(
    async (name: string) => {
      if (!user) throw new Error("Sign in again to create a division.");
      await createDivision(name, user.id, {
        displayName: user.displayName,
        email: user.email,
      });
    },
    {
      successMessage: "Division created",
      errorMessage: "Couldn't create the division. Check your connection and try again.",
      onSuccess: () => setNewDivisionName(""),
    },
  );

  const addPlayer = useAsyncAction(
    async (name: string, email: string) => {
      if (!division) throw new Error("No division loaded.");
      return addDivisionMemberPlaceholder(
        division.id,
        name,
        email || undefined,
        false,
      );
    },
    {
      successMessage: (result) =>
        `Player added. ${plural(result.linkedHistoricalMatches, "match", "matches")} linked.`,
      errorMessage: (e) =>
        (e as { message?: string }).message ||
        "Couldn't add the player. Check your connection and try again.",
    },
  );

  async function handleAddPlayer() {
    const name = newPlayerName.trim();
    const email = newPlayerEmail.trim();
    if (!division || !name) return;
    setAddNotice(null);
    const result = await addPlayer.run(name, email);
    if (!result) return;
    setNeedsMergeForUserId(result.userId);
    setMergeSourceUserId(null);
    setSelectedMatchIds([]);
    setCandidateMatches([]);
    setEditEmail(email);
    setMergeNotice(null);
    setAddNotice(
      result.linkedHistoricalMatches > 0
        ? `${name} was added, and ${plural(result.linkedHistoricalMatches, "recorded match", "recorded matches")} with the same player name ${result.linkedHistoricalMatches === 1 ? "was" : "were"} linked automatically. If any are still missing, link them below.`
        : `${name} was added. If they already have recorded matches under another record, link them below.`,
    );
    setNewPlayerName("");
    setNewPlayerEmail("");
  }

  const merge = useAsyncAction(
    async () => {
      if (!division || !needsMergeForUserId) throw new Error("No player selected.");
      return mergeDivisionPlayerRecords(division.id, needsMergeForUserId, {
        sourceUserId: mergeSourceUserId || undefined,
        matchIds: selectedMatchIds,
        targetEmail: editEmail.trim() || undefined,
      });
    },
    {
      successMessage: (updated) =>
        `${plural(updated, "match", "matches")} linked`,
      errorMessage: (e) =>
        (e as { message?: string }).message ||
        "Couldn't link those matches. Check your connection and try again.",
      onSuccess: (updated) => {
        setMergeNotice(
          `Linked ${plural(updated, "recorded match", "recorded matches")} and refreshed the standings.`,
        );
        setCandidateMatchRefreshKey((key) => key + 1);
        setSelectedMatchIds([]);
        setMergeSourceUserId(null);
      },
    },
  );

  const addedPlayerName =
    players.find((p) => p.id === needsMergeForUserId)?.displayName ??
    "this player";

  async function handleMergeRecords() {
    if (!division || !needsMergeForUserId || selectedMatchIds.length === 0) return;
    setMergeNotice(null);
    const ok = await confirmAction({
      title: `Link ${plural(selectedMatchIds.length, "match", "matches")} to ${addedPlayerName}?`,
      message:
        "These results will count toward this player's record and the standings are recalculated. Check the selection: linking the wrong match changes someone's standing.",
      confirmLabel: "Link matches",
    });
    if (ok) await merge.run();
  }

  const updateEmail = useAsyncAction(
    async () => {
      if (!division || !needsMergeForUserId) throw new Error("No player selected.");
      await updateDivisionPlayerEmail(division.id, needsMergeForUserId, editEmail);
    },
    {
      successMessage: "Player email updated",
      errorMessage: (e) =>
        (e as { message?: string }).message || "Couldn't update the email. Try again.",
      onSuccess: () => setMergeNotice("Email updated."),
    },
  );

  useEffect(() => {
    async function loadCandidateMatches() {
      if (!division?.id || !needsMergeForUserId) {
        setCandidateMatches([]);
        setSelectedMatchIds([]);
        return;
      }
      const snap = await getDocs(
        query(
          matchesCol(),
          where("divisionId", "==", division.id),
          where("status", "==", "completed"),
        ),
      );
      const matches = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<Match, "id">) }))
        .filter((match) => {
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
    void loadCandidateMatches();
  }, [division?.id, needsMergeForUserId, candidateMatchRefreshKey]);

  const saveLevel = useAsyncAction(
    async () => {
      if (!division) throw new Error("No division loaded.");
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
    },
    {
      successMessage: () => `${levelName} saved`,
      errorMessage: (e) =>
        (e as { message?: string }).message ||
        "Couldn't save the division level. Try again.",
      onSuccess: () => {
        setLevelNotice(`${levelName} is saved for ${selectedSeason.name}.`);
        setLevelDescription("");
      },
    },
  );

  const exportCsv = useAsyncAction(
    async (exportType: "matches" | "rankings") => {
      if (!division) throw new Error("No division loaded.");
      const result = await exportDivisionCsv({
        divisionId: division.id,
        exportType,
        seasonId,
      });
      const safeFilename = result.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
      const baseDirectory =
        FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
      if (!baseDirectory) {
        throw new Error("This device has no writable app folder for the CSV file.");
      }
      const fileUri = `${baseDirectory}${safeFilename}`;
      await FileSystem.writeAsStringAsync(fileUri, result.csv, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      if (!(await Sharing.isAvailableAsync())) {
        throw new Error(
          "The CSV was created, but sharing isn't available on this device. Export it from the web admin page instead.",
        );
      }
      await Sharing.shareAsync(fileUri, {
        mimeType: result.contentType,
        dialogTitle: result.filename,
        UTI: "public.comma-separated-values-text",
      });
      return exportType;
    },
    {
      successMessage: (type) => `${type === "matches" ? "Matches" : "Rankings"} CSV ready`,
      errorMessage: (e) =>
        (e as { message?: string }).message || "Couldn't export the CSV. Try again.",
      onSuccess: (type) =>
        setExportNotice(
          `${type === "matches" ? "Matches" : "Rankings"} CSV for ${selectedSeason.name} was created.`,
        ),
    },
  );

  async function handleExport(type: "matches" | "rankings") {
    setExportingType(type);
    setLastExportType(type);
    setExportNotice(null);
    await exportCsv.run(type);
    setExportingType(null);
  }

  const repair = useAsyncAction(
    async () => {
      if (!division) throw new Error("No division loaded.");
      return (await recalculateDivisionRankings(division.id, true)) as RepairResult;
    },
    {
      successMessage: "Rankings repaired",
      errorMessage: (e) =>
        (e as { message?: string }).message ||
        "Couldn't repair the rankings. Check your connection and try again.",
      onSuccess: (response) => {
        const result = response?.result;
        setRepairMessage(
          result
            ? `Counted ${plural(result.countedMatches ?? 0, "match", "matches")} and left out ${plural(result.guestMatchesSkipped ?? 0, "guest match", "guest matches")}. Updated ${plural(result.rankingsWritten ?? 0, "ranking row")} and removed ${plural(result.rankingsDeleted ?? 0, "stale row")}. Normalized ${plural(result.matchesNormalized ?? 0, "historic match", "historic matches")}.`
            : "Rankings repaired.",
        );
      },
    },
  );

  const resolve = useAsyncAction(
    async (report: MessageReport, action: "dismiss" | "remove") => {
      if (!user) throw new Error("Sign in again to resolve reports.");
      await resolveMessageReport(report, user.id, action);
      return action;
    },
    {
      successMessage: (action) =>
        action === "remove" ? "Message removed" : "Report dismissed",
      errorMessage: (e) =>
        (e as { message?: string }).message ||
        "Couldn't resolve the report. Check your connection and try again.",
    },
  );

  async function handleResolveReport(
    report: MessageReport,
    action: "dismiss" | "remove",
  ) {
    if (action === "remove") {
      const ok = await confirmDestructive({
        title: "Remove this message?",
        message: `The message from ${report.messageSenderName} is deleted for everyone in the conversation, and this report and any other reports of it are marked resolved. This can't be undone.`,
        confirmLabel: "Remove message",
      });
      if (!ok) return;
    }
    setActiveReport({ id: report.id, action });
    await resolve.run(report, action);
  }

  // Roster players (not ranking-only history rows) with no active or waitlisted
  // membership in this season. Only meaningful once the season has levels.
  const membershipByUser = useMemo(() => {
    const map = new Map<string, (typeof memberships)[number]>();
    memberships.forEach((m) => map.set(m.userId, m));
    return map;
  }, [memberships]);
  const levelNameById = useMemo(() => {
    const map = new Map<string, string>();
    divisionLevels.forEach((l) => map.set(l.id, l.name));
    return map;
  }, [divisionLevels]);
  const unassignedCount =
    division && levelsForSeason.length > 0 && !membershipsLoading
      ? division.playerIds.filter((id) => !membershipByUser.has(id)).length
      : 0;

  if (!isAdmin) {
    return (
      <EmptyState
        style={styles.fill}
        icon="person.crop.rectangle.stack"
        title="For division leaders"
        message="The Admin tab is only available to division leaders and app admins. Ask your division leader if you need something changed."
      />
    );
  }

  if (loading) {
    return <LoadingState style={styles.fill} label="Loading your division" />;
  }

  if (loadError) {
    return (
      <ErrorState
        style={styles.fill}
        title="Couldn't load your division"
        message={loadError}
        onRetry={() => setLoadRetryKey((key) => key + 1)}
      />
    );
  }

  if (!division) {
    return (
      <KeyboardAwareScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
      >
        <Card style={styles.card}>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            Create your division
          </Text>
          <Text style={styles.hint}>
            You aren't leading a division yet. Create one, then add players and
            division levels for the season.
          </Text>
          <FormField
            label="Division name"
            required
            value={newDivisionName}
            onChangeText={(t) => {
              setNewDivisionName(t);
              create.reset();
            }}
            placeholder="For example, Office A"
            autoCapitalize="words"
            returnKeyType="done"
            onSubmitEditing={() => {
              if (newDivisionName.trim()) void create.run(newDivisionName.trim());
            }}
          />
          {create.error ? (
            <InlineAlert
              tone="error"
              message={create.error}
              actionLabel="Try again"
              onAction={() => void create.run(newDivisionName.trim())}
            />
          ) : null}
          <Button
            label="Create division"
            pending={create.pending}
            disabled={!newDivisionName.trim()}
            onPress={() => void create.run(newDivisionName.trim())}
          />
        </Card>
      </KeyboardAwareScrollView>
    );
  }

  const pendingReports = messageReports.length;
  const nothingNeedsYou =
    !reportsLoading &&
    !reportsError &&
    pendingReports === 0 &&
    awaitingResolution.length === 0 &&
    unassignedCount === 0;

  return (
    <KeyboardAwareScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle} accessibilityRole="header">
          {division.name}
        </Text>
        <Text style={styles.hint}>
          {plural(players.length, "player")} · Working on {selectedSeason.name}
        </Text>
        <View style={styles.chipRow}>
          {seasonOptions.map((season) => (
            <Chip
              key={season.id}
              label={season.name}
              accessibilityLabel={`Work on season ${season.name}`}
              selected={seasonId === season.id}
              onPress={() => {
                setSeasonId(season.id);
                setLevelNotice(null);
                setExportNotice(null);
              }}
            />
          ))}
        </View>
      </View>

      {/* What needs the leader first. */}
      <Card style={styles.card}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          Needs your attention
        </Text>
        {nothingNeedsYou ? (
          <View style={styles.allClear}>
            <AppIcon
              name="checkmark.circle"
              size={ICON_SIZE.action}
              color={colors.successText}
            />
            <Text style={styles.allClearText}>
              Nothing is waiting on you. No reported messages, disputes, or
              unassigned players.
            </Text>
          </View>
        ) : null}

        {unassignedCount > 0 ? (
          <InlineAlert
            tone="warning"
            title={`${plural(unassignedCount, "player")} without a division level`}
            message={`They aren't on any ${selectedSeason.name} level, so the round-robin scheduler won't include them. Assign levels from the Roster tab on the web admin page.`}
          />
        ) : null}

        {awaitingResolution.length > 0 ? (
          <View style={styles.subsection}>
            <Text style={styles.subTitle} accessibilityRole="header">
              Results to settle ({awaitingResolution.length})
            </Text>
            <Text style={styles.hint}>
              Disputed scores, and reports the other side hasn't answered. Open
              one to confirm the reported score or set the correct one.
            </Text>
            {awaitingResolution.map((m) => (
              <Pressable
                key={m.id}
                accessibilityRole="button"
                accessibilityLabel={`${m.player1Name ?? "Player 1"} versus ${m.player2Name ?? "Player 2"}, ${m.status === "disputed" ? "disputed" : "awaiting the other side"}`}
                accessibilityHint="Opens the match to settle its result"
                android_ripple={{ color: colors.primarySoft }}
                style={({ pressed }) => [
                  styles.listRow,
                  pressed && styles.listRowPressed,
                ]}
                onPress={() =>
                  router.push({ pathname: "/match/[id]", params: { id: m.id } })
                }
              >
                <Text style={styles.listRowText} numberOfLines={2}>
                  {m.player1Name ?? "Player 1"} vs {m.player2Name ?? "Player 2"}
                </Text>
                <StatusBadge status={m.status} />
              </Pressable>
            ))}
          </View>
        ) : null}

        <View style={styles.subsection}>
          <Text style={styles.subTitle} accessibilityRole="header">
            Reported messages{pendingReports > 0 ? ` (${pendingReports})` : ""}
          </Text>
          {reportsLoading ? (
            <LoadingState inline showLabel label="Loading reported messages" />
          ) : reportsError ? (
            <InlineAlert
              tone="error"
              message="Couldn't load reported messages. Check your connection, then reopen the Admin tab."
            />
          ) : pendingReports === 0 ? (
            <Text style={styles.hint}>No messages are waiting for review.</Text>
          ) : (
            messageReports.map((report) => {
              const busy = resolve.pending && activeReport?.id === report.id;
              return (
                <View key={report.id} style={styles.reportItem}>
                  <View style={styles.reportHeader}>
                    <Text style={styles.playerName}>
                      {report.messageSenderName}
                    </Text>
                    <View style={styles.reportReasonBadge}>
                      <Text style={styles.reportReasonBadgeText}>
                        {REPORT_REASON_LABELS[report.reason] ?? report.reason}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.reportContent} numberOfLines={3}>
                    "{report.messageContent}"
                  </Text>
                  {report.note ? (
                    <Text style={styles.playerContact}>
                      Reporter's note: {report.note}
                    </Text>
                  ) : null}
                  {resolve.error && activeReport?.id === report.id ? (
                    <InlineAlert tone="error" message={resolve.error} />
                  ) : null}
                  <View style={styles.reportActions}>
                    <Button
                      label="Dismiss"
                      variant="secondary"
                      size="compact"
                      accessibilityLabel={`Dismiss report about ${report.messageSenderName}'s message`}
                      disabled={resolve.pending}
                      pending={busy && activeReport?.action === "dismiss"}
                      style={styles.reportAction}
                      onPress={() => void handleResolveReport(report, "dismiss")}
                    />
                    <Button
                      label="Remove message"
                      variant="danger"
                      size="compact"
                      icon="trash"
                      accessibilityLabel={`Remove message from ${report.messageSenderName}`}
                      disabled={resolve.pending}
                      pending={busy && activeReport?.action === "remove"}
                      style={styles.reportAction}
                      onPress={() => void handleResolveReport(report, "remove")}
                    />
                  </View>
                </View>
              );
            })
          )}
        </View>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          Players
        </Text>
        {players.length === 0 ? (
          <Text style={styles.hint}>
            No players yet. Add the first one below.
          </Text>
        ) : (
          <View>
            {players.map((p, i) => {
              const isLeader = division.leaderIds.includes(p.id);
              const membership = membershipByUser.get(p.id);
              const onRoster = division.playerIds.includes(p.id);
              const levelLabel = membership
                ? `${levelNameById.get(membership.divisionLevelId) ?? "Division level"}${membership.status === "waitlisted" ? " · Waitlisted" : ""}`
                : null;
              return (
                <View
                  key={p.id}
                  style={[styles.playerRow, i > 0 && styles.playerRowDivider]}
                >
                  <View style={styles.playerInfo}>
                    <Text style={styles.playerName}>{p.displayName}</Text>
                    {p.contactPreferences?.allowEmail !== false && p.email ? (
                      <Text style={styles.playerContact}>{p.email}</Text>
                    ) : null}
                    {p.phone && p.contactPreferences?.allowSMS ? (
                      <Text style={styles.playerContact}>{p.phone}</Text>
                    ) : null}
                    {levelLabel ? (
                      <Text style={styles.playerContact}>{levelLabel}</Text>
                    ) : onRoster && levelsForSeason.length > 0 && !membershipsLoading ? (
                      <View style={styles.unassignedLine}>
                        <AppIcon
                          name="exclamationmark.triangle"
                          size={ICON_SIZE.small}
                          color={colors.unassignedText}
                        />
                        <Text style={styles.unassignedText}>
                          No {selectedSeason.name} level
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={isLeader ? styles.leaderBadge : styles.playerBadge}>
                    <Text
                      style={isLeader ? styles.leaderBadgeText : styles.playerBadgeText}
                    >
                      {isLeader ? "Leader" : "Player"}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        <View style={styles.subsection}>
          <Text style={styles.subTitle} accessibilityRole="header">
            Add a player
          </Text>
          <Text style={styles.hint}>
            Adds them to the roster. Someone without an account yet becomes a
            placeholder, and their matches move to their account when they
            accept an invite.
          </Text>
          <FormField
            label="Full name"
            required
            value={newPlayerName}
            onChangeText={(t) => {
              setNewPlayerName(t);
              addPlayer.reset();
            }}
            placeholder="First and last name"
            autoCapitalize="words"
            textContentType="name"
          />
          <FormField
            label="Email"
            helperText="Optional"
            value={newPlayerEmail}
            onChangeText={(t) => {
              setNewPlayerEmail(t);
              addPlayer.reset();
            }}
            placeholder="name@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="emailAddress"
          />
          {addPlayer.error ? (
            <InlineAlert
              tone="error"
              title="Couldn't add the player"
              message={addPlayer.error}
              actionLabel="Try again"
              onAction={() => void handleAddPlayer()}
            />
          ) : null}
          {addNotice ? <InlineAlert tone="success" message={addNotice} /> : null}
          <Button
            label="Add player"
            icon="person.crop.circle.badge.plus"
            pending={addPlayer.pending}
            pendingLabel="Adding player"
            disabled={!newPlayerName.trim()}
            onPress={() => void handleAddPlayer()}
          />
        </View>

        {needsMergeForUserId ? (
          <View style={styles.subsection}>
            <Text style={styles.subTitle} accessibilityRole="header">
              Link recorded matches to {addedPlayerName} (optional)
            </Text>
            <Text style={styles.hint}>
              If this player's past matches were recorded under another record,
              pick that record and the matches they played, then link them.
            </Text>
            <FormField
              label="Player email"
              helperText="Optional. Updates the email on this placeholder."
              value={editEmail}
              onChangeText={(t) => {
                setEditEmail(t);
                updateEmail.reset();
              }}
              placeholder="name@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {updateEmail.error ? (
              <InlineAlert
                tone="error"
                message={updateEmail.error}
                actionLabel="Try again"
                onAction={() => void updateEmail.run()}
              />
            ) : null}
            <Button
              label="Update email"
              variant="secondary"
              pending={updateEmail.pending}
              disabled={!editEmail.trim() || merge.pending}
              onPress={() => {
                setMergeNotice(null);
                void updateEmail.run();
              }}
            />

            <Text style={styles.fieldLabel}>Existing record (optional)</Text>
            <View accessibilityRole="radiogroup">
              {players
                .filter((p) => p.id !== needsMergeForUserId)
                .map((p) => {
                  const selected = mergeSourceUserId === p.id;
                  return (
                    <Pressable
                      key={p.id}
                      accessibilityRole="radio"
                      accessibilityLabel={p.displayName}
                      accessibilityState={{ checked: selected }}
                      android_ripple={{ color: colors.primarySoft }}
                      style={[styles.selectRow, selected && styles.selectRowActive]}
                      onPress={() =>
                        setMergeSourceUserId(selected ? null : p.id)
                      }
                    >
                      <View style={[styles.radio, selected && styles.radioOn]}>
                        {selected ? <View style={styles.radioDot} /> : null}
                      </View>
                      <Text style={styles.selectRowText}>{p.displayName}</Text>
                    </Pressable>
                  );
                })}
            </View>

            <Text style={styles.fieldLabel}>
              Matches {addedPlayerName} played
              {selectedMatchIds.length > 0 ? ` (${selectedMatchIds.length} selected)` : ""}
            </Text>
            {candidateMatches.length > 0 ? (
              candidateMatches.map((match) => {
                const selected = selectedMatchIds.includes(match.id);
                return (
                  <Pressable
                    key={match.id}
                    accessibilityRole="checkbox"
                    accessibilityLabel={`${match.player1Name || "Player 1"} versus ${match.player2Name || "Player 2"}`}
                    accessibilityState={{ checked: selected }}
                    android_ripple={{ color: colors.primarySoft }}
                    style={[styles.selectRow, selected && styles.selectRowActive]}
                    onPress={() =>
                      setSelectedMatchIds((prev) =>
                        selected
                          ? prev.filter((id) => id !== match.id)
                          : [...prev, match.id],
                      )
                    }
                  >
                    <View style={[styles.checkbox, selected && styles.checkboxOn]}>
                      {selected ? (
                        <AppIcon
                          name="checkmark"
                          size={ICON_SIZE.small}
                          color={colors.onPrimary}
                        />
                      ) : null}
                    </View>
                    <Text style={styles.selectRowText}>
                      {match.player1Name || "Player 1"} vs{" "}
                      {match.player2Name || "Player 2"}
                    </Text>
                  </Pressable>
                );
              })
            ) : (
              <Text style={styles.hint}>
                No completed matches are missing a player.
              </Text>
            )}
            {merge.error ? (
              <InlineAlert
                tone="error"
                title="Couldn't link the matches"
                message={merge.error}
                actionLabel="Try again"
                onAction={() => void merge.run()}
              />
            ) : null}
            {mergeNotice ? (
              <InlineAlert tone="success" message={mergeNotice} />
            ) : null}
            <Button
              label={
                selectedMatchIds.length > 0
                  ? `Link ${plural(selectedMatchIds.length, "match", "matches")}`
                  : "Link selected matches"
              }
              icon="link"
              pending={merge.pending}
              pendingLabel="Linking matches"
              disabled={selectedMatchIds.length === 0 || updateEmail.pending}
              onPress={() => void handleMergeRecords()}
            />
            <Button
              label="Done linking"
              variant="quiet"
              onPress={() => {
                setNeedsMergeForUserId(null);
                setMergeNotice(null);
                setAddNotice(null);
              }}
            />
          </View>
        ) : null}
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          Division levels for {selectedSeason.name}
        </Text>
        {levelsForSeason.length > 0 ? (
          <View style={styles.levelList}>
            {levelsForSeason.map((level) => (
              <View key={level.id} style={styles.levelItem}>
                <Text style={styles.playerName}>{level.name}</Text>
                <Text style={styles.playerContact}>
                  {level.matchType === "doubles" ? "Doubles" : "Singles"}
                  {level.description ? ` · ${level.description}` : ""}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.hint}>
            No division levels for {selectedSeason.name} yet. Add one below so
            players can be assigned and scheduled.
          </Text>
        )}

        <View style={styles.subsection}>
          <Text style={styles.subTitle} accessibilityRole="header">
            Add or update a level
          </Text>
          <Text style={styles.fieldLabel}>Skill level</Text>
          <View style={styles.chipRow}>
            {SKILL_LEVELS.map((skill) => (
              <Chip
                key={skill}
                label={skill[0].toUpperCase() + skill.slice(1)}
                selected={levelSkill === skill}
                onPress={() => {
                  setLevelSkill(skill);
                  setLevelName(formatDivisionLevelName(skill, levelMatchType));
                  saveLevel.reset();
                }}
              />
            ))}
          </View>
          <Text style={styles.fieldLabel}>Format</Text>
          <View style={styles.chipRow}>
            {(["singles", "doubles"] as DivisionMatchType[]).map((matchType) => (
              <Chip
                key={matchType}
                label={matchType === "singles" ? "Singles" : "Doubles"}
                selected={levelMatchType === matchType}
                onPress={() => {
                  setLevelMatchType(matchType);
                  setLevelName(formatDivisionLevelName(levelSkill, matchType));
                  saveLevel.reset();
                }}
              />
            ))}
          </View>
          <FormField
            label="Level name"
            required
            value={levelName}
            onChangeText={(t) => {
              setLevelName(t);
              saveLevel.reset();
            }}
            placeholder="Level name"
          />
          <FormField
            label="Description"
            helperText="Optional. Eligibility notes players will see."
            value={levelDescription}
            onChangeText={setLevelDescription}
            placeholder="For example, NTRP 3.0 to 3.5"
          />
          {saveLevel.error ? (
            <InlineAlert
              tone="error"
              message={saveLevel.error}
              actionLabel="Try again"
              onAction={() => void saveLevel.run()}
            />
          ) : null}
          {levelNotice ? <InlineAlert tone="success" message={levelNotice} /> : null}
          <Button
            label={`Save level for ${selectedSeason.name}`}
            variant="secondary"
            pending={saveLevel.pending}
            pendingLabel="Saving level"
            disabled={!levelName.trim()}
            onPress={() => {
              setLevelNotice(null);
              void saveLevel.run();
            }}
          />
        </View>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          Tools
        </Text>

        <View style={styles.tool}>
          <Text style={styles.subTitle}>Round-robin scheduler</Text>
          <Text style={styles.hint}>
            Build and publish every match for a singles division level in one
            go. You see a preview before anything is created.
          </Text>
          <Button
            label="Open scheduler"
            icon="calendar.badge.plus"
            variant="secondary"
            accessibilityLabel="Open round-robin scheduler"
            onPress={() =>
              router.push({
                pathname: "/round-robin-scheduler",
                params: { divisionId: division.id, seasonId },
              })
            }
          />
        </View>

        <View style={[styles.tool, styles.toolDivider]}>
          <Text style={styles.subTitle}>Export {selectedSeason.name} as CSV</Text>
          <Text style={styles.hint}>
            Creates a spreadsheet file and opens the share sheet.
          </Text>
          {exportCsv.error ? (
            <InlineAlert
              tone="error"
              message={exportCsv.error}
              actionLabel="Try again"
              onAction={() => void handleExport(lastExportType)}
            />
          ) : null}
          {exportNotice ? <InlineAlert tone="success" message={exportNotice} /> : null}
          <View style={styles.buttonRow}>
            <Button
              label="Matches CSV"
              icon="square.and.arrow.up"
              variant="secondary"
              accessibilityLabel="Share matches CSV"
              style={styles.flexButton}
              pending={exportCsv.pending && exportingType === "matches"}
              disabled={exportCsv.pending}
              onPress={() => void handleExport("matches")}
            />
            <Button
              label="Rankings CSV"
              icon="square.and.arrow.up"
              variant="secondary"
              accessibilityLabel="Share rankings CSV"
              style={styles.flexButton}
              pending={exportCsv.pending && exportingType === "rankings"}
              disabled={exportCsv.pending}
              onPress={() => void handleExport("rankings")}
            />
          </View>
        </View>

        <View style={[styles.tool, styles.toolDivider]}>
          <Text style={styles.subTitle}>Ranking repair</Text>
          <Text style={styles.hint}>
            Rebuilds standings and head-to-head records from completed matches,
            and tidies older recorded matches. No match history is deleted.
          </Text>
          {repair.error ? (
            <InlineAlert
              tone="error"
              message={repair.error}
              actionLabel="Try again"
              onAction={() => void repair.run()}
            />
          ) : null}
          {repairMessage ? (
            <InlineAlert tone="success" title="Rankings repaired" message={repairMessage} />
          ) : null}
          <Button
            label="Repair rankings"
            icon="arrow.clockwise"
            variant="secondary"
            pending={repair.pending}
            pendingLabel="Repairing rankings"
            onPress={() => {
              setRepairMessage("");
              void repair.run();
            }}
          />
        </View>
      </Card>
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.canvas },
  container: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.lg },
  pageHeader: { gap: spacing.sm },
  pageTitle: { ...typography.title, color: colors.primary },
  card: { gap: spacing.md },
  sectionTitle: { ...typography.heading, color: colors.primary },
  subsection: {
    gap: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  subTitle: { ...typography.subheading, color: colors.text },
  fieldLabel: { ...typography.label, color: colors.text, marginTop: spacing.sm },
  hint: { ...typography.bodySmall, color: colors.textMuted },
  allClear: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  allClearText: { ...typography.bodySmall, color: colors.text, flex: 1 },
  listRow: {
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    overflow: "hidden",
  },
  listRowPressed: { backgroundColor: colors.surfaceMuted },
  listRowText: { ...typography.label, color: colors.text, flex: 1 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  selectRow: {
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    overflow: "hidden",
  },
  selectRowActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  selectRowText: { ...typography.label, color: colors.text, flex: 1 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: radii.sm,
    borderWidth: 2,
    borderColor: colors.textMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  radio: {
    width: 22,
    height: 22,
    borderRadius: radii.pill,
    borderWidth: 2,
    borderColor: colors.textMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  radioOn: { borderColor: colors.primary },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
  },
  levelList: { gap: spacing.sm },
  levelItem: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.xxs,
  },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  playerRowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  playerInfo: { flex: 1, gap: spacing.xxs },
  playerName: { ...typography.subheading, color: colors.text },
  playerContact: { ...typography.bodySmall, color: colors.textMuted },
  unassignedLine: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  unassignedText: {
    ...typography.caption,
    color: colors.unassignedText,
    fontWeight: "700",
  },
  leaderBadge: {
    backgroundColor: colors.unassignedSoft,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  leaderBadgeText: {
    ...typography.caption,
    color: colors.unassignedText,
    fontWeight: "700",
  },
  playerBadge: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  playerBadgeText: { ...typography.caption, color: colors.textMuted },
  reportItem: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  reportHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
  },
  reportReasonBadge: {
    backgroundColor: colors.destructiveSoft,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  reportReasonBadgeText: {
    ...typography.caption,
    color: colors.destructive,
    fontWeight: "700",
  },
  reportContent: {
    ...typography.bodySmall,
    color: colors.text,
    fontStyle: "italic",
  },
  reportActions: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  reportAction: { flexGrow: 1 },
  tool: { gap: spacing.sm },
  toolDivider: {
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  buttonRow: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  flexButton: { flexGrow: 1 },
});
