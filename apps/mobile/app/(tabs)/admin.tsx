import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
  Alert,
} from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { onSnapshot, getDoc, getDocs, query, where } from "firebase/firestore";
import {
  divisionsCol,
  userDoc,
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
} from "@tennis/firebase-client";
import { useAppStore } from "../../store/appStore";
import { KeyboardAwareScrollView } from "../../components/KeyboardSafeView";
import {
  currentSeasonForDate,
  defaultSeasonOptions,
  formatDivisionLevelName,
  type Division,
  type DivisionMatchType,
  type DivisionSkillLevel,
  type Match,
  type PlayerRanking,
  type User,
  isPrivilegedRole,
} from "@tennis/shared";

export default function AdminScreen() {
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
  const [merging, setMerging] = useState(false);
  const [candidateMatches, setCandidateMatches] = useState<Match[]>([]);
  const [candidateMatchRefreshKey, setCandidateMatchRefreshKey] = useState(0);
  const [selectedMatchIds, setSelectedMatchIds] = useState<string[]>([]);
  const [editEmail, setEditEmail] = useState("");
  const [newDivisionName, setNewDivisionName] = useState("");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [creating, setCreating] = useState(false);
  const [repairingRankings, setRepairingRankings] = useState(false);
  const [repairMessage, setRepairMessage] = useState("");
  const [error, setError] = useState("");
  const currentSeason = currentSeasonForDate();
  const seasonOptions = defaultSeasonOptions();
  const { levels: divisionLevels } = useDivisionLevels(division?.id);
  const [levelSeasonId, setLevelSeasonId] = useState(currentSeason.id);
  const [levelSkill, setLevelSkill] = useState<DivisionSkillLevel>("beginner");
  const [levelMatchType, setLevelMatchType] =
    useState<DivisionMatchType>("singles");
  const [levelName, setLevelName] = useState(
    formatDivisionLevelName("beginner", "singles"),
  );
  const [levelDescription, setLevelDescription] = useState("");
  const [savingLevel, setSavingLevel] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);

  const isAdmin = isPrivilegedRole(user?.role);

  useEffect(() => {
    if (!user?.id) {
      setDivision(null);
      setPlayers([]);
      setLoading(false);
      return;
    }
    const q = query(
      divisionsCol(),
      where("leaderIds", "array-contains", user.id),
    );
    const unsub = onSnapshot(q, async (snap) => {
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

      setDivision(div);
      if (div) {
        const activeDivision = div;
        const [divisionMemberProfiles, divisionProfileSnap, rankingSnap] =
          await Promise.all([
            activeDivision.playerIds.length
              ? Promise.all(
                  activeDivision.playerIds.map((id) => getDoc(userDoc(id))),
                )
              : Promise.resolve([]),
            getDocs(
              query(usersCol(), where("divisionId", "==", activeDivision.id)),
            ),
            getDocs(rankingsCol(activeDivision.id)),
          ]);
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
    return unsub;
  }, [user?.id, user?.divisionId]);

  async function handleCreateDivision() {
    if (!user || !newDivisionName.trim()) return;
    setCreating(true);
    try {
      await createDivision(newDivisionName.trim(), user.id, {
        displayName: user.displayName,
        email: user.email,
      });
      setNewDivisionName("");
    } catch {
      Alert.alert("Error", "Could not create division. Please try again.");
    } finally {
      setCreating(false);
    }
  }

  async function handleAddPlayer() {
    if (!division || !newPlayerName.trim()) return;
    setAdding(true);
    setError("");
    try {
      const result = await addDivisionMemberPlaceholder(
        division.id,
        newPlayerName.trim(),
        newPlayerEmail.trim() || undefined,
        false,
      );
      setNeedsMergeForUserId(result.userId);
      setMergeSourceUserId(null);
      setSelectedMatchIds([]);
      setCandidateMatches([]);
      setEditEmail(newPlayerEmail.trim());
      Alert.alert(
        "Player added",
        result.linkedHistoricalMatches > 0
          ? `Automatically linked ${result.linkedHistoricalMatches} historical match${
              result.linkedHistoricalMatches === 1 ? "" : "es"
            } by player name. If anything is still missing, use link records below.`
          : "If existing recorded matches belong to this player, select an existing player below and link records.",
      );
      setNewPlayerName("");
      setNewPlayerEmail("");
    } catch (e) {
      setError(
        (e as { message?: string }).message ||
          "Failed to add player. Please try again.",
      );
    } finally {
      setAdding(false);
    }
  }

  async function handleMergeRecords() {
    if (!division || !needsMergeForUserId) return;
    if (selectedMatchIds.length === 0) {
      Alert.alert(
        "Select matches",
        "Please select at least one completed match to link.",
      );
      return;
    }
    setMerging(true);
    setError("");
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
      Alert.alert(
        "Records linked",
        `Updated ${updatedMatches} historical matches and refreshed rankings.`,
      );
      setCandidateMatchRefreshKey((key) => key + 1);
      setSelectedMatchIds([]);
      setMergeSourceUserId(null);
    } catch (e) {
      setError(
        (e as { message?: string }).message ||
          "Failed to link historical records. Please try again.",
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
      await updateDivisionPlayerEmail(
        division.id,
        needsMergeForUserId,
        editEmail,
      );
      Alert.alert("Email updated", "Player email updated.");
    } catch (e) {
      setError(
        (e as { message?: string }).message || "Failed to update player email.",
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

  async function handleCreateLevel() {
    if (!division || !levelName.trim()) return;
    const selectedSeason =
      seasonOptions.find((season) => season.id === levelSeasonId) ??
      currentSeason;
    setSavingLevel(true);
    setError("");
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
      Alert.alert("Division level saved", `${levelName} is now documented.`);
    } catch (e) {
      Alert.alert(
        "Could not save level",
        (e as { message?: string }).message || "Please try again.",
      );
    } finally {
      setSavingLevel(false);
    }
  }

  async function handleShareCsv(exportType: "matches" | "rankings") {
    if (!division) return;
    setExportingCsv(true);
    try {
      const result = await exportDivisionCsv({
        divisionId: division.id,
        exportType,
        seasonId: levelSeasonId,
      });
      const safeFilename = result.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
      const baseDirectory =
        FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
      if (!baseDirectory) {
        Alert.alert(
          "Could not export CSV",
          "No writable app directory is available on this device.",
        );
        return;
      }
      const fileUri = `${baseDirectory}${safeFilename}`;
      await FileSystem.writeAsStringAsync(fileUri, result.csv, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert(
          "Sharing unavailable",
          "CSV export was created, but sharing is not available on this device.",
        );
        return;
      }
      await Sharing.shareAsync(fileUri, {
        mimeType: result.contentType,
        dialogTitle: result.filename,
        UTI: "public.comma-separated-values-text",
      });
    } catch (e) {
      Alert.alert(
        "Could not export CSV",
        (e as { message?: string }).message || "Please try again.",
      );
    } finally {
      setExportingCsv(false);
    }
  }

  async function repairRankings() {
    if (!division) return;
    setRepairingRankings(true);
    setRepairMessage("");
    setError("");
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
          ? `Rankings repaired. Counted ${result.countedMatches ?? 0} matches, including ${result.guestMatchesCounted ?? 0} guest matches. Updated ${result.rankingsWritten ?? 0} ranking rows and removed ${result.rankingsDeleted ?? 0} stale rows. Normalized ${result.matchesNormalized ?? 0} historic matches.`
          : "Rankings repaired.",
      );
    } catch (e) {
      setError(
        (e as { message?: string }).message || "Failed to repair rankings.",
      );
    } finally {
      setRepairingRankings(false);
    }
  }

  if (!isAdmin) {
    return (
      <View style={styles.center}>
        <Text style={styles.accessDenied}>⚠ Admin access only</Text>
        <Text style={styles.accessHint}>
          This screen is only available to division leaders and admins.
        </Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1a472a" />
      </View>
    );
  }

  return (
    <KeyboardAwareScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <Text style={styles.pageTitle}>Division Admin</Text>

      {!division ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Create Your Division</Text>
          <Text style={styles.hint}>
            You are not currently managing a division. Create one to get
            started.
          </Text>
          <TextInput
            accessibilityLabel="Division name"
            style={styles.input}
            value={newDivisionName}
            onChangeText={setNewDivisionName}
            placeholder="Division name (e.g. Office A)"
            placeholderTextColor="#aaa"
            autoCapitalize="words"
          />
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Create division"
            accessibilityState={{
              disabled: !newDivisionName.trim() || creating,
              busy: creating,
            }}
            style={[
              styles.btn,
              (!newDivisionName.trim() || creating) && styles.btnDisabled,
            ]}
            onPress={handleCreateDivision}
            disabled={!newDivisionName.trim() || creating}
          >
            {creating ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnText}>Create Division</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{division.name}</Text>
            <Text style={styles.hint}>
              {players.length} player{players.length !== 1 ? "s" : ""} enrolled
            </Text>

            <Text style={styles.subTitle}>Add Player</Text>
            <TextInput
              accessibilityLabel="New player full name"
              style={styles.input}
              value={newPlayerName}
              onChangeText={setNewPlayerName}
              placeholder="Full name"
              placeholderTextColor="#aaa"
              autoCapitalize="words"
            />
            <TextInput
              accessibilityLabel="New player email"
              style={styles.input}
              value={newPlayerEmail}
              onChangeText={(t) => {
                setNewPlayerEmail(t);
                setError("");
              }}
              placeholder="player@company.com"
              placeholderTextColor="#aaa"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {error ? (
              <Text
                accessibilityLiveRegion="assertive"
                style={styles.errorText}
              >
                {error}
              </Text>
            ) : null}
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Add player"
              accessibilityState={{
                disabled: !newPlayerName.trim() || adding,
                busy: adding,
              }}
              style={[
                styles.btn,
                (!newPlayerName.trim() || adding) && styles.btnDisabled,
              ]}
              onPress={handleAddPlayer}
              disabled={!newPlayerName.trim() || adding}
            >
              {adding ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnText}>Add Player</Text>
              )}
            </TouchableOpacity>
            {needsMergeForUserId ? (
              <View style={styles.mergeBox}>
                <Text style={styles.subTitle}>
                  Link Historical Matches (Optional)
                </Text>
                <Text style={styles.hint}>
                  Pick an existing player record if historical matches should be
                  reassigned to this newly added player.
                </Text>
                <TextInput
                  accessibilityLabel="Updated player email"
                  style={styles.input}
                  value={editEmail}
                  onChangeText={setEditEmail}
                  placeholder="Update player email (optional)"
                  placeholderTextColor="#aaa"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Text style={styles.hint}>
                  Optional: select a source player record.
                </Text>
                {players
                  .filter((p) => p.id !== needsMergeForUserId)
                  .map((p) => (
                    <TouchableOpacity
                      key={p.id}
                      accessibilityRole="button"
                      accessibilityLabel={`Select ${p.displayName} as source player`}
                      accessibilityState={{
                        selected: mergeSourceUserId === p.id,
                      }}
                      style={[
                        styles.mergeCandidate,
                        mergeSourceUserId === p.id &&
                          styles.mergeCandidateActive,
                      ]}
                      onPress={() => setMergeSourceUserId(p.id)}
                    >
                      <Text style={styles.playerName}>{p.displayName}</Text>
                    </TouchableOpacity>
                  ))}
                <Text style={styles.hint}>
                  Which recorded matches did this player play in?
                </Text>
                {candidateMatches.length > 0 ? (
                  candidateMatches.map((match) => {
                    const selected = selectedMatchIds.includes(match.id);
                    return (
                      <TouchableOpacity
                        key={match.id}
                        accessibilityRole="button"
                        accessibilityLabel={`${selected ? "Deselect" : "Select"} ${match.player1Name || "P1"} versus ${match.player2Name || "P2"}`}
                        accessibilityState={{ selected }}
                        style={[
                          styles.matchCandidate,
                          selected && styles.mergeCandidateActive,
                        ]}
                        onPress={() =>
                          setSelectedMatchIds((prev) =>
                            selected
                              ? prev.filter((id) => id !== match.id)
                              : [...prev, match.id],
                          )
                        }
                      >
                        <Text style={styles.playerName}>
                          {selected ? "✓ " : ""}
                          {match.player1Name || "P1"} vs{" "}
                          {match.player2Name || "P2"}
                        </Text>
                      </TouchableOpacity>
                    );
                  })
                ) : (
                  <Text style={styles.hint}>
                    No recorded matches are available.
                  </Text>
                )}
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Link selected matches"
                  accessibilityState={{
                    disabled: selectedMatchIds.length === 0 || merging,
                    busy: merging,
                  }}
                  style={[
                    styles.btn,
                    (selectedMatchIds.length === 0 || merging) &&
                      styles.btnDisabled,
                  ]}
                  onPress={handleMergeRecords}
                  disabled={selectedMatchIds.length === 0 || merging}
                >
                  {merging ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.btnText}>Link Selected Matches</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Update player email"
                  accessibilityState={{
                    disabled: !editEmail.trim() || merging,
                    busy: merging,
                  }}
                  style={[
                    styles.secondaryBtn,
                    (!editEmail.trim() || merging) && styles.btnDisabled,
                  ]}
                  onPress={handleUpdatePlayerEmail}
                  disabled={!editEmail.trim() || merging}
                >
                  <Text style={styles.secondaryBtnText}>Update Email</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Seasons & Division Levels</Text>
            <Text style={styles.hint}>
              Document Beginner, Intermediate, Advanced, or Open singles/doubles
              levels for Spring and Fall seasons.
            </Text>
            <Text style={styles.subTitle}>Season</Text>
            <View style={styles.chipRow}>
              {seasonOptions.map((season) => (
                <TouchableOpacity
                  key={season.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: levelSeasonId === season.id }}
                  style={[
                    styles.chip,
                    levelSeasonId === season.id && styles.chipActive,
                  ]}
                  onPress={() => setLevelSeasonId(season.id)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      levelSeasonId === season.id && styles.chipTextActive,
                    ]}
                  >
                    {season.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.subTitle}>Level</Text>
            <View style={styles.chipRow}>
              {(
                [
                  "beginner",
                  "intermediate",
                  "advanced",
                  "open",
                ] as DivisionSkillLevel[]
              ).map((skill) => (
                <TouchableOpacity
                  key={skill}
                  accessibilityRole="button"
                  accessibilityState={{ selected: levelSkill === skill }}
                  style={[
                    styles.chip,
                    levelSkill === skill && styles.chipActive,
                  ]}
                  onPress={() => {
                    setLevelSkill(skill);
                    setLevelName(
                      formatDivisionLevelName(skill, levelMatchType),
                    );
                  }}
                >
                  <Text
                    style={[
                      styles.chipText,
                      levelSkill === skill && styles.chipTextActive,
                    ]}
                  >
                    {skill[0].toUpperCase() + skill.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.chipRow}>
              {(["singles", "doubles"] as DivisionMatchType[]).map(
                (matchType) => (
                  <TouchableOpacity
                    key={matchType}
                    accessibilityRole="button"
                    accessibilityState={{
                      selected: levelMatchType === matchType,
                    }}
                    style={[
                      styles.chip,
                      levelMatchType === matchType && styles.chipActive,
                    ]}
                    onPress={() => {
                      setLevelMatchType(matchType);
                      setLevelName(
                        formatDivisionLevelName(levelSkill, matchType),
                      );
                    }}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        levelMatchType === matchType && styles.chipTextActive,
                      ]}
                    >
                      {matchType === "singles" ? "Singles" : "Doubles"}
                    </Text>
                  </TouchableOpacity>
                ),
              )}
            </View>
            <TextInput
              accessibilityLabel="Division level name"
              style={styles.input}
              value={levelName}
              onChangeText={setLevelName}
              placeholder="Level name"
              placeholderTextColor="#aaa"
            />
            <TextInput
              accessibilityLabel="Division level description"
              style={styles.input}
              value={levelDescription}
              onChangeText={setLevelDescription}
              placeholder="Description or eligibility notes"
              placeholderTextColor="#aaa"
            />
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Save division level"
              accessibilityState={{
                disabled: !levelName.trim() || savingLevel,
                busy: savingLevel,
              }}
              style={[
                styles.btn,
                (!levelName.trim() || savingLevel) && styles.btnDisabled,
              ]}
              onPress={handleCreateLevel}
              disabled={!levelName.trim() || savingLevel}
            >
              {savingLevel ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnText}>Save Level</Text>
              )}
            </TouchableOpacity>
            {divisionLevels.length > 0 ? (
              <View style={styles.levelList}>
                {divisionLevels.map((level) => (
                  <View key={level.id} style={styles.levelItem}>
                    <Text style={styles.playerName}>{level.name}</Text>
                    <Text style={styles.playerContact}>
                      {level.seasonHalf === "spring" ? "Spring" : "Fall"}{" "}
                      {level.year} · {level.matchType}
                    </Text>
                    {level.description ? (
                      <Text style={styles.playerContact}>
                        {level.description}
                      </Text>
                    ) : null}
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.hint}>
                No division levels documented yet.
              </Text>
            )}
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Share matches CSV"
              style={[styles.secondaryBtn, exportingCsv && styles.btnDisabled]}
              onPress={() => handleShareCsv("matches")}
              disabled={exportingCsv}
            >
              <Text style={styles.secondaryBtnText}>Share Matches CSV</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Share rankings CSV"
              style={[styles.secondaryBtn, exportingCsv && styles.btnDisabled]}
              onPress={() => handleShareCsv("rankings")}
              disabled={exportingCsv}
            >
              <Text style={styles.secondaryBtnText}>Share Rankings CSV</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Ranking Repair</Text>
            <Text style={styles.hint}>
              Rebuild rankings and head-to-head records from completed matches
              without deleting match history.
            </Text>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Repair rankings"
              accessibilityState={{
                disabled: repairingRankings,
                busy: repairingRankings,
              }}
              style={[styles.btn, repairingRankings && styles.btnDisabled]}
              onPress={repairRankings}
              disabled={repairingRankings}
            >
              {repairingRankings ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnText}>Repair Rankings</Text>
              )}
            </TouchableOpacity>
            {repairMessage ? (
              <Text accessibilityLiveRegion="polite" style={styles.successText}>
                {repairMessage}
              </Text>
            ) : null}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Players</Text>
            {players.length === 0 ? (
              <Text style={styles.hint}>
                No players yet. Add players above.
              </Text>
            ) : (
              <FlatList
                data={players}
                keyExtractor={(p) => p.id}
                scrollEnabled={false}
                renderItem={({ item: p }) => (
                  <View style={styles.playerRow}>
                    <View style={styles.playerInfo}>
                      <Text style={styles.playerName}>{p.displayName}</Text>
                      {p.contactPreferences?.allowEmail !== false && p.email ? (
                        <Text style={styles.playerContact}>{p.email}</Text>
                      ) : null}
                      {p.phone && p.contactPreferences?.allowSMS ? (
                        <Text style={styles.playerContact}>{p.phone}</Text>
                      ) : null}
                    </View>
                    <View
                      style={
                        division.leaderIds.includes(p.id)
                          ? styles.leaderBadge
                          : styles.playerBadge
                      }
                    >
                      <Text
                        style={
                          division.leaderIds.includes(p.id)
                            ? styles.leaderBadgeText
                            : styles.playerBadgeText
                        }
                      >
                        {division.leaderIds.includes(p.id)
                          ? "Leader"
                          : "Player"}
                      </Text>
                    </View>
                  </View>
                )}
                ItemSeparatorComponent={() => <View style={styles.separator} />}
              />
            )}
          </View>
        </>
      )}
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f5f5" },
  content: { padding: 20, paddingBottom: 40 },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  accessDenied: {
    fontSize: 20,
    fontWeight: "700",
    color: "#c0392b",
    marginBottom: 8,
  },
  accessHint: { fontSize: 14, color: "#888", textAlign: "center" },
  pageTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: "#1a472a",
    marginBottom: 20,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1a472a",
    marginBottom: 6,
  },
  subTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#444",
    marginTop: 16,
    marginBottom: 8,
  },
  hint: { fontSize: 13, color: "#888", marginBottom: 12 },
  mergeBox: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#eee",
    paddingTop: 8,
  },
  mergeCandidate: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  mergeCandidateActive: { borderColor: "#1a472a", backgroundColor: "#e8f5e9" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  chip: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipActive: { borderColor: "#1a472a", backgroundColor: "#e8f5e9" },
  chipText: { color: "#555", fontWeight: "600" },
  chipTextActive: { color: "#1a472a" },
  levelList: { gap: 8, marginVertical: 12 },
  levelItem: {
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 12,
    padding: 12,
  },
  matchCandidate: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#222",
    marginBottom: 10,
  },
  btn: {
    backgroundColor: "#1a472a",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: "#1a472a",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  secondaryBtnText: { color: "#1a472a", fontWeight: "700", fontSize: 15 },
  errorText: { color: "#c0392b", fontSize: 13, marginBottom: 8 },
  successText: { color: "#1a472a", fontSize: 13, marginTop: 8 },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  playerInfo: { flex: 1, gap: 2 },
  playerName: { fontSize: 15, fontWeight: "600", color: "#222" },
  playerContact: { fontSize: 13, color: "#555" },
  leaderBadge: {
    backgroundColor: "#fff3cd",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  leaderBadgeText: { color: "#856404", fontWeight: "700", fontSize: 12 },
  playerBadge: {
    backgroundColor: "#f0f0f0",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  playerBadgeText: { color: "#555", fontWeight: "600", fontSize: 12 },
  separator: { height: 1, backgroundColor: "#f5f5f5" },
});
