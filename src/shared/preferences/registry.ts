/**
 * Preference Registry — Global registration and lookup of ManageableUnits.
 */
import type { ManageableUnit } from './types';

const units = new Map<string, ManageableUnit>();

/** Register a manageable unit. Throws if the ID is already taken. */
export function registerUnit(unit: ManageableUnit): void {
  if (units.has(unit.id)) {
    console.warn(`[preferences] Unit "${unit.id}" is already registered — skipping duplicate.`);
    return;
  }
  units.set(unit.id, unit);
}

/** Get a registered unit by its dot-separated ID. */
export function getUnit(id: string): ManageableUnit | undefined {
  return units.get(id);
}

/** List all registered units, optionally filtered by domain. */
export function listUnits(domain?: string): ManageableUnit[] {
  const all = Array.from(units.values());
  return domain ? all.filter(u => u.domain === domain) : all;
}

/** Remove a unit (useful for tests). */
export function unregisterUnit(id: string): boolean {
  return units.delete(id);
}

/** Clear all registered units (useful for tests). */
export function clearRegistry(): void {
  units.clear();
}
