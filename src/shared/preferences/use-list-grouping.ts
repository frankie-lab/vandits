/**
 * use-list-grouping — Persistent user preference for list grouping mode.
 *
 * Single source of truth for "Agrupar por" selector across all point lists
 * (document view tabs, general catalog list, etc.).
 *
 * Persistence: localStorage (Nivel A — UX personal, per-device fast access).
 * Cross-component sync: window event so multiple selectors stay aligned.
 */
import { useCallback, useEffect, useState } from 'react';
import type { GroupingMode } from '@/shared/geography/hierarchy';

const STORAGE_KEY = 'content.list_grouping';
const EVENT = 'lovable:list-grouping-changed';
const DEFAULT: GroupingMode = 'geography';

function read(): GroupingMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'geography' || v === 'category' || v === 'status') return v;
  } catch { /* ignore */ }
  return DEFAULT;
}

export function useListGrouping(): [GroupingMode, (mode: GroupingMode) => void] {
  const [mode, setMode] = useState<GroupingMode>(read);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ mode: GroupingMode }>).detail;
      if (detail?.mode) setMode(detail.mode);
    };
    window.addEventListener(EVENT, handler);
    return () => window.removeEventListener(EVENT, handler);
  }, []);

  const update = useCallback((next: GroupingMode) => {
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
    setMode(next);
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { mode: next } }));
  }, []);

  return [mode, update];
}
