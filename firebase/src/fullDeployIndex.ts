// Every function except the onUserCreated blocking function, for the deploy workflow's
// full scope. onUserCreated declares the ALLOWED_EMAIL_DOMAIN param, and firebase deploy
// resolves the params of every function in the bundle, not only the ones named in --only,
// so a bundle that contains it cannot deploy in CI without that value even when it is
// not selected. index.ts adds onUserCreated back for a deploy that includes it.
export {
  onMatchUpdate,
  scoreMatchPoint,
  recordHistoricMatch,
  recordMatchOnBehalf,
  resolveDisputedReport,
  recalculateDivisionRankings,
  repairAllDivisionRankings,
} from './matches/matchFunctions';
export { createDoublesMatch } from './matches/doublesFunctions';
export {
  autoConfirmExpiredReports,
  requestMatchAppeal,
  decideMatchAppeal,
} from './matches/appealFunctions';
export { publishRoundRobinSchedule } from './matches/scheduleFunctions';
export { sendMatchReminders } from './matches/reminderFunctions';
export {
  publishPlayoffBracket,
  cancelPlayoffBracket,
  onPlayoffMatchUpdate,
} from './matches/playoffFunctions';
export { generateMatchReport } from './reports/generateReport';
export { onNewMessage } from './messaging/onNewMessage';
export { resolveMessageReport } from './messaging/moderationFunctions';

export { sendInvite, getInvitePreview, acceptInvite } from './users/sendInvite';
export { deleteAccount } from './users/deleteAccount';
export {
  createDivision,
  joinDivisionByCode,
  addPlayerToDivisionByEmail,
  addDivisionMemberPlaceholder,
  mergeDivisionPlayerRecords,
  updateDivisionPlayerEmail,
  upsertDivisionLevel,
  upsertDivisionMembership,
  removeDivisionMembership,
  backfillDivisionSeasonLevel,
  backfillMissingProfiles,
  exportDivisionCsv,
} from './divisions/divisionFunctions';

export { submitFeedback } from './feedback/submitFeedback';

export { health, readiness } from './health/health';
