/**
 * Preference Storage — Adapters for localStorage, Supabase (preference_values), and legacy app_settings.
 */
import type { PreferenceScope, PreferenceStorageAdapter, ScopeOverrides } from './types';
import { supabase } from '@/integrations/supabase/client';

// ── LocalStorage Adapter ─────────────────────────────────────
const LS_PREFIX = 'vandits-pref:';

function lsKey(unitId: string, scope: PreferenceScope, entityId?: string): string {
  return `${LS_PREFIX}${unitId}:${scope}${entityId ? `:${entityId}` : ''}`;
}

export const localStorageAdapter: PreferenceStorageAdapter = {
  async load(unitId, scope, entityId) {
    try {
      const raw = localStorage.getItem(lsKey(unitId, scope, entityId));
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  async save(unitId, scope, overrides, entityId) {
    localStorage.setItem(lsKey(unitId, scope, entityId), JSON.stringify(overrides));
  },

  async clear(unitId, scope, entityId) {
    localStorage.removeItem(lsKey(unitId, scope, entityId));
  },
};

// ── Supabase Adapter (preference_values table) ───────────────
export const supabaseAdapter: PreferenceStorageAdapter = {
  async load(unitId, scope, entityId) {
    const scopeId = scope === 'entity' ? entityId : (scope === 'user' ? (await supabase.auth.getUser()).data.user?.id : null);
    const { data, error } = await (supabase.from as any)('preference_values')
      .select('values')
      .eq('unit_key', unitId)
      .eq('scope_type', scope)
      .eq('scope_id', scopeId ?? '')
      .maybeSingle();

    if (error || !data) return null;
    return data.values as ScopeOverrides;
  },

  async save(unitId, scope, overrides, entityId) {
    const scopeId = scope === 'entity' ? entityId : (scope === 'user' ? (await supabase.auth.getUser()).data.user?.id : null);
    const { error } = await (supabase.from as any)('preference_values')
      .upsert(
        {
          unit_key: unitId,
          scope_type: scope,
          scope_id: scopeId ?? '',
          values: overrides,
        },
        { onConflict: 'unit_key,scope_type,scope_id' },
      );

    if (error) {
      console.error(`[preferences] Failed to save ${unitId}/${scope}:`, error.message);
    }
  },

  async clear(unitId, scope, entityId) {
    const scopeId = scope === 'entity' ? entityId : (scope === 'user' ? (await supabase.auth.getUser()).data.user?.id : null);
    await (supabase.from as any)('preference_values')
      .delete()
      .eq('unit_key', unitId)
      .eq('scope_type', scope)
      .eq('scope_id', scopeId ?? '');
  },
};

// ── Legacy Supabase Adapter (app_settings table — for backward compat) ──
function dbKey(unitId: string, scope: PreferenceScope, entityId?: string): string {
  return `pref:${unitId}:${scope}${entityId ? `:${entityId}` : ''}`;
}

export const legacyAppSettingsAdapter: PreferenceStorageAdapter = {
  async load(unitId, scope, entityId) {
    const key = dbKey(unitId, scope, entityId);
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', key)
      .maybeSingle();

    if (error || !data) return null;
    return data.value as ScopeOverrides;
  },

  async save(unitId, scope, overrides, entityId) {
    const key = dbKey(unitId, scope, entityId);
    const { error } = await supabase
      .from('app_settings')
      .upsert(
        { key, value: overrides as any, description: `Preferences for ${unitId} (${scope})` },
        { onConflict: 'key' },
      );

    if (error) {
      console.error(`[preferences] Failed to save ${key}:`, error.message);
    }
  },

  async clear(unitId, scope, entityId) {
    const key = dbKey(unitId, scope, entityId);
    await supabase.from('app_settings').delete().eq('key', key);
  },
};

// ── Composite adapter: localStorage for session/device, Supabase for persistent ──
export const defaultAdapter: PreferenceStorageAdapter = {
  async load(unitId, scope, entityId) {
    if (scope === 'session' || scope === 'device') {
      return localStorageAdapter.load(unitId, scope, entityId);
    }
    return supabaseAdapter.load(unitId, scope, entityId);
  },

  async save(unitId, scope, overrides, entityId) {
    if (scope === 'session' || scope === 'device') {
      return localStorageAdapter.save(unitId, scope, overrides, entityId);
    }
    return supabaseAdapter.save(unitId, scope, overrides, entityId);
  },

  async clear(unitId, scope, entityId) {
    if (scope === 'session' || scope === 'device') {
      return localStorageAdapter.clear(unitId, scope, entityId);
    }
    return supabaseAdapter.clear(unitId, scope, entityId);
  },
};
