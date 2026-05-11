"use client";

export const dynamic = "force-dynamic";

import { AppNav, appNavStyles } from "../shared/AppNav";
import { useState, useEffect } from "react";
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
  useAuthUser,
} from "@tennis/firebase-client";
import type { Division, User } from "@tennis/shared";
import type { Match, PlayerRanking } from "@tennis/shared";
import { query, where } from "firebase/firestore";

export default function AdminPage(): React.JSX.Element {
  const { firebaseUser } = useAuthUser();
  const [division, setDivision] = useState<Division | null>(null);
  const [players, setPlayers] = useState<User[]>([]);
  const [memberName, setMemberName] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [needsMergeForUserId, setNeedsMergeForUserId] = useState<string | null>(
    null,
  );
  const [mergeSourceUserId, setMergeSourceUserId] = useState("");
  const [merging, setMerging] = useState(false);
  const [candidateMatches, setCandidateMatches] = useState<Match[]>([]);
  const [candidateMatchRefreshKey, setCandidateMatchRefreshKey] = useState(0);
  const [selectedMatchIds, setSelectedMatchIds] = useState<string[]>([]);
  const [editEmail, setEditEmail] = useState("");
  const [newDivisionName, setNewDivisionName] = useState("");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [inviteMessage, setInviteMessage] = useState("");
  const [repairingRankings, setRepairingRankings] = useState(false);
  const [repairMessage, setRepairMessage] = useState("");
  const [expandedPlayerId, setExpandedPlayerId] = useState<string | null>(null);
  const [lastLinkAction, setLastLinkAction] = useState<{
    sourceUserId?: string;
    targetUserId: string;
    matchIds: string[];
  } | null>(null);
  const [linkActionMessage, setLinkActionMessage] = useState<{
    targetUserId: string;
    message: string;
  } | null>(null);

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
    if (!firebaseUser || !division?.id || !memberName.trim()) return;
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
      );
      setNeedsMergeForUserId(memberResult.userId);
      setMergeSourceUserId("");
      setSelectedMatchIds([]);
      setCandidateMatches([]);
      setEditEmail(trimmedEmail ?? "");
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
      );
      setInviteMessage("Player email updated.");
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

  return (
    <div style={styles.page}>
      <AppNav active="admin" />

      <main style={styles.main}>
        <h1 style={styles.pageTitle}>Division Admin</h1>

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
                  disabled={adding || !memberName.trim() || !division?.id}
                >
                  {adding ? "Saving…" : "Add Member"}
                </button>
              </div>
              {inviteMessage && <p style={styles.success}>{inviteMessage}</p>}
              {error && <p style={styles.error}>{error}</p>}
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
              {repairMessage && <p style={styles.success}>{repairMessage}</p>}
            </div>

            <div style={styles.card}>
              <h2 style={styles.sectionTitle}>Players</h2>
              {players.length === 0 ? (
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
                        <th style={styles.th}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {players.flatMap((p) => {
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
                                  setLinkActionMessage(null);
                                  setExpandedPlayerId((current) =>
                                    current === p.id ? null : p.id,
                                  );
                                }}
                              >
                                Edit / Link
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
                                      Update Email
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
                                      <p style={styles.inlineSuccess}>
                                        {linkActionMessage.message}
                                      </p>
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
                      })}
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
  pageTitle: {
    fontSize: 28,
    fontWeight: 800,
    color: "var(--green-dark)",
    marginBottom: 24,
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
  row: { display: "flex", gap: 10, flexWrap: "wrap" },
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
  success: { marginTop: 10, color: "#1a7f37", fontSize: 13 },
  inlineSuccess: {
    flexBasis: "100%",
    margin: "0 0 4px",
    color: "#1a7f37",
    fontSize: 13,
    fontWeight: 600,
  },
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
