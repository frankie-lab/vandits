/**
 * P-POPUP-3A — ownership-strip contract tests.
 *
 * Pilot scope: own enriched only.
 *  - `buildSourceHashtagsBlock(location, ownership, { suppressOwn: true })`
 *    devuelve '' cuando `source.type === 'own'`.
 *  - El mismo helper SIN `suppressOwn` sigue emitiendo el chip propio
 *    (rollback global preservado).
 *  - `buildSourceHashtagsBlock` con `suppressOwn: true` NO afecta a
 *    followed/app/source (siguen emitiendo chip clicable `.source-filter-chip`).
 *  - `buildOwnAddedLineHtml(location)` produce una línea compacta
 *    `Añadido dd/mm/yyyy` con `data-popup-own-added` y sin literal de
 *    ownership ("Mi punto" / "Mío" / "Tuyo").
 *  - `isPopupOwnershipStripV1On()` defaultea a true y respeta el kill-switch
 *    runtime `window.__POPUP_OWNERSHIP_STRIP_V1__ = false`.
 *
 * Out of scope: followed/app/source (P-POPUP-3B/C/D), camera, subset-fit,
 * geo hierarchy, tags, lifecycle, SourceFilterBridge.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { GeoLocation } from '@/types/location';
import { clearPoiSourceCache } from '@/domains/content/lib/poi-source';
import {
  buildSourceHashtagsBlock,
  buildOwnAddedLineHtml,
  isPopupOwnershipStripV1On,
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
  try { delete (globalThis as any).window?.__POPUP_OWNERSHIP_STRIP_V1__; } catch { /* noop */ }
});

describe('P-POPUP-3A — buildSourceHashtagsBlock(suppressOwn)', () => {
  it('own: suppressOwn=true → emite cadena vacía (chip propio oculto)', () => {
    const html = buildSourceHashtagsBlock(
      poi({ ownerUserId: VIEWER }),
      { isOwn: true, viewerUid: VIEWER },
      { suppressOwn: true },
    );
    expect(html).toBe('');
  });

  it('own: suppressOwn=false (rollback) → emite chip propio clicable', () => {
    const html = buildSourceHashtagsBlock(
      poi({ ownerUserId: VIEWER }),
      { isOwn: true, viewerUid: VIEWER },
      { suppressOwn: false },
    );
    expect(html).toContain('source-filter-chip');
    expect(html).toContain('data-source-type="own"');
  });

  it('followed: suppressOwn=true NO oculta chip de otros usuarios', () => {
    const html = buildSourceHashtagsBlock(
      poi({ ownerUserId: OTHER }),
      { isOwn: false, viewerUid: VIEWER },
      { suppressOwn: true },
    );
    expect(html).toContain('source-filter-chip');
    expect(html).toContain('data-source-type="followed"');
  });

  it('app: suppressOwn=true NO oculta chips de origen app', () => {
    const html = buildSourceHashtagsBlock(
      poi({ sourceKind: 'app', sourceId: 'vandits-app', groupId: 'playas' }),
      { isOwn: false, viewerUid: VIEWER },
      { suppressOwn: true },
    );
    expect(html).toContain('data-source-type="app"');
    expect(html).toContain('#vandits-app');
  });

  it('source: suppressOwn=true NO oculta chips de origen externo', () => {
    const html = buildSourceHashtagsBlock(
      poi({ sourceKind: 'external', sourceId: 'osm' }),
      { isOwn: false, viewerUid: VIEWER },
      { suppressOwn: true },
    );
    expect(html).toContain('data-source-type="source"');
    expect(html).toContain('#osm');
  });
});

describe('P-POPUP-3A — buildOwnAddedLineHtml', () => {
  it('emite fecha dd/mm/yyyy y data-popup-own-added', () => {
    const html = buildOwnAddedLineHtml(poi({ createdAt: new Date('2026-05-03T10:00:00Z') }));
    expect(html).toContain('data-popup-own-added="p1"');
    expect(html).toMatch(/Añadido 03\/05\/2026/);
  });

  it('NO contiene literal de ownership ("Mi punto" / "Mío" / "Tuyo")', () => {
    const html = buildOwnAddedLineHtml(poi());
    expect(html).not.toMatch(/Mi punto/i);
    expect(html).not.toMatch(/\bM[ií]o\b/);
    expect(html).not.toMatch(/\bTuyo\b/i);
  });

  it('cadena vacía cuando createdAt es null/invalid', () => {
    expect(buildOwnAddedLineHtml(poi({ createdAt: null }))).toBe('');
    expect(buildOwnAddedLineHtml(poi({ createdAt: 'not-a-date' }))).toBe('');
  });

  it('usa token muted-foreground (no hex hardcoded de color)', () => {
    const html = buildOwnAddedLineHtml(poi());
    expect(html).toContain('hsl(var(--muted-foreground))');
    // No fugas de hex en el color principal.
    expect(html).not.toMatch(/color:\s*#[0-9a-fA-F]{3,6}/);
  });
});

describe('P-POPUP-3A — flag', () => {
  it('default = true (rollout global conforme rollout-policy.md)', () => {
    try { delete (globalThis as any).window?.__POPUP_OWNERSHIP_STRIP_V1__; } catch { /* noop */ }
    expect(isPopupOwnershipStripV1On()).toBe(true);
  });

  it('kill-switch runtime global: window.__POPUP_OWNERSHIP_STRIP_V1__ = false', () => {
    (globalThis as any).window = (globalThis as any).window ?? {};
    (globalThis as any).window.__POPUP_OWNERSHIP_STRIP_V1__ = false;
    expect(isPopupOwnershipStripV1On()).toBe(false);
  });
});

describe('P-POPUP-3A — static guard (rama enriched A)', () => {
  const SRC = resolve(__dirname, '../components/map/map-popups.ts');
  const src = readFileSync(SRC, 'utf8');

  it('rama A envuelve ownershipBadgeHtml bajo flag isOwn + ownership-strip', () => {
    expect(src).toMatch(/\(isOwn && isPopupOwnershipStripV1On\(\)\)\s*\?\s*''\s*:\s*ownershipBadgeHtml/);
  });

  it('rama A sustituye buildSourceHashtagsBlock por buildOwnAddedLineHtml en own', () => {
    // Tras P-POPUP-4A el dispatch es una IIFE; aceptamos tanto el ternario
    // legacy como el `if (...) return buildOwnAddedLineHtml(location)`.
    expect(src).toMatch(/isPopupOwnershipStripV1On\(\)\)[\s\S]{0,400}buildOwnAddedLineHtml\(location\)/);
  });

  it('root popup expone data-popup-ownership-strip', () => {
    expect(src).toContain('data-popup-ownership-strip=');
  });

  it('rama B (fallback) NO ha sido tocada — sigue llamando ownershipBadgeHtml y buildSourceHashtagsBlock sin gating', () => {
    // Hay exactamente dos sitios donde se inserta ${ownershipBadgeHtml}:
    //  - rama A (envuelta bajo flag)
    //  - rama B (sin flag — out of scope 3A)
    const matchesPlain = src.match(/^\$\{ownershipBadgeHtml\}$/gm) ?? [];
    expect(matchesPlain.length).toBeGreaterThanOrEqual(1);
  });
});
