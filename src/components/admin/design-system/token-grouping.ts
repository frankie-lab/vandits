/**
 * Token grouping helpers — transforman el JSON fuente en filas listas para renderizar.
 *
 *  - flattenTokens   : recorre el árbol y devuelve hojas { path, value, cssVar }.
 *  - pairLightDark   : empareja `color.light.X` + `color.dark.X` en una sola fila bicolor.
 *  - dedupeByValue   : agrupa filas con el mismo HSL/hex en una fila "alias".
 */

export interface LeafToken {
  /** Ruta completa en el JSON, sin metadatos. Ej.: ['color','light','primary'] */
  path: string[];
  /** Ruta canónica para mirar el glosario (sin light/dark). Ej.: 'color.primary' */
  glossaryKey: string;
  /** Valor final, ya resuelto a través de la cadena $ref. */
  value: string | number;
  cssVar?: string;
  /** Si el token es un alias, ruta dotted al primitivo que referencia. */
  refPath?: string;
  /** Primitivo = sin _css y sin $ref. Base de la paleta cruda. */
  isPrimitive: boolean;
}

export type PairedRow =
  | {
      kind: 'single';
      glossaryKey: string;
      label?: string;
      tokens: LeafToken[];
      value: string | number;
      cssVar?: string;
      refPath?: string;
      isPrimitive: boolean;
    }
  | {
      kind: 'lightDark';
      glossaryKey: string;
      light: LeafToken;
      dark?: LeafToken;
    };

type RawLeaf = { value?: string | number; $ref?: string; _css?: string };

function isLeaf(node: unknown): node is RawLeaf {
  return !!node && typeof node === 'object' && ('value' in (node as RawLeaf) || '$ref' in (node as RawLeaf));
}

function getByPath(root: unknown, dotted: string): unknown {
  return dotted.split('.').reduce<unknown>(
    (acc, k) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[k] : undefined),
    root,
  );
}

function resolveValue(leaf: RawLeaf, root: unknown, seen = new Set<string>()): string | number | undefined {
  if (leaf.value !== undefined) return leaf.value;
  if (leaf.$ref) {
    if (seen.has(leaf.$ref)) return undefined;
    seen.add(leaf.$ref);
    const target = getByPath(root, leaf.$ref);
    if (isLeaf(target)) return resolveValue(target, root, seen);
  }
  return undefined;
}

/**
 * Devuelve la clave "humana" del glosario.
 * Color JSON usa `color.light.X` / `color.dark.X` → colapsamos a `color.X`.
 * Para primitivos `color.primitives.light.neutral.0` colapsamos a `color.primitives.neutral.0`.
 */
function toGlossaryKey(path: string[]): string {
  if (path[0] === 'color' && path[1] === 'primitives' && (path[2] === 'light' || path[2] === 'dark')) {
    return ['color', 'primitives', ...path.slice(3)].join('.');
  }
  if (path[0] === 'color' && (path[1] === 'light' || path[1] === 'dark')) {
    return ['color', ...path.slice(2)].join('.');
  }
  return path.join('.');
}

export function flattenTokens(data: unknown, path: string[] = [], root: unknown = data): LeafToken[] {
  if (!data || typeof data !== 'object') return [];
  const out: LeafToken[] = [];
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    if (k.startsWith('$')) continue;
    const next = [...path, k];
    if (isLeaf(v)) {
      out.push({
        path: next,
        glossaryKey: toGlossaryKey(next),
        value: resolveValue(v, root) ?? '',
        cssVar: v._css,
        refPath: v.$ref,
        isPrimitive: !v._css && !v.$ref,
      });
    } else if (v && typeof v === 'object') {
      out.push(...flattenTokens(v, next, root));
    }
  }
  return out;
}

/** Empareja light/dark de color/semánticos y de primitivos. */
export function pairLightDark(leaves: LeafToken[]): PairedRow[] {
  const lightByKey = new Map<string, LeafToken>();
  const darkByKey = new Map<string, LeafToken>();
  const passthrough: LeafToken[] = [];

  for (const leaf of leaves) {
    const p = leaf.path;
    const isSemanticLight = p[0] === 'color' && p[1] === 'light';
    const isSemanticDark = p[0] === 'color' && p[1] === 'dark';
    const isPrimitiveLight = p[0] === 'color' && p[1] === 'primitives' && p[2] === 'light';
    const isPrimitiveDark = p[0] === 'color' && p[1] === 'primitives' && p[2] === 'dark';
    if (isSemanticLight || isPrimitiveLight) lightByKey.set(leaf.glossaryKey, leaf);
    else if (isSemanticDark || isPrimitiveDark) darkByKey.set(leaf.glossaryKey, leaf);
    else passthrough.push(leaf);
  }

  const paired: PairedRow[] = [];
  for (const [key, light] of lightByKey) {
    paired.push({ kind: 'lightDark', glossaryKey: key, light, dark: darkByKey.get(key) });
  }
  for (const leaf of passthrough) {
    paired.push({
      kind: 'single',
      glossaryKey: leaf.glossaryKey,
      tokens: [leaf],
      value: leaf.value,
      cssVar: leaf.cssVar,
      refPath: leaf.refPath,
      isPrimitive: leaf.isPrimitive,
    });
  }
  return paired;
}

/**
 * Para filas `single` con el mismo valor, las fusiona en un único row con todos
 * los alias dentro. No fusiona filas `lightDark` (cada par es ya su propia entidad).
 */
export function dedupeByValue(rows: PairedRow[]): PairedRow[] {
  const byValue = new Map<string, PairedRow>();
  const out: PairedRow[] = [];

  for (const row of rows) {
    if (row.kind !== 'single') {
      out.push(row);
      continue;
    }
    const valueKey = String(row.value);
    const existing = byValue.get(valueKey);
    if (existing && existing.kind === 'single') {
      existing.tokens.push(...row.tokens);
    } else {
      const fresh: PairedRow = { ...row, tokens: [...row.tokens] };
      byValue.set(valueKey, fresh);
      out.push(fresh);
    }
  }
  return out;
}

/** Transforma un JSON fuente en filas finales listas para renderizar. */
export function buildRows(
  data: unknown,
  opts: { dedupe?: boolean; only?: 'primitives' | 'semantics' } = {},
): PairedRow[] {
  const leaves = flattenTokens(data);
  const filtered = opts.only
    ? leaves.filter((l) => (opts.only === 'primitives' ? l.isPrimitive : !l.isPrimitive))
    : leaves;
  const paired = pairLightDark(filtered);
  return opts.dedupe ? dedupeByValue(paired) : paired;
}

// ─── Reorganización de grupos del sidebar ───────────────────────────

export type GroupSection = 'essentials' | 'domain' | 'advanced';

export interface GroupMeta {
  id: string;
  label: string;
  section: GroupSection;
}

export const GROUP_SECTIONS: GroupMeta[] = [
  { id: 'color',      label: 'Color',           section: 'essentials' },
  { id: 'typography', label: 'Tipografía',      section: 'essentials' },
  { id: 'density',    label: 'Densidad',        section: 'essentials' },
  { id: 'radius',     label: 'Radius',          section: 'essentials' },
  { id: 'motion',     label: 'Motion',          section: 'essentials' },

  { id: 'poi',        label: 'POI (marcadores)', section: 'domain' },
  { id: 'popup',      label: 'Popup (fichas)',   section: 'domain' },
  { id: 'map',        label: 'Map (capas/zoom)', section: 'domain' },

  { id: 'z-index',    label: 'Z-index',         section: 'advanced' },
  { id: 'elevation',  label: 'Elevation',       section: 'advanced' },
];

export const SECTION_LABEL: Record<GroupSection, string> = {
  essentials: 'Esenciales',
  domain: 'Dominio',
  advanced: 'Avanzado',
};

// ─── Helpers de valor ──────────────────────────────────────────────

export function isHslTriplet(value: string): boolean {
  return /^\d+(\.\d+)?\s+\d+(\.\d+)?%\s+\d+(\.\d+)?%$/.test(value.trim());
}

export function isHex(value: string): boolean {
  return /^#[0-9a-f]{3,8}$/i.test(value.trim());
}

export function isColorValue(value: string | number): boolean {
  if (typeof value !== 'string') return false;
  return isHslTriplet(value) || isHex(value);
}

export function toCssColor(value: string): string {
  return isHslTriplet(value) ? `hsl(${value})` : value;
}

/** Convierte un triplete HSL a hex aproximado, útil para mostrar como referencia. */
export function hslTripletToHex(hsl: string): string | null {
  const m = hsl.trim().match(/^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%$/);
  if (!m) return null;
  const h = parseFloat(m[1]) / 360;
  const s = parseFloat(m[2]) / 100;
  const l = parseFloat(m[3]) / 100;

  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  const toHex = (x: number) =>
    Math.round(x * 255).toString(16).padStart(2, '0').toUpperCase();
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
