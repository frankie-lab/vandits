/**
 * Preference Resolver — Merges scope overrides in precedence order.
 *
 * Resolution: system < role < domain < user < device < entity < session
 * The "system" scope is the field defaults declared in the PreferenceUnit.
 */
import type {
  PreferenceUnit,
  ManageableUnit,
  PreferenceScope,
  ScopeOverrides,
  ResolvedPreferences,
  ResolvedField,
} from './types';
import { SCOPE_PRECEDENCE } from './types';

export interface ScopeLayer {
  scope: PreferenceScope;
  overrides: ScopeOverrides;
}

/**
 * Resolve preferences for a unit given a set of scope layers.
 * Returns the final flat map of key → value after applying all overrides.
 */
export function resolvePreferences(
  unit: PreferenceUnit | ManageableUnit,
  layers: ScopeLayer[],
): ResolvedPreferences {
  const result: ResolvedPreferences = {};

  // Start with system defaults
  for (const field of unit.fields) {
    result[field.key] = field.defaultValue;
  }

  // Apply layers in precedence order
  const sorted = [...layers].sort(
    (a, b) => SCOPE_PRECEDENCE.indexOf(a.scope) - SCOPE_PRECEDENCE.indexOf(b.scope),
  );

  for (const layer of sorted) {
    for (const [key, value] of Object.entries(layer.overrides)) {
      if (value !== undefined) {
        result[key] = value;
      }
    }
  }

  return result;
}

/**
 * Resolve with full provenance — tells you which scope each value came from.
 */
export function resolveWithProvenance(
  unit: PreferenceUnit | ManageableUnit,
  layers: ScopeLayer[],
): ResolvedField[] {
  const sources = new Map<string, { value: unknown; scope: PreferenceScope }>();

  // System defaults
  for (const field of unit.fields) {
    sources.set(field.key, { value: field.defaultValue, scope: 'system' });
  }

  // Apply layers in precedence order
  const sorted = [...layers].sort(
    (a, b) => SCOPE_PRECEDENCE.indexOf(a.scope) - SCOPE_PRECEDENCE.indexOf(b.scope),
  );

  for (const layer of sorted) {
    for (const [key, value] of Object.entries(layer.overrides)) {
      if (value !== undefined) {
        sources.set(key, { value, scope: layer.scope });
      }
    }
  }

  return unit.fields.map(field => {
    const source = sources.get(field.key)!;
    return {
      key: field.key,
      value: source.value,
      source: source.scope,
      isOverridden: source.scope !== 'system',
    };
  });
}
