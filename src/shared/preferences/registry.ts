/**
 * Preference Registry — Global registration and lookup of PreferenceUnits.
 */
import type { PreferenceUnit, PreferenceGroup } from './types';

const units = new Map<string, PreferenceUnit>();

/** Register a preference unit. Skips silently if already registered. */
export function registerUnit(unit: PreferenceUnit): void {
  // Support both `key` (v2) and legacy `id` (v1) as the lookup key
  const unitKey = unit.key ?? (unit as any).id;
  if (!unitKey) {
    console.warn('[preferences] Unit has no key — skipping.');
    return;
  }
  if (units.has(unitKey)) {
    console.warn(`[preferences] Unit "${unitKey}" is already registered — skipping duplicate.`);
    return;
  }
  units.set(unitKey, unit);
}

/** Get a registered unit by its key. Also supports legacy `id` lookups. */
export function getUnit(id: string): PreferenceUnit | undefined {
  return units.get(id);
}

/** List all registered units, optionally filtered by domain or group. */
export function listUnits(filter?: { domain?: string; group?: PreferenceGroup }): PreferenceUnit[] {
  const all = Array.from(units.values());
  if (!filter) return all;
  return all.filter(u => {
    if (filter.domain && u.domain !== filter.domain) return false;
    if (filter.group && u.group !== filter.group) return false;
    return true;
  });
}

/** Remove a unit (useful for tests). */
export function unregisterUnit(id: string): boolean {
  return units.delete(id);
}

/** Clear all registered units (useful for tests). */
export function clearRegistry(): void {
  units.clear();
}
