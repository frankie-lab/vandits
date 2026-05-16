/**
 * P-POPUP-4A — source metadata line contract tests.
 *
 * Pilot scope: rama A enriched, tipos `source` y `app`.
 *  - `buildSourceMetadataLineHtml` emite línea `Añadido dd/mm/yyyy · vía …`
 *    para `source` y `app`, '' para `own` / `followed`.
 *  - Cada chip preserva `.source-filter-chip` + datasets canónicos
 *    (`data-source-type` / `data-source-id` / `data-source-label`).
 *  - `prettifySourceId` formatea CamelCase, snake_case, acrónimos cortos.
 *  - `isPopupSourceMetadataV1On()` defaultea a true y respeta el kill-switch
 *    runtime global `window.__POPUP_SOURCE_METADATA_V1__ = false`.
 *  - Guardrail estático: la rama A despacha por tipo (own → 3A, source/app →
 *    4A, resto → legacy). Rama B sigue intacta.
 *
 * Out of scope: own (P-POPUP-3A), followed (P-POPUP-3B/4C), cards React,
 * rama B fallback, SourceFilterBridge, subset-fit, lifecycle, taxonomy.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { GeoLocation } from '@/types/location';
import { clearPoiSourceCache } from '@/domains/content/lib/poi-source';
import {
  buildSourceMetadataLineHtml,
  buildOwnEnrichedMetadataLineHtml,
  prettifySourceId,
  isPopupSourceMetadataV1On,
} from '@/components/map/map-popups';

const VIEWER = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';

function poi(extra: Record<string, unknown> = {}): GeoLocation {
  return {
    id: 'p1',
    name: 'p1',
    coordinates: { lat: 0, lng: 0 },
    createdAt: new Date('2026-05-03T10:00:00Z'),
    updatedAt: new Date('2026-05-03T10:00:00Z'),
    ...extra,
  } as unknown as GeoLocation;
}

beforeEach(() => clearPoiSourceCache());
afterEach(() => {
  try { delete (globalThis as any).window?.__POPUP_SOURCE_METADATA_V1__; } catch { /* noop */ }
});

describe('P-POPUP-4A — prettifySourceId', () => {
  it('CamelCase → palabras separadas', () => {
    expect(prettifySourceId('AtlasObscura')).toBe('Atlas Obscura');
  });
  it('snake_case → segmentos separados por " · "', () => {
    expect(prettifySourceId('AtlasObscura_España')).toBe('Atlas Obscura · España');
  });
  it('hyphen-case → espacios', () => {
    expect(prettifySourceId('vandits-app')).toBe('Vandits App');
  });
  it('acrónimo corto all-lowercase → uppercase', () => {
    expect(prettifySourceId('osm')).toBe('OSM');
  });
  it('null/empty → cadena vacía', () => {
    expect(prettifySourceId(null)).toBe('');
    expect(prettifySourceId('')).toBe('');
    expect(prettifySourceId(undefined)).toBe('');
  });
  it('palabras normales conservan capitalización inicial', () => {
    expect(prettifySourceId('tripadvisor')).toBe('Tripadvisor');
  });
});

describe('P-POPUP-4A — buildSourceMetadataLineHtml: scope', () => {
  it('source: emite línea metadata con fecha + chip clicable', () => {
    const html = buildSourceMetadataLineHtml(
      poi({ sourceKind: 'external', sourceId: 'AtlasObscura_España' }),
      { isOwn: false, viewerUid: VIEWER },
    );
    expect(html).toContain('data-popup-source-metadata="p1"');
    expect(html).toContain('data-source-metadata-type="source"');
    expect(html).toMatch(/Añadido 03\/05\/2026/);
    expect(html).toContain('vía');
    expect(html).toContain('Atlas Obscura · España');
    expect(html).toContain('source-filter-chip');
    expect(html).toContain('data-source-type="source"');
    expect(html).toContain('data-source-id="AtlasObscura_España"');
    expect(html).toContain('data-source-label="Atlas Obscura · España"');
  });

  it('app con groupId: emite dos chips clicables separados por " · "', () => {
    const html = buildSourceMetadataLineHtml(
      poi({ sourceKind: 'app', sourceId: 'vandits-app', groupId: 'playas' }),
      { isOwn: false, viewerUid: VIEWER },
    );
    expect(html).toContain('data-source-metadata-type="app"');
    expect(html).toContain('data-source-id="vandits-app"');
    expect(html).toContain('data-source-id="playas"');
    // Dos `.source-filter-chip` (paridad funcional con legacy).
    const chipCount = (html.match(/source-filter-chip/g) ?? []).length;
    expect(chipCount).toBe(2);
  });

  it('own → cadena vacía (lo gestiona P-POPUP-3A)', () => {
    const html = buildSourceMetadataLineHtml(
      poi({ ownerUserId: VIEWER }),
      { isOwn: true, viewerUid: VIEWER },
    );
    expect(html).toBe('');
  });

  it('followed → cadena vacía (out of scope 4A)', () => {
    const html = buildSourceMetadataLineHtml(
      poi({ ownerUserId: OTHER }),
      { isOwn: false, viewerUid: VIEWER },
    );
    expect(html).toBe('');
  });

  it('source sin createdAt: emite solo "vía <chip>" sin fecha', () => {
    const html = buildSourceMetadataLineHtml(
      poi({ sourceKind: 'external', sourceId: 'osm', createdAt: null }),
      { isOwn: false, viewerUid: VIEWER },
    );
    expect(html).not.toMatch(/Añadido/);
    expect(html).toContain('vía');
    expect(html).toContain('OSM');
  });

  it('NO usa estilo hashtag `#` (debe parecer metadata, no taxonomy)', () => {
    const html = buildSourceMetadataLineHtml(
      poi({ sourceKind: 'external', sourceId: 'AtlasObscura_España' }),
      { isOwn: false, viewerUid: VIEWER },
    );
    expect(html).not.toContain('#Atlas');
    expect(html).not.toContain('#AtlasObscura');
  });

  it('usa token muted-foreground (sin hex hardcoded)', () => {
    const html = buildSourceMetadataLineHtml(
      poi({ sourceKind: 'external', sourceId: 'osm' }),
      { isOwn: false, viewerUid: VIEWER },
    );
    expect(html).toContain('hsl(var(--muted-foreground))');
    expect(html).not.toMatch(/color:\s*#[0-9a-fA-F]{3,6}/);
  });

  it('flag OFF → cadena vacía (rollback runtime)', () => {
    (globalThis as any).window = (globalThis as any).window ?? {};
    (globalThis as any).window.__POPUP_SOURCE_METADATA_V1__ = false;
    const html = buildSourceMetadataLineHtml(
      poi({ sourceKind: 'external', sourceId: 'osm' }),
      { isOwn: false, viewerUid: VIEWER },
    );
    expect(html).toBe('');
  });
});

describe('P-POPUP-4A — flag', () => {
  it('default = true (rollout global conforme rollout-policy.md)', () => {
    try { delete (globalThis as any).window?.__POPUP_SOURCE_METADATA_V1__; } catch { /* noop */ }
    expect(isPopupSourceMetadataV1On()).toBe(true);
  });
  it('kill-switch runtime global: window.__POPUP_SOURCE_METADATA_V1__ = false', () => {
    (globalThis as any).window = (globalThis as any).window ?? {};
    (globalThis as any).window.__POPUP_SOURCE_METADATA_V1__ = false;
    expect(isPopupSourceMetadataV1On()).toBe(false);
  });
});

describe('P-POPUP-4A — static guard (rama A despacho)', () => {
  const SRC = resolve(__dirname, '../components/map/map-popups.ts');
  const src = readFileSync(SRC, 'utf8');

  it('rama A dispatch usa buildSourceMetadataLineHtml para source/app', () => {
    expect(src).toContain('buildSourceMetadataLineHtml(location, ownership)');
    expect(src).toMatch(/src\.type === 'source' \|\| src\.type === 'app'/);
  });

  it('rama A conserva fallback a buildSourceHashtagsBlock (rollback)', () => {
    expect(src).toContain("buildSourceHashtagsBlock(location, ownership, { suppressOwn: false })");
  });

  it('rama A conserva P-POPUP-3A own branch (buildOwnAddedLineHtml)', () => {
    expect(src).toContain('buildOwnAddedLineHtml(location)');
    expect(src).toMatch(/isOwn && isPopupOwnershipStripV1On\(\)/);
  });

  it('rama B (fallback no-enriched) sigue llamando buildSourceHashtagsBlock sin gating', () => {
    // Rama B en L≈1300+: una sola llamada sin opts (sin suppressOwn, sin metadata gating).
    expect(src).toMatch(/buildSourceHashtagsBlock\(location, ownership\)/);
  });

  it('flag exporta isPopupSourceMetadataV1On (testabilidad)', () => {
    expect(src).toMatch(/export function isPopupSourceMetadataV1On/);
  });
});
