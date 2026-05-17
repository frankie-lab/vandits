/**
 * P-POPUP-15 — Golden POI popup contract.
 *
 * Convierte el POI dorado (fixture `golden-poi-popup.ts`) en la
 * REFERENCIA estructural canónica del renderer único `createPopupContent`.
 *
 * Invariantes:
 *   - El POI dorado renderiza el shell canónico completo (todos los markers
 *     `data-popup-*` presentes).
 *   - Un POI degradado (sin enriched, sin visited, sin rating) renderiza
 *     el MISMO shell, omitiendo sólo los slots sin datos. No existe un
 *     renderer legacy alternativo.
 *   - Ningún POI puede emitir UI legacy: `Ficha IA actualizada`,
 *     `+N campos más`, chips territoriales antiguos, gradient verde
 *     `#16a34a → #22c55e`, borde `#f0f0f0`, footer sin marker `v1`,
 *     ni barra/link colapsable "Valorar".
 *   - El bloque de ratings (P-POPUP-14.2) responde por estado:
 *       not-visited   → label `Pendiente`, gris, sin handlers.
 *       visited-empty → label `Pendiente de valoración`, verde, 5×set-rating.
 *       visited-rated → label `Tu valoración`, verde, ★ + clear-rating.
 *
 * Si este test falla, alguien reintrodujo una rama legacy del renderer o
 * rompió la degradación del shell canónico.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/domains/content/lib/nearby-popup-context', () => ({
  isNearbyPopupContext: () => false,
}));
vi.mock('@/domains/content/lib/personal-tags-filter', () => ({
  filterPersonalTags: (_id: string, tags: string[] | undefined) => tags ?? [],
}));

import { createPopupContent } from '@/components/map/map-popups';
import {
  GOLDEN_POI,
  GOLDEN_POI_DEGRADED,
  GOLDEN_POI_VISITED_UNRATED,
  GOLDEN_OWNERSHIP,
} from './fixtures/golden-poi-popup';

const goldenHtml = createPopupContent(GOLDEN_POI, 0, GOLDEN_OWNERSHIP, true);
const degradedHtml = createPopupContent(GOLDEN_POI_DEGRADED, 0, GOLDEN_OWNERSHIP, true);
const visitedUnratedHtml = createPopupContent(
  GOLDEN_POI_VISITED_UNRATED,
  0,
  GOLDEN_OWNERSHIP,
  true,
);

// ─── Markers canónicos del shell único ────────────────────────────────────
const CANON_MARKERS = [
  'data-popup-version="geo-canonical-v1"',
  'data-popup-geo-breadcrumb="1"',
  'data-popup-ratings-block="v1"',
  'data-popup-footer="v1"',
];

describe('P-POPUP-15 — Golden POI: shell canónico completo', () => {
  it('renderiza string HTML no vacío', () => {
    expect(typeof goldenHtml).toBe('string');
    expect(goldenHtml.length).toBeGreaterThan(500);
  });

  it('emite TODOS los markers canónicos del shell único', () => {
    for (const marker of CANON_MARKERS) {
      expect(goldenHtml).toContain(marker);
    }
  });

  it('emite el bloque ratings (Row 1 + Row 2 visited-rated)', () => {
    expect(goldenHtml).toContain('data-popup-ratings-block="v1"');
    expect(goldenHtml).toContain('Rating del POI');
    expect(goldenHtml).toContain('data-personal-rating-state="visited-rated"');
    expect(goldenHtml).toContain('>Tu valoración<');
    expect(goldenHtml).toContain('data-action="set-rating"');
    expect(goldenHtml).toContain('data-action="clear-rating"');
  });

  it('emite título canónico desde enriched.nombre_lugar', () => {
    expect(goldenHtml).toContain('Catedral de Santiago de Compostela');
  });

  it('emite descripción y entradilla (slots editoriales 1+5)', () => {
    expect(goldenHtml).toContain('Pórtico de la Gloria'); // punto_destacado
    expect(goldenHtml).toContain('románica iniciada en 1075'); // descripcion
  });

  it('emite breadcrumb territorial con underline persistente (P-POPUP-10.2)', () => {
    expect(goldenHtml).toContain('data-popup-geo-breadcrumb="1"');
    expect(goldenHtml).toMatch(/border-bottom:\s*1px solid hsl\(var\(--muted-foreground\)/);
  });

  it('emite footer persistente único', () => {
    const matches = goldenHtml.match(/data-popup-footer="v1"/g) ?? [];
    expect(matches.length).toBe(1);
  });
});

describe('P-POPUP-15 — Golden POI: NO UI legacy', () => {
  const allHtml = [goldenHtml, degradedHtml, visitedUnratedHtml];

  it('ningún POI emite "Ficha IA actualizada"', () => {
    for (const h of allHtml) expect(h).not.toContain('Ficha IA actualizada');
  });

  it('ningún POI emite contador legacy `+N campos más`', () => {
    for (const h of allHtml) expect(h).not.toMatch(/\d+\s+campos\s+más/);
  });

  it('ningún POI emite chips territoriales antiguos (#e0f2fe/#dcfce7/#f3e8ff)', () => {
    for (const h of allHtml) {
      expect(h).not.toMatch(/background:\s*#e0f2fe/);
      expect(h).not.toMatch(/background:\s*#dcfce7/);
      expect(h).not.toMatch(/background:\s*#f3e8ff/);
    }
  });

  it('ningún POI emite gradient verde legacy `#16a34a → #22c55e`', () => {
    for (const h of allHtml) {
      expect(h).not.toMatch(/linear-gradient\(135deg,\s*#16a34a,\s*#22c55e\)/);
    }
  });

  it('ningún POI emite borde gris legacy `border: 1px solid #f0f0f0`', () => {
    for (const h of allHtml) expect(h).not.toMatch(/border:\s*1px solid\s*#f0f0f0/);
  });

  it('ningún POI emite link/barra colapsable "Valorar"', () => {
    for (const h of allHtml) {
      expect(h).not.toContain('>Valorar<');
      expect(h).not.toMatch(/data-personal-rating-state="collapsed"/);
    }
  });

  it('ningún POI duplica el footer persistente', () => {
    for (const h of allHtml) {
      const matches = h.match(/data-popup-footer="v1"/g) ?? [];
      expect(matches.length).toBe(1);
    }
  });
});

describe('P-POPUP-15 — Degradación graciosa (mismo shell, sin datos)', () => {
  it('POI degradado conserva el shell canónico completo', () => {
    for (const marker of CANON_MARKERS) {
      // Excepción: breadcrumb territorial requiere al menos un chip geográfico.
      // El POI degradado no tiene jerarquía → breadcrumb se omite legítimamente.
      if (marker === 'data-popup-geo-breadcrumb="1"') continue;
      expect(degradedHtml).toContain(marker);
    }
  });

  it('POI degradado emite bloque ratings con Row 2 = not-visited (Pendiente, gris)', () => {
    expect(degradedHtml).toContain('data-popup-ratings-block="v1"');
    expect(degradedHtml).toContain('data-personal-rating-state="not-visited"');
    expect(degradedHtml).toContain('>Pendiente<');
    expect(degradedHtml).toContain('aria-disabled="true"');
    // No handlers de rating cuando no está visitado.
    expect(degradedHtml).not.toContain('data-action="set-rating"');
    expect(degradedHtml).not.toContain('data-action="clear-rating"');
  });

  it('POI degradado NO emite descripción ni entradilla (slots ausentes omitidos)', () => {
    expect(degradedHtml).not.toContain('Pórtico de la Gloria');
    expect(degradedHtml).not.toContain('románica iniciada en 1075');
  });

  it('POI degradado mantiene footer persistente único', () => {
    const matches = degradedHtml.match(/data-popup-footer="v1"/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it('POI visited-empty: label "Pendiente de valoración" + 5× set-rating', () => {
    expect(visitedUnratedHtml).toContain('data-personal-rating-state="visited-empty"');
    expect(visitedUnratedHtml).toContain('>Pendiente de valoración<');
    for (const star of [1, 2, 3, 4, 5]) {
      expect(visitedUnratedHtml).toContain(`data-rating="${star}"`);
    }
    expect(visitedUnratedHtml).not.toContain('data-action="clear-rating"');
  });
});

describe('P-POPUP-15 — Paridad de shell entre POI golden y degradado', () => {
  it('ambos POIs usan el MISMO marker `data-popup-version="geo-canonical-v1"`', () => {
    expect(goldenHtml).toContain('data-popup-version="geo-canonical-v1"');
    expect(degradedHtml).toContain('data-popup-version="geo-canonical-v1"');
  });

  it('ambos POIs llevan el bloque de ratings (el shell siempre lo incluye)', () => {
    expect(goldenHtml).toContain('data-popup-ratings-block="v1"');
    expect(degradedHtml).toContain('data-popup-ratings-block="v1"');
  });

  it('ambos POIs cierran con footer persistente `v1`', () => {
    expect(goldenHtml).toContain('data-popup-footer="v1"');
    expect(degradedHtml).toContain('data-popup-footer="v1"');
  });
});

// ─── P-POI-CURATION-1 — Renderer invariance frente a niveles de curación ──
describe('P-POI-CURATION-1 — los niveles de curación NO bifurcan el renderer', () => {
  const allHtml = [goldenHtml, degradedHtml, visitedUnratedHtml];

  it('ningún POI emite footer alternativo `v2+`', () => {
    for (const h of allHtml) {
      expect(h).not.toMatch(/data-popup-footer="v[2-9]"/);
    }
  });

  it('ningún POI introduce wrappers/variantes nuevas alrededor del shell', () => {
    for (const h of allHtml) {
      expect(h).not.toContain('data-popup-variant');
      expect(h).not.toContain('popup-v2-');
      expect(h).not.toMatch(/class="[^"]*legacy-popup[^"]*"/);
    }
  });

  it('todos los markers canónicos siguen presentes (shell único)', () => {
    // El golden tiene todos los markers; degraded omite breadcrumb por falta
    // de jerarquía (legítimo).
    for (const marker of CANON_MARKERS) {
      expect(goldenHtml).toContain(marker);
      expect(visitedUnratedHtml).toContain(marker);
    }
  });

  it('el único marker nuevo admisible es `data-curation-action` dentro del footer', () => {
    // El golden (POI-10, rated) NO emite botón principal: estado final.
    expect(goldenHtml).not.toContain('data-action="curation-primary"');
    // El visited-unrated (POI-9) sí emite el botón con la acción correcta.
    expect(visitedUnratedHtml).toContain('data-action="curation-primary"');
    expect(visitedUnratedHtml).toContain('data-curation-action="rate-experience"');
  });
});

