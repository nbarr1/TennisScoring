import React, { useState, useEffect } from "react";
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
} from "react-native";
import { useRouter } from "expo-router";
import { onSnapshot } from "firebase/firestore";
import {
  divisionMatchesQuery,
  createMatch,
  recordHistoricMatch,
  recordMatchOnBehalf,
  searchDivisionPlayers,
  proposeMatch,
  acceptMatchProposal,
  declineMatchProposal,
} from "@tennis/firebase-client";
import {
  formatScoreDisplay,
  formatGameScore,
  DAY_LABELS,
  getMatchStatusMetadata,
} from "@tennis/shared";
import { useAppStore } from "../../store/appStore";
import { StatusBadge } from "../../components/StatusBadge";
import { KeyboardAwareBottomSheet } from "../../components/KeyboardSafeView";
import type { Match, User, Availability } from "@tennis/shared";

type ActionKind = "pending" | "awaiting" | null;
type MatchItem = { id: string; match: Match; actionKind: ActionKind };

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
      <View style={styles.cardHeader}>
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
        <Text style={styles.scheduledLine}>
          🗓 {formatScheduledAt(match.scheduledAt)}
        </Text>
      )}

      {!isUpcoming && (
        <View style={styles.scoreRow}>
          <Text style={styles.setScore}>
            {formatScoreDisplay(match.liveScore)}
          </Text>
          {isLive && (
            <Text style={styles.gameScore}>
              {formatGameScore(match.liveScore)}
            </Text>
          )}
        </View>
      )}

      <View style={styles.players}>
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
        <View style={styles.cardActions}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`Accept match proposal from ${player2Name}`}
            style={styles.acceptBtn}
            onPress={onAccept}
          >
            <Text style={styles.acceptBtnText}>✓ Accept</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`Decline match proposal from ${player2Name}`}
            style={styles.declineBtn}
            onPress={onDecline}
          >
            <Text style={styles.declineBtnText}>✕ Decline</Text>
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
  const { user, divisionId } = useAppStore();
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showPropose, setShowPropose] = useState(false);
  const [createMode, setCreateMode] = useState<"live" | "historic">("live");
  const [recordingMode, setRecordingMode] = useState<"self" | "onBehalf">(
    "self",
  );
  const [opponentMode, setOpponentMode] = useState<"search" | "guest">(
    "search",
  );
  const [guestName, setGuestName] = useState("");
  const [player1SearchText, setPlayer1SearchText] = useState("");
  const [player1SearchResults, setPlayer1SearchResults] = useState<User[]>([]);
  const [selectedPlayer1, setSelectedPlayer1] = useState<User | null>(null);
  const [searchingPlayer1, setSearchingPlayer1] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [selectedOpponent, setSelectedOpponent] = useState<User | null>(null);
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);
  // Historic match set scores: array of { p1, p2 } per set
  const [historicSets, setHistoricSets] = useState([{ p1: "", p2: "" }]);
  const router = useRouter();

  useEffect(() => {
    if (!divisionId) return;
    setLoading(true);
    const q = divisionMatchesQuery(divisionId);
    const unsub = onSnapshot(q, (snap) => {
      setMatches(snap.docs.map((d) => ({ ...d.data(), id: d.id }) as Match));
      setLoading(false);
    });
    return unsub;
  }, [divisionId]);

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
        console.error('Failed to search player 1:', err);
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
        console.error('Failed to search opponent:', err);
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
  }

  async function handleCreateMatch() {
    if (!user || !divisionId) return;
    if (opponentMode === "search" && !selectedOpponent) return;
    if (opponentMode === "guest" && !guestName.trim()) return;
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
              createdBy: user.id,
            }
          : {
              player1Id: user.id,
              player2Id: selectedOpponent!.id,
              player1Name: user.displayName,
              player2Name: selectedOpponent!.displayName,
              divisionId,
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
    if (recordingMode === "onBehalf" && !selectedPlayer1) return;
    if (opponentMode === "search" && !selectedOpponent) return;
    if (opponentMode === "guest" && !guestName.trim()) return;

    const parsed = historicSets.map((s) => ({
      p1: parseInt(s.p1, 10),
      p2: parseInt(s.p2, 10),
    }));
    const invalid = parsed.some(
      (s) => isNaN(s.p1) || isNaN(s.p2) || s.p1 < 0 || s.p2 < 0,
    );
    if (invalid || parsed.length === 0) {
      Alert.alert(
        "Invalid Score",
        "Please enter a valid number of games for each set.",
      );
      return;
    }
    if (parsed.some((s) => s.p1 === s.p2)) {
      Alert.alert(
        "Invalid Score",
        "Each set must have a clear winner. Check the set scores.",
      );
      return;
    }
    const p1Sets = parsed.filter((s) => s.p1 > s.p2).length;
    const p2Sets = parsed.filter((s) => s.p2 > s.p1).length;
    if (p1Sets === p2Sets) {
      Alert.alert(
        "Invalid Score",
        "The match must have a clear winner. Check the set scores.",
      );
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
                createdBy: user.id,
                sets: parsed,
              }
            : {
                player1Id: user.id,
                player2Id: selectedOpponent!.id,
                player1Name: user.displayName,
                player2Name: selectedOpponent!.displayName,
                divisionId,
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
        <ActivityIndicator size="large" color="#1a472a" />
      </View>
    );
  }

  const uid = user?.id;
  const toItem = (match: Match, actionKind: ActionKind = null): MatchItem => ({
    id: match.id,
    match,
    actionKind,
  });

  const liveMatches = matches
    .filter((m) => m.status === "in_progress")
    .map((m) => toItem(m));
  const pendingInvites = matches
    .filter((m) => m.status === "proposed" && m.player2Id === uid)
    .sort((a, b) => (a.scheduledAt ?? 0) - (b.scheduledAt ?? 0))
    .map((m) => toItem(m, "pending"));
  const awaitingOpponent = matches
    .filter((m) => m.status === "proposed" && m.player1Id === uid)
    .sort((a, b) => (a.scheduledAt ?? 0) - (b.scheduledAt ?? 0))
    .map((m) => toItem(m, "awaiting"));
  const upcomingMatches = matches
    .filter((m) => m.status === "scheduled")
    .sort((a, b) => (a.scheduledAt ?? 0) - (b.scheduledAt ?? 0))
    .map((m) => toItem(m));
  const otherStatuses = new Set(["in_progress", "proposed", "scheduled"]);
  const otherMatches = matches
    .filter((m) => !otherStatuses.has(m.status))
    .map((m) => toItem(m));
  const canRecordOnBehalf =
    user?.role === "admin" ||
    user?.role === "division_leader" ||
    user?.role === "app_developer";

  const sections: { title: string; data: MatchItem[] }[] = [
    ...(liveMatches.length > 0
      ? [{ title: "Now Live", data: liveMatches }]
      : []),
    ...(pendingInvites.length > 0
      ? [{ title: "Pending Invitations", data: pendingInvites }]
      : []),
    ...(awaitingOpponent.length > 0
      ? [{ title: "Awaiting Opponent", data: awaitingOpponent }]
      : []),
    ...(upcomingMatches.length > 0
      ? [{ title: "Upcoming", data: upcomingMatches }]
      : []),
    ...(otherMatches.length > 0
      ? [{ title: "All Matches", data: otherMatches }]
      : []),
  ];

  return (
    <View style={styles.container}>
      {matches.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>No Matches</Text>
          <Text style={styles.emptyBody}>
            Create a new match to get started.
          </Text>
        </View>
      ) : (
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
          contentContainerStyle={styles.list}
        />
      )}

      <View style={styles.fabGroup}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Record a past match"
          style={[styles.fab, styles.fabSecondary]}
          onPress={() => {
            setCreateMode("historic");
            setShowCreate(true);
          }}
        >
          <Text style={styles.fabSecondaryText}>📋 Past</Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Propose a match"
          style={[styles.fab, styles.fabSecondary]}
          onPress={() => setShowPropose(true)}
        >
          <Text style={styles.fabSecondaryText}>📅 Propose</Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Start a live match"
          style={styles.fab}
          onPress={() => {
            setCreateMode("live");
            setShowCreate(true);
          }}
        >
          <Text style={styles.fabText}>+ Live</Text>
        </TouchableOpacity>
      </View>

      {showPropose && user && divisionId && (
        <ProposeMatchModal
          currentUser={user}
          divisionId={divisionId}
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
                          {selectedPlayer1.email}
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
                            color="#1a472a"
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
                                {item.email}
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
              <TextInput
                accessibilityLabel="Guest opponent name"
                style={styles.input}
                value={guestName}
                onChangeText={setGuestName}
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
                  <Text style={styles.playerChipEmail}>
                    {selectedOpponent.email}
                  </Text>
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
                        <Text style={styles.resultName}>
                          {item.displayName}
                        </Text>
                        <Text style={styles.resultEmail}>{item.email}</Text>
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
                  disabled:
                    creating ||
                    (createMode === "historic" &&
                      recordingMode === "onBehalf" &&
                      !selectedPlayer1) ||
                    (opponentMode === "search"
                      ? !selectedOpponent
                      : !guestName.trim()),
                  busy: creating,
                }}
                style={[
                  styles.createBtn,
                  (creating ||
                    (createMode === "historic" &&
                      recordingMode === "onBehalf" &&
                      !selectedPlayer1) ||
                    (opponentMode === "search"
                      ? !selectedOpponent
                      : !guestName.trim())) &&
                    styles.createBtnDisabled,
                ]}
                onPress={
                  createMode === "historic"
                    ? handleRecordHistoric
                    : handleCreateMatch
                }
                disabled={
                  creating ||
                  (createMode === "historic" &&
                    recordingMode === "onBehalf" &&
                    !selectedPlayer1) ||
                  (opponentMode === "search"
                    ? !selectedOpponent
                    : !guestName.trim())
                }
              >
                {creating ? (
                  <ActivityIndicator color="#fff" />
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
  onClose,
}: {
  currentUser: { id: string; displayName: string };
  divisionId: string;
  onClose: () => void;
}) {
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [selectedOpponent, setSelectedOpponent] = useState<User | null>(null);
  const [searching, setSearching] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
    if (!selectedOpponent) return;
    if (!DATE_RE.test(date)) {
      Alert.alert("Invalid date", "Please enter the date as YYYY-MM-DD.");
      return;
    }
    if (!TIME_RE.test(time)) {
      Alert.alert("Invalid time", "Please enter the time as HH:MM (24-hour).");
      return;
    }
    const ts = Date.parse(`${date}T${time}`);
    if (!ts || Number.isNaN(ts)) {
      Alert.alert("Invalid date/time", "Could not parse that date and time.");
      return;
    }
    if (ts < Date.now()) {
      Alert.alert("Past time", "Pick a date/time in the future.");
      return;
    }
    setSubmitting(true);
    try {
      await proposeMatch({
        player1Id: currentUser.id,
        player2Id: selectedOpponent.id,
        player1Name: currentUser.displayName,
        player2Name: selectedOpponent.displayName,
        divisionId,
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

            {selectedOpponent ? (
              <>
                <View style={styles.selectedPlayer}>
                  <View style={styles.playerChip}>
                    <Text style={styles.playerChipName}>
                      {selectedOpponent.displayName}
                    </Text>
                    <Text style={styles.playerChipEmail}>
                      {selectedOpponent.email}
                    </Text>
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
                <AvailabilityHint availability={selectedOpponent.availability} />

                <Text style={styles.modalLabel}>Date (YYYY-MM-DD)</Text>
                <TextInput
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
                        <Text style={styles.resultName}>
                          {item.displayName}
                        </Text>
                        <Text style={styles.resultEmail}>{item.email}</Text>
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
                  disabled: submitting || !selectedOpponent || !date || !time,
                  busy: submitting,
                }}
                style={[
                  styles.createBtn,
                  (submitting || !selectedOpponent || !date || !time) &&
                    styles.createBtnDisabled,
                ]}
                onPress={handleSubmit}
                disabled={submitting || !selectedOpponent || !date || !time}
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

function AvailabilityHint({ availability }: { availability?: Availability }) {
  if (
    !availability ||
    (availability.slots.length === 0 && !availability.note)
  ) {
    return (
      <Text style={styles.availabilityEmpty}>
        Opponent hasn&apos;t set their preferred play times.
      </Text>
    );
  }
  return (
    <View style={styles.availabilityBox}>
      <Text style={styles.availabilityTitle}>Their preferred times</Text>
      {availability.slots.map((s, i) => (
        <View key={i} style={styles.availabilityRow}>
          <Text style={styles.availabilityDay}>{DAY_LABELS[s.day]}</Text>
          <Text style={styles.availabilityTime}>
            {s.from}–{s.to}
          </Text>
        </View>
      ))}
      {availability.note && (
        <Text style={styles.availabilityNote}>{availability.note}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f5f0" },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  list: { padding: 16, paddingBottom: 80 },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  sectionTitleLive: { color: "#27ae60" },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#27ae60" },

  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  cardLive: { borderLeftWidth: 4, borderLeftColor: "#27ae60" },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  winnerBadge: {
    fontSize: 11,
    fontWeight: "600",
    color: "#1a472a",
    backgroundColor: "#e8f5e9",
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
  gameScore: { fontSize: 15, fontWeight: "600", color: "#27ae60" },

  players: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  playerName: { fontSize: 15, fontWeight: "600", color: "#333", flex: 1 },
  playerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
    justifyContent: "flex-end",
  },
  winner: { color: "#1a472a" },
  vs: { fontSize: 13, color: "#999", marginHorizontal: 12 },
  guestBadge: {
    fontSize: 10,
    fontWeight: "700",
    color: "#e67e22",
    backgroundColor: "#fff3e0",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: "hidden",
  },
  serverLine: { fontSize: 12, color: "#888", marginTop: 6 },

  fabGroup: {
    position: "absolute",
    bottom: 24,
    right: 16,
    flexDirection: "row",
    gap: 10,
  },
  fab: {
    backgroundColor: "#1a472a",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 28,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  fabText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  fabSecondary: {
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: "#1a472a",
  },
  fabSecondaryText: { color: "#1a472a", fontWeight: "700", fontSize: 15 },
  setsContainer: { marginBottom: 4, gap: 8 },
  setRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  setLabel: { fontSize: 13, color: "#666", width: 40 },
  setInput: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
    width: 56,
    color: "#1a472a",
  },
  setDash: { fontSize: 18, color: "#888", fontWeight: "600" },
  removeSet: { fontSize: 18, color: "#c0392b", paddingHorizontal: 6 },
  addSet: {
    color: "#1a472a",
    fontWeight: "600",
    fontSize: 14,
    paddingVertical: 4,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
    marginBottom: 8,
  },
  emptyBody: { fontSize: 14, color: "#666", textAlign: "center" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    maxHeight: "80%",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1a472a",
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
    borderColor: "#ddd",
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
  resultEmail: { fontSize: 13, color: "#888", marginTop: 2 },
  noResults: {
    fontSize: 14,
    color: "#999",
    textAlign: "center",
    marginVertical: 12,
  },
  selectedPlayer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  playerChip: { flex: 1 },
  playerChipName: { fontSize: 16, fontWeight: "700", color: "#1a472a" },
  playerChipEmail: { fontSize: 13, color: "#666", marginTop: 2 },
  changeText: { fontSize: 14, color: "#1a472a", fontWeight: "600" },
  modeToggle: {
    flexDirection: "row",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ddd",
    overflow: "hidden",
    marginBottom: 16,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: "#f9f9f9",
  },
  modeBtnActive: { backgroundColor: "#1a472a" },
  modeBtnText: { fontSize: 13, fontWeight: "600", color: "#888" },
  modeBtnTextActive: { color: "#fff" },
  modalActions: { flexDirection: "row", gap: 12, marginTop: 8 },
  cancelBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ddd",
    alignItems: "center",
  },
  cancelText: { color: "#333", fontWeight: "600" },
  createBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    backgroundColor: "#1a472a",
    alignItems: "center",
  },
  createBtnDisabled: { opacity: 0.6 },
  createText: { color: "#fff", fontWeight: "600" },
  scheduledLine: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1a472a",
    marginBottom: 8,
  },
  cardActions: { flexDirection: "row", gap: 8, marginTop: 12 },
  acceptBtn: {
    flex: 1,
    backgroundColor: "#1a472a",
    padding: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  acceptBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  declineBtn: {
    flex: 1,
    backgroundColor: "#fff",
    padding: 10,
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#c0392b",
  },
  declineBtnText: { color: "#c0392b", fontWeight: "600", fontSize: 13 },
  availabilityBox: {
    backgroundColor: "#f5f5ec",
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  availabilityTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#1a472a",
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
    color: "#1a472a",
    width: 32,
  },
  availabilityTime: { fontSize: 13, color: "#444" },
  availabilityNote: {
    fontSize: 12,
    color: "#666",
    fontStyle: "italic",
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: "#e7e7d8",
  },
  availabilityEmpty: {
    color: "#999",
    fontSize: 13,
    fontStyle: "italic",
    marginBottom: 12,
  },
});
