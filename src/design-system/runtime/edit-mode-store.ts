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

interface State {
  editMode: boolean;
  published: OverrideMap;
  draft: OverrideMap;

  setEditMode: (v: boolean) => void;
  hydrate: (published: OverrideMap) => void;
  setDraft: (path: string, value: string | number) => void;
  resetToBase: (path: string) => void;
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
  editMode: false,
  published: {},
  draft: {},

  setEditMode: (v) => set({ editMode: v }),

  hydrate: (published) => {
    set({ published });
    if (!get().editMode) apply(published);
    else apply(effective(published, get().draft));
  },

  setDraft: (path, value) => {
    const draft = { ...get().draft, [path]: value };
    set({ draft });
    apply(effective(get().published, draft));
  },

  resetToBase: (path) => {
    const draft = { ...get().draft };
    const published = { ...get().published };
    delete draft[path];
    delete published[path];
    set({ draft, published });
    apply(effective(published, draft));
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
