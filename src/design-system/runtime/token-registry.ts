/**
 * Single source of truth for every token leaf in the design system.
 *
 * Reads all token JSONs at module load and builds an indexed registry keyed
 * by dotted path (e.g. `color.light.primary`, `density.controlHeight.lg`).
 *
 * For each leaf we know:
 *   - cssVar       → the CSS variable name to write
 *   - mode         → 'light' | 'dark' | null (color tokens only)
 *   - baseValue    → original (factory) value
 *   - type         → editor type for the UI (color | number | easing | …)
 */
import colorTokens from '@/design-system/tokens/source/color.json';
import typographyTokens from '@/design-system/tokens/source/typography.json';
import densityTokens from '@/design-system/tokens/source/density.json';
import motionTokens from '@/design-system/tokens/source/motion.json';
import radiusTokens from '@/design-system/tokens/source/radius.json';
import zindexTokens from '@/design-system/tokens/source/z-index.json';
import popupTokens from '@/design-system/tokens/source/popup.json';
import mapTokens from '@/design-system/tokens/source/map.json';
import poiTokens from '@/design-system/tokens/source/poi.json';
import elevationTokens from '@/design-system/tokens/source/elevation.json';

export type TokenType =
  | 'color'
  | 'fontFamily'
  | 'number'
  | 'easing'
  | 'shadow'
  | 'text';

export interface TokenLeaf {
  /** Dotted path (storage key). */
  path: string;
  /** Logical group id (matches sidebar). */
  groupId: string;
  /** Primary CSS variable (first entry of `_css`). undefined → not directly editable as a var. */
  cssVar?: string;
  /** Full list of CSS variables this token drives (a single semantic token can power multiple legacy vars). */
  cssVars: string[];
  /** light/dark selector for color tokens. null for everything else. */
  mode: 'light' | 'dark' | null;
  /** Factory value (immutable, fully resolved through $ref chain). */
  baseValue: string | number;
  type: TokenType;
  /** If this leaf is a $ref alias, the target dotted path. */
  refPath?: string;
  /** Original (unresolved) value or {$ref} as stored in JSON. */
  rawRef?: string;
  /** Primitive = no _css var and no $ref (palette base). */
  isPrimitive: boolean;
}

const SOURCES: Record<string, unknown> = {
  color: colorTokens,
  typography: typographyTokens,
  density: densityTokens,
  motion: motionTokens,
  radius: radiusTokens,
  'z-index': zindexTokens,
  popup: popupTokens,
  map: mapTokens,
  poi: poiTokens,
  elevation: elevationTokens,
};

type Raw = { value?: string | number; $ref?: string; _css?: string };

function isLeaf(n: unknown): n is Raw {
  return !!n && typeof n === 'object' && ('value' in (n as Raw) || '$ref' in (n as Raw));
}

function getByPath(root: unknown, dotted: string): unknown {
  return dotted.split('.').reduce<unknown>(
    (acc, k) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[k] : undefined),
    root,
  );
}

/** Resolve a leaf's value following $ref chains. Mirrors build-tokens.cjs. */
function resolveValue(leaf: Raw, root: unknown, seen = new Set<string>()): string | number | undefined {
  if (leaf.value !== undefined) return leaf.value;
  if (leaf.$ref) {
    if (seen.has(leaf.$ref)) return undefined;
    seen.add(leaf.$ref);
    const target = getByPath(root, leaf.$ref);
    if (isLeaf(target)) return resolveValue(target, root, seen);
  }
  return undefined;
}

function inferType(path: string[], value: string | number): TokenType {
  const dotted = path.join('.');
  const v = String(value).trim();
  if (path[0] === 'color') return 'color';
  if (/^#[0-9a-fA-F]{3,8}$/.test(v)) return 'color';
  if (dotted.includes('fontFamily')) return 'fontFamily';
  if (dotted.includes('motion.easing') || /^cubic-bezier\(/.test(v)) return 'easing';
  if (dotted.toLowerCase().includes('shadow') && /[a-z]/.test(v)) return 'shadow';
  if (/^-?\d+(\.\d+)?(px|rem|em|ms|s|%)?$/.test(v)) return 'number';
  if (typeof value === 'number') return 'number';
  return 'text';
}

function walk(group: string, data: unknown, path: string[], out: TokenLeaf[], root: unknown) {
  if (!data || typeof data !== 'object') return;
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    if (k.startsWith('$')) continue;
    const next = [...path, k];
    if (isLeaf(v)) {
      // Mode is based on whether the path traverses light/dark, anywhere in
      // the chain (handles `color.light.X` and `color.primitives.light.…`).
      const mode: 'light' | 'dark' | null =
        next.includes('light') ? 'light' : next.includes('dark') ? 'dark' : null;
      const value = resolveValue(v, root) ?? '';
      out.push({
        path: next.join('.'),
        groupId: group,
        cssVar: v._css,
        mode: group === 'color' ? mode : null,
        baseValue: value,
        type: inferType(next, value),
        refPath: v.$ref,
        rawRef: v.$ref,
        isPrimitive: !v._css && !v.$ref,
      });
    } else if (v && typeof v === 'object') {
      walk(group, v, next, out, root);
    }
  }
}

const LEAVES: TokenLeaf[] = (() => {
  const acc: TokenLeaf[] = [];
  for (const [group, data] of Object.entries(SOURCES)) walk(group, data, [group], acc, data);
  return acc;
})();

const BY_PATH = new Map(LEAVES.map((l) => [l.path, l]));

export function getAllLeaves(): TokenLeaf[] {
  return LEAVES;
}

export function getLeaf(path: string): TokenLeaf | undefined {
  return BY_PATH.get(path);
}

export function getBaseValue(path: string): string | number | undefined {
  return BY_PATH.get(path)?.baseValue;
}

/** Leaves that reference `primitivePath` directly via $ref. */
export function getAliasesOf(primitivePath: string): TokenLeaf[] {
  return LEAVES.filter((l) => l.refPath === primitivePath);
}
