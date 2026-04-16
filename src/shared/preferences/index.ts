/**
 * Shared Preferences System — barrel export
 */

// Types
export type {
  PreferenceScope,
  FieldType,
  PreferenceField,
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
export { localStorageAdapter, supabaseAdapter, defaultAdapter } from './storage';

// Hook
export { usePreferences } from './usePreferences';
