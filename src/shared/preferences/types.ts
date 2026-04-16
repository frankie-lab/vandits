/**
 * Preference System — Core Types (v2)
 *
 * ADR: docs/adr/001-manageable-unit.md
 *
 * Design rules:
 *  1. Validation, appearance and visibility are SEPARATE concerns — never mixed in one unit.
 *  2. A PreferenceUnit declares its fields, defaults, supported scopes and group.
 *  3. Resolution follows strict scope precedence: system < role < domain < user < device < session.
 *  4. Fields marked `protected` are only editable at system/role scope (Nivel B).
 *  5. Semantic V2 contracts (marker shapes, colors, state rules) are NOT UX preferences.
 */

// ── Scopes ───────────────────────────────────────────────────
/** Ordered from lowest to highest precedence */
export type PreferenceScope = 'system' | 'role' | 'domain' | 'user' | 'device' | 'entity' | 'session';

export const SCOPE_PRECEDENCE: readonly PreferenceScope[] = [
  'system',
  'role',
  'domain',
  'user',
  'device',
  'entity',
  'session',
] as const;

// ── Groups ───────────────────────────────────────────────────
export type PreferenceGroup =
  | 'appearance'
  | 'layout'
  | 'icons'
  | 'map'
  | 'accessibility'
  | 'experimental';

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
  /** UX family group */
  group?: PreferenceGroup;
  /** Which scopes can write this field (default: all supportedScopes of the unit) */
  editableScopes?: PreferenceScope[];
  /** If true, only editable at system/role scope — semantic / admin config (Nivel B) */
  protected?: boolean;
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

// ── Preference Unit (formerly ManageableUnit) ────────────────
export interface PreferenceUnit {
  /** Dot-separated hierarchical key (e.g. "ux.appearance", "ux.map.chrome") */
  key: string;
  /** Domain this unit belongs to */
  domain: string;
  /** Human-readable name */
  name: string;
  /** Brief description */
  description?: string;
  /** Primary UX group for panel organization */
  group?: PreferenceGroup;
  /** Fields declared by this unit */
  fields: PreferenceField[];
  /** Which scopes this unit supports (subset of SCOPE_PRECEDENCE) */
  supportedScopes: PreferenceScope[];
  /** Optional: custom panel component ID for overriding the generic renderer */
  customPanelId?: string;
}

/** @deprecated Use PreferenceUnit instead */
export type ManageableUnit = PreferenceUnit;

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
