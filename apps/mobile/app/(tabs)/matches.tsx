import React, { useState, useEffect, useMemo, useRef } from "react";
import { colors } from "../../theme";
import {
  View,
  Text,
  SectionList,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  FlatList,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { onSnapshot } from "firebase/firestore";
import {
  divisionMatchesQuery,
  createMatch,
  recordHistoricMatch,
  recordMatchOnBehalf,
  searchDivisionPlayers,
  proposeMatch,
  proposeDoublesMatch,
  acceptMatchProposal,
  declineMatchProposal,
} from "@tennis/firebase-client";
import {
  formatScoreDisplay,
  formatGameScore,
  getMatchStatusMetadata,
  currentSeasonForDate,
  defaultSeasonOptions,
  sideOfPlayer,
} from "@tennis/shared";
import { useAppStore } from "../../store/appStore";
import { StatusBadge } from "../../components/StatusBadge";
import { KeyboardAwareBottomSheet } from "../../components/KeyboardSafeView";
import type { Match, PublicProfile } from "@tennis/shared";
import { PlayerSlotPicker } from "../../components/PlayerSlotPicker";
import {
  AppIcon,
  IconLabel,
  ICON_COLOR,
  ICON_SIZE,
} from "../../components/AppIcon";
import { FormErrorSummary, FormField } from "../../components/FormField";

type ActionKind = "pending" | "awaiting" | null;
type MatchItem = { id: string; match: Match; actionKind: ActionKind };
type MatchFilter = "upcoming" | "action" | "completed" | "all";

const FILTERS: { id: MatchFilter; label: string }[] = [
  { id: "upcoming", label: "Upcoming" },
  { id: "action", label: "Needs action" },
  { id: "completed", label: "Completed" },
  { id: "all", label: "All" },
];
const COLLAPSED_HISTORY_LIMIT = 5;

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function formatScheduledAt(ts?: number): string {
  if (!ts) return "Time TBD";
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function MatchCard({
  match,
  onPress,
  actionKind,
  onAccept,
  onDecline,
  onWithdraw,
}: {
  match: Match;
  onPress: () => void;
  actionKind?: ActionKind;
  onAccept?: () => void;
  onDecline?: () => void;
  onWithdraw?: () => void;
}) {
  const { width } = useWindowDimensions();
  const compact = width < 380;
  const isLive = match.status === "in_progress";
  const isUpcoming =
    match.status === "scheduled" || match.status === "proposed";
  const metadata = getMatchStatusMetadata(match.status);
  const player1Name = match.player1Name ?? "Player 1";
  const player2Name = match.player2Name ?? "Player 2";
  const cardAccessibilityLabel = `${player1Name} versus ${player2Name}, ${metadata.accessibilityLabel}${
    isUpcoming ? `, ${formatScheduledAt(match.scheduledAt)}` : ""
  }`;

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={cardAccessibilityLabel}
      style={[styles.card, isLive && styles.cardLive]}
      onPress={onPress}
    >
      <View style={[styles.cardHeader, compact && styles.wrapRow]}>
        <StatusBadge status={match.status} />
        {match.winner && (
          <Text style={styles.winnerBadge}>
            {match.winner === "player1"
              ? (match.player1Name ?? "P1") + " wins"
              : (match.player2Name ?? "P2") + " wins"}
          </Text>
        )}
      </View>

      {isUpcoming && (
        <IconLabel name="calendar" textStyle={styles.scheduledLine}>
          {formatScheduledAt(match.scheduledAt)}
        </IconLabel>
      )}

      {!isUpcoming && (
        <View style={[styles.scoreRow, compact && styles.wrapRow]}>
          <Text style={styles.setScore} maxFontSizeMultiplier={1.35}>
            {formatScoreDisplay(match.liveScore)}
          </Text>
          {isLive && (
            <Text style={styles.gameScore} maxFontSizeMultiplier={1.5}>
              {formatGameScore(match.liveScore)}
            </Text>
          )}
        </View>
      )}

      <View style={[styles.players, compact && styles.playersCompact]}>
        <Text
          style={[
            styles.playerName,
            match.winner === "player1" && styles.winner,
          ]}
        >
          {player1Name}
        </Text>
        <Text style={styles.vs}>vs</Text>
        <View style={styles.playerRight}>
          <Text
            style={[
              styles.playerName,
              match.winner === "player2" && styles.winner,
            ]}
          >
            {player2Name}
          </Text>
          {match.player2IsGuest && <Text style={styles.guestBadge}>Guest</Text>}
        </View>
      </View>

      {isLive && (
        <Text style={styles.serverLine}>
          {match.liveScore.server === "player1" ? "P1" : "P2"} serves ·{" "}
          {match.liveScore.serviceSide} side
        </Text>
      )}

      {actionKind === "pending" && (
        <View
          style={[styles.cardActions, compact && styles.cardActionsCompact]}
        >
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`Accept match proposal from ${player2Name}`}
            style={styles.acceptBtn}
            onPress={onAccept}
          >
            <IconLabel
              name="checkmark"
              color={ICON_COLOR.inverse}
              textStyle={styles.acceptBtnText}
            >
              Accept
            </IconLabel>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`Decline match proposal from ${player2Name}`}
            style={styles.declineBtn}
            onPress={onDecline}
          >
            <IconLabel
              name="xmark"
              color={ICON_COLOR.destructive}
              textStyle={styles.declineBtnText}
            >
              Decline
            </IconLabel>
          </TouchableOpacity>
        </View>
      )}
      {actionKind === "awaiting" && (
        <View style={styles.cardActions}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`Cancel match proposal to ${player2Name}`}
            style={styles.declineBtn}
            onPress={onWithdraw}
          >
            <Text style={styles.declineBtnText}>Cancel proposal</Text>
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function MatchesScreen() {
  const insets = useSafeAreaInsets();
  const { user, divisionId } = useAppStore();
  // A match is tagged to the season current when it's logged, matching web's
  // matches/dashboard pages — otherwise it falls outside every season-scoped
  // standings view (see useRankings' seasonId filter) and never counts.
  const seasonId = useMemo(() => currentSeasonForDate().id, []);
  const seasonOptions = useMemo(() => defaultSeasonOptions(), []);
  const [selectedSeasonId, setSelectedSeasonId] = useState(seasonId);
  const [activeFilter, setActiveFilter] = useState<MatchFilter>("upcoming");
  const [playerSearch, setPlayerSearch] = useState("");
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadRetryKey, setLoadRetryKey] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [showPropose, setShowPropose] = useState(false);
  const [showNewMatchActions, setShowNewMatchActions] = useState(false);
  const [createMode, setCreateMode] = useState<"live" | "historic">("live");
  const [recordingMode, setRecordingMode] = useState<"self" | "onBehalf">(
    "self",
  );
  const [opponentMode, setOpponentMode] = useState<"search" | "guest">(
    "search",
  );
  const [guestName, setGuestName] = useState("");
  const [player1SearchText, setPlayer1SearchText] = useState("");
  const [player1SearchResults, setPlayer1SearchResults] = useState<
    PublicProfile[]
  >([]);
  const [selectedPlayer1, setSelectedPlayer1] = useState<PublicProfile | null>(
    null,
  );
  const [searchingPlayer1, setSearchingPlayer1] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState<PublicProfile[]>([]);
  const [selectedOpponent, setSelectedOpponent] =
    useState<PublicProfile | null>(null);
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);
  // Historic match set scores: array of { p1, p2 } per set
  const [historicSets, setHistoricSets] = useState([{ p1: "", p2: "" }]);
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});
  const guestNameRef = useRef<TextInput>(null);
  const router = useRouter();

  useEffect(() => {
    if (!divisionId) return;
    setLoading(true);
    setLoadError(null);
    const q = divisionMatchesQuery(divisionId);
    const unsub = onSnapshot(
      q,
      (snap) => {
        setMatches(snap.docs.map((d) => ({ ...d.data(), id: d.id }) as Match));
        setLoading(false);
      },
      (err) => {
        console.error("[MatchesScreen] matches listener error:", err);
        setLoadError(
          "Could not load matches. Check your connection and try again.",
        );
        setLoading(false);
      },
    );
    return unsub;
  }, [divisionId, loadRetryKey]);

  useEffect(() => {
    if (
      !divisionId ||
      createMode !== "historic" ||
      recordingMode !== "onBehalf" ||
      !player1SearchText.trim() ||
      selectedPlayer1
    ) {
      setPlayer1SearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchingPlayer1(true);
      try {
        const results = await searchDivisionPlayers(
          divisionId,
          player1SearchText,
        );
        setPlayer1SearchResults(
          results.filter((u) => u.id !== selectedOpponent?.id),
        );
      } catch (err) {
        console.error("Failed to search player 1:", err);
        setPlayer1SearchResults([]);
      } finally {
        setSearchingPlayer1(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [
    createMode,
    divisionId,
    player1SearchText,
    recordingMode,
    selectedOpponent?.id,
    selectedPlayer1,
  ]);

  useEffect(() => {
    if (!divisionId || !searchText.trim() || selectedOpponent) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await searchDivisionPlayers(divisionId, searchText);
        const player1Id =
          createMode === "historic" && recordingMode === "onBehalf"
            ? selectedPlayer1?.id
            : user?.id;
        setSearchResults(results.filter((u) => u.id !== player1Id));
      } catch (err) {
        console.error("Failed to search opponent:", err);
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [
    createMode,
    divisionId,
    recordingMode,
    searchText,
    selectedOpponent,
    selectedPlayer1?.id,
    user?.id,
  ]);

  function resetCreateModal() {
    setShowCreate(false);
    setCreateMode("live");
    setRecordingMode("self");
    setOpponentMode("search");
    setGuestName("");
    setPlayer1SearchText("");
    setPlayer1SearchResults([]);
    setSelectedPlayer1(null);
    setSearchText("");
    setSearchResults([]);
    setSelectedOpponent(null);
    setHistoricSets([{ p1: "", p2: "" }]);
    setCreateErrors({});
  }

  async function handleCreateMatch() {
    if (!user || !divisionId) return;
    const opponentError =
      opponentMode === "search" && !selectedOpponent
        ? "Select an opponent from the search results."
        : opponentMode === "guest" && !guestName.trim()
          ? "Enter the guest opponent's name."
          : "";
    if (opponentError) {
      setCreateErrors({ opponent: opponentError });
      if (opponentMode === "guest") guestNameRef.current?.focus();
      return;
    }
    setCreating(true);
    try {
      const matchId = await createMatch(
        opponentMode === "guest"
          ? {
              player1Id: user.id,
              player2Id: "guest",
              player1Name: user.displayName,
              player2Name: guestName.trim(),
              player2IsGuest: true,
              divisionId,
              seasonId,
              createdBy: user.id,
            }
          : {
              player1Id: user.id,
              player2Id: selectedOpponent!.id,
              player1Name: user.displayName,
              player2Name: selectedOpponent!.displayName,
              divisionId,
              seasonId,
              createdBy: user.id,
            },
      );
      resetCreateModal();
      router.push({ pathname: "/match/[id]", params: { id: matchId } });
    } catch (e) {
      console.error("[createMatch]", e);
      Alert.alert("Error", "Could not create match. Please try again.");
    } finally {
      setCreating(false);
    }
  }

  async function handleRecordHistoric() {
    if (!user || !divisionId) return;
    const selectionErrors = [
      recordingMode === "onBehalf" && !selectedPlayer1
        ? "Select the first player."
        : "",
      opponentMode === "search" && !selectedOpponent
        ? "Select the second player or opponent."
        : "",
      opponentMode === "guest" && !guestName.trim()
        ? "Enter the guest opponent's name."
        : "",
    ].filter(Boolean);
    if (selectionErrors.length) {
      setCreateErrors({ selection: selectionErrors.join(" ") });
      if (opponentMode === "guest") guestNameRef.current?.focus();
      return;
    }

    const parsed = historicSets.map((s) => ({
      p1: parseInt(s.p1, 10),
      p2: parseInt(s.p2, 10),
    }));
    const invalid = parsed.some(
      (s) => isNaN(s.p1) || isNaN(s.p2) || s.p1 < 0 || s.p2 < 0,
    );
    if (invalid || parsed.length === 0) {
      setCreateErrors({
        scores: "Enter a valid number of games for every set.",
      });
      return;
    }
    if (parsed.some((s) => s.p1 === s.p2)) {
      setCreateErrors({ scores: "Each set must have a clear winner." });
      return;
    }
    const p1Sets = parsed.filter((s) => s.p1 > s.p2).length;
    const p2Sets = parsed.filter((s) => s.p2 > s.p1).length;
    if (p1Sets === p2Sets) {
      setCreateErrors({ scores: "The match must have a clear winner." });
      return;
    }
    setCreating(true);
    try {
      const isGuest = opponentMode === "guest";
      if (recordingMode === "onBehalf") {
        if (isGuest) {
          Alert.alert(
            "Select players",
            "Choose a registered division player for both sides when recording on behalf of players.",
          );
          return;
        }
        await recordMatchOnBehalf({
          player1Id: selectedPlayer1!.id,
          player2Id: selectedOpponent!.id,
          divisionId,
          seasonId,
          sets: parsed,
          notifyPlayers: true,
        });
      } else {
        await recordHistoricMatch(
          isGuest
            ? {
                player1Id: user.id,
                player2Id: "guest",
                player1Name: user.displayName,
                player2Name: guestName.trim(),
                player2IsGuest: true,
                divisionId,
                seasonId,
                createdBy: user.id,
                sets: parsed,
              }
            : {
                player1Id: user.id,
                player2Id: selectedOpponent!.id,
                player1Name: user.displayName,
                player2Name: selectedOpponent!.displayName,
                divisionId,
                seasonId,
                createdBy: user.id,
                sets: parsed,
              },
        );
      }
      const recordedOnBehalf = recordingMode === "onBehalf";
      resetCreateModal();
      Alert.alert(
        "Match Recorded",
        recordedOnBehalf
          ? "Match saved and both players will be notified when contact information is available."
          : isGuest
            ? "Match saved. You can link your opponent to their account later."
            : "Match saved. Your opponent must confirm before standings update.",
      );
    } catch {
      Alert.alert("Error", "Could not record match. Please try again.");
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>Something went wrong</Text>
        <Text style={styles.emptyBody}>{loadError}</Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Retry loading matches"
          style={styles.retryBtn}
          onPress={() => setLoadRetryKey((key) => key + 1)}
        >
          <Text style={styles.retryBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const uid = user?.id;
  const toItem = (match: Match, actionKind: ActionKind = null): MatchItem => ({
    id: match.id,
    match,
    actionKind,
  });

  const normalizedSearch = playerSearch.trim().toLocaleLowerCase();
  const seasonMatches = matches.filter(
    (match) => match.seasonId === selectedSeasonId,
  );
  const visibleMatches = seasonMatches.filter((match) => {
    if (!normalizedSearch) return true;
    return [
      match.player1Name,
      match.player2Name,
      match.side1?.displayName,
      match.side2?.displayName,
    ].some((name) => name?.toLocaleLowerCase().includes(normalizedSearch));
  });
  const pendingInviteCount = seasonMatches.filter(
    (match) =>
      match.status === "proposed" &&
      !!uid &&
      sideOfPlayer(match, uid) === "player2",
  ).length;

  const includeUpcoming = activeFilter === "upcoming" || activeFilter === "all";
  const includeAction = activeFilter === "action" || activeFilter === "all";
  const includeCompleted =
    activeFilter === "completed" || activeFilter === "all";

  const liveMatches = visibleMatches
    .filter((m) => m.status === "in_progress")
    .map((m) => toItem(m));
  // Side membership rather than player2Id/player1Id, so a doubles partner sees
  // the proposal too instead of only the side's first player.
  const pendingInvites = visibleMatches
    .filter(
      (m) =>
        m.status === "proposed" && !!uid && sideOfPlayer(m, uid) === "player2",
    )
    .sort((a, b) => (a.scheduledAt ?? 0) - (b.scheduledAt ?? 0))
    .map((m) => toItem(m, "pending"));
  const awaitingOpponent = visibleMatches
    .filter(
      (m) =>
        m.status === "proposed" && !!uid && sideOfPlayer(m, uid) === "player1",
    )
    .sort((a, b) => (a.scheduledAt ?? 0) - (b.scheduledAt ?? 0))
    .map((m) => toItem(m, "awaiting"));
  const upcomingMatches = visibleMatches
    .filter((m) => m.status === "scheduled")
    .sort((a, b) => (a.scheduledAt ?? 0) - (b.scheduledAt ?? 0))
    .map((m) => toItem(m));
  const actionMatches = visibleMatches
    .filter((m) => m.status === "pending_report" || m.status === "disputed")
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
    .map((m) => toItem(m));
  const completedMatches = visibleMatches
    .filter((m) => m.status === "completed" || m.status === "cancelled")
    .sort(
      (a, b) =>
        (b.completedAt ?? b.createdAt ?? 0) -
        (a.completedAt ?? a.createdAt ?? 0),
    )
    .map((m) => toItem(m));
  const shownCompletedMatches = historyExpanded
    ? completedMatches
    : completedMatches.slice(0, COLLAPSED_HISTORY_LIMIT);
  const canRecordOnBehalf =
    user?.role === "admin" ||
    user?.role === "division_leader" ||
    user?.role === "app_developer";

  const sections: { title: string; data: MatchItem[] }[] = [
    ...((includeUpcoming || includeAction) && liveMatches.length > 0
      ? [{ title: "Now Live", data: liveMatches }]
      : []),
    ...((includeAction || includeUpcoming) && pendingInvites.length > 0
      ? [
          {
            title: `Needs Your Response (${pendingInvites.length})`,
            data: pendingInvites,
          },
        ]
      : []),
    ...(includeUpcoming && awaitingOpponent.length > 0
      ? [{ title: "Awaiting Opponent", data: awaitingOpponent }]
      : []),
    ...(includeUpcoming && upcomingMatches.length > 0
      ? [{ title: "Upcoming", data: upcomingMatches }]
      : []),
    ...(includeAction && actionMatches.length > 0
      ? [{ title: "Other Action Needed", data: actionMatches }]
      : []),
    ...(includeCompleted && shownCompletedMatches.length > 0
      ? [{ title: "Match History", data: shownCompletedMatches }]
      : []),
  ];

  return (
    <View style={styles.container}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <MatchCard
            match={item.match}
            onPress={() => router.push(`/match/${item.id}`)}
            actionKind={item.actionKind}
            onAccept={() =>
              acceptMatchProposal(item.id).catch(() =>
                Alert.alert("Error", "Could not accept."),
              )
            }
            onDecline={() =>
              declineMatchProposal(item.id).catch(() =>
                Alert.alert("Error", "Could not decline."),
              )
            }
            onWithdraw={() =>
              declineMatchProposal(item.id).catch(() =>
                Alert.alert("Error", "Could not cancel."),
              )
            }
          />
        )}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            {section.title === "Now Live" && <View style={styles.liveDot} />}
            <Text
              style={[
                styles.sectionTitle,
                section.title === "Now Live" && styles.sectionTitleLive,
              ]}
            >
              {section.title}
            </Text>
          </View>
        )}
        stickySectionHeadersEnabled
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.listControls}>
            <Text style={styles.controlLabel}>Season</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.controlRow}
            >
              {seasonOptions.map((season) => (
                <TouchableOpacity
                  key={season.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Show matches for ${season.name}`}
                  accessibilityState={{
                    selected: selectedSeasonId === season.id,
                  }}
                  style={[
                    styles.controlChip,
                    selectedSeasonId === season.id && styles.controlChipActive,
                  ]}
                  onPress={() => {
                    setSelectedSeasonId(season.id);
                    setHistoryExpanded(false);
                  }}
                >
                  <Text
                    style={[
                      styles.controlChipText,
                      selectedSeasonId === season.id &&
                        styles.controlChipTextActive,
                    ]}
                  >
                    {season.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.matchSearchRow}>
              <AppIcon
                name="magnifyingglass"
                size={ICON_SIZE.action}
                color={ICON_COLOR.inactive}
              />
              <TextInput
                accessibilityLabel="Search matches by player name"
                value={playerSearch}
                onChangeText={setPlayerSearch}
                placeholder="Search player name"
                autoCorrect={false}
                style={styles.matchSearchInput}
              />
              {!!playerSearch && (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Clear player search"
                  onPress={() => setPlayerSearch("")}
                  style={styles.clearSearch}
                >
                  <AppIcon
                    name="xmark.circle.fill"
                    size={ICON_SIZE.action}
                    color={ICON_COLOR.inactive}
                  />
                </TouchableOpacity>
              )}
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.controlRow}
            >
              {FILTERS.map((filter) => {
                const count = filter.id === "action" ? pendingInviteCount : 0;
                return (
                  <TouchableOpacity
                    key={filter.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Show ${filter.label.toLowerCase()} matches${count ? `, ${count} requiring a response` : ""}`}
                    accessibilityState={{
                      selected: activeFilter === filter.id,
                    }}
                    style={[
                      styles.filterChip,
                      activeFilter === filter.id && styles.filterChipActive,
                    ]}
                    onPress={() => {
                      setActiveFilter(filter.id);
                      setHistoryExpanded(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        activeFilter === filter.id &&
                          styles.filterChipTextActive,
                      ]}
                    >
                      {filter.label}
                    </Text>
                    {count > 0 && (
                      <View style={styles.countBadge}>
                        <Text style={styles.countBadgeText}>{count}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.filteredEmpty}>
            <Text style={styles.emptyTitle}>No matching matches</Text>
            <Text style={styles.emptyBody}>
              Try another filter, player name, or season.
            </Text>
          </View>
        }
        ListFooterComponent={
          includeCompleted &&
          completedMatches.length > COLLAPSED_HISTORY_LIMIT ? (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={
                historyExpanded
                  ? "Collapse match history"
                  : "View match history"
              }
              style={styles.historyButton}
              onPress={() => setHistoryExpanded((expanded) => !expanded)}
            >
              <Text style={styles.historyButtonText}>
                {historyExpanded
                  ? "Show less history"
                  : `View match history (${completedMatches.length - COLLAPSED_HISTORY_LIMIT} older)`}
              </Text>
            </TouchableOpacity>
          ) : null
        }
        contentContainerStyle={[styles.list, { paddingBottom: 16 }]}
      />

      <View
        style={[
          styles.fabGroup,
          { paddingBottom: Math.max(insets.bottom, 12) },
        ]}
      >
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="New match"
          accessibilityHint="Opens match creation choices"
          style={styles.fab}
          onPress={() => setShowNewMatchActions(true)}
        >
          <IconLabel
            name="plus"
            color={ICON_COLOR.inverse}
            textStyle={styles.fabText}
          >
            New match
          </IconLabel>
        </TouchableOpacity>
      </View>

      <Modal
        visible={showNewMatchActions}
        transparent
        animationType="fade"
        onRequestClose={() => setShowNewMatchActions(false)}
      >
        <View style={styles.newMatchOverlay}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Close new match choices"
            style={StyleSheet.absoluteFill}
            onPress={() => setShowNewMatchActions(false)}
          />
          <View accessibilityRole="menu" style={styles.newMatchSheet}>
            <Text style={styles.newMatchTitle}>New match</Text>
            {(
              [
                [
                  "figure.tennis",
                  "Start live scoring",
                  "Score every point as you play.",
                  "live",
                ],
                [
                  "calendar.badge.plus",
                  "Propose a future match",
                  "Invite players and choose a time.",
                  "propose",
                ],
                [
                  "doc.text",
                  "Record a completed match",
                  "Enter the final score from a past match.",
                  "historic",
                ],
              ] as const
            ).map(([icon, title, description, action]) => (
              <TouchableOpacity
                key={action}
                accessibilityRole="menuitem"
                accessibilityLabel={title}
                accessibilityHint={description}
                style={styles.newMatchChoice}
                onPress={() => {
                  setShowNewMatchActions(false);
                  if (action === "propose") setShowPropose(true);
                  else {
                    setCreateMode(action);
                    setShowCreate(true);
                  }
                }}
              >
                <View style={styles.newMatchChoiceCopy}>
                  <IconLabel name={icon} textStyle={styles.newMatchChoiceTitle}>
                    {title}
                  </IconLabel>
                  <Text style={styles.newMatchChoiceDescription}>
                    {description}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              accessibilityRole="button"
              style={styles.newMatchCancel}
              onPress={() => setShowNewMatchActions(false)}
            >
              <Text style={styles.newMatchCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {showPropose && user && divisionId && (
        <ProposeMatchModal
          currentUser={user}
          divisionId={divisionId}
          seasonId={seasonId}
          onClose={() => setShowPropose(false)}
        />
      )}

      <Modal visible={showCreate} transparent animationType="slide">
        <KeyboardAwareBottomSheet style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {createMode === "historic"
                ? "Record Past Match"
                : "New Live Match"}
            </Text>

            {createMode === "historic" && canRecordOnBehalf && (
              <>
                <View style={styles.modeToggle}>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Record one of my matches"
                    accessibilityState={{
                      selected: recordingMode === "self",
                    }}
                    style={[
                      styles.modeBtn,
                      recordingMode === "self" && styles.modeBtnActive,
                    ]}
                    onPress={() => {
                      setRecordingMode("self");
                      setSelectedPlayer1(null);
                      setPlayer1SearchText("");
                      setPlayer1SearchResults([]);
                    }}
                  >
                    <Text
                      style={[
                        styles.modeBtnText,
                        recordingMode === "self" && styles.modeBtnTextActive,
                      ]}
                      onPress={() => {
                        setRecordingMode("self");
                        setSelectedPlayer1(null);
                        setPlayer1SearchText("");
                        setPlayer1SearchResults([]);
                      }}
                    >
                      My Match
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Record a match between any two players"
                    accessibilityState={{
                      selected: recordingMode === "onBehalf",
                    }}
                    style={[
                      styles.modeBtn,
                      recordingMode === "onBehalf" && styles.modeBtnActive,
                    ]}
                    onPress={() => {
                      setRecordingMode("onBehalf");
                      setOpponentMode("search");
                      setGuestName("");
                      setSelectedOpponent(null);
                      setSearchText("");
                      setSearchResults([]);
                    }}
                  >
                    <Text
                      style={[
                        styles.modeBtnText,
                        recordingMode === "onBehalf" &&
                          styles.modeBtnTextActive,
                      ]}
                      onPress={() => {
                        setRecordingMode("onBehalf");
                        setOpponentMode("search");
                        setGuestName("");
                        setSelectedOpponent(null);
                        setSearchText("");
                        setSearchResults([]);
                      }}
                    >
                      Any Two
                    </Text>
                  </TouchableOpacity>
                </View>

                {recordingMode === "onBehalf" &&
                  (selectedPlayer1 ? (
                    <View style={styles.selectedPlayer}>
                      <View style={styles.playerChip}>
                        <Text style={styles.playerChipName}>
                          {selectedPlayer1.displayName}
                        </Text>
                        <Text style={styles.playerChipEmail}>
                          Public profile
                        </Text>
                      </View>
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel="Change first player"
                        onPress={() => {
                          setSelectedPlayer1(null);
                          setPlayer1SearchText("");
                        }}
                      >
                        <Text style={styles.changeText}>Change</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <>
                      <Text style={styles.modalLabel}>Search first player</Text>
                      <View style={styles.searchRow}>
                        <TextInput
                          accessibilityLabel="Search first player"
                          style={[styles.input, styles.searchInput]}
                          value={player1SearchText}
                          onChangeText={setPlayer1SearchText}
                          placeholder="Name or email..."
                          autoCapitalize="none"
                          autoCorrect={false}
                        />
                        {searchingPlayer1 && (
                          <ActivityIndicator
                            style={styles.searchSpinner}
                            color={colors.primary}
                          />
                        )}
                      </View>
                      {player1SearchResults.length > 0 && (
                        <FlatList
                          data={player1SearchResults}
                          keyExtractor={(u) => u.id}
                          style={styles.resultsList}
                          keyboardShouldPersistTaps="handled"
                          renderItem={({ item }) => (
                            <TouchableOpacity
                              accessibilityRole="button"
                              accessibilityLabel={`Select ${item.displayName} as first player`}
                              style={styles.resultRow}
                              onPress={() => {
                                setSelectedPlayer1(item);
                                setPlayer1SearchResults([]);
                              }}
                            >
                              <Text style={styles.resultName}>
                                {item.displayName}
                              </Text>
                              <Text style={styles.resultEmail}>
                                Public profile
                              </Text>
                            </TouchableOpacity>
                          )}
                        />
                      )}
                      {player1SearchText.trim().length > 0 &&
                        !searchingPlayer1 &&
                        player1SearchResults.length === 0 && (
                          <Text style={styles.noResults}>
                            No players found.
                          </Text>
                        )}
                    </>
                  ))}
              </>
            )}

            {/* Opponent mode toggle */}
            <View style={styles.modeToggle}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Search for an existing player"
                accessibilityState={{ selected: opponentMode === "search" }}
                style={[
                  styles.modeBtn,
                  opponentMode === "search" && styles.modeBtnActive,
                ]}
                onPress={() => {
                  setOpponentMode("search");
                  setGuestName("");
                }}
              >
                <Text
                  style={[
                    styles.modeBtnText,
                    opponentMode === "search" && styles.modeBtnTextActive,
                  ]}
                >
                  Search Player
                </Text>
              </TouchableOpacity>
              {(createMode !== "historic" || recordingMode === "self") && (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Enter a guest opponent"
                  accessibilityState={{ selected: opponentMode === "guest" }}
                  style={[
                    styles.modeBtn,
                    opponentMode === "guest" && styles.modeBtnActive,
                  ]}
                  onPress={() => {
                    setOpponentMode("guest");
                    setSelectedOpponent(null);
                    setSearchText("");
                    setSearchResults([]);
                  }}
                >
                  <Text
                    style={[
                      styles.modeBtnText,
                      opponentMode === "guest" && styles.modeBtnTextActive,
                    ]}
                  >
                    Search Player
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Opponent picker */}
            {opponentMode === "guest" ? (
              <FormField
                ref={guestNameRef}
                label="Guest opponent"
                required
                error={createErrors.opponent || createErrors.selection}
                accessibilityLabel="Guest opponent name"
                value={guestName}
                onChangeText={setGuestName}
                onBlur={() =>
                  setCreateErrors((e) => ({
                    ...e,
                    opponent: guestName.trim()
                      ? ""
                      : "Enter the guest opponent's name.",
                  }))
                }
                placeholder="Guest name..."
                autoCapitalize="words"
                autoCorrect={false}
              />
            ) : selectedOpponent ? (
              <View style={styles.selectedPlayer}>
                <View style={styles.playerChip}>
                  <Text style={styles.playerChipName}>
                    {selectedOpponent.displayName}
                  </Text>
                  <Text style={styles.playerChipEmail}>Public profile</Text>
                </View>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Change selected opponent"
                  onPress={() => {
                    setSelectedOpponent(null);
                    setSearchText("");
                  }}
                >
                  <Text style={styles.changeText}>Change</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <Text style={styles.modalLabel}>
                  {createMode === "historic" && recordingMode === "onBehalf"
                    ? "Search second player"
                    : "Search for opponent"}
                </Text>
                <View style={styles.searchRow}>
                  <TextInput
                    accessibilityLabel={
                      createMode === "historic" && recordingMode === "onBehalf"
                        ? "Search second player"
                        : "Search for opponent"
                    }
                    style={[styles.input, styles.searchInput]}
                    value={searchText}
                    onChangeText={setSearchText}
                    placeholder="Name or email..."
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  {searching && (
                    <ActivityIndicator
                      style={styles.searchSpinner}
                      color={colors.primary}
                    />
                  )}
                </View>
                {searchResults.length > 0 && (
                  <FlatList
                    data={searchResults}
                    keyExtractor={(u) => u.id}
                    style={styles.resultsList}
                    keyboardShouldPersistTaps="handled"
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel={`Select ${item.displayName}`}
                        style={styles.resultRow}
                        onPress={() => {
                          setSelectedOpponent(item);
                          setSearchResults([]);
                        }}
                      >
                        <Text style={styles.resultName}>
                          {item.displayName}
                        </Text>
                        <Text style={styles.resultEmail}>Public profile</Text>
                      </TouchableOpacity>
                    )}
                  />
                )}
                {searchText.trim().length > 0 &&
                  !searching &&
                  searchResults.length === 0 && (
                    <Text style={styles.noResults}>No players found.</Text>
                  )}
              </>
            )}

            <FormErrorSummary
              errors={Object.values(createErrors).filter(Boolean)}
            />

            {/* Historic set-score entry */}
            {createMode === "historic" &&
              (recordingMode === "self" || selectedPlayer1) &&
              (opponentMode === "guest"
                ? guestName.trim()
                : selectedOpponent) && (
                <View style={styles.setsContainer}>
                  <Text style={styles.modalLabel}>
                    {recordingMode === "onBehalf"
                      ? "Enter set scores (first player's games first)"
                      : "Enter set scores (your games first)"}
                  </Text>
                  {historicSets.map((s, i) => (
                    <View key={i} style={styles.setRow}>
                      <Text style={styles.setLabel}>Set {i + 1}</Text>
                      <TextInput
                        accessibilityLabel={`Set ${i + 1} ${
                          recordingMode === "onBehalf"
                            ? "first player's"
                            : "your"
                        } games`}
                        style={styles.setInput}
                        value={s.p1}
                        onChangeText={(v) => {
                          const next = [...historicSets];
                          next[i] = { ...next[i], p1: v };
                          setHistoricSets(next);
                        }}
                        keyboardType="number-pad"
                        maxLength={2}
                        placeholder={
                          recordingMode === "onBehalf" ? "P1" : "You"
                        }
                      />
                      <Text style={styles.setDash}>–</Text>
                      <TextInput
                        accessibilityLabel={`Set ${i + 1} opponent games`}
                        style={styles.setInput}
                        value={s.p2}
                        onChangeText={(v) => {
                          const next = [...historicSets];
                          next[i] = { ...next[i], p2: v };
                          setHistoricSets(next);
                        }}
                        keyboardType="number-pad"
                        maxLength={2}
                        placeholder={
                          recordingMode === "onBehalf" ? "P2" : "Opp"
                        }
                      />
                    </View>
                  ))}
                  {historicSets.length < 5 && (
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel="Add another set"
                      onPress={() =>
                        setHistoricSets([...historicSets, { p1: "", p2: "" }])
                      }
                    >
                      <Text style={styles.addSet}>+ Add Set</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Cancel match creation"
                style={styles.cancelBtn}
                onPress={resetCreateModal}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={
                  createMode === "historic"
                    ? "Record past match"
                    : "Create live match"
                }
                accessibilityState={{
                  disabled: creating,
                  busy: creating,
                }}
                style={[styles.createBtn, creating && styles.createBtnDisabled]}
                onPress={
                  createMode === "historic"
                    ? handleRecordHistoric
                    : handleCreateMatch
                }
                disabled={creating}
              >
                {creating ? (
                  <ActivityIndicator color={colors.surface} />
                ) : (
                  <Text style={styles.createText}>
                    {createMode === "historic" ? "Record" : "Create"}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAwareBottomSheet>
      </Modal>
    </View>
  );
}

function ProposeMatchModal({
  currentUser,
  divisionId,
  seasonId,
  onClose,
}: {
  currentUser: { id: string; displayName: string };
  divisionId: string;
  seasonId: string;
  onClose: () => void;
}) {
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState<PublicProfile[]>([]);
  const [selectedOpponent, setSelectedOpponent] =
    useState<PublicProfile | null>(null);
  const [isDoubles, setIsDoubles] = useState(false);
  // Doubles slots: the signed-in player always fills side 1's first seat.
  const [partner, setPartner] = useState<PublicProfile | null>(null);
  const [opponent1, setOpponent1] = useState<PublicProfile | null>(null);
  const [opponent2, setOpponent2] = useState<PublicProfile | null>(null);
  const [searching, setSearching] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const dateRef = useRef<TextInput>(null);
  const timeRef = useRef<TextInput>(null);

  const doublesChosenIds = [
    currentUser.id,
    partner?.id,
    opponent1?.id,
    opponent2?.id,
  ].filter((id): id is string => !!id);
  const opponentReady = isDoubles
    ? !!(partner && opponent1 && opponent2)
    : !!selectedOpponent;

  useEffect(() => {
    if (!searchText.trim() || selectedOpponent) {
      setSearchResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await searchDivisionPlayers(divisionId, searchText);
        setSearchResults(results.filter((u) => u.id !== currentUser.id));
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [searchText, divisionId, selectedOpponent, currentUser.id]);

  async function handleSubmit() {
    const nextErrors: Record<string, string> = {};
    if (!opponentReady)
      nextErrors.opponent = isDoubles
        ? "Select all three other players."
        : "Select an opponent.";
    if (!DATE_RE.test(date)) nextErrors.date = "Enter the date as YYYY-MM-DD.";
    if (!TIME_RE.test(time)) nextErrors.time = "Enter a 24-hour time as HH:MM.";
    const ts = Date.parse(`${date}T${time}`);
    if (!nextErrors.date && !nextErrors.time && (!ts || Number.isNaN(ts)))
      nextErrors.date = "Enter a real date and time.";
    if (!nextErrors.date && !nextErrors.time && ts < Date.now())
      nextErrors.date = "Choose a date and time in the future.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      if (nextErrors.date) dateRef.current?.focus();
      else if (nextErrors.time) timeRef.current?.focus();
      return;
    }
    setSubmitting(true);
    try {
      if (isDoubles) {
        await proposeDoublesMatch({
          side1PlayerIds: [currentUser.id, partner!.id],
          side2PlayerIds: [opponent1!.id, opponent2!.id],
          divisionId,
          seasonId,
          scheduledAt: ts,
        });
        onClose();
        return;
      }
      if (!selectedOpponent) {
        Alert.alert("Select an opponent", "Choose who you want to play.");
        return;
      }
      await proposeMatch({
        player1Id: currentUser.id,
        player2Id: selectedOpponent.id,
        player1Name: currentUser.displayName,
        player2Name: selectedOpponent.displayName,
        divisionId,
        seasonId,
        createdBy: currentUser.id,
        scheduledAt: ts,
      });
      onClose();
    } catch {
      Alert.alert("Error", "Could not send the proposal.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal visible transparent animationType="slide">
      <KeyboardAwareBottomSheet style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Propose a Match</Text>

          <Text style={styles.modalLabel}>Format</Text>
          <View style={styles.formatRow}>
            {([false, true] as const).map((doubles) => (
              <TouchableOpacity
                key={doubles ? "doubles" : "singles"}
                accessibilityRole="button"
                accessibilityLabel={`Propose a ${doubles ? "doubles" : "singles"} match`}
                accessibilityState={{ selected: isDoubles === doubles }}
                style={[
                  styles.formatChip,
                  isDoubles === doubles && styles.formatChipActive,
                ]}
                onPress={() => setIsDoubles(doubles)}
              >
                <Text
                  style={[
                    styles.formatChipText,
                    isDoubles === doubles && styles.formatChipTextActive,
                  ]}
                >
                  {doubles ? "Doubles" : "Singles"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {isDoubles ? (
            <>
              <PlayerSlotPicker
                label="Your partner"
                divisionId={divisionId}
                excludeIds={doublesChosenIds}
                selected={partner}
                onSelect={setPartner}
                onClear={() => setPartner(null)}
              />
              <PlayerSlotPicker
                label="Opponent 1"
                divisionId={divisionId}
                excludeIds={doublesChosenIds}
                selected={opponent1}
                onSelect={setOpponent1}
                onClear={() => setOpponent1(null)}
              />
              <PlayerSlotPicker
                label="Opponent 2"
                divisionId={divisionId}
                excludeIds={doublesChosenIds}
                selected={opponent2}
                onSelect={setOpponent2}
                onClear={() => setOpponent2(null)}
              />
              {opponentReady && (
                <>
                  <Text style={styles.modalLabel}>Date (YYYY-MM-DD)</Text>
                  <TextInput
                    ref={dateRef}
                    accessibilityLabel="Match date"
                    style={styles.input}
                    value={date}
                    onChangeText={setDate}
                    placeholder="2026-05-10"
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={10}
                  />
                  <Text style={styles.modalLabel}>Time (HH:MM, 24-hour)</Text>
                  <TextInput
                    ref={timeRef}
                    accessibilityLabel="Match time"
                    style={styles.input}
                    value={time}
                    onChangeText={setTime}
                    placeholder="18:30"
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={5}
                  />
                </>
              )}
            </>
          ) : selectedOpponent ? (
            <>
              <View style={styles.selectedPlayer}>
                <View style={styles.playerChip}>
                  <Text style={styles.playerChipName}>
                    {selectedOpponent.displayName}
                  </Text>
                  <Text style={styles.playerChipEmail}>Public profile</Text>
                </View>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Change selected opponent"
                  onPress={() => {
                    setSelectedOpponent(null);
                    setSearchText("");
                  }}
                >
                  <Text style={styles.changeText}>Change</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.availabilityEmpty}>
                Availability is visible only when teammates share it.
              </Text>

              <Text style={styles.modalLabel}>Date (YYYY-MM-DD)</Text>
              <TextInput
                ref={dateRef}
                accessibilityLabel="Match date"
                style={styles.input}
                value={date}
                onChangeText={setDate}
                placeholder="2026-05-10"
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={10}
              />
              <Text style={styles.modalLabel}>Time (HH:MM, 24-hour)</Text>
              <TextInput
                ref={timeRef}
                accessibilityLabel="Match time"
                style={styles.input}
                value={time}
                onChangeText={setTime}
                placeholder="18:30"
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={5}
              />
            </>
          ) : (
            <>
              <Text style={styles.modalLabel}>Search for opponent</Text>
              <View style={styles.searchRow}>
                <TextInput
                  accessibilityLabel="Search for opponent"
                  style={[styles.input, styles.searchInput]}
                  value={searchText}
                  onChangeText={setSearchText}
                  placeholder="Name or email..."
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {searching && (
                  <ActivityIndicator
                    style={styles.searchSpinner}
                    color="#1a472a"
                  />
                )}
              </View>
              {searchResults.length > 0 && (
                <FlatList
                  data={searchResults}
                  keyExtractor={(u) => u.id}
                  style={styles.resultsList}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel={`Select ${item.displayName}`}
                      style={styles.resultRow}
                      onPress={() => {
                        setSelectedOpponent(item);
                        setSearchResults([]);
                      }}
                    >
                      <Text style={styles.resultName}>{item.displayName}</Text>
                      <Text style={styles.resultEmail}>Public profile</Text>
                    </TouchableOpacity>
                  )}
                />
              )}
              {searchText.trim().length > 0 &&
                !searching &&
                searchResults.length === 0 && (
                  <Text style={styles.noResults}>No players found.</Text>
                )}
            </>
          )}

          <FormErrorSummary errors={Object.values(errors)} />

          <View style={styles.modalActions}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Cancel match proposal"
              style={styles.cancelBtn}
              onPress={onClose}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Send match proposal"
              accessibilityState={{
                disabled: submitting || !opponentReady || !date || !time,
                busy: submitting,
              }}
              style={[
                styles.createBtn,
                (submitting || !opponentReady || !date || !time) &&
                  styles.createBtnDisabled,
              ]}
              onPress={handleSubmit}
              disabled={submitting || !opponentReady || !date || !time}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.createText}>Send Proposal</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAwareBottomSheet>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  list: { padding: 16 },
  listControls: { marginBottom: 12, gap: 10 },
  controlLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
  },
  controlRow: { flexDirection: "row", gap: 8 },
  controlChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.surface,
  },
  controlChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  controlChipText: { color: colors.textMuted, fontWeight: "600", fontSize: 13 },
  controlChipTextActive: { color: colors.primary },
  matchSearchRow: {
    minHeight: 44,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.surface,
  },
  matchSearchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    paddingVertical: 9,
  },
  clearSearch: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  filterChip: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterChipText: { color: colors.textMuted, fontSize: 13, fontWeight: "700" },
  filterChipTextActive: { color: colors.onPrimary },
  countBadge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.warning,
  },
  countBadgeText: { color: colors.onPrimary, fontWeight: "800", fontSize: 11 },
  filteredEmpty: {
    alignItems: "center",
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  historyButton: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 2,
    marginBottom: 16,
    backgroundColor: colors.surface,
  },
  historyButtonText: { color: colors.primary, fontSize: 14, fontWeight: "700" },
  wrapRow: { flexWrap: "wrap", alignItems: "flex-start" },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    backgroundColor: "#f5f5f0",
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textSubtle,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  sectionTitleLive: { color: colors.success },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
  },

  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  cardLive: { borderLeftWidth: 4, borderLeftColor: colors.success },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  winnerBadge: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.primary,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },

  scoreRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 10,
    marginBottom: 8,
  },
  setScore: {
    fontSize: 20,
    fontWeight: "700",
    color: "#222",
    letterSpacing: 1,
  },
  gameScore: { fontSize: 15, fontWeight: "600", color: colors.success },

  players: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  playersCompact: { flexWrap: "wrap", gap: 8 },
  playerName: { fontSize: 15, fontWeight: "600", color: colors.text, flex: 1 },
  playerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
    justifyContent: "flex-end",
  },
  winner: { color: colors.primary },
  vs: { fontSize: 13, color: colors.textSubtle, marginHorizontal: 12 },
  guestBadge: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.warning,
    backgroundColor: "#fff3e0",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: "hidden",
  },
  serverLine: { fontSize: 12, color: colors.textSubtle, marginTop: 6 },

  fabGroup: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 8,
    justifyContent: "flex-end",
    backgroundColor: "#f5f5f0",
  },
  fabGroupCompact: { flexWrap: "wrap" },
  fab: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 28,
    minHeight: 44,
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  fabText: { color: colors.surface, fontWeight: "700", fontSize: 15 },
  newMatchOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: colors.overlay,
  },
  newMatchSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 32,
    gap: 8,
  },
  newMatchTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 4,
  },
  newMatchChoice: {
    minHeight: 72,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    justifyContent: "center",
  },
  newMatchChoiceCopy: { gap: 4 },
  newMatchChoiceTitle: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: "700",
  },
  newMatchChoiceDescription: {
    color: colors.textMuted,
    fontSize: 13,
    marginLeft: 22,
  },
  newMatchCancel: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  newMatchCancelText: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: "600",
  },
  fabSecondary: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  fabSecondaryText: { color: colors.primary, fontWeight: "700", fontSize: 15 },
  setsContainer: { marginBottom: 4, gap: 8 },
  setRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  setLabel: { fontSize: 13, color: colors.textMuted, width: 40 },
  setInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
    width: 56,
    color: colors.primary,
  },
  setDash: { fontSize: 18, color: colors.textSubtle, fontWeight: "600" },
  removeSet: { fontSize: 18, color: colors.destructive, paddingHorizontal: 6 },
  addSet: {
    color: colors.primary,
    fontWeight: "600",
    fontSize: 14,
    paddingVertical: 4,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 8,
  },
  emptyBody: { fontSize: 14, color: colors.textMuted, textAlign: "center" },
  retryBtn: {
    marginTop: 16,
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  retryBtnText: { color: colors.surface, fontWeight: "600", fontSize: 15 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    width: "100%",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.primary,
    marginBottom: 20,
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#444",
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    marginBottom: 12,
  },
  searchRow: { flexDirection: "row", alignItems: "center" },
  searchInput: { flex: 1, marginBottom: 0 },
  searchSpinner: { marginLeft: 10 },
  resultsList: { maxHeight: 200, marginTop: 8, marginBottom: 12 },
  resultRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  resultName: { fontSize: 15, fontWeight: "600", color: "#222" },
  resultEmail: { fontSize: 13, color: colors.textSubtle, marginTop: 2 },
  noResults: {
    fontSize: 14,
    color: colors.textSubtle,
    textAlign: "center",
    marginVertical: 12,
  },
  formatRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  formatChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: colors.surface,
  },
  formatChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  formatChipText: { fontSize: 14, fontWeight: "600", color: "#475569" },
  formatChipTextActive: { color: colors.surface },
  selectedPlayer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  playerChip: { flex: 1 },
  playerChipName: { fontSize: 16, fontWeight: "700", color: colors.primary },
  playerChipEmail: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  changeText: { fontSize: 14, color: colors.primary, fontWeight: "600" },
  modeToggle: {
    flexDirection: "row",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    marginBottom: 16,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: "#f9f9f9",
  },
  modeBtnActive: { backgroundColor: colors.primary },
  modeBtnText: { fontSize: 13, fontWeight: "600", color: colors.textSubtle },
  modeBtnTextActive: { color: colors.surface },
  modalActions: { flexDirection: "row", gap: 12, marginTop: 8 },
  cancelBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  cancelText: { color: colors.text, fontWeight: "600" },
  createBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: "center",
  },
  createBtnDisabled: { opacity: 0.6 },
  createText: { color: colors.surface, fontWeight: "600" },
  scheduledLine: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.primary,
    marginBottom: 8,
  },
  cardActions: { flexDirection: "row", gap: 8, marginTop: 12 },
  cardActionsCompact: { flexDirection: "column" },
  acceptBtn: {
    flex: 1,
    backgroundColor: colors.primary,
    padding: 10,
    borderRadius: 8,
    alignItems: "center",
    minHeight: 44,
  },
  acceptBtnText: { color: colors.surface, fontWeight: "700", fontSize: 13 },
  declineBtn: {
    flex: 1,
    backgroundColor: colors.surface,
    padding: 10,
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.destructive,
  },
  declineBtnText: {
    color: colors.destructive,
    fontWeight: "600",
    fontSize: 13,
  },
  availabilityBox: {
    backgroundColor: "#f5f5ec",
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  availabilityTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.primary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  availabilityRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    paddingVertical: 2,
  },
  availabilityDay: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.primary,
    width: 32,
  },
  availabilityTime: { fontSize: 13, color: "#444" },
  availabilityNote: {
    fontSize: 12,
    color: colors.textMuted,
    fontStyle: "italic",
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: "#e7e7d8",
  },
  availabilityEmpty: {
    color: colors.textSubtle,
    fontSize: 13,
    fontStyle: "italic",
    marginBottom: 12,
  },
});
