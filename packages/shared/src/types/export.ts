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

export function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  const raw = String(value);
  if (!/[",\n\r]/.test(raw)) return raw;
  return `"${raw.replace(/"/g, '""')}"`;
}

export function toCsv(rows: unknown[][]): string {
  return `${rows.map((row) => row.map(escapeCsvValue).join(',')).join('\n')}\n`;
}
