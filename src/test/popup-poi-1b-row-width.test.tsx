/**
 * P-POI-CURATION-2.5 — Compact row width regression.
 *
 * Garantiza que las filas de "Contexto cercano" (density="compact",
 * únicamente consumidas por la variante inline de POI-1b) mantienen el
 * padding lateral mínimo y el gap ajustado, sin regresar a `px-2`/`gap-2`
 * ni reintroducir layout encajonado.
 *
 * Alcance cerrado:
 *  - solo verifica clases del primitive `NearbyResultCard` en compact
 *  - no toca lógica de curación, niveles POI ni shell
 *  - `comfortable` debe permanecer intacto (no regresión para otros consumidores)
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { NearbyResultCard } from '@/shared/components/ui/nearby-result-card';

describe('P-POI-CURATION-2.5 — compact row width', () => {
  it('compact rows use px-1.5 + gap-1.5 (no px-2, no gap-2)', () => {
    const { container } = render(
      <NearbyResultCard
        name="Nombre muy largo de candidato que debería leerse holgado"
        distanceLabel="240m"
        metaLabel="museum"
        density="compact"
      />,
    );
    const row = container.querySelector('[data-density="compact"]') as HTMLElement;
    expect(row).toBeTruthy();
    const cls = row.className;
    expect(cls).toContain('px-1.5');
    expect(cls).toContain('gap-1.5');
    expect(cls).not.toMatch(/(^|\s)px-2(\s|$)/);
    expect(cls).not.toMatch(/(^|\s)gap-2(\s|$)/);
    // ritmo vertical intacto
    expect(cls).toContain('py-2');
  });

  it('comfortable rows keep original px-3 + gap-3 (no regresión)', () => {
    const { container } = render(
      <NearbyResultCard
        name="Otro candidato"
        distanceLabel="120m"
        density="comfortable"
      />,
    );
    const row = container.querySelector('[data-density="comfortable"]') as HTMLElement;
    expect(row).toBeTruthy();
    const cls = row.className;
    expect(cls).toContain('px-3');
    expect(cls).toContain('gap-3');
    expect(cls).not.toContain('px-1.5');
  });
});
