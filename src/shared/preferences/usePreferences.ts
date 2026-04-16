/**
 * usePreferences — React hook for consuming and updating preferences.
 *
 * Features:
 *  - Reactive bus: emits via preferencesBus on every update so all instances of the same unitId stay in sync.
 *  - Optimistic updates: state is updated immediately; persistence runs in background.
 *  - Scope resolution follows SCOPE_PRECEDENCE order.
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
import { emitPrefChanged, onPrefChanged } from './preferencesBus';

// ── Hook ─────────────────────────────────────────────────────
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

  // ── Reactive bus listener: sync from other instances ──────
  useEffect(() => {
    const unsub = onPrefChanged((detail) => {
      if (detail.unitId !== unitId) return;

      setLayers(prev => {
        const without = prev.filter(l => l.scope !== detail.scope);
        return [...without, { scope: detail.scope, overrides: detail.overrides }];
      });
    });

    return unsub;
  }, [unitId]);

  // Resolve preferences from current layers
  const preferences = unit
    ? resolvePreferences(unit, layers)
    : {};

  const update = useCallback(async (scope: PreferenceScope, key: string, value: unknown) => {
    if (!unit) return;

    // Optimistic: compute new overrides and apply immediately
    const existing = layers.find(l => l.scope === scope);
    const newOverrides = { ...(existing?.overrides ?? {}), [key]: value };

    setLayers(prev => {
      const without = prev.filter(l => l.scope !== scope);
      return [...without, { scope, overrides: newOverrides }];
    });

    // Notify other instances via bus
    emitPrefChanged({ unitId, scope, overrides: newOverrides });

    // Persist in background
    adapter.save(unitId, scope, newOverrides, scope === 'entity' ? entityId : undefined)
      .catch(err => console.error(`[preferences] persist failed ${unitId}/${scope}:`, err));
  }, [unit, layers, unitId, entityId, adapter]);

  const updateBatch = useCallback(async (scope: PreferenceScope, overrides: ScopeOverrides) => {
    if (!unit) return;

    const existing = layers.find(l => l.scope === scope);
    const newOverrides = { ...(existing?.overrides ?? {}), ...overrides };

    // Optimistic
    setLayers(prev => {
      const without = prev.filter(l => l.scope !== scope);
      return [...without, { scope, overrides: newOverrides }];
    });

    emitPrefChanged({ unitId, scope, overrides: newOverrides });

    adapter.save(unitId, scope, newOverrides, scope === 'entity' ? entityId : undefined)
      .catch(err => console.error(`[preferences] persist failed ${unitId}/${scope}:`, err));
  }, [unit, layers, unitId, entityId, adapter]);

  const resetScope = useCallback(async (scope: PreferenceScope) => {
    if (!unit) return;

    // Optimistic
    setLayers(prev => prev.filter(l => l.scope !== scope));

    emitPrefChanged({ unitId, scope, overrides: {} });

    adapter.clear(unitId, scope, scope === 'entity' ? entityId : undefined)
      .catch(err => console.error(`[preferences] clear failed ${unitId}/${scope}:`, err));
  }, [unit, unitId, entityId, adapter]);

  return { preferences, loading, update, updateBatch, resetScope, unit };
}
