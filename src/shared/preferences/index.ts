/**
 * Shared Preferences System — barrel export
 */

// Types
export type {
  PreferenceScope,
  PreferenceGroup,
  FieldType,
  PreferenceField,
  PreferenceUnit,
  ManageableUnit,
  ResolvedPreferences,
  ScopeOverrides,
  ResolvedField,
  PreferenceStorageAdapter,
} from './types';
export { SCOPE_PRECEDENCE } from './types';

// Registry
export { registerUnit, getUnit, listUnits, unregisterUnit, clearRegistry } from './registry';

// Resolver
export { resolvePreferences, resolveWithProvenance, type ScopeLayer } from './resolver';

// Storage adapters
export { localStorageAdapter, supabaseAdapter, legacyAppSettingsAdapter, defaultAdapter } from './storage';

// Hook
export { usePreferences } from './usePreferences';
