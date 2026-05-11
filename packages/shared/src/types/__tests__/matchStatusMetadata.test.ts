import { MATCH_STATUS_METADATA, getMatchStatusMetadata, type MatchStatus } from '../match';

const STATUSES: MatchStatus[] = [
  'proposed',
  'scheduled',
  'in_progress',
  'pending_report',
  'completed',
  'disputed',
  'cancelled',
];

describe('match status metadata', () => {
  it('provides display and accessibility metadata for every match status', () => {
    for (const status of STATUSES) {
      const metadata = getMatchStatusMetadata(status);
      expect(metadata).toBe(MATCH_STATUS_METADATA[status]);
      expect(metadata.label).toEqual(expect.any(String));
      expect(metadata.icon).toEqual(expect.any(String));
      expect(metadata.color).toMatch(/^#[0-9a-f]{3,6}$/i);
      expect(metadata.accessibilityLabel).toEqual(expect.stringContaining('Match'));
    }
  });
});
