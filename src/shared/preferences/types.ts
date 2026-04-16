/**
 * Preference System — Core Types
 *
 * ADR: docs/adr/001-manageable-unit.md
 *
 * Design rules:
 *  1. Validation, appearance and visibility are SEPARATE concerns — never mixed in one unit.
 *  2. A ManageableUnit declares its fields, defaults and supported scopes.
 *  3. Resolution follows strict scope precedence: system < domain < user < entity < session.
 */

// ── Scopes ───────────────────────────────────────────────────
/** Ordered from lowest to highest precedence */
export type PreferenceScope = 'system' | 'domain' | 'user' | 'entity' | 'session';

export const SCOPE_PRECEDENCE: readonly PreferenceScope[] = [
  'system',
  'domain',
  'user',
  'entity',
  'session',
] as const;

// ── Field types ──────────────────────────────────────────────
export type FieldType = 'boolean' | 'number' | 'enum' | 'color' | 'string' | 'json';

export interface PreferenceField<T = unknown> {
  /** Unique key within the unit (e.g. "ownLayerVisible") */
  key: string;
  /** Human-readable label for UI rendering */
  label: string;
  /** Data type — drives the generic panel renderer */
  type: FieldType;
  /** Default value (system scope) */
  defaultValue: T;
  /** Optional enum options when type === 'enum' */
  enumOptions?: { value: string; label: string }[];
  /** Numeric constraints when type === 'number' */
  min?: number;
  max?: number;
  step?: number;
  /** Brief description shown as helper text */
  description?: string;
  /** If true, field is hidden from the generic panel (managed by custom UI) */
  hidden?: boolean;
}

// ── Manageable Unit ──────────────────────────────────────────
export interface ManageableUnit {
  /** Dot-separated hierarchical ID (e.g. "discovery.map.layer_visibility") */
  id: string;
  /** Domain this unit belongs to */
  domain: string;
  /** Human-readable name */
  name: string;
  /** Brief description */
  description?: string;
  /** Fields declared by this unit */
  fields: PreferenceField[];
  /** Which scopes this unit supports (subset of SCOPE_PRECEDENCE) */
  supportedScopes: PreferenceScope[];
  /** Optional: custom panel component ID for overriding the generic renderer */
  customPanelId?: string;
}

// ── Resolved preferences ─────────────────────────────────────
/** A flat key-value map after resolving all scope overrides */
export type ResolvedPreferences = Record<string, unknown>;

/** A single scope's partial overrides */
export type ScopeOverrides = Record<string, unknown>;

/** Full picture: what value came from which scope */
export interface ResolvedField<T = unknown> {
  key: string;
  value: T;
  source: PreferenceScope;
  /** Whether this field has been overridden from its default */
  isOverridden: boolean;
}

// ── Storage adapter contract ─────────────────────────────────
export interface PreferenceStorageAdapter {
  /** Load overrides for a unit+scope. Returns null if nothing stored. */
  load(unitId: string, scope: PreferenceScope, entityId?: string): Promise<ScopeOverrides | null>;
  /** Save overrides for a unit+scope. */
  save(unitId: string, scope: PreferenceScope, overrides: ScopeOverrides, entityId?: string): Promise<void>;
  /** Delete all overrides for a unit+scope. */
  clear(unitId: string, scope: PreferenceScope, entityId?: string): Promise<void>;
}
