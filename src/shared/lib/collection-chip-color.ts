/**
 * collection-chip-color — Helper único transversal para derivar los tokens
 * visuales (texto, borde, fondo, hashtag) de un chip de colección a partir
 * del color elegido por el usuario.
 *
 * Garantiza contraste mínimo legible sobre fondo claro: si el color guardado
 * es muy claro (blanco, beige, amarillo pálido…) se oscurece preservando
 * matiz/saturación. Si es gris/inválido/null se mapea a un gris neutro.
 *
 * Se usa en TODOS los renders de chips de colección
 * (popup del mapa, GalleryView, listas, admin, editor de apariencia).
 */

export interface CollectionChipColors {
  /** Color del texto y del símbolo "#" (con contraste garantizado). */
  text: string;
  /** Color del borde (con opacidad). */
  border: string;
  /** Color de fondo (con opacidad). */
  background: string;
  /** Alias de text — útil para semántica al pintar el "#". */
  hashtag: string;
}

/** Gris neutro de fallback (slate-500 aprox.). */
const FALLBACK_HEX = '#6b7280';

/** Umbral de luminosidad: por encima se considera "demasiado claro". */
const MAX_L = 60;
/** Umbral mínimo de saturación para mantener el matiz. */
const MIN_S = 8;
/** Luminosidad objetivo cuando hay que oscurecer. */
const TARGET_L = 42;

interface RGB { r: number; g: number; b: number; }
interface HSL { h: number; s: number; l: number; }

function parseHex(input: string): RGB | null {
  let hex = input.trim().replace(/^#/, '');
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  if (hex.length !== 6) return null;
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

function rgbToHsl({ r, g, b }: RGB): HSL {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn: h = ((gn - bn) / d + (gn < bn ? 6 : 0)); break;
      case gn: h = ((bn - rn) / d + 2); break;
      case bn: h = ((rn - gn) / d + 4); break;
    }
    h *= 60;
  }
  return { h, s: s * 100, l: l * 100 };
}

function hslToCss({ h, s, l }: HSL, alpha?: number): string {
  const hh = Math.round(h);
  const ss = Math.round(Math.min(100, Math.max(0, s)));
  const ll = Math.round(Math.min(100, Math.max(0, l)));
  if (typeof alpha === 'number') {
    return `hsla(${hh}, ${ss}%, ${ll}%, ${alpha})`;
  }
  return `hsl(${hh}, ${ss}%, ${ll}%)`;
}

/**
 * Devuelve los 4 tokens visuales para un chip de colección.
 * Punto de entrada único — no calcular colores de chip inline en componentes.
 */
export function getCollectionChipColors(rawColor: string | null | undefined): CollectionChipColors {
  const input = (rawColor ?? '').trim();
  const rgb = parseHex(input) ?? parseHex(FALLBACK_HEX)!;
  let hsl = rgbToHsl(rgb);

  // Grises (saturación muy baja) → fallback neutro legible.
  if (hsl.s < MIN_S) {
    hsl = rgbToHsl(parseHex(FALLBACK_HEX)!);
  }

  // Si el color es demasiado claro sobre fondo blanco, oscurecer
  // preservando matiz y saturación.
  if (hsl.l > MAX_L) {
    hsl = { ...hsl, l: TARGET_L };
  }

  // Si quedó casi negro (raro), elevar un poco.
  if (hsl.l < 18) {
    hsl = { ...hsl, l: 22 };
  }

  const text = hslToCss(hsl);
  const border = hslToCss(hsl, 0.4);
  const background = hslToCss(hsl, 0.1);

  return { text, border, background, hashtag: text };
}
