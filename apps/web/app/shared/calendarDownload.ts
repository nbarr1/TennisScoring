import { buildMatchCalendarFile, matchCalendarFilename } from '@tennis/shared';
import type { Match } from '@tennis/shared';

/**
 * Downloads a scheduled match as an `.ics` file, which every calendar app can
 * import. Returns false when the match has no start time.
 */
export function downloadMatchCalendar(match: Match, matchId: string, viewerId?: string): boolean {
  const ics = buildMatchCalendarFile(match, {
    matchId,
    viewerId,
    matchUrl: `${window.location.origin}/matches/${encodeURIComponent(matchId)}`,
  });
  if (!ics) return false;
  const href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = href;
  link.download = matchCalendarFilename(match, viewerId);
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoked on the next task: some browsers start the download asynchronously.
  setTimeout(() => URL.revokeObjectURL(href), 0);
  return true;
}
