"use client";

export const dynamic = "force-dynamic";

import { AppNav, appNavStyles } from "../shared/AppNav";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  useRankings,
  useAuthUser,
  useUserProfile,
  useActiveDivisionId,
  useDivisionLevels,
} from "@tennis/firebase-client";
import { currentSeasonForDate, defaultSeasonOptions } from "@tennis/shared";
import type { PlayerRanking } from "@tennis/shared";

export default function DashboardPage(): React.JSX.Element {
  const router = useRouter();
  const { firebaseUser } = useAuthUser();
  const { profile, loading: profileLoading } = useUserProfile(
    firebaseUser?.uid ?? null,
  );
  const { divisionId, loading: divisionLoading } = useActiveDivisionId(
    firebaseUser?.uid ?? null,
    profile?.divisionId,
  );
  const currentSeason = useMemo(() => currentSeasonForDate(), []);
  const seasonOptions = useMemo(() => defaultSeasonOptions(), []);
  const [selectedSeasonId, setSelectedSeasonId] = useState(currentSeason.id);
  const [selectedLevelId, setSelectedLevelId] = useState("all");
  const { levels: divisionLevels } = useDivisionLevels(divisionId);
  const seasonLevels = divisionLevels.filter(
    (level) => level.seasonId === selectedSeasonId,
  );
  const activeLevelId =
    selectedLevelId !== "all" &&
    seasonLevels.some((level) => level.id === selectedLevelId)
      ? selectedLevelId
      : undefined;
  const { rankings, loading } = useRankings(divisionId, {
    seasonId: selectedSeasonId,
    divisionLevelId: activeLevelId,
  });

  useEffect(() => {
    if (profileLoading || !profile) return;
    if (profile.divisionId && !profile.tutorialDone) {
      router.replace("/onboarding/tutorial");
    }
  }, [profileLoading, profile, router]);

  return (
    <div style={styles.page}>
      <AppNav active="dashboard" />

      <main style={styles.main}>
        <h1 style={styles.pageTitle}>Division Standings</h1>
        <p style={styles.subtitle}>
          Sorted by: Matches Won · Sets · Games · Differential · Head-to-Head
        </p>

        <div style={styles.filterBar} aria-label="Standings filters">
          <label style={styles.filterLabel}>
            Season
            <select
              style={styles.select}
              value={selectedSeasonId}
              onChange={(e) => {
                setSelectedSeasonId(e.target.value);
                setSelectedLevelId("all");
              }}
            >
              {seasonOptions.map((season) => (
                <option key={season.id} value={season.id}>
                  {season.name}
                </option>
              ))}
            </select>
          </label>
          <label style={styles.filterLabel}>
            Division
            <select
              style={styles.select}
              value={activeLevelId ?? "all"}
              onChange={(e) => setSelectedLevelId(e.target.value)}
            >
              <option value="all">All divisions</option>
              {seasonLevels.map((level) => (
                <option key={level.id} value={level.id}>
                  {level.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {!profileLoading && !divisionLoading && !divisionId ? (
          <div style={styles.empty}>
            Join or create a division to see standings.
          </div>
        ) : loading || divisionLoading ? (
          <div style={styles.loading}>Loading rankings…</div>
        ) : rankings.length === 0 ? (
          <div style={styles.empty}>
            No matches completed yet. Rankings appear after the first match.
          </div>
        ) : (
          <div style={styles.table}>
            <div style={styles.tableHeader}>
              <span style={styles.thRank}>#</span>
              <span style={styles.thName}>Player</span>
              <span style={styles.thStat}>W</span>
              <span style={styles.thStat}>L</span>
              <span style={styles.thStat}>Sets (W/Total)</span>
              <span style={styles.thStat}>Games (W/Total)</span>
              <span style={styles.thStat}>+/-</span>
            </div>
            {rankings.map((r, i) => (
              <RankingRow key={r.userId} ranking={r} index={i} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function RankingRow({
  ranking,
  index,
}: {
  ranking: PlayerRanking;
  index: number;
}) {
  const medal =
    index === 0
      ? "🥇"
      : index === 1
        ? "🥈"
        : index === 2
          ? "🥉"
          : `${index + 1}`;
  return (
    <div
      style={{
        ...styles.tableRow,
        ...(index === 0 ? styles.tableRowFirst : {}),
      }}
    >
      <span style={styles.tdRank}>{medal}</span>
      <span style={styles.tdName}>{ranking.displayName}</span>
      <span style={styles.tdStat}>{ranking.matchesWon}</span>
      <span style={styles.tdStat}>{ranking.matchesLost}</span>
      <span style={styles.tdStat}>
        {ranking.setsWon}/{ranking.setsWon + ranking.setsLost}
      </span>
      <span style={styles.tdStat}>
        {ranking.gamesWon}/{ranking.gamesWon + ranking.gamesLost}
      </span>
      <span
        style={{
          ...styles.tdStat,
          color: ranking.gameDifferential >= 0 ? "#2d6a4f" : "#c0392b",
        }}
      >
        {ranking.gameDifferential > 0 ? "+" : ""}
        {ranking.gameDifferential}
      </span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: appNavStyles.page,
  main: { maxWidth: "100%", margin: "0 auto", padding: "40px 40px" },
  pageTitle: {
    fontSize: 28,
    fontWeight: 800,
    color: "var(--green-dark)",
    marginBottom: 8,
  },
  subtitle: { fontSize: 13, color: "var(--muted)", marginBottom: 18 },
  filterBar: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
    alignItems: "end",
    marginBottom: 24,
  },
  filterLabel: {
    display: "grid",
    gap: 6,
    fontSize: 12,
    fontWeight: 700,
    color: "#555",
    textTransform: "uppercase" as const,
    letterSpacing: 0.4,
  },
  select: {
    minWidth: 180,
    border: "1px solid #ddd",
    borderRadius: 10,
    padding: "10px 12px",
    background: "#fff",
    color: "var(--text)",
    fontSize: 14,
    textTransform: "none" as const,
    letterSpacing: 0,
  },
  loading: { textAlign: "center", color: "var(--muted)", padding: 40 },
  empty: {
    textAlign: "center",
    color: "var(--muted)",
    padding: 40,
    background: "#fff",
    borderRadius: 12,
  },
  table: {
    background: "#fff",
    borderRadius: 14,
    overflowX: "auto",
    boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
  },
  tableHeader: {
    display: "grid",
    gridTemplateColumns: "60px 1fr 60px 60px 80px 100px 60px",
    minWidth: 640,
    padding: "12px 20px",
    background: "var(--green-dark)",
    color: "#fff",
    fontWeight: 700,
    fontSize: 13,
  },
  thRank: {},
  thName: {},
  thStat: { textAlign: "center" as const },
  tableRow: {
    display: "grid",
    gridTemplateColumns: "60px 1fr 60px 60px 80px 100px 60px",
    minWidth: 640,
    padding: "14px 20px",
    borderBottom: "1px solid #f0f0f0",
    alignItems: "center",
  },
  tableRowFirst: { background: "#fffef0", fontWeight: 600 },
  tdRank: { fontSize: 18 },
  tdName: { fontWeight: 600, color: "var(--text)" },
  tdStat: { textAlign: "center" as const, fontSize: 14, color: "var(--muted)" },
};
