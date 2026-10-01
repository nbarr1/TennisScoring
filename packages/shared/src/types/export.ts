export type CsvExportType = 'matches' | 'rankings' | 'doublesRankings';

export interface CsvExportRequest {
  divisionId: string;
  exportType: CsvExportType;
  seasonId?: string;
  divisionLevelId?: string;
}

export interface CsvExportResult {
  filename: string;
  contentType: 'text/csv';
  csv: string;
  rowCount: number;
}

/**
 * Escapes one CSV cell.
 *
 * Text that a spreadsheet would read as a formula (a leading `=`, `+`, `-`, `@`,
 * tab, or carriage return) is prefixed with a single quote, per the OWASP CSV
 * injection guidance. Display names are user-editable and land in leaders'
 * exports, so `=HYPERLINK(...)` as a name otherwise became a live formula.
 * Numbers are left alone: a negative game differential is data, not a formula.
 */
export function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  const raw = typeof value === 'string' && /^[=+\-@\t\r]/.test(value) ? `'${value}` : String(value);
  if (!/[",\n\r]/.test(raw)) return raw;
  return `"${raw.replace(/"/g, '""')}"`;
}

export function toCsv(rows: unknown[][]): string {
  return `${rows.map((row) => row.map(escapeCsvValue).join(',')).join('\n')}\n`;
}
