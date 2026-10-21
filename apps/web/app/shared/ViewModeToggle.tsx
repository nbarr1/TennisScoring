'use client';

import { useId } from 'react';
import { useViewMode, type ViewModePreference } from './viewMode';
import { color, radius } from './tokens';

const OPTIONS: Array<{ label: string; value: ViewModePreference }> = [
  { label: 'Auto', value: 'auto' },
  { label: 'Compact (iPhone)', value: 'ios' },
  { label: 'Standard', value: 'standard' },
];

/**
 * The "Layout" select in the nav bar, styled for the Clubhouse Green bar.
 * The stored values ('auto' | 'ios' | 'standard') are unchanged; only the
 * labels moved from developer language to what the player sees.
 */
export function ViewModeToggle(): React.JSX.Element {
  const { preference, setPreference, showPrompt, dismissPrompt } = useViewMode();
  const selectId = useId();

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <label htmlFor={selectId} style={{ color: color.surface, fontSize: 14, fontWeight: 500 }}>Layout</label>
      <select
        id={selectId}
        value={preference}
        onChange={(event) => setPreference(event.target.value as ViewModePreference)}
        style={{
          minHeight: 44,
          borderRadius: radius.pill,
          padding: '0 12px',
          border: '1px solid rgba(255,255,255,0.45)',
          background: 'rgba(255,255,255,0.12)',
          color: color.surface,
          fontSize: 14,
        }}
      >
        {OPTIONS.map((option) => (
          <option key={option.value} value={option.value} style={{ color: color.ink, background: color.surface }}>
            {option.label}
          </option>
        ))}
      </select>
      {showPrompt && (
        <button
          type="button"
          onClick={() => { setPreference('ios'); dismissPrompt(); }}
          style={{
            minHeight: 44,
            border: `1px solid ${color.ballYellow}`,
            background: color.ballYellow,
            color: color.clubhouseGreen,
            borderRadius: radius.pill,
            padding: '0 14px',
            fontWeight: 700,
            fontSize: 13,
          }}
        >
          Optimize for iPhone
        </button>
      )}
    </div>
  );
}
