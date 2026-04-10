/**
 * Shared design tokens for enrichment card rendering.
 * Used by BOTH the Admin CardPreview (React/Tailwind) and
 * Map Popups (raw HTML/inline styles) to guarantee pixel-perfect parity.
 *
 * ─ Rules ─
 *  • CSS variable references (e.g. `hsl(var(--primary))`) are safe in inline
 *    HTML because index.css defines them on :root.
 *  • Tailwind utility equivalents are noted in comments for the React side.
 */

// ─── Typography ───────────────────────────────────────────────────────────────

export const CARD_FONT_FAMILY = "'Inter', system-ui, sans-serif";

/** Font sizes in px – use `text-[Npx]` on the React side */
export const FONT = {
  title: 16,          // text-base
  subtitle: 11,       // text-[11px]
  body: 11,           // text-[11px]
  label: 10,          // text-[10px]
  badge: 9,           // text-[9px]
  micro: 9,           // text-[9px]
  sectionHeader: 10,  // text-[10px]
  charCount: 9,       // text-[9px]
} as const;

// ─── Colors ───────────────────────────────────────────────────────────────────
// Inline-safe HSL strings for map popups; React side uses Tailwind tokens.

export const COLOR = {
  /** Primary text – tw: text-foreground */
  foreground: 'hsl(215, 25%, 15%)',
  /** Secondary / muted text – tw: text-muted-foreground */
  muted: 'hsl(215, 15%, 45%)',
  /** Body text at 90 % opacity – tw: text-foreground/90 */
  bodyText: 'hsl(215, 25%, 15%, 0.9)',
  /** Observation text at 80 % – tw: text-foreground/80 */
  obsText: 'hsl(215, 25%, 15%, 0.8)',

  /** CSS-var–based colours (resolved at runtime) */
  primary: 'hsl(var(--primary))',
  primaryFg: 'hsl(var(--primary-foreground))',
  secondary: 'hsl(var(--secondary))',
  secondaryFg: 'hsl(var(--secondary-foreground))',
  border: 'hsl(var(--border))',
  mutedBg: 'hsl(var(--muted) / 0.5)',
  mutedBg60: 'hsl(var(--muted) / 0.6)',
  primaryBgLight: 'hsl(var(--primary) / 0.05)',

  // Placeholder / empty-image
  placeholderBg: 'linear-gradient(135deg, #f3f4f6, #e5e7eb)',
  placeholderText: '#9ca3af',

  // Timestamp muted
  timestamp: '#9ca3af',
  timestampBorder: '#e5e7eb',
} as const;

// ─── Tag Palette ──────────────────────────────────────────────────────────────

export const TAG_COLORS = {
  geo: { bg: '#e0f2fe', text: '#0369a1', border: '#bae6fd', hoverBg: '#bae6fd' },        // tw: bg-sky-100 text-sky-700 border-sky-200
  classification: { bg: '#eef2ff', text: '#4338ca', border: '#c7d2fe', hoverBg: '#e0e7ff' }, // tw: bg-indigo-50 text-indigo-700 border-indigo-200
  thematic: { bg: '#faf5ff', text: '#7c3aed', border: '#e9d5ff', hoverBg: '#e9d5ff' },    // tw: bg-purple-50 text-purple-700 border-purple-200
} as const;

// ─── Spacing / Layout ─────────────────────────────────────────────────────────

export const CARD = {
  /** Min / max width of the popup container */
  minWidth: 300,
  maxWidth: 360,
  /** Content padding inside card body */
  bodyPadding: '16px 16px 8px 16px',
  /** Gap between sections */
  sectionGap: 12,
  /** Border-radius for section cards */
  sectionRadius: 8,
  /** Tag badge padding */
  tagPadding: '1px 8px',
  tagRadius: '9999px',
} as const;

// ─── Punto Destacado ──────────────────────────────────────────────────────────

export const HIGHLIGHT = {
  borderWidth: 2,
  borderColor: COLOR.primary,
  bgColor: COLOR.primaryBgLight,
  padding: '8px 12px',
  borderRadius: '0 6px 6px 0',
} as const;

// ─── Observación ──────────────────────────────────────────────────────────────

export const OBSERVATION = {
  bgColor: COLOR.mutedBg,
  padding: '8px 12px',
  borderRadius: '6px',
} as const;

// ─── Section Headers (Datos geográficos / Datos clave) ────────────────────────

export const SECTION_HEADER = {
  padding: '6px 12px',
  bgColor: COLOR.mutedBg60,
  fontSize: FONT.sectionHeader,
  fontWeight: 600,
  letterSpacing: '0.05em',
  textTransform: 'uppercase' as const,
  iconSize: 12,
} as const;

// ─── Geo Labels ───────────────────────────────────────────────────────────────

export const GEO_LABELS: Record<string, string> = {
  continente: 'Continente',
  pais: 'País',
  admin_nivel_1: 'Región',
  admin_nivel_2: 'Provincia',
  admin_nivel_3: 'Comarca',
  localidad: 'Localidad',
  sublocalidad: 'Sublocalidad',
  lugar_interes: 'Lugar de interés',
  direccion_postal: 'Dirección postal',
};

// ─── Key Data Labels ──────────────────────────────────────────────────────────

export const KEY_DATA_LABELS: Record<string, string> = {
  tipo: 'Tipo',
  dimension_principal: 'Dimensión',
  acceso: 'Acceso',
  estado_proteccion: 'Protección',
  coordenadas: 'Coordenadas',
  web_referencia: 'Web',
};

// ─── SVG Icon Paths (Lucide 24×24 viewBox) ────────────────────────────────────
// Shared between map-popups (raw SVG strings) and admin (reference / fallback).

export const SVG_PATHS = {
  // Section headers
  map: '<path d="m3 7 6-3 6 3 6-3v13l-6 3-6-3-6 3Z"/><path d="m9 4v13"/><path d="m15 7v13"/>',
  bookMarked: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20"/><path d="m9 9.5 2 2 4-4"/>',

  // Key data row icons
  landmark: '<path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/>',
  navigation: '<path d="M3 11l19-9-9 19-2-8-8-2z"/>',
  mapPin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',

  // Contact icons
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  dollarSign: '<line x1="12" y1="2" x2="12" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',

  // Enrichment / actions
  sparkles: '<path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
  fileText: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>',
} as const;

// ─── SVG Helper (for raw HTML contexts) ───────────────────────────────────────

export function svgIcon(
  pathKey: keyof typeof SVG_PATHS,
  opts?: { size?: number; color?: string; strokeWidth?: number; extraStyle?: string },
): string {
  const s = opts?.size ?? 12;
  const c = opts?.color ?? COLOR.muted;
  const sw = opts?.strokeWidth ?? 2;
  const extra = opts?.extraStyle ? ` style="${opts.extraStyle}"` : '';
  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"${extra}>${SVG_PATHS[pathKey]}</svg>`;
}

// ─── Inline Tag Builder (for map popups) ──────────────────────────────────────

export function inlineTagBadge(
  text: string,
  palette: keyof typeof TAG_COLORS,
  opts?: { filterType?: string; filterValue?: string },
): string {
  const c = TAG_COLORS[palette];
  const filterAttrs = opts?.filterType
    ? ` class="filter-link" data-filter-type="${opts.filterType}" data-filter-value="${opts.filterValue || text}"`
    : '';
  return `<span${filterAttrs} style="background: ${c.bg}; color: ${c.text}; padding: ${CARD.tagPadding}; border-radius: ${CARD.tagRadius}; font-size: ${FONT.badge}px; border: 1px solid ${c.border}; cursor: pointer; transition: background 0.15s; font-weight: 400;" onmouseover="this.style.background='${c.hoverBg}'" onmouseout="this.style.background='${c.bg}'">${text}</span>`;
}
