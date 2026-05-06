/**
 * color-contrast — Helpers transversales para elegir foreground legible
 * sobre un fondo de color arbitrario (collection.color, tags, etc.).
 *
 * Usa luminancia relativa (WCAG 2.x).
 */

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  if (!hex) return null;
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6) return null;
  const num = parseInt(h, 16);
  if (Number.isNaN(num)) return null;
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

/** Devuelve un color de texto/icono legible sobre `bg`. */
export function getReadableForeground(bg: string): string {
  return relativeLuminance(bg) > 0.6 ? '#1f2937' : '#ffffff';
}

/** True si el color es claro (necesita borde para distinguirse de fondos blancos). */
export function isLightColor(bg: string): boolean {
  return relativeLuminance(bg) > 0.85;
}
