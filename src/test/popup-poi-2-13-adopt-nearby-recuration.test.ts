/**
 * P-POI-CURATION-2.13 — Adopción nearby + re-curación canónica.
 *
 * Contrato verificado:
 *  1. Para source=osm/followed, "Usar como este punto" hace UPDATE que
 *     resetea enriched_data + enrichment_status='pending'.
 *  2. Llama `enrichmentFailureStore.invalidate(id)` antes de re-curar.
 *  3. Llama `setNearbyPopupContextId(null)` (popup deja de ser vista vecino).
 *  4. Invoca `advancePoiCurationUntilBlocked(id, 'validate-geo', popupId)`.
 *  5. NO llama `onClose()` ni `clearMapMarkers()` durante el flujo.
 *  6. Para source=own sigue siendo merge + onClose (sin re-curación).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = readFileSync(
  resolve(__dirname, '../domains/content/components/PointContextActions.tsx'),
  'utf8',
);

describe('P-POI-CURATION-2.13 — adopt nearby re-curation', () => {
  it('resetea enriched_data y enrichment_status=pending en UPDATE para osm/followed', () => {
    // Asegura que el UPDATE de promoción de identidad incluye el reset.
    const updateBlock = src.match(
      /\.update\(\{[\s\S]*?enriched_data: null[\s\S]*?enrichment_status: 'pending'[\s\S]*?\}\)/,
    );
    expect(updateBlock, 'UPDATE de identidad debe resetear enriched_data y status').not.toBeNull();
  });

  it('invalida enrichmentFailureStore antes de re-curar', () => {
    expect(src).toMatch(/enrichmentFailureStore\.invalidate\(location\.id\)/);
  });

  it('limpia el contexto de popup vecino tras adoptar', () => {
    expect(src).toMatch(/setNearbyPopupContextId\(null\)/);
  });

  it('relanza el pipeline de curación reutilizando advancePoiCurationUntilBlocked', () => {
    expect(src).toMatch(/advancePoiCurationUntilBlocked\(\s*location\.id,\s*'validate-geo',\s*popupId\s*\)/);
  });

  it('osm y followed convergen en el mismo flujo (sin rama exclusiva osm)', () => {
    // Anti-regresión: el caso "if (nearbyPoint.source === 'osm')" del legacy
    // que disparaba triggerEnrichLocation fire-and-forget no debe reaparecer.
    expect(src).not.toMatch(/source === 'osm'\)\s*\{[\s\S]{0,200}triggerEnrichLocation\(location\.id\)\.catch/);
  });

  it('NO cierra el popup durante la re-curación osm/followed', () => {
    // El bloque osm/followed debe terminar con setReplacingPoint(false) en
    // finally, sin onClose() ni clearMapMarkers(). Aislamos el bloque entre
    // "── osm / followed" y el catch externo.
    const block = src.match(/── osm \/ followed[\s\S]*?setReplacingPoint\(false\);\s*\}\s*\};/);
    expect(block, 'bloque osm/followed presente').not.toBeNull();
    expect(block![0]).not.toMatch(/onClose\(\)/);
    expect(block![0]).not.toMatch(/clearMapMarkers\(\)/);
  });

  it('mantiene el merge clásico para source=own (con onClose)', () => {
    const ownBranch = src.match(/if \(nearbyPoint\.source === 'own'\) \{[\s\S]*?return;\s*\}/);
    expect(ownBranch, 'rama own presente').not.toBeNull();
    expect(ownBranch![0]).toMatch(/onClose\(\)/);
    expect(ownBranch![0]).toMatch(/clearMapMarkers\(\)/);
  });

  it('limpia el overlay operacional en el finally del pipeline', () => {
    expect(src).toMatch(/clearPopupOperationalState\(popupId\)/);
  });
});
