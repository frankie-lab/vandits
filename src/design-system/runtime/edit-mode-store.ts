/**
 * Edit-mode store for the DS Inspector.
 *
 *  - `published`     — last persisted overrides (mirrors app_settings row).
 *  - `draft`         — in-memory edits (only when editMode === true).
 *  - On every setDraft we recompute the effective map (published+draft) and
 *    apply it live so the user sees the change everywhere.
 *  - publish() writes to BD + history; discard() drops the draft.
 */
import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';
import {
  applyOverrides,
  cacheApplied,
  type OverrideMap,
} from '@/design-system/runtime/apply-overrides';
import { getLeaf } from '@/design-system/runtime/token-registry';
import {
  deriveOppositeTriplet,
  resolveOppositeModePath,
  resolveTargetBackgroundPath,
} from '@/components/admin/design-system/color-adaptive';
import { parseHslTriplet } from '@/components/admin/design-system/color-conversions';

/** Pair key per token role (without light/dark prefix). True = auto-link. */
type LinkedMap = Record<string, boolean>;

function pairKey(path: string): string | undefined {
  const m = path.match(/^color\.(light|dark)\.(.+)$/);
  return m ? m[2] : undefined;
}

interface State {
  published: OverrideMap;
  draft: OverrideMap;
  linkedPairs: LinkedMap;

  hydrate: (published: OverrideMap) => void;
  setDraft: (path: string, value: string | number) => void;
  /** Toggle auto-link for a color pair (key = role without mode). */
  setLinked: (path: string, value: boolean) => void;
  /** True when the pair is currently auto-linked (default true). */
  isLinked: (path: string) => boolean;
  /** Restaurar el valor de fábrica de un alias (re-vincular a su $ref). */
  resetToBase: (path: string) => void;
  /** Alias de resetToBase con nombre semántico: vuelve a heredar del primitivo. */
  relink: (path: string) => void;
  discard: () => void;
  publish: (note?: string) => Promise<void>;
  resetAll: () => Promise<void>;
}

function effective(published: OverrideMap, draft: OverrideMap): OverrideMap {
  return { ...published, ...draft };
}

function apply(map: OverrideMap) {
  applyOverrides(map);
  cacheApplied(map);
}

export const useDesignSystemEdit = create<State>((set, get) => ({
  published: {},
  draft: {},
  linkedPairs: {},

  hydrate: (published) => {
    set({ published });
    apply(effective(published, get().draft));
  },

  setDraft: (path, value) => {
    const draft = { ...get().draft, [path]: value };

    // Auto-link: if this is a color.{light|dark}.role token and its pair is
    // linked (default true), propagate the perceptual opposite to the twin.
    const key = pairKey(path);
    const linked = key ? get().linkedPairs[key] !== false : false;
    if (linked && key && typeof value === 'string') {
      const oppositePath = resolveOppositeModePath(path);
      const mode: 'light' | 'dark' = path.includes('.light.') ? 'light' : 'dark';
      if (oppositePath && parseHslTriplet(value)) {
        const oppositeBgPath = resolveTargetBackgroundPath(oppositePath);
        const bgLeaf = oppositeBgPath ? getLeaf(oppositeBgPath) : undefined;
        const bgTriplet =
          (oppositeBgPath && (draft[oppositeBgPath] ?? get().published[oppositeBgPath])) ??
          bgLeaf?.baseValue;
        const derived = deriveOppositeTriplet(value, {
          from: mode,
          targetBgTriplet: typeof bgTriplet === 'string' ? bgTriplet : undefined,
          minContrast: 3,
        });
        if (derived) draft[oppositePath] = derived;
      }
    }

    set({ draft });
    apply(effective(get().published, draft));
  },

  setLinked: (path, value) => {
    const key = pairKey(path);
    if (!key) return;
    set({ linkedPairs: { ...get().linkedPairs, [key]: value } });
  },

  isLinked: (path) => {
    const key = pairKey(path);
    if (!key) return false;
    return get().linkedPairs[key] !== false;
  },

  resetToBase: (path) => {
    const draft = { ...get().draft };
    const published = { ...get().published };
    delete draft[path];
    delete published[path];
    set({ draft, published });
    apply(effective(published, draft));
  },

  relink: (path) => {
    get().resetToBase(path);
  },

  discard: () => {
    set({ draft: {} });
    apply(get().published);
  },

  publish: async (note) => {
    const next = effective(get().published, get().draft);
    const { error } = await supabase
      .from('app_settings')
      .update({ value: next as never, updated_at: new Date().toISOString() })
      .eq('key', 'design_system_overrides');
    if (error) throw error;

    await supabase
      .from('design_system_history')
      .insert([{ value: next as never, note: note ?? null }]);

    set({ published: next, draft: {} });
    apply(next);
  },

  resetAll: async () => {
    const { error } = await supabase
      .from('app_settings')
      .update({ value: {} as never, updated_at: new Date().toISOString() })
      .eq('key', 'design_system_overrides');
    if (error) throw error;
    await supabase
      .from('design_system_history')
      .insert([{ value: {} as never, note: 'Restaurar valores de fábrica' }]);
    set({ published: {}, draft: {} });
    apply({});
  },
}));
