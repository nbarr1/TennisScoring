import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
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
import { AppIcon, ICON_SIZE } from "../components/AppIcon";
import { FormField } from "../components/FormField";
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
} from "../theme";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const INTERVAL_OPTIONS = [3, 7, 14];

/** Parses YYYY-MM-DD as 6:00 PM local time, or returns null with a reason. */
function parseStartDate(value: string): { startAt: number } | { error: string } {
  if (!value.trim()) return { error: "Enter the date round 1 starts." };
  if (!DATE_RE.test(value)) {
    return { error: "Use the format YYYY-MM-DD, for example 2026-11-02." };
  }
  const startAt = Date.parse(`${value}T18:00:00`);
  if (!startAt || Number.isNaN(startAt)) {
    return { error: "That isn't a real date. Check the month and day." };
  }
  return { startAt };
}

type PublishResult = { matchesCreated: number; roundsCreated: number };

export default function RoundRobinSchedulerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ divisionId: string; seasonId?: string }>();
  const divisionId = params.divisionId;
  const { user } = useAppStore();
  const currentSeason = currentSeasonForDate();
  const seasonOptions = useMemo(() => defaultSeasonOptions(), []);
  const initialSeasonId =
    params.seasonId && seasonOptions.some((s) => s.id === params.seasonId)
      ? params.seasonId
      : currentSeason.id;

  const [seasonId, setSeasonId] = useState(initialSeasonId);
  const { levels: divisionLevels, loading: levelsLoading } =
    useDivisionLevels(divisionId);
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

  // Schedulers want active players only (the hook's default), not the waitlist.
  const { memberships, loading: membershipsLoading } = useDivisionMemberships(
    divisionId,
    seasonId,
    divisionLevelId || null,
  );
  const { rankings } = useRankings(divisionId ?? null, { seasonId, divisionLevelId });

  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  useEffect(() => {
    setSelectedPlayerIds(memberships.map((m) => m.userId));
  }, [memberships]);

  const [doubleRoundRobin, setDoubleRoundRobin] = useState(false);
  const [intervalDays, setIntervalDays] = useState(7);
  const [startDate, setStartDate] = useState("");
  const [startDateError, setStartDateError] = useState<string | undefined>();
  const [seedByRankings, setSeedByRankings] = useState(true);
  const [clearExisting, setClearExisting] = useState(false);

  const [preview, setPreview] = useState<RoundRobinMatchup[] | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [published, setPublished] = useState<PublishResult | null>(null);

  const selectedLevel = divisionLevels.find((l) => l.id === divisionLevelId);
  const selectedSeason =
    seasonOptions.find((s) => s.id === seasonId) ?? currentSeason;
  // The generator pairs individuals, so it cannot fill a doubles level yet.
  // publishRoundRobinSchedule rejects doubles server-side; this stops the flow
  // before a leader builds a preview they cannot publish.
  const selectedLevelIsDoubles = selectedLevel?.matchType === "doubles";

  function invalidatePreview() {
    setPreview(null);
    setPreviewError(null);
    setPublished(null);
  }

  function togglePlayer(userId: string) {
    invalidatePreview();
    setSelectedPlayerIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  }

  function nameFor(userId: string): string {
    return memberships.find((m) => m.userId === userId)?.displayNameSnapshot ?? userId;
  }

  function handleGeneratePreview() {
    if (selectedLevelIsDoubles) return;
    if (selectedPlayerIds.length < 2) {
      setPreviewError("Select at least 2 players to build a schedule.");
      return;
    }
    setPreviewError(null);
    setPublished(null);
    setPreview(
      previewRoundRobinSchedule({
        playerIds: selectedPlayerIds,
        doubleRoundRobin,
        seedByRankings,
        rankings,
      }),
    );
  }

  const publish = useAsyncAction(
    async (startAt: number): Promise<PublishResult> => {
      if (!divisionId) throw new Error("No division selected.");
      return publishRoundRobinSchedule({
        divisionId,
        seasonId,
        divisionLevelId,
        matchType: selectedLevel?.matchType,
        playerIds: selectedPlayerIds,
        doubleRoundRobin,
        startAt,
        intervalDays,
        clearExisting,
      });
    },
    {
      successMessage: (result) =>
        `Schedule published. ${result.matchesCreated} matches created.`,
      onSuccess: (result) => {
        setPreview(null);
        setPublished(result);
      },
    },
  );

  async function handlePublish() {
    if (!user || !divisionId || !seasonId || !divisionLevelId || !preview) return;
    if (selectedLevelIsDoubles) return;
    const parsed = parseStartDate(startDate);
    if ("error" in parsed) {
      setStartDateError(parsed.error);
      return;
    }
    setStartDateError(undefined);

    const count = preview.length;
    const matchWord = `match${count === 1 ? "" : "es"}`;
    const levelName = selectedLevel?.name ?? "this division level";
    const base =
      `Creates ${count} scheduled ${matchWord} in ${levelName}, ${selectedSeason.name}, ` +
      `starting ${startDate} with a new round every ${intervalDays} days. ` +
      "Players are notified and can postpone or cancel individual matches.";
    const ok = clearExisting
      ? await confirmDestructive({
          title: "Replace the existing schedule?",
          message:
            `${base}\n\nThis also deletes the scheduled matches a previously published ` +
            "schedule created for this level. Matches players scheduled themselves, and " +
            "matches already played, are kept.",
          confirmLabel: "Replace and publish",
        })
      : await confirmAction({
          title: `Publish ${count} ${matchWord}?`,
          message:
            `${base}\n\nAny schedule published earlier for this level stays in place. ` +
            "Turn on “Replace the previously published schedule” to remove it first.",
          confirmLabel: "Publish schedule",
        });
    if (ok) await publish.run(parsed.startAt);
  }

  if (!divisionId) {
    return (
      <ErrorState
        title="No division selected"
        message="Open the scheduler from the Admin tab."
        onRetry={() => router.back()}
        retryLabel="Back to Admin"
      />
    );
  }

  const rounds = preview ? Array.from(new Set(preview.map((m) => m.round))) : [];

  return (
    <KeyboardAwareScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.intro}>
        Build every match for one division level and season, check the preview, then
        publish. Nothing is created until you publish.
      </Text>

      <Card style={styles.section}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          Season
        </Text>
        <View style={styles.chipRow}>
          {seasonOptions.map((season) => (
            <Chip
              key={season.id}
              label={season.name}
              accessibilityLabel={`Season ${season.name}`}
              selected={seasonId === season.id}
              onPress={() => {
                setSeasonId(season.id);
                invalidatePreview();
              }}
            />
          ))}
        </View>

        <Text style={styles.sectionTitle} accessibilityRole="header">
          Division level
        </Text>
        {levelsLoading ? (
          <LoadingState inline showLabel label="Loading division levels" />
        ) : levelsForSeason.length === 0 ? (
          <EmptyState
            style={styles.inlineEmpty}
            icon="calendar"
            title={`No division levels for ${selectedSeason.name}`}
            message="Add a division level for this season on the Admin tab, then come back to build its schedule."
            actionLabel="Back to Admin"
            onAction={() => router.back()}
          />
        ) : (
          <View style={styles.chipRow}>
            {levelsForSeason.map((level) => (
              <Chip
                key={level.id}
                label={level.name}
                accessibilityLabel={`Division level ${level.name}`}
                selected={divisionLevelId === level.id}
                onPress={() => {
                  setDivisionLevelId(level.id);
                  invalidatePreview();
                }}
              />
            ))}
          </View>
        )}
        {selectedLevelIsDoubles ? (
          <InlineAlert
            tone="warning"
            title="Doubles levels can't be scheduled here"
            message="Round-robin scheduling pairs individual players, so it isn't available for doubles levels. Players in this level create their doubles matches from the Matches tab."
          />
        ) : null}
      </Card>

      {!selectedLevelIsDoubles && divisionLevelId ? (
        <>
          <Card style={styles.section}>
            <View style={styles.headerRow}>
              <Text style={styles.sectionTitle} accessibilityRole="header">
                Players
              </Text>
              <Text style={styles.count}>
                {selectedPlayerIds.length} of {memberships.length} selected
              </Text>
            </View>
            {membershipsLoading ? (
              <LoadingState inline showLabel label="Loading players" />
            ) : memberships.length === 0 ? (
              <Text style={styles.hint}>
                No active players are assigned to {selectedLevel?.name ?? "this level"} for{" "}
                {selectedSeason.name}. Assign players to it on the Admin page first.
              </Text>
            ) : (
              <>
                <View style={styles.bulkRow}>
                  <Button
                    label="Select all"
                    variant="quiet"
                    size="compact"
                    disabled={selectedPlayerIds.length === memberships.length}
                    onPress={() => {
                      invalidatePreview();
                      setSelectedPlayerIds(memberships.map((m) => m.userId));
                    }}
                  />
                  <Button
                    label="Clear"
                    variant="quiet"
                    size="compact"
                    accessibilityLabel="Clear player selection"
                    disabled={selectedPlayerIds.length === 0}
                    onPress={() => {
                      invalidatePreview();
                      setSelectedPlayerIds([]);
                    }}
                  />
                </View>
                {memberships.map((m) => {
                  const selected = selectedPlayerIds.includes(m.userId);
                  return (
                    <Pressable
                      key={m.userId}
                      accessibilityRole="checkbox"
                      accessibilityLabel={m.displayNameSnapshot}
                      accessibilityState={{ checked: selected }}
                      android_ripple={{ color: colors.primarySoft }}
                      style={[styles.playerRow, selected && styles.playerRowActive]}
                      onPress={() => togglePlayer(m.userId)}
                    >
                      <View style={[styles.checkbox, selected && styles.checkboxOn]}>
                        {selected ? (
                          <AppIcon name="checkmark" size={ICON_SIZE.small} color={colors.onPrimary} />
                        ) : null}
                      </View>
                      <Text style={styles.playerRowText}>{m.displayNameSnapshot}</Text>
                    </Pressable>
                  );
                })}
              </>
            )}
          </Card>

          <Card style={styles.section}>
            <Text style={styles.sectionTitle} accessibilityRole="header">
              Format
            </Text>
            <View style={styles.chipRow}>
              {[
                { label: "Single round robin", value: false },
                { label: "Double round robin", value: true },
              ].map((opt) => (
                <Chip
                  key={String(opt.value)}
                  label={opt.label}
                  selected={doubleRoundRobin === opt.value}
                  onPress={() => {
                    setDoubleRoundRobin(opt.value);
                    invalidatePreview();
                  }}
                />
              ))}
            </View>
            <Text style={styles.hint}>
              {doubleRoundRobin
                ? "Everyone plays everyone twice, with sides swapped the second time."
                : "Everyone plays everyone once."}
            </Text>

            <Text style={styles.sectionTitle} accessibilityRole="header">
              Time between rounds
            </Text>
            <View style={styles.chipRow}>
              {INTERVAL_OPTIONS.map((days) => (
                <Chip
                  key={days}
                  label={`Every ${days} days`}
                  selected={intervalDays === days}
                  onPress={() => setIntervalDays(days)}
                />
              ))}
            </View>

            <FormField
              label="Round 1 start date"
              required
              containerStyle={styles.field}
              value={startDate}
              onChangeText={(text) => {
                setStartDate(text);
                if (startDateError) setStartDateError(undefined);
              }}
              placeholder="YYYY-MM-DD"
              helperText="Matches are set for 6:00 PM on each round's date."
              error={startDateError}
              keyboardType="numbers-and-punctuation"
              autoCorrect={false}
              maxLength={10}
            />

            <View style={styles.toggleRow}>
              <View style={styles.toggleText}>
                <Text style={styles.toggleLabel}>Seed pairings by current ranking</Text>
                <Text style={styles.toggleHint}>
                  Orders players by this level's standings before pairing.
                </Text>
              </View>
              <Switch
                accessibilityLabel="Seed pairings by current ranking"
                value={seedByRankings}
                onValueChange={(v) => {
                  setSeedByRankings(v);
                  invalidatePreview();
                }}
                trackColor={{ true: colors.primary, false: colors.disabled }}
              />
            </View>
            <View style={styles.toggleRow}>
              <View style={styles.toggleText}>
                <Text style={styles.toggleLabel}>
                  Replace the previously published schedule
                </Text>
                <Text style={styles.toggleHint}>
                  Deletes scheduled matches an earlier schedule created for this level.
                  Matches players set up themselves are never removed.
                </Text>
              </View>
              <Switch
                accessibilityLabel="Replace the previously published schedule"
                value={clearExisting}
                onValueChange={setClearExisting}
                trackColor={{ true: colors.destructive, false: colors.disabled }}
              />
            </View>
          </Card>

          {previewError ? (
            <InlineAlert tone="error" message={previewError} />
          ) : null}
          <Button
            label={preview ? "Rebuild preview" : "Preview schedule"}
            variant={preview ? "secondary" : "primary"}
            icon="calendar"
            disabled={selectedPlayerIds.length < 2 || publish.pending}
            onPress={handleGeneratePreview}
            style={styles.previewBtn}
          />
          {selectedPlayerIds.length < 2 && memberships.length > 0 ? (
            <Text style={styles.hint}>Select at least 2 players to preview a schedule.</Text>
          ) : null}
        </>
      ) : null}

      {published ? (
        <InlineAlert
          tone="success"
          title="Schedule published"
          message={`Created ${published.matchesCreated} match${published.matchesCreated === 1 ? "" : "es"} across ${published.roundsCreated} round${published.roundsCreated === 1 ? "" : "s"}. Players can see them on their Matches tab.`}
          actionLabel="Back to Admin"
          onAction={() => router.back()}
        />
      ) : null}

      {preview && !selectedLevelIsDoubles ? (
        <Card style={styles.section}>
          <View style={styles.headerRow}>
            <Text style={styles.sectionTitle} accessibilityRole="header">
              Preview
            </Text>
            <Text style={styles.count}>
              {preview.length} match{preview.length === 1 ? "" : "es"} · {rounds.length} round
              {rounds.length === 1 ? "" : "s"}
            </Text>
          </View>
          <InlineAlert
            tone="info"
            title="Not published yet"
            message="Players can't see these matches. Publish when the pairings look right."
          />
          {rounds.map((round) => (
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

          {publish.error ? (
            <InlineAlert
              tone="error"
              title="Couldn't publish the schedule"
              message={publish.error}
              actionLabel="Try again"
              onAction={() => void handlePublish()}
            />
          ) : null}
          <Button
            label={clearExisting ? "Replace and publish" : "Publish schedule"}
            variant={clearExisting ? "danger" : "primary"}
            pending={publish.pending}
            pendingLabel="Publishing schedule"
            onPress={() => void handlePublish()}
            style={styles.publishBtn}
          />
        </Card>
      ) : null}
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.lg },
  intro: { ...typography.bodySmall, color: colors.textMuted },
  section: { gap: spacing.sm },
  inlineEmpty: { paddingVertical: spacing.lg },
  headerRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  sectionTitle: {
    ...typography.subheading,
    color: colors.primary,
    marginTop: spacing.sm,
  },
  count: { ...typography.caption, color: colors.textMuted },
  hint: { ...typography.bodySmall, color: colors.textMuted },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  bulkRow: { flexDirection: "row", gap: spacing.sm },
  field: { marginTop: spacing.md },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: MIN_TOUCH_TARGET,
    paddingTop: spacing.md,
    marginTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: spacing.lg,
  },
  toggleText: { flex: 1, gap: spacing.xxs },
  toggleLabel: { ...typography.label, color: colors.text },
  toggleHint: { ...typography.caption, color: colors.textMuted },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: MIN_TOUCH_TARGET,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    overflow: "hidden",
  },
  playerRowActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
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
  playerRowText: { ...typography.label, color: colors.text, flex: 1 },
  previewBtn: { alignSelf: "stretch" },
  roundBlock: { marginTop: spacing.sm },
  roundLabel: { ...typography.label, color: colors.primary, marginBottom: spacing.xs },
  matchupText: { ...typography.bodySmall, color: colors.text },
  publishBtn: { marginTop: spacing.sm, alignSelf: "stretch" },
});
