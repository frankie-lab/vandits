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
  value: string | number;
  cssVar?: string;
}

export type PairedRow =
  | {
      kind: 'single';
      glossaryKey: string;
      label?: string; // override opcional
      tokens: LeafToken[]; // 1+ alias con el mismo valor
      value: string | number;
      cssVar?: string;
    }
  | {
      kind: 'lightDark';
      glossaryKey: string;
      light: LeafToken;
      dark?: LeafToken;
    };

function isLeaf(node: unknown): node is { value: string | number; _css?: string } {
  return !!node && typeof node === 'object' && 'value' in (node as Record<string, unknown>);
}

/**
 * Devuelve la clave "humana" del glosario.
 * Color JSON usa `color.light.X` / `color.dark.X` → colapsamos a `color.X`.
 */
function toGlossaryKey(path: string[]): string {
  if (path[0] === 'color' && (path[1] === 'light' || path[1] === 'dark')) {
    return ['color', ...path.slice(2)].join('.');
  }
  return path.join('.');
}

export function flattenTokens(data: unknown, path: string[] = []): LeafToken[] {
  if (!data || typeof data !== 'object') return [];
  const out: LeafToken[] = [];
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    if (k.startsWith('$')) continue;
    const next = [...path, k];
    if (isLeaf(v)) {
      out.push({
        path: next,
        glossaryKey: toGlossaryKey(next),
        value: v.value,
        cssVar: v._css,
      });
    } else if (v && typeof v === 'object') {
      out.push(...flattenTokens(v, next));
    }
  }
  return out;
}

/** Agrupa light/dark de color en una sola fila. Solo aplica al JSON `color`. */
export function pairLightDark(leaves: LeafToken[]): PairedRow[] {
  const lightByKey = new Map<string, LeafToken>();
  const darkByKey = new Map<string, LeafToken>();
  const passthrough: LeafToken[] = [];

  for (const leaf of leaves) {
    if (leaf.path[0] === 'color' && leaf.path[1] === 'light') {
      lightByKey.set(leaf.glossaryKey, leaf);
    } else if (leaf.path[0] === 'color' && leaf.path[1] === 'dark') {
      darkByKey.set(leaf.glossaryKey, leaf);
    } else {
      passthrough.push(leaf);
    }
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
export function buildRows(data: unknown, opts: { dedupe?: boolean } = {}): PairedRow[] {
  const leaves = flattenTokens(data);
  const paired = pairLightDark(leaves);
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
