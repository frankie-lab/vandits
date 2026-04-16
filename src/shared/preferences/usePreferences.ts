/**
 * usePreferences — React hook for consuming and updating preferences.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  PreferenceUnit,
  PreferenceScope,
  PreferenceStorageAdapter,
  ResolvedPreferences,
  ScopeOverrides,
} from './types';
import { getUnit } from './registry';
import { resolvePreferences, type ScopeLayer } from './resolver';
import { defaultAdapter } from './storage';

interface UsePreferencesOptions {
  /** The dot-separated unit key */
  unitId: string;
  /** Optional entity ID for entity-scope overrides */
  entityId?: string;
  /** Override the default storage adapter */
  adapter?: PreferenceStorageAdapter;
}

interface UsePreferencesResult {
  /** The fully resolved preferences (all scopes merged) */
  preferences: ResolvedPreferences;
  /** Whether the initial load is still in progress */
  loading: boolean;
  /** Update a specific field at a given scope */
  update: (scope: PreferenceScope, key: string, value: unknown) => Promise<void>;
  /** Update multiple fields at a given scope */
  updateBatch: (scope: PreferenceScope, overrides: ScopeOverrides) => Promise<void>;
  /** Reset a scope (clear all overrides at that level) */
  resetScope: (scope: PreferenceScope) => Promise<void>;
  /** The unit definition (for rendering panels) */
  unit: PreferenceUnit | undefined;
}

export function usePreferences({
  unitId,
  entityId,
  adapter = defaultAdapter,
}: UsePreferencesOptions): UsePreferencesResult {
  const unit = getUnit(unitId);
  const [layers, setLayers] = useState<ScopeLayer[]>([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  // Load all scope layers on mount
  useEffect(() => {
    mountedRef.current = true;
    if (!unit) {
      setLoading(false);
      return;
    }

    const loadAll = async () => {
      const loaded: ScopeLayer[] = [];

      for (const scope of unit.supportedScopes) {
        const overrides = await adapter.load(unitId, scope, scope === 'entity' ? entityId : undefined);
        if (overrides) {
          loaded.push({ scope, overrides });
        }
      }

      if (mountedRef.current) {
        setLayers(loaded);
        setLoading(false);
      }
    };

    loadAll();
    return () => { mountedRef.current = false; };
  }, [unitId, entityId]);

  // Resolve preferences from current layers
  const preferences = unit
    ? resolvePreferences(unit, layers)
    : {};

  const update = useCallback(async (scope: PreferenceScope, key: string, value: unknown) => {
    if (!unit) return;

    const existing = layers.find(l => l.scope === scope);
    const newOverrides = { ...(existing?.overrides ?? {}), [key]: value };

    await adapter.save(unitId, scope, newOverrides, scope === 'entity' ? entityId : undefined);

    setLayers(prev => {
      const without = prev.filter(l => l.scope !== scope);
      return [...without, { scope, overrides: newOverrides }];
    });
  }, [unit, layers, unitId, entityId, adapter]);

  const updateBatch = useCallback(async (scope: PreferenceScope, overrides: ScopeOverrides) => {
    if (!unit) return;

    const existing = layers.find(l => l.scope === scope);
    const newOverrides = { ...(existing?.overrides ?? {}), ...overrides };

    await adapter.save(unitId, scope, newOverrides, scope === 'entity' ? entityId : undefined);

    setLayers(prev => {
      const without = prev.filter(l => l.scope !== scope);
      return [...without, { scope, overrides: newOverrides }];
    });
  }, [unit, layers, unitId, entityId, adapter]);

  const resetScope = useCallback(async (scope: PreferenceScope) => {
    if (!unit) return;

    await adapter.clear(unitId, scope, scope === 'entity' ? entityId : undefined);
    setLayers(prev => prev.filter(l => l.scope !== scope));
  }, [unit, unitId, entityId, adapter]);

  return { preferences, loading, update, updateBatch, resetScope, unit };
}
