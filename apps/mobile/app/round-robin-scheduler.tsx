import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  publishRoundRobinSchedule,
  previewRoundRobinSchedule,
  useDivisionLevels,
  useDivisionMemberships,
  useRankings,
} from "@tennis/firebase-client";
import {
  currentSeasonForDate,
  defaultSeasonOptions,
  type RoundRobinMatchup,
} from "@tennis/shared";
import { useAppStore } from "../store/appStore";
import { KeyboardAwareScrollView } from "../components/KeyboardSafeView";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const INTERVAL_OPTIONS = [3, 7, 14];

export default function RoundRobinSchedulerScreen() {
  const router = useRouter();
  const { divisionId } = useLocalSearchParams<{ divisionId: string }>();
  const { user } = useAppStore();
  const currentSeason = currentSeasonForDate();
  const seasonOptions = defaultSeasonOptions();

  const [seasonId, setSeasonId] = useState(currentSeason.id);
  const { levels: divisionLevels } = useDivisionLevels(divisionId);
  const levelsForSeason = divisionLevels.filter((l) => l.seasonId === seasonId);
  const [divisionLevelId, setDivisionLevelId] = useState("");

  useEffect(() => {
    if (levelsForSeason.length === 0) {
      setDivisionLevelId("");
      return;
    }
    if (!levelsForSeason.some((l) => l.id === divisionLevelId)) {
      setDivisionLevelId(levelsForSeason[0].id);
    }
  }, [seasonId, divisionLevels]);

  const { memberships } = useDivisionMemberships(divisionId, seasonId, divisionLevelId || null);
  const { rankings } = useRankings(divisionId ?? null, { seasonId, divisionLevelId });

  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  useEffect(() => {
    setSelectedPlayerIds(memberships.map((m) => m.userId));
  }, [memberships]);

  const [doubleRoundRobin, setDoubleRoundRobin] = useState(false);
  const [intervalDays, setIntervalDays] = useState(7);
  const [startDate, setStartDate] = useState("");
  const [seedByRankings, setSeedByRankings] = useState(true);
  const [clearExisting, setClearExisting] = useState(false);

  const [preview, setPreview] = useState<RoundRobinMatchup[] | null>(null);
  const [publishing, setPublishing] = useState(false);

  function togglePlayer(userId: string) {
    setPreview(null);
    setSelectedPlayerIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  }

  function nameFor(userId: string): string {
    return memberships.find((m) => m.userId === userId)?.displayNameSnapshot ?? userId;
  }

  // The generator pairs individuals, so it cannot fill a doubles level yet.
  // publishRoundRobinSchedule rejects doubles server-side; this stops the flow
  // before a leader builds a preview they cannot publish.
  const selectedLevelIsDoubles =
    divisionLevels.find((l) => l.id === divisionLevelId)?.matchType === "doubles";

  function handleGeneratePreview() {
    if (selectedLevelIsDoubles) {
      Alert.alert(
        "Doubles not supported",
        "Round-robin scheduling is not yet available for doubles levels. Create doubles matches from the Matches tab instead.",
      );
      return;
    }
    if (selectedPlayerIds.length < 2) {
      Alert.alert("Select players", "Choose at least 2 players to generate a schedule.");
      return;
    }
    setPreview(
      previewRoundRobinSchedule({
        playerIds: selectedPlayerIds,
        doubleRoundRobin,
        seedByRankings,
        rankings,
      }),
    );
  }

  async function handlePublish() {
    if (!user || !divisionId || !seasonId || !divisionLevelId || !preview) return;
    if (selectedLevelIsDoubles) return;
    if (!DATE_RE.test(startDate)) {
      Alert.alert("Invalid date", "Please enter the start date as YYYY-MM-DD.");
      return;
    }
    const startAt = Date.parse(`${startDate}T18:00:00`);
    if (!startAt || Number.isNaN(startAt)) {
      Alert.alert("Invalid date", "Could not parse that start date.");
      return;
    }

    Alert.alert(
      "Publish Schedule",
      `This will create ${preview.length} match${preview.length === 1 ? "" : "es"}${
        clearExisting ? " and remove the previously generated schedule for this level" : ""
      }. Continue?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Publish",
          style: "destructive",
          onPress: async () => {
            setPublishing(true);
            try {
              const level = divisionLevels.find((l) => l.id === divisionLevelId);
              const result = await publishRoundRobinSchedule({
                divisionId,
                seasonId,
                divisionLevelId,
                matchType: level?.matchType,
                playerIds: selectedPlayerIds,
                doubleRoundRobin,
                startAt,
                intervalDays,
                clearExisting,
              });
              setPreview(null);
              Alert.alert(
                "Schedule published",
                `Created ${result.matchesCreated} match${result.matchesCreated === 1 ? "" : "es"} across ${result.roundsCreated} round${result.roundsCreated === 1 ? "" : "s"}.`,
                [{ text: "OK", onPress: () => router.back() }],
              );
            } catch (e) {
              Alert.alert(
                "Could not publish schedule",
                (e as { message?: string }).message || "Please try again.",
              );
            } finally {
              setPublishing(false);
            }
          },
        },
      ],
    );
  }

  return (
    <KeyboardAwareScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.subtitle}>
        Auto-generate a round-robin fixture list for a season and division level.
      </Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Season</Text>
        <View style={styles.chipRow}>
          {seasonOptions.map((season) => (
            <TouchableOpacity
              key={season.id}
              style={[styles.chip, seasonId === season.id && styles.chipActive]}
              onPress={() => setSeasonId(season.id)}
            >
              <Text style={[styles.chipText, seasonId === season.id && styles.chipTextActive]}>
                {season.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Division Level</Text>
        {levelsForSeason.length === 0 ? (
          <Text style={styles.hint}>
            No division levels documented for this season yet — add one from Admin first.
          </Text>
        ) : (
          <View style={styles.chipRow}>
            {levelsForSeason.map((level) => (
              <TouchableOpacity
                key={level.id}
                style={[styles.chip, divisionLevelId === level.id && styles.chipActive]}
                onPress={() => {
                  setDivisionLevelId(level.id);
                  setPreview(null);
                }}
              >
                <Text
                  style={[styles.chipText, divisionLevelId === level.id && styles.chipTextActive]}
                >
                  {level.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          Players ({selectedPlayerIds.length} selected)
        </Text>
        {memberships.length === 0 ? (
          <Text style={styles.hint}>
            No active players in this season/level yet.
          </Text>
        ) : (
          memberships.map((m) => {
            const selected = selectedPlayerIds.includes(m.userId);
            return (
              <TouchableOpacity
                key={m.userId}
                style={[styles.playerRow, selected && styles.playerRowActive]}
                onPress={() => togglePlayer(m.userId)}
              >
                <Text style={styles.playerRowText}>
                  {selected ? "✓ " : ""}
                  {m.displayNameSnapshot}
                </Text>
              </TouchableOpacity>
            );
          })
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Format</Text>
        <View style={styles.chipRow}>
          {[
            { label: "Single round robin", value: false },
            { label: "Double round robin", value: true },
          ].map((opt) => (
            <TouchableOpacity
              key={String(opt.value)}
              style={[styles.chip, doubleRoundRobin === opt.value && styles.chipActive]}
              onPress={() => {
                setDoubleRoundRobin(opt.value);
                setPreview(null);
              }}
            >
              <Text
                style={[
                  styles.chipText,
                  doubleRoundRobin === opt.value && styles.chipTextActive,
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Round interval</Text>
        <View style={styles.chipRow}>
          {INTERVAL_OPTIONS.map((days) => (
            <TouchableOpacity
              key={days}
              style={[styles.chip, intervalDays === days && styles.chipActive]}
              onPress={() => setIntervalDays(days)}
            >
              <Text style={[styles.chipText, intervalDays === days && styles.chipTextActive]}>
                Every {days} days
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Round 1 start date</Text>
        <TextInput
          style={styles.input}
          value={startDate}
          onChangeText={setStartDate}
          placeholder="YYYY-MM-DD"
          maxLength={10}
        />

        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Seed pairings by current ranking</Text>
          <Switch
            value={seedByRankings}
            onValueChange={(v) => {
              setSeedByRankings(v);
              setPreview(null);
            }}
            trackColor={{ true: "#1a472a", false: "#ccc" }}
          />
        </View>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>
            Clear previously generated schedule for this level
          </Text>
          <Switch
            value={clearExisting}
            onValueChange={setClearExisting}
            trackColor={{ true: "#1a472a", false: "#ccc" }}
          />
        </View>
      </View>

      <TouchableOpacity style={styles.previewBtn} onPress={handleGeneratePreview}>
        <Text style={styles.previewBtnText}>Generate Preview</Text>
      </TouchableOpacity>

      {preview && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Preview — {preview.length} match{preview.length === 1 ? "" : "es"}
          </Text>
          {Array.from(new Set(preview.map((m) => m.round))).map((round) => (
            <View key={round} style={styles.roundBlock}>
              <Text style={styles.roundLabel}>Round {round}</Text>
              {preview
                .filter((m) => m.round === round)
                .map((m, idx) => (
                  <Text key={idx} style={styles.matchupText}>
                    {nameFor(m.player1Id)} vs {nameFor(m.player2Id)}
                  </Text>
                ))}
            </View>
          ))}

          <TouchableOpacity
            style={[styles.publishBtn, publishing && styles.btnDisabled]}
            onPress={handlePublish}
            disabled={publishing}
          >
            {publishing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.publishBtnText}>Publish Schedule</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f5f0" },
  content: { padding: 20, paddingBottom: 40, gap: 4 },
  subtitle: { fontSize: 13, color: "#666", marginBottom: 12 },
  section: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1a472a",
    marginBottom: 8,
    marginTop: 8,
  },
  hint: { fontSize: 13, color: "#999" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
  chip: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipActive: { borderColor: "#1a472a", backgroundColor: "#e8f5e9" },
  chipText: { color: "#555", fontWeight: "600", fontSize: 13 },
  chipTextActive: { color: "#1a472a" },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
    marginTop: 8,
  },
  toggleLabel: { color: "#444", fontSize: 14, flex: 1, marginRight: 16 },
  playerRow: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  playerRowActive: { borderColor: "#1a472a", backgroundColor: "#e8f5e9" },
  playerRowText: { color: "#222", fontSize: 14, fontWeight: "600" },
  previewBtn: {
    borderWidth: 1,
    borderColor: "#1a472a",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 16,
  },
  previewBtnText: { color: "#1a472a", fontWeight: "700", fontSize: 15 },
  roundBlock: { marginBottom: 12 },
  roundLabel: { color: "#1a472a", fontWeight: "700", fontSize: 13, marginBottom: 4 },
  matchupText: { color: "#333", fontSize: 14, marginBottom: 2 },
  publishBtn: {
    backgroundColor: "#1a472a",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  publishBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  btnDisabled: { opacity: 0.5 },
});
