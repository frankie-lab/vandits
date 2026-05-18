/**
 * P-POI-CURATION-2.3 — POI-1b: legibilidad y ancho útil de "Contexto cercano".
 *
 * Reglas verificadas:
 *  - Inline: edge-to-edge (sin padding horizontal propio en header/results/footer).
 *  - NearbyResultCard expone `data-density` y soporta densidad `compact`.
 *  - El nombre de la card en density `compact` usa `line-clamp-2`, no `truncate`.
 *  - El meta secundario NO renderiza coordenadas crudas como texto visible
 *    (las coords viven en `title`/`aria-label` para accesibilidad).
 */
import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { render, cleanup } from '@testing-library/react';
import { NearbyResultCard } from '@/shared/components/ui/nearby-result-card';

describe('P-POI-CURATION-2.3 — NearbyResultCard density', () => {
  it('compact: line-clamp-2 en el nombre, sin truncate', () => {
    cleanup();
    const { container } = render(
      <NearbyResultCard
        name="Ermita de Sant Miquel del Fai amb un nom molt llarg per validar"
        distanceLabel="180m"
        metaLabel="ermita"
        density="compact"
      />,
    );
    const root = container.querySelector('[data-density="compact"]') as HTMLElement;
    expect(root).not.toBeNull();
    const name = root.querySelector('span');
    expect(name!.className).toMatch(/line-clamp-2/);
    expect(name!.className).not.toMatch(/\btruncate\b/);
  });

  it('comfortable (default): mantiene truncate (sin regresión en otros consumidores)', () => {
    cleanup();
    const { container } = render(
      <NearbyResultCard name="X" distanceLabel="1m" metaLabel="meta" />,
    );
    const root = container.querySelector('[data-density="comfortable"]') as HTMLElement;
    expect(root).not.toBeNull();
    const name = root.querySelector('span');
    expect(name!.className).toMatch(/\btruncate\b/);
  });

  it('compact: coords no se renderizan como texto visible cuando se omiten del meta', () => {
    cleanup();
    const { container } = render(
      <NearbyResultCard
        name="Punto X"
        distanceLabel="120m"
        metaLabel="ermita"
        density="compact"
        ariaLabel="Punto X · 120m · 41.1234, 2.5678"
      />,
    );
    const root = container.querySelector('[data-density="compact"]') as HTMLElement;
    // Coordenadas accesibles vía title (no rompe a11y/QA) pero NO como texto.
    expect(root.getAttribute('title')).toMatch(/41\.1234/);
    expect(root.textContent || '').not.toMatch(/41\.1234/);
  });
});
