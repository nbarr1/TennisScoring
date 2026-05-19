'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

export type ViewModePreference = 'auto' | 'ios' | 'standard';
export type EffectiveViewMode = 'ios' | 'standard';

const VIEW_MODE_STORAGE_KEY = 'ui.viewMode';
const IOS_PROMPT_STORAGE_KEY = 'ui.iosPromptDismissed';

type ViewModeContextValue = {
  preference: ViewModePreference;
  effectiveMode: EffectiveViewMode;
  setPreference: (next: ViewModePreference) => void;
  showPrompt: boolean;
  dismissPrompt: () => void;
};

const ViewModeContext = createContext<ViewModeContextValue | null>(null);

function isIphoneLikeDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPod/i.test(navigator.userAgent);
}

function resolveEffectiveViewMode(preference: ViewModePreference): EffectiveViewMode {
  if (preference === 'ios') return 'ios';
  if (preference === 'standard') return 'standard';
  return isIphoneLikeDevice() ? 'ios' : 'standard';
}

export function ViewModeProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [preference, setPreference] = useState<ViewModePreference>('auto');
  const [promptDismissed, setPromptDismissed] = useState(true);
  const [mounted, setMounted] = useState(false);
  const isInitialized = useRef(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY) as ViewModePreference | null;
    if (saved === 'auto' || saved === 'ios' || saved === 'standard') setPreference(saved);
    const dismissed = window.localStorage.getItem(IOS_PROMPT_STORAGE_KEY);
    setPromptDismissed(dismissed === '1');
    setMounted(true);
    isInitialized.current = true;
  }, []);

  useEffect(() => {
    if (!isInitialized.current) return;
    window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, preference);
  }, [preference]);

  const effectiveMode = useMemo<EffectiveViewMode>(() => {
    if (!mounted) return 'standard';
    return resolveEffectiveViewMode(preference);
  }, [mounted, preference]);

  const showPrompt = mounted && !promptDismissed && preference === 'auto' && isIphoneLikeDevice();

  useEffect(() => {
    if (!mounted) return;
    document.body.dataset.viewMode = effectiveMode;
  }, [effectiveMode, mounted]);

  const value = useMemo<ViewModeContextValue>(() => ({
    preference,
    effectiveMode,
    setPreference,
    showPrompt,
    dismissPrompt: () => {
      window.localStorage.setItem(IOS_PROMPT_STORAGE_KEY, '1');
      setPromptDismissed(true);
    },
  }), [effectiveMode, preference, showPrompt]);

  return <ViewModeContext.Provider value={value}>{children}</ViewModeContext.Provider>;
}

export function useViewMode(): ViewModeContextValue {
  const context = useContext(ViewModeContext);
  if (!context) throw new Error('useViewMode must be used within ViewModeProvider');
  return context;
}
