"use client";

import type { RefObject } from "react";
import Link from "next/link";
import type {
  DivisionLevel,
  DivisionMembership,
  Match,
  MessageReport,
  RoundRobinMatchup,
} from "@tennis/shared";
import { IconCheck, IconDownload, IconRefresh } from "@tabler/icons-react";
import type { FirestoreError } from "firebase/firestore";
import { Button, EmptyState, ErrorState, FieldError, InlineAlert, StatusBadge } from "../shared/ui";
import type { AsyncAction } from "../shared/ui";
import { CheckboxRow, Field, plural } from "./AdminParts";
import { DAY_MS, REPORT_REASON_LABELS, type AdminSeason, type ToolPanel } from "./adminModel";
import { styles } from "./adminStyles";
import css from "./admin.module.css";

type ExportType = "matches" | "rankings";

/**
 * The Tools tab: reported messages, results to resolve, the round-robin
 * scheduler, ranking repair, and CSV exports. AdminPage owns the state, so the
 * scheduler's choices survive a switch to another tab and back.
 */
export type ToolsPanelProps = {
  adminSeason: AdminSeason;
  adminSeasonLevels: DivisionLevel[];
  openToolPanel: ToolPanel;
  toggleToolPanel: (panel: Exclude<ToolPanel, null>) => void;
  reportsHeadingRef: RefObject<HTMLHeadingElement | null>;
  resultsHeadingRef: RefObject<HTMLHeadingElement | null>;
  schedulerHeadingRef: RefObject<HTMLHeadingElement | null>;
  // Reported messages
  messageReports: MessageReport[];
  reportErrors: Record<string, string>;
  resolvingReportId: string | null;
  removeReportTarget: MessageReport | null;
  setRemoveReportTarget: (report: MessageReport | null) => void;
  dismissReport: (report: MessageReport) => Promise<void>;
  // Results to resolve
  reportsAwaitingResolution: Match[];
  // Ranking repair and exports
  repairRankings: AsyncAction<[], string>;
  repairMessage: string;
  setRepairMessage: (message: string) => void;
  exportCsv: AsyncAction<[ExportType], string>;
  exportingType: ExportType | null;
  runExport: (exportType: ExportType) => void;
  csvMessage: string;
  setCsvMessage: (message: string) => void;
  // Round-robin scheduler
  rrDivisionLevelId: string;
  setRrDivisionLevelId: (levelId: string) => void;
  rrSelectedLevelIsDoubles: boolean;
  rrMemberships: DivisionMembership[];
  rrMembershipsError: FirestoreError | null;
  retryRrMemberships: () => void;
  rrSelectedPlayerIds: string[];
  setRrSelectedPlayerIds: (ids: string[]) => void;
  toggleRrPlayer: (userId: string) => void;
  rrDoubleRoundRobin: boolean;
  setRrDoubleRoundRobin: (value: boolean) => void;
  rrIntervalDays: number;
  setRrIntervalDays: (days: number) => void;
  rrStartDate: string;
  setRrStartDate: (date: string) => void;
  rrDateError: string;
  setRrDateError: (message: string) => void;
  rrSeedByRankings: boolean;
  setRrSeedByRankings: (value: boolean) => void;
  rrClearExisting: boolean;
  setRrClearExisting: (value: boolean) => void;
  rrFormError: string;
  setRrFormError: (message: string) => void;
  rrPreview: RoundRobinMatchup[] | null;
  setRrPreview: (preview: RoundRobinMatchup[] | null) => void;
  rrPreviewStartAt: number | null;
  rrNameById: Map<string, string>;
  rrMessage: string;
  setRrMessage: (message: string) => void;
  handleRrGeneratePreview: () => void;
  requestRrPublish: () => void;
};

export function ToolsPanel({
  adminSeason,
  adminSeasonLevels,
  openToolPanel,
  toggleToolPanel,
  reportsHeadingRef,
  resultsHeadingRef,
  schedulerHeadingRef,
  messageReports,
  reportErrors,
  resolvingReportId,
  removeReportTarget,
  setRemoveReportTarget,
  dismissReport,
  reportsAwaitingResolution,
  repairRankings,
  repairMessage,
  setRepairMessage,
  exportCsv,
  exportingType,
  runExport,
  csvMessage,
  setCsvMessage,
  rrDivisionLevelId,
  setRrDivisionLevelId,
  rrSelectedLevelIsDoubles,
  rrMemberships,
  rrMembershipsError,
  retryRrMemberships,
  rrSelectedPlayerIds,
  setRrSelectedPlayerIds,
  toggleRrPlayer,
  rrDoubleRoundRobin,
  setRrDoubleRoundRobin,
  rrIntervalDays,
  setRrIntervalDays,
  rrStartDate,
  setRrStartDate,
  rrDateError,
  setRrDateError,
  rrSeedByRankings,
  setRrSeedByRankings,
  rrClearExisting,
  setRrClearExisting,
  rrFormError,
  setRrFormError,
  rrPreview,
  setRrPreview,
  rrPreviewStartAt,
  rrNameById,
  rrMessage,
  setRrMessage,
  handleRrGeneratePreview,
  requestRrPublish,
}: ToolsPanelProps): React.JSX.Element {
  return (
    <div role="tabpanel" id="admin-panel-tools" aria-labelledby="admin-tab-tools">
      <div style={styles.toolGrid}>
        <section style={styles.toolCard} aria-labelledby="tool-reports-title">
          <h2 id="tool-reports-title" style={styles.toolTitle}>Reported messages</h2>
          <p style={styles.toolDesc}>
            {messageReports.length === 0
              ? "No reports waiting. Messages players flag in your division appear here."
              : `${plural(messageReports.length, "report", "reports")} waiting for review.`}
          </p>
          <Button
            variant={messageReports.length > 0 ? "primary" : "secondary"}
            onClick={() => toggleToolPanel("reports")}
            aria-expanded={openToolPanel === "reports"}
            aria-controls="admin-reports-panel"
          >
            {openToolPanel === "reports" ? "Hide reports" : "Review reports"}
          </Button>
        </section>

        <section style={styles.toolCard} aria-labelledby="tool-results-title">
          <h2 id="tool-results-title" ref={resultsHeadingRef} tabIndex={-1} style={styles.toolTitle}>
            Results to resolve
          </h2>
          <p style={styles.toolDesc}>
            Disputed scores, and reports the opposing side hasn&rsquo;t answered. Open one to
            confirm the reported score or set the correct one.
          </p>
          {reportsAwaitingResolution.length === 0 ? (
            <p style={styles.toolDescStrong}>Nothing waiting.</p>
          ) : (
            <ul style={styles.resolveList}>
              {reportsAwaitingResolution.map((m) => (
                <li key={m.id} style={styles.resolveItem}>
                  <Link href={`/matches/${encodeURIComponent(m.id)}`} className="tl-link" style={styles.resolveLink}>
                    {m.player1Name ?? "Player 1"} vs {m.player2Name ?? "Player 2"}
                  </Link>
                  <StatusBadge status={m.status} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section style={styles.toolCard} aria-labelledby="tool-scheduler-title">
          <h2 id="tool-scheduler-title" style={styles.toolTitle}>Round-robin scheduler</h2>
          <p style={styles.toolDesc}>
            Build and publish a full fixture list for one division level.
          </p>
          <Button
            variant="secondary"
            onClick={() => toggleToolPanel("scheduler")}
            aria-expanded={openToolPanel === "scheduler"}
            aria-controls="admin-scheduler-panel"
          >
            {openToolPanel === "scheduler" ? "Close scheduler" : "Open scheduler"}
          </Button>
        </section>

        <section style={styles.toolCard} aria-labelledby="tool-repair-title">
          <h2 id="tool-repair-title" style={styles.toolTitle}>Ranking repair</h2>
          <p style={styles.toolDesc}>
            Rebuild standings and head-to-heads from confirmed results. Use it if the
            standings look out of date.
          </p>
          <Button
            variant="secondary"
            icon={<IconRefresh size={18} aria-hidden="true" />}
            pending={repairRankings.pending}
            pendingLabel="Rebuilding…"
            onClick={() => void repairRankings.run()}
          >
            Rebuild rankings
          </Button>
          {repairRankings.error ? (
            <InlineAlert
              tone="error"
              action={
                <Button size="sm" variant="secondary" onClick={() => void repairRankings.run()}>
                  Try again
                </Button>
              }
            >
              {repairRankings.error}
            </InlineAlert>
          ) : null}
          {repairMessage ? (
            <InlineAlert tone="success" role={null} onDismiss={() => setRepairMessage("")}>
              {repairMessage}
            </InlineAlert>
          ) : null}
        </section>

        <section style={styles.toolCard} aria-labelledby="tool-csv-title">
          <h2 id="tool-csv-title" style={styles.toolTitle}>CSV exports</h2>
          <p style={styles.toolDesc}>
            Download {adminSeason.name} matches or standings as a spreadsheet.
          </p>
          <div style={styles.toolActions}>
            <Button
              variant="secondary"
              icon={<IconDownload size={18} aria-hidden="true" />}
              pending={exportCsv.pending && exportingType === "matches"}
              pendingLabel="Exporting…"
              disabled={exportCsv.pending && exportingType !== "matches"}
              onClick={() => runExport("matches")}
            >
              Export matches
            </Button>
            <Button
              variant="secondary"
              icon={<IconDownload size={18} aria-hidden="true" />}
              pending={exportCsv.pending && exportingType === "rankings"}
              pendingLabel="Exporting…"
              disabled={exportCsv.pending && exportingType !== "rankings"}
              onClick={() => runExport("rankings")}
            >
              Export rankings
            </Button>
          </div>
          {exportCsv.error ? (
            <InlineAlert
              tone="error"
              action={
                exportingType ? (
                  <Button size="sm" variant="secondary" onClick={() => runExport(exportingType)}>
                    Try again
                  </Button>
                ) : undefined
              }
            >
              {exportCsv.error}
            </InlineAlert>
          ) : null}
          {csvMessage ? (
            <InlineAlert tone="success" role={null} onDismiss={() => setCsvMessage("")}>
              {csvMessage}
            </InlineAlert>
          ) : null}
        </section>
      </div>

      {openToolPanel === "reports" ? (
        <section id="admin-reports-panel" style={styles.card} aria-labelledby="reports-panel-title">
          <h2 id="reports-panel-title" ref={reportsHeadingRef} tabIndex={-1} style={styles.sectionTitle}>
            Reported messages
          </h2>
          {messageReports.length === 0 ? (
            <EmptyState
              compact
              title="No reports waiting"
              description="When a player reports a message in your division, it appears here for you to remove or dismiss."
            />
          ) : (
            <ul style={styles.reportList}>
              {messageReports.map((report) => {
                const busy = resolvingReportId === report.id;
                return (
                  <li key={report.id} style={styles.reportItem}>
                    <div style={styles.reportHeader}>
                      <h3 style={styles.reportSender}>{report.messageSenderName}</h3>
                      <span style={styles.reasonBadge}>
                        {REPORT_REASON_LABELS[report.reason] ?? report.reason}
                      </span>
                    </div>
                    <blockquote style={styles.reportQuote}>{report.messageContent}</blockquote>
                    {report.note ? (
                      <p style={styles.hint}>Reporter&rsquo;s note: {report.note}</p>
                    ) : null}
                    {reportErrors[report.id] ? (
                      <InlineAlert tone="error" style={{ marginBottom: 12 }}>
                        {reportErrors[report.id]}
                      </InlineAlert>
                    ) : null}
                    <div style={styles.actionsRow}>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => setRemoveReportTarget(report)}
                        disabled={Boolean(resolvingReportId) && !busy}
                        aria-haspopup="dialog"
                      >
                        Remove message
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        pending={busy && !removeReportTarget}
                        pendingLabel="Dismissing…"
                        disabled={Boolean(resolvingReportId) && !busy}
                        onClick={() => void dismissReport(report)}
                      >
                        Dismiss report
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}

      {openToolPanel === "scheduler" ? (
        <section id="admin-scheduler-panel" style={styles.card} aria-labelledby="scheduler-panel-title">
          <h2 id="scheduler-panel-title" ref={schedulerHeadingRef} tabIndex={-1} style={styles.sectionTitle}>
            Round-robin scheduler
          </h2>
          <p style={styles.hint}>
            Building a fixture list for {adminSeason.name}. Change the season at the top of
            the page to schedule a different one.
          </p>
          <div style={styles.fieldGrid}>
            <Field id="rr-level" label="Division level">
              <select
                id="rr-level"
                style={styles.input}
                value={rrDivisionLevelId}
                onChange={(e) => {
                  setRrDivisionLevelId(e.target.value);
                  setRrPreview(null);
                  setRrFormError("");
                }}
                disabled={adminSeasonLevels.length === 0}
              >
                {adminSeasonLevels.length === 0 ? (
                  <option value="">No levels for this season</option>
                ) : (
                  adminSeasonLevels.map((level) => (
                    <option key={level.id} value={level.id}>
                      {level.name}
                    </option>
                  ))
                )}
              </select>
            </Field>
          </div>

          {rrSelectedLevelIsDoubles ? (
            <InlineAlert tone="info" role={null} style={styles.blockGap}>
              Round-robin scheduling isn&rsquo;t available for doubles levels yet. Create
              doubles matches from the Matches page instead.
            </InlineAlert>
          ) : null}

          <fieldset style={styles.fieldset}>
            <legend style={styles.legend}>
              Players ({rrSelectedPlayerIds.length} of {rrMemberships.length} selected)
            </legend>
            {rrMembershipsError ? (
              // A failed query is not an empty level: say so rather than "No active players".
              <ErrorState
                compact
                title="Couldn't load this level's players."
                error={rrMembershipsError}
                onRetry={retryRrMemberships}
              />
            ) : rrMemberships.length === 0 ? (
              <p style={styles.hint}>
                No active players in this division level for {adminSeason.name} yet. Assign
                players on the Roster tab.
              </p>
            ) : (
              <>
                <div style={styles.actionsRow}>
                  <Button
                    size="sm"
                    variant="quiet"
                    onClick={() => {
                      setRrPreview(null);
                      setRrSelectedPlayerIds(rrMemberships.map((m) => m.userId));
                    }}
                  >
                    Select all
                  </Button>
                  <Button
                    size="sm"
                    variant="quiet"
                    onClick={() => {
                      setRrPreview(null);
                      setRrSelectedPlayerIds([]);
                    }}
                  >
                    Select none
                  </Button>
                </div>
                <div style={styles.toggleGrid}>
                  {rrMemberships.map((m) => {
                    const selected = rrSelectedPlayerIds.includes(m.userId);
                    return (
                      <button
                        type="button"
                        key={m.userId}
                        className={`${css.chip} ${selected ? css.chipActive : ""}`}
                        aria-pressed={selected}
                        onClick={() => toggleRrPlayer(m.userId)}
                      >
                        {selected ? <IconCheck size={16} aria-hidden="true" /> : null}
                        {m.displayNameSnapshot}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </fieldset>

          <div style={styles.fieldGrid}>
            <Field id="rr-format" label="Format">
              <select
                id="rr-format"
                style={styles.input}
                value={rrDoubleRoundRobin ? "double" : "single"}
                onChange={(e) => {
                  setRrDoubleRoundRobin(e.target.value === "double");
                  setRrPreview(null);
                }}
              >
                <option value="single">Single round robin (play everyone once)</option>
                <option value="double">Double round robin (play everyone twice)</option>
              </select>
            </Field>
            <Field id="rr-interval" label="Time between rounds">
              <select
                id="rr-interval"
                style={styles.input}
                value={rrIntervalDays}
                onChange={(e) => setRrIntervalDays(Number(e.target.value))}
              >
                {[3, 7, 14].map((days) => (
                  <option key={days} value={days}>
                    Every {days} days
                  </option>
                ))}
              </select>
            </Field>
            <Field id="rr-start-date" label="Round 1 starts">
              <input
                id="rr-start-date"
                style={styles.input}
                type="date"
                value={rrStartDate}
                onChange={(e) => {
                  setRrStartDate(e.target.value);
                  setRrDateError("");
                }}
                aria-invalid={rrDateError ? true : undefined}
                aria-describedby={rrDateError ? "rr-start-date-error" : undefined}
              />
              <FieldError id="rr-start-date-error">{rrDateError}</FieldError>
            </Field>
          </div>
          <CheckboxRow
            checked={rrSeedByRankings}
            onChange={(checked) => {
              setRrSeedByRankings(checked);
              setRrPreview(null);
            }}
          >
            Seed pairings by current ranking
          </CheckboxRow>
          <CheckboxRow
            checked={rrClearExisting}
            onChange={setRrClearExisting}
            description="Deletes the round-robin matches published earlier for this level that are still scheduled. Matches players arranged themselves are kept."
          >
            Replace the schedule published earlier for this level
          </CheckboxRow>

          {rrFormError ? (
            <InlineAlert tone="error" style={styles.blockGap}>
              {rrFormError}
            </InlineAlert>
          ) : null}

          <div style={styles.actionsRow}>
            <Button
              variant={rrPreview ? "secondary" : "primary"}
              onClick={handleRrGeneratePreview}
              disabled={rrSelectedLevelIsDoubles}
            >
              {rrPreview ? "Rebuild preview" : "Preview schedule"}
            </Button>
          </div>

          {rrPreview ? (
            <div style={styles.previewBox}>
              <h3 style={styles.subTitle}>
                Preview: {plural(rrPreview.length, "match", "matches")} over{" "}
                {plural(new Set(rrPreview.map((m) => m.round)).size, "round", "rounds")}
              </h3>
              <p style={styles.hint}>
                {rrPreviewStartAt
                  ? "Nothing is created until you publish."
                  : "Nothing is created until you publish. Choose when round 1 starts to see each round's date."}
              </p>
              <div style={styles.roundGrid}>
                {Array.from(new Set(rrPreview.map((m) => m.round))).map((round) => (
                  <div key={round}>
                    <h4 style={styles.roundTitle}>
                      Round {round}
                      {rrPreviewStartAt ? (
                        <span style={styles.roundDate}>
                          {" · "}
                          {new Date(
                            rrPreviewStartAt + (round - 1) * rrIntervalDays * DAY_MS,
                          ).toLocaleDateString(undefined, {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      ) : null}
                    </h4>
                    <ul style={styles.roundList}>
                      {rrPreview
                        .filter((m) => m.round === round)
                        .map((m, idx) => (
                          <li key={idx}>
                            {rrNameById.get(m.player1Id) ?? m.player1Id} vs{" "}
                            {rrNameById.get(m.player2Id) ?? m.player2Id}
                          </li>
                        ))}
                    </ul>
                  </div>
                ))}
              </div>
              <Button onClick={requestRrPublish} aria-haspopup="dialog">
                Publish schedule
              </Button>
            </div>
          ) : null}
          {rrMessage ? (
            <InlineAlert tone="success" role={null} style={styles.blockGap} onDismiss={() => setRrMessage("")}>
              {rrMessage}
            </InlineAlert>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
