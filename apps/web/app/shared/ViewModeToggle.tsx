'use client';

import { useViewMode, type ViewModePreference } from './viewMode';

const OPTIONS: Array<{ label: string; value: ViewModePreference }> = [
  { label: 'Auto', value: 'auto' },
  { label: 'iOS View', value: 'ios' },
  { label: 'Standard', value: 'standard' },
];

export function ViewModeToggle(): React.JSX.Element {
  const { preference, setPreference, showPrompt, dismissPrompt } = useViewMode();

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <label htmlFor="view-mode" style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13 }}>View:</label>
      <select
        id="view-mode"
        aria-label="View mode"
        value={preference}
        onChange={(event) => setPreference(event.target.value as ViewModePreference)}
        style={{ borderRadius: 999, padding: '6px 12px', border: '1px solid rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.12)', color: '#fff' }}
      >
        {OPTIONS.map((option) => (
          <option key={option.value} value={option.value} style={{ color: '#111' }}>
            {option.label}
          </option>
        ))}
      </select>
      {showPrompt && (
        <button type="button" onClick={() => { setPreference('ios'); dismissPrompt(); }} style={{ border: '1px solid #ffdc60', background: '#ffdc60', color: '#1a472a', borderRadius: 999, padding: '6px 10px', fontWeight: 700, fontSize: 12 }}>
          Optimize for iPhone
        </button>
      )}
    </div>
  );
}
