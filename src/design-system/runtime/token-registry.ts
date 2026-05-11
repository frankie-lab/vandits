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
  /** CSS variable name (without `--`). undefined → token is not directly editable as a var. */
  cssVar?: string;
  /** light/dark selector for color tokens. null for everything else. */
  mode: 'light' | 'dark' | null;
  /** Factory value (immutable). */
  baseValue: string | number;
  type: TokenType;
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

function isLeaf(n: unknown): n is { value: string | number; _css?: string } {
  return !!n && typeof n === 'object' && 'value' in (n as Record<string, unknown>);
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

function walk(group: string, data: unknown, path: string[], out: TokenLeaf[]) {
  if (!data || typeof data !== 'object') return;
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    if (k.startsWith('$')) continue;
    const next = [...path, k];
    if (isLeaf(v)) {
      const mode: 'light' | 'dark' | null =
        group === 'color' && (next[1] === 'light' || next[1] === 'dark')
          ? (next[1] as 'light' | 'dark')
          : null;
      out.push({
        path: next.join('.'),
        groupId: group,
        cssVar: v._css,
        mode,
        baseValue: v.value,
        type: inferType(next, v.value),
      });
    } else if (v && typeof v === 'object') {
      walk(group, v, next, out);
    }
  }
}

const LEAVES: TokenLeaf[] = (() => {
  const acc: TokenLeaf[] = [];
  for (const [group, data] of Object.entries(SOURCES)) walk(group, data, [group], acc);
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
