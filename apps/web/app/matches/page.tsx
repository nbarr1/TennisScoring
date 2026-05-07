"use client";

export const dynamic = "force-dynamic";

import { AppNav, appNavStyles } from "../shared/AppNav";
import Link from "next/link";
import { useEffect, useState } from "react";
import { onSnapshot } from "firebase/firestore";
import {
  divisionMatchesQuery,
  recordHistoricMatch,
  searchDivisionPlayers,
  proposeMatch,
  acceptMatchProposal,
  declineMatchProposal,
  useActiveDivisionId,
  useAuthUser,
  useUserProfile,
} from "@tennis/firebase-client";
import {
  formatScoreDisplay,
  formatGameScore,
  DAY_LABELS,
} from "@tennis/shared";
import type { Match, User, Availability } from "@tennis/shared";

const STATUS_COLOR: Record<string, string> = {
  in_progress: "#27ae60",
  pending_report: "#e67e22",
  completed: "#555",
  disputed: "#c0392b",
  scheduled: "#1a472a",
  proposed: "#8e44ad",
  cancelled: "#999",
};

const STATUS_LABEL: Record<string, string> = {
  in_progress: "● LIVE",
  pending_report: "Pending Report",
  completed: "Final",
  disputed: "⚠ Disputed",
  scheduled: "Scheduled",
  proposed: "Proposed",
  cancelled: "Cancelled",
};

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

function MatchCard({ m, actions }: { m: Match; actions?: React.ReactNode }) {
  const isLive = m.status === "in_progress";
  const isHistoric = m.source === "manual";
  const isUpcoming = m.status === "scheduled" || m.status === "proposed";
  const p1 = m.player1Name ?? "Player 1";
  const p2 = m.player2Name ?? "Player 2";
  return (
    <Link
      key={m.id}
      href={`/matches/${m.id}`}
      style={{ ...styles.card, ...(isLive ? styles.cardLive : {}) }}
    >
      <div style={styles.cardTop}>
        <span style={{ ...styles.statusDot, color: STATUS_COLOR[m.status] }}>
          {STATUS_LABEL[m.status] ?? m.status}
        </span>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {isHistoric && <span style={styles.historicBadge}>📋 Historic</span>}
          {m.status === "completed" && m.winner && (
            <span style={styles.winnerBadge}>
              {m.winner === "player1" ? p1 : p2} wins
            </span>
          )}
        </div>
      </div>

      {isUpcoming && (
        <div style={styles.scheduledLine}>
          🗓 {formatScheduledAt(m.scheduledAt)}
        </div>
      )}

      {!isUpcoming && (
        <div style={styles.scoreBlock}>
          <span style={styles.setScore}>{formatScoreDisplay(m.liveScore)}</span>
          {isLive && (
            <span style={styles.gameScore}>{formatGameScore(m.liveScore)}</span>
          )}
        </div>
      )}

      <div style={styles.players}>
        <span
          style={m.winner === "player1" ? styles.winnerName : styles.playerName}
        >
          {p1}
        </span>
        <span style={styles.vs}>vs</span>
        <span
          style={m.winner === "player2" ? styles.winnerName : styles.playerName}
        >
          {p2}
          {m.player2IsGuest ? " (Guest)" : ""}
        </span>
      </div>

      {isLive && (
        <div style={styles.serverLine}>
          {m.liveScore.server === "player1" ? p1 : p2} serves ·{" "}
          {m.liveScore.serviceSide} side
        </div>
      )}

      {actions && <div style={styles.actionsRow}>{actions}</div>}
    </Link>
  );
}

function stop(handler: () => void) {
  return (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    handler();
  };
}

export default function MatchesPage(): React.JSX.Element {
  const { firebaseUser } = useAuthUser();
  const { profile } = useUserProfile(firebaseUser?.uid ?? null);
  const { divisionId, loading: divisionLoading } = useActiveDivisionId(
    firebaseUser?.uid ?? null,
    profile?.divisionId,
  );
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRecord, setShowRecord] = useState(false);
  const [showPropose, setShowPropose] = useState(false);

  useEffect(() => {
    if (!divisionId) {
      setMatches([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = divisionMatchesQuery(divisionId);
    return onSnapshot(
      q,
      (snap) => {
        setMatches(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<Match, "id">),
          })),
        );
        setLoading(false);
      },
      () => {
        setMatches([]);
        setLoading(false);
      },
    );
  }, [divisionId]);

  const uid = firebaseUser?.uid;
  const liveMatches = matches.filter((m) => m.status === "in_progress");
  const pendingInvites = matches
    .filter((m) => m.status === "proposed" && m.player2Id === uid)
    .sort((a, b) => (a.scheduledAt ?? 0) - (b.scheduledAt ?? 0));
  const awaitingOpponent = matches
    .filter((m) => m.status === "proposed" && m.player1Id === uid)
    .sort((a, b) => (a.scheduledAt ?? 0) - (b.scheduledAt ?? 0));
  const upcomingMatches = matches
    .filter((m) => m.status === "scheduled")
    .sort((a, b) => (a.scheduledAt ?? 0) - (b.scheduledAt ?? 0));
  const otherStatuses = new Set(["in_progress", "proposed", "scheduled"]);
  const otherMatches = matches.filter((m) => !otherStatuses.has(m.status));

  return (
    <div style={styles.page}>
      <AppNav active="matches" />

      <main style={styles.main}>
        <div style={styles.titleRow}>
          <h1 style={styles.pageTitle}>Matches</h1>
          {divisionId && firebaseUser && (
            <div style={styles.titleActions}>
              <button
                style={styles.proposeBtn}
                onClick={() => setShowPropose(true)}
              >
                📅 Propose Match
              </button>
              <button
                style={styles.recordBtn}
                onClick={() => setShowRecord(true)}
              >
                📋 Record Past Match
              </button>
            </div>
          )}
        </div>

        {!divisionLoading && !divisionId ? (
          <div style={styles.emptyCard}>
            Join or create a division to see and record matches.
          </div>
        ) : loading || divisionLoading ? (
          <div style={styles.placeholder}>Loading matches…</div>
        ) : matches.length === 0 ? (
          <div style={styles.emptyCard}>
            No matches yet. Create one from the mobile app, or record a past
            match above.
          </div>
        ) : (
          <>
            {liveMatches.length > 0 && (
              <section style={styles.liveSection}>
                <div style={styles.liveSectionHeader}>
                  <span style={styles.livePulse} />
                  <h2 style={styles.liveSectionTitle}>Now Live</h2>
                </div>
                <div style={styles.grid}>
                  {liveMatches.map((m) => (
                    <MatchCard key={m.id} m={m} />
                  ))}
                </div>
              </section>
            )}

            {pendingInvites.length > 0 && (
              <section style={styles.section}>
                <h2 style={styles.sectionTitle}>Pending Invitations</h2>
                <div style={styles.grid}>
                  {pendingInvites.map((m) => (
                    <MatchCard
                      key={m.id}
                      m={m}
                      actions={
                        <>
                          <button
                            style={styles.acceptBtn}
                            onClick={stop(() => acceptMatchProposal(m.id))}
                          >
                            ✓ Accept
                          </button>
                          <button
                            style={styles.declineBtn}
                            onClick={stop(() => declineMatchProposal(m.id))}
                          >
                            ✕ Decline
                          </button>
                        </>
                      }
                    />
                  ))}
                </div>
              </section>
            )}

            {awaitingOpponent.length > 0 && (
              <section style={styles.section}>
                <h2 style={styles.sectionTitle}>Awaiting Opponent</h2>
                <div style={styles.grid}>
                  {awaitingOpponent.map((m) => (
                    <MatchCard
                      key={m.id}
                      m={m}
                      actions={
                        <button
                          style={styles.declineBtn}
                          onClick={stop(() => declineMatchProposal(m.id))}
                        >
                          Cancel proposal
                        </button>
                      }
                    />
                  ))}
                </div>
              </section>
            )}

            {upcomingMatches.length > 0 && (
              <section style={styles.section}>
                <h2 style={styles.sectionTitle}>Upcoming</h2>
                <div style={styles.grid}>
                  {upcomingMatches.map((m) => (
                    <MatchCard key={m.id} m={m} />
                  ))}
                </div>
              </section>
            )}

            {otherMatches.length > 0 && (
              <section>
                <h2 style={styles.sectionTitle}>All Matches</h2>
                <div style={styles.grid}>
                  {otherMatches.map((m) => (
                    <MatchCard key={m.id} m={m} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {showRecord && firebaseUser && profile && divisionId && (
          <RecordPastMatchModal
            currentUser={profile}
            divisionId={divisionId}
            onClose={() => setShowRecord(false)}
          />
        )}

        {showPropose && firebaseUser && profile && divisionId && (
          <ProposeMatchModal
            currentUser={profile}
            divisionId={divisionId}
            onClose={() => setShowPropose(false)}
          />
        )}
      </main>
    </div>
  );
}

function RecordPastMatchModal({
  currentUser,
  divisionId,
  onClose,
}: {
  currentUser: User;
  divisionId: string;
  onClose: () => void;
}) {
  const [opponentMode, setOpponentMode] = useState<"search" | "guest">(
    "search",
  );
  const [guestName, setGuestName] = useState("");
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [selectedOpponent, setSelectedOpponent] = useState<User | null>(null);
  const [searching, setSearching] = useState(false);
  const [sets, setSets] = useState([{ p1: "", p2: "" }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [isDivisionMatch, setIsDivisionMatch] = useState(true);
  const [entryMode, setEntryMode] = useState<"single" | "bulk">("single");
  const [bulkText, setBulkText] = useState("");

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

  const isGuestOpponent = opponentMode === "guest";
  const opponentReady = isGuestOpponent
    ? guestName.trim().length > 0
    : !!selectedOpponent;

  function parseSetToken(token: string): { p1: number; p2: number } | null {
    const m = token.trim().match(/^(\d{1,2})\s*[-:]\s*(\d{1,2})$/);
    if (!m) return null;
    return { p1: parseInt(m[1], 10), p2: parseInt(m[2], 10) };
  }

  function parseBulkLine(
    line: string,
  ): { opponentName: string; sets: { p1: number; p2: number }[] } | null {
    const cleaned = line.trim();
    if (!cleaned) return null;
    const parts = cleaned
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length < 3) return null;
    const opponentName = parts[0];
    const sets = parts.slice(1).map(parseSetToken);
    if (!opponentName || sets.some((s) => !s)) return null;
    return { opponentName, sets: sets as { p1: number; p2: number }[] };
  }

  async function handleSubmit() {
    setError("");
    if (entryMode === "bulk") {
      const lines = bulkText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      if (lines.length === 0) {
        setError("Add at least one line for bulk import.");
        return;
      }
      const parsedLines = lines.map(parseBulkLine);
      if (parsedLines.some((line) => !line)) {
        setError("Each line must be: Opponent Name, 6-4, 7-5");
        return;
      }
      setSubmitting(true);
      try {
        for (const item of parsedLines as {
          opponentName: string;
          sets: { p1: number; p2: number }[];
        }[]) {
          const p1Sets = item.sets.filter((s) => s.p1 > s.p2).length;
          const p2Sets = item.sets.filter((s) => s.p2 > s.p1).length;
          if (p1Sets === p2Sets || item.sets.some((s) => s.p1 === s.p2)) {
            throw new Error(`Invalid winner in line for ${item.opponentName}.`);
          }
          await recordHistoricMatch({
            player1Id: currentUser.id,
            player2Id: "guest",
            player1Name: currentUser.displayName,
            player2Name: item.opponentName,
            player2IsGuest: true,
            divisionId,
            createdBy: currentUser.id,
            sets: item.sets,
            isDivisionMatch,
          });
        }
        onClose();
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : "Could not bulk record matches. Please try again.",
        );
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const parsed = sets.map((s) => ({
      p1: parseInt(s.p1, 10),
      p2: parseInt(s.p2, 10),
    }));
    const invalid = parsed.some(
      (s) => isNaN(s.p1) || isNaN(s.p2) || s.p1 < 0 || s.p2 < 0,
    );
    if (invalid || parsed.length === 0) {
      setError("Please enter a valid number of games for each set.");
      return;
    }
    if (parsed.some((s) => s.p1 === s.p2)) {
      setError("Each set must have a clear winner. Check the set scores.");
      return;
    }
    const p1Sets = parsed.filter((s) => s.p1 > s.p2).length;
    const p2Sets = parsed.filter((s) => s.p2 > s.p1).length;
    if (p1Sets === p2Sets) {
      setError("The match must have a clear winner. Check the set scores.");
      return;
    }
    setSubmitting(true);
    try {
      const isGuest = opponentMode === "guest";
      await recordHistoricMatch(
        isGuest
          ? {
              player1Id: currentUser.id,
              player2Id: "guest",
              player1Name: currentUser.displayName,
              player2Name: guestName.trim(),
              player2IsGuest: true,
              divisionId,
              createdBy: currentUser.id,
              sets: parsed,
              isDivisionMatch,
            }
          : {
              player1Id: currentUser.id,
              player2Id: selectedOpponent!.id,
              player1Name: currentUser.displayName,
              player2Name: selectedOpponent!.displayName,
              player2IsGuest: false, // EXPLICIT: Real division player
              divisionId,
              createdBy: currentUser.id,
              sets: parsed,
              isDivisionMatch,
            },
      );
      onClose();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not record match. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={modalStyles.overlay} onClick={onClose}>
      <div style={modalStyles.card} onClick={(e) => e.stopPropagation()}>
        <h2 style={modalStyles.title}>Record Past Match</h2>

        <div style={modalStyles.modeToggle}>
          <button
            style={{
              ...modalStyles.modeBtn,
              ...(entryMode === "single" ? modalStyles.modeBtnActive : {}),
            }}
            onClick={() => setEntryMode("single")}
          >
            Single Match
          </button>
          <button
            style={{
              ...modalStyles.modeBtn,
              ...(entryMode === "bulk" ? modalStyles.modeBtnActive : {}),
            }}
            onClick={() => {
              setEntryMode("bulk");
              setOpponentMode("guest");
              setSelectedOpponent(null);
            }}
          >
            Bulk Add
          </button>
        </div>

        {entryMode === "single" && (
          <>
            <div style={modalStyles.modeToggle}>
              <button
                style={{
                  ...modalStyles.modeBtn,
                  ...(opponentMode === "search"
                    ? modalStyles.modeBtnActive
                    : {}),
                }}
                onClick={() => {
                  setOpponentMode("search");
                  setGuestName("");
                }}
              >
                Search Player
              </button>
              <button
                style={{
                  ...modalStyles.modeBtn,
                  ...(opponentMode === "guest"
                    ? modalStyles.modeBtnActive
                    : {}),
                }}
                onClick={() => {
                  setOpponentMode("guest");
                  setSelectedOpponent(null);
                  setSearchText("");
                  setSearchResults([]);
                }}
              >
                Guest / No Account
              </button>
            </div>

            {opponentMode === "guest" ? (
              <input
                style={modalStyles.input}
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="Guest name…"
              />
            ) : selectedOpponent ? (
              <div style={modalStyles.selectedRow}>
                <div>
                  <div style={modalStyles.selectedName}>
                    {selectedOpponent.displayName}
                  </div>
                  <div style={modalStyles.selectedEmail}>
                    {selectedOpponent.email}
                  </div>
                </div>
                <button
                  style={modalStyles.changeBtn}
                  onClick={() => {
                    setSelectedOpponent(null);
                    setSearchText("");
                  }}
                >
                  Change
                </button>
              </div>
            ) : (
              <>
                <input
                  style={modalStyles.input}
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="Search opponent by name or email…"
                />
                {searching && <div style={modalStyles.muted}>Searching…</div>}
                {searchResults.length > 0 && (
                  <div style={modalStyles.results}>
                    {searchResults.map((u) => (
                      <button
                        key={u.id}
                        style={modalStyles.resultRow}
                        onClick={() => {
                          setSelectedOpponent(u);
                          setSearchResults([]);
                        }}
                      >
                        <div style={modalStyles.resultName}>
                          {u.displayName}
                        </div>
                        <div style={modalStyles.resultEmail}>{u.email}</div>
                      </button>
                    ))}
                  </div>
                )}
                {searchText.trim().length > 0 &&
                  !searching &&
                  searchResults.length === 0 && (
                    <div style={modalStyles.muted}>No players found.</div>
                  )}
              </>
            )}

            {entryMode === "single" && opponentReady && (
              <div style={modalStyles.toggleSection}>
                <label style={modalStyles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={isDivisionMatch}
                    onChange={(e) => setIsDivisionMatch(e.target.checked)}
                    style={modalStyles.checkbox}
                  />
                  <span>Include in division rankings</span>
                </label>
                <div style={modalStyles.checkboxHint}>
                  {isDivisionMatch
                    ? "This match will count toward the division standings."
                    : "This match will be recorded but won't affect rankings."}
                </div>
              </div>
            )}

            {entryMode === "single" && opponentReady && (
              <div style={modalStyles.setsBlock}>
                <div style={modalStyles.label}>
                  Set scores (your games first)
                </div>
                {sets.map((s, i) => (
                  <div key={i} style={modalStyles.setRow}>
                    <span style={modalStyles.setLabel}>Set {i + 1}</span>
                    <input
                      style={modalStyles.setInput}
                      value={s.p1}
                      onChange={(e) => {
                        const next = [...sets];
                        next[i] = {
                          ...next[i],
                          p1: e.target.value.replace(/[^0-9]/g, ""),
                        };
                        setSets(next);
                      }}
                      placeholder="You"
                      inputMode="numeric"
                      maxLength={2}
                    />
                    <span style={modalStyles.setDash}>–</span>
                    <input
                      style={modalStyles.setInput}
                      value={s.p2}
                      onChange={(e) => {
                        const next = [...sets];
                        next[i] = {
                          ...next[i],
                          p2: e.target.value.replace(/[^0-9]/g, ""),
                        };
                        setSets(next);
                      }}
                      placeholder="Opp"
                      inputMode="numeric"
                      maxLength={2}
                    />
                    {sets.length > 1 && (
                      <button
                        style={modalStyles.removeSet}
                        onClick={() => setSets(sets.filter((_, j) => j !== i))}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
                {sets.length < 5 && (
                  <button
                    style={modalStyles.addSet}
                    onClick={() => setSets([...sets, { p1: "", p2: "" }])}
                  >
                    + Add Set
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {entryMode === "bulk" && (
          <>
            <div style={modalStyles.toggleSection}>
              <div style={modalStyles.checkboxHint}>
                Format: <strong>Opponent Name, 6-4, 7-5</strong> (one match per
                line; guest opponents only).
              </div>
            </div>
            <textarea
              style={modalStyles.textarea}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder={"Jane Doe, 6-3, 6-4\nAlex Smith, 4-6, 7-5, 6-2"}
              rows={7}
            />
            <div style={modalStyles.toggleSection}>
              <label style={modalStyles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={isDivisionMatch}
                  onChange={(e) => setIsDivisionMatch(e.target.checked)}
                  style={modalStyles.checkbox}
                />
                <span>Include imported matches in division rankings</span>
              </label>
            </div>
          </>
        )}

        {error && <div style={modalStyles.error}>{error}</div>}

        <div style={modalStyles.actions}>
          <button
            style={modalStyles.cancelBtn}
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            style={{
              ...modalStyles.submitBtn,
              ...((entryMode === "single" && !opponentReady) || submitting
                ? modalStyles.btnDisabled
                : {}),
            }}
            onClick={handleSubmit}
            disabled={(entryMode === "single" && !opponentReady) || submitting}
          >
            {submitting
              ? "Recording…"
              : entryMode === "bulk"
                ? "Import Matches"
                : "Record Match"}
          </button>
        </div>
      </div>
    </div>
  );
}
function AvailabilityHint({ availability }: { availability?: Availability }) {
  if (
    !availability ||
    (availability.slots.length === 0 && !availability.note)
  ) {
    return (
      <div style={modalStyles.muted}>
        Opponent hasn&apos;t set their preferred play times.
      </div>
    );
  }
  return (
    <div style={modalStyles.availability}>
      <div style={modalStyles.availabilityTitle}>Their preferred times</div>
      {availability.slots.map((s, i) => (
        <div key={i} style={modalStyles.availabilityRow}>
          <span style={modalStyles.availabilityDay}>{DAY_LABELS[s.day]}</span>
          <span style={modalStyles.availabilityTime}>
            {s.from}–{s.to}
          </span>
        </div>
      ))}
      {availability.note && (
        <div style={modalStyles.availabilityNote}>{availability.note}</div>
      )}
    </div>
  );
}

function ProposeMatchModal({
  currentUser,
  divisionId,
  onClose,
}: {
  currentUser: User;
  divisionId: string;
  onClose: () => void;
}) {
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [selectedOpponent, setSelectedOpponent] = useState<User | null>(null);
  const [searching, setSearching] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

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
    setError("");
    if (!selectedOpponent) {
      setError("Select an opponent.");
      return;
    }
    const ts = Date.parse(scheduledAt);
    if (!ts || Number.isNaN(ts)) {
      setError("Pick a valid date and time.");
      return;
    }
    if (ts < Date.now()) {
      setError("Pick a time in the future.");
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the proposal.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={modalStyles.overlay} onClick={onClose}>
      <div style={modalStyles.card} onClick={(e) => e.stopPropagation()}>
        <h2 style={modalStyles.title}>Propose a Match</h2>

        {selectedOpponent ? (
          <>
            <div style={modalStyles.selectedRow}>
              <div>
                <div style={modalStyles.selectedName}>
                  {selectedOpponent.displayName}
                </div>
                <div style={modalStyles.selectedEmail}>
                  {selectedOpponent.email}
                </div>
              </div>
              <button
                style={modalStyles.changeBtn}
                onClick={() => {
                  setSelectedOpponent(null);
                  setSearchText("");
                }}
              >
                Change
              </button>
            </div>
            <AvailabilityHint availability={selectedOpponent.availability} />
          </>
        ) : (
          <>
            <input
              style={modalStyles.input}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search opponent by name or email…"
            />
            {searching && <div style={modalStyles.muted}>Searching…</div>}
            {searchResults.length > 0 && (
              <div style={modalStyles.results}>
                {searchResults.map((u) => (
                  <button
                    key={u.id}
                    style={modalStyles.resultRow}
                    onClick={() => {
                      setSelectedOpponent(u);
                      setSearchResults([]);
                    }}
                  >
                    <div style={modalStyles.resultName}>{u.displayName}</div>
                    <div style={modalStyles.resultEmail}>{u.email}</div>
                  </button>
                ))}
              </div>
            )}
            {searchText.trim().length > 0 &&
              !searching &&
              searchResults.length === 0 && (
                <div style={modalStyles.muted}>No players found.</div>
              )}
          </>
        )}

        {selectedOpponent && (
          <div style={{ marginTop: 14 }}>
            <div style={modalStyles.label}>When?</div>
            <input
              style={modalStyles.input}
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
          </div>
        )}

        {error && <div style={modalStyles.error}>{error}</div>}

        <div style={modalStyles.actions}>
          <button
            style={modalStyles.cancelBtn}
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            style={{
              ...modalStyles.submitBtn,
              ...(!selectedOpponent || !scheduledAt || submitting
                ? modalStyles.btnDisabled
                : {}),
            }}
            onClick={handleSubmit}
            disabled={!selectedOpponent || !scheduledAt || submitting}
          >
            {submitting ? "Sending…" : "Send Proposal"}
          </button>
        </div>
      </div>
    </div>
  );
}

const modalStyles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed" as const,
    inset: 0,
    background: "rgba(0,0,0,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
    padding: 16,
  },
  card: {
    background: "#fff",
    borderRadius: 16,
    padding: 28,
    maxWidth: 460,
    width: "100%",
    maxHeight: "90vh",
    overflowY: "auto" as const,
  },
  title: { fontSize: 20, fontWeight: 700, color: "#1a472a", marginBottom: 16 },
  modeToggle: {
    display: "flex",
    borderRadius: 10,
    border: "1px solid #ddd",
    overflow: "hidden",
    marginBottom: 14,
  },
  modeBtn: {
    flex: 1,
    padding: "10px 0",
    background: "#f9f9f9",
    border: "none",
    fontSize: 13,
    fontWeight: 600,
    color: "#888",
    cursor: "pointer",
  },
  modeBtnActive: { background: "#1a472a", color: "#fff" },
  input: {
    width: "100%",
    border: "1px solid #ddd",
    borderRadius: 10,
    padding: "10px 14px",
    fontSize: 14,
    marginBottom: 12,
    boxSizing: "border-box" as const,
    outline: "none",
  },
  textarea: {
    width: "100%",
    border: "1px solid #ddd",
    borderRadius: 10,
    padding: "10px 14px",
    fontSize: 14,
    marginBottom: 12,
    boxSizing: "border-box" as const,
    outline: "none",
    resize: "vertical" as const,
  },
  results: {
    maxHeight: 200,
    overflowY: "auto" as const,
    border: "1px solid #eee",
    borderRadius: 10,
    marginBottom: 12,
  },
  resultRow: {
    display: "block",
    width: "100%",
    textAlign: "left" as const,
    padding: "10px 14px",
    background: "#fff",
    border: "none",
    borderBottom: "1px solid #f5f5f5",
    cursor: "pointer",
  },
  resultName: { fontSize: 14, fontWeight: 600, color: "#222" },
  resultEmail: { fontSize: 12, color: "#888", marginTop: 2 },
  selectedRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    background: "#f0f9f0",
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  selectedName: { fontSize: 15, fontWeight: 700, color: "#1a472a" },
  selectedEmail: { fontSize: 12, color: "#666", marginTop: 2 },
  changeBtn: {
    background: "transparent",
    border: "none",
    color: "#1a472a",
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
  },
  setsBlock: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: 600, color: "#444", marginBottom: 8 },
  setRow: { display: "flex", alignItems: "center", gap: 8, marginBottom: 6 },
  setLabel: { fontSize: 13, color: "#666", width: 48 },
  setInput: {
    width: 56,
    padding: "8px 0",
    border: "1px solid #ddd",
    borderRadius: 8,
    fontSize: 16,
    fontWeight: 700,
    textAlign: "center" as const,
    color: "#1a472a",
  },
  setDash: { color: "#999", fontWeight: 600 },
  removeSet: {
    marginLeft: "auto",
    background: "transparent",
    border: "none",
    color: "#c0392b",
    fontSize: 16,
    cursor: "pointer",
  },
  addSet: {
    background: "transparent",
    border: "none",
    color: "#1a472a",
    fontWeight: 600,
    fontSize: 13,
    padding: "4px 0",
    cursor: "pointer",
  },
  actions: { display: "flex", gap: 10, marginTop: 12 },
  cancelBtn: {
    flex: 1,
    padding: "12px 0",
    background: "#f0f0f0",
    border: "none",
    borderRadius: 10,
    fontWeight: 600,
    color: "#333",
    cursor: "pointer",
  },
  submitBtn: {
    flex: 1,
    padding: "12px 0",
    background: "#1a472a",
    border: "none",
    borderRadius: 10,
    fontWeight: 700,
    color: "#fff",
    cursor: "pointer",
  },
  btnDisabled: { opacity: 0.5, cursor: "not-allowed" as const },
  error: { color: "#c0392b", fontSize: 13, marginBottom: 12 },
  muted: { color: "#999", fontSize: 13, marginBottom: 12 },
  availability: {
    background: "#f7f7f0",
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  availabilityTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: "#1a472a",
    marginBottom: 6,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  availabilityRow: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    fontSize: 13,
    color: "#333",
    padding: "2px 0",
  },
  availabilityDay: { fontWeight: 600, color: "#1a472a", minWidth: 32 },
  availabilityTime: { color: "#444" },
  availabilityNote: {
    fontSize: 12,
    color: "#666",
    fontStyle: "italic" as const,
    marginTop: 6,
    paddingTop: 6,
    borderTop: "1px solid #e7e7d8",
  },
  toggleSection: {
    marginBottom: 14,
    background: "#f0f9f0",
    borderRadius: 10,
    padding: 12,
  } as const,
  checkboxLabel: {
    display: "flex" as const,
    alignItems: "center",
    gap: 10,
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 600,
    color: "#1a472a",
  } as const,
  checkbox: {
    cursor: "pointer" as const,
    width: 18,
    height: 18,
  } as const,
  checkboxHint: {
    fontSize: 12,
    color: "#666",
    marginTop: 8,
    fontStyle: "italic" as const,
  } as const,
};

const styles: Record<string, React.CSSProperties> = {
  page: appNavStyles.page,
  main: { maxWidth: 960, margin: "0 auto", padding: "40px 24px" },
  titleRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 24,
    gap: 16,
    flexWrap: "wrap" as const,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: 800,
    color: "var(--green-dark)",
    margin: 0,
  },
  recordBtn: {
    background: "#fff",
    border: "1.5px solid var(--green-dark)",
    color: "var(--green-dark)",
    borderRadius: 10,
    padding: "10px 18px",
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
  },
  historicBadge: {
    fontSize: 11,
    fontWeight: 600,
    color: "#1a472a",
    background: "#ffdc60",
    padding: "2px 8px",
    borderRadius: 12,
  },
  placeholder: {
    color: "var(--muted)",
    padding: 40,
    textAlign: "center" as const,
  },
  emptyCard: {
    background: "#fff",
    borderRadius: 14,
    padding: 40,
    textAlign: "center" as const,
    color: "var(--muted)",
  },

  liveSection: { marginBottom: 32 },
  liveSectionHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  },
  livePulse: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    background: "#27ae60",
    boxShadow: "0 0 0 3px rgba(39,174,96,0.3)",
    animation: "pulse 1.5s infinite",
  },
  liveSectionTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: "#1a472a",
    margin: 0,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: "#666",
    marginBottom: 14,
  },

  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
    gap: 16,
  },
  card: {
    background: "#fff",
    borderRadius: 14,
    padding: 20,
    boxShadow: "0 2px 10px rgba(0,0,0,0.06)",
    display: "block",
    cursor: "pointer",
  },
  cardLive: {
    borderLeft: "4px solid #27ae60",
    boxShadow: "0 4px 16px rgba(39,174,96,0.15)",
  },
  cardTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  statusDot: { fontWeight: 700, fontSize: 13 },
  winnerBadge: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--green-dark)",
    background: "#e8f5e9",
    padding: "2px 8px",
    borderRadius: 20,
  },
  scoreBlock: { marginBottom: 8 },
  setScore: { fontSize: 22, fontWeight: 700, color: "#222", letterSpacing: 1 },
  gameScore: {
    fontSize: 15,
    fontWeight: 600,
    color: "#27ae60",
    marginLeft: 10,
  },
  players: { display: "flex", alignItems: "center", gap: 10 },
  playerName: { fontSize: 15, fontWeight: 500, color: "#555" },
  winnerName: { fontSize: 15, fontWeight: 700, color: "var(--green-dark)" },
  vs: { fontSize: 12, color: "#bbb" },
  serverLine: { fontSize: 12, color: "#888", marginTop: 8 },
  scheduledLine: {
    fontSize: 13,
    fontWeight: 600,
    color: "#1a472a",
    marginBottom: 8,
  },
  section: { marginBottom: 28 },
  titleActions: { display: "flex", gap: 10, flexWrap: "wrap" as const },
  proposeBtn: {
    background: "var(--green-dark)",
    border: "none",
    color: "#fff",
    borderRadius: 10,
    padding: "10px 18px",
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
  },
  actionsRow: { display: "flex", gap: 8, marginTop: 12 },
  acceptBtn: {
    flex: 1,
    padding: "8px 12px",
    background: "#1a472a",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
  },
  declineBtn: {
    flex: 1,
    padding: "8px 12px",
    background: "#fff",
    color: "#c0392b",
    border: "1px solid #c0392b",
    borderRadius: 8,
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
  },
};
