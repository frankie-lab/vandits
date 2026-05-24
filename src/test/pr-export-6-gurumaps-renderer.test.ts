/**
 * PR-EXPORT-6 — GuruMaps target renderer.
 *
 * Verifica que el renderer plain-text móvil-first produce fichas legibles
 * en GuruMaps: sin tags HTML, bloques cortos, truncation por frase,
 * links compactados, footer mínimo. Verifica también que el target
 * 'generic' sigue produciendo HTML whitelisted (regresión PR-EXPORT-5).
 */
import { describe, it, expect } from 'vitest';
import { buildPoiExportContent } from '@/domains/content/lib/poi-export-content-model';
import { mapToPoiExportRecord } from '@/domains/content/lib/poi-export-mapper';
import { serializePoiKml } from '@/domains/content/lib/exporters';
import {
  buildGuruMapsDescription,
  GURUMAPS_RENDERER_LIMITS,
} from '@/domains/content/lib/exporters/gurumaps-description';
import { renderExportDescription } from '@/domains/content/lib/exporters/render-export-description';
import { makeTorreHerculesFixture } from '@/test/fixtures/poi-torre-hercules-export';
import { makeMazingerZFixture } from '@/test/fixtures/poi-mazinger-z-export';

const GEN_AT = '2026-05-24T00:00:00.000Z';

describe('PR-EXPORT-6 · GuruMaps plain-text renderer', () => {
  it('no contiene tags HTML (<p>, <br>, <b>, <i>, <a>, <img>)', () => {
    const content = buildPoiExportContent(makeTorreHerculesFixture(), {
      scope: 'internal',
    });
    const body = buildGuruMapsDescription(content, { generatedAt: GEN_AT });
    for (const pat of [/<p\b/i, /<br\b/i, /<b\b/i, /<i\b/i, /<a\s/i, /<img\b/i]) {
      expect(body).not.toMatch(pat);
    }
  });

  it('mantiene estructura legible: ≥3 bloques separados por \\n\\n y total ≤ HARD cap', () => {
    const content = buildPoiExportContent(makeTorreHerculesFixture(), {
      scope: 'internal',
    });
    const body = buildGuruMapsDescription(content, { generatedAt: GEN_AT });
    const blocks = body.split('\n\n').filter((b) => b.trim().length > 0);
    expect(blocks.length).toBeGreaterThanOrEqual(3);
    expect(body.length).toBeLessThanOrEqual(GURUMAPS_RENDERER_LIMITS.HARD_TOTAL_CAP);
  });

  it('trunca longDescription >2000 chars con ellipsis y respeta hard cap', () => {
    const huge = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(60);
    const loc = makeTorreHerculesFixture({
      enrichedData: {
        ...makeTorreHerculesFixture().enrichedData!,
        descripcion: huge,
        punto_destacado: undefined as unknown as string,
      },
    });
    const content = buildPoiExportContent(loc, { scope: 'internal' });
    const body = buildGuruMapsDescription(content, { generatedAt: GEN_AT });
    expect(body.length).toBeLessThanOrEqual(GURUMAPS_RENDERER_LIMITS.HARD_TOTAL_CAP);
    expect(body).toMatch(/…|\.\.\./);
  });

  it('prioriza highlight antes que longDescription', () => {
    const content = buildPoiExportContent(makeTorreHerculesFixture(), {
      scope: 'internal',
    });
    const body = buildGuruMapsDescription(content, { generatedAt: GEN_AT });
    const idxHighlight = body.indexOf('Único faro romano');
    const idxLong = body.indexOf('Patrimonio de la Humanidad');
    expect(idxHighlight).toBeGreaterThanOrEqual(0);
    expect(idxLong).toBeGreaterThan(idxHighlight);
  });

  it('compacta links: máximo MAX_LINKS visibles aunque haya más fuentes', () => {
    const base = makeTorreHerculesFixture();
    const loc = makeTorreHerculesFixture({
      enrichedData: {
        ...base.enrichedData!,
        fuentes: [
          'https://es.wikipedia.org/wiki/Torre_de_Hércules',
          'https://whc.unesco.org/en/list/1312',
          'https://example.com/a',
          'https://example.com/b',
          'https://example.com/c',
          'https://example.com/d',
        ],
      },
    });
    const content = buildPoiExportContent(loc, { scope: 'internal' });
    const body = buildGuruMapsDescription(content, { generatedAt: GEN_AT });
    const urlMatches = body.match(/https?:\/\/[^\s]+/g) ?? [];
    // webReference (1) + sources (hasta MAX_LINKS-1) → máx MAX_LINKS URLs distintas
    const unique = new Set(urlMatches);
    expect(unique.size).toBeLessThanOrEqual(GURUMAPS_RENDERER_LIMITS.MAX_LINKS);
  });

  it('compacta tags: máximo MAX_TAGS con prefijo #', () => {
    const base = makeTorreHerculesFixture();
    const loc = makeTorreHerculesFixture({
      enrichedData: {
        ...base.enrichedData!,
        etiquetas: Array.from({ length: 20 }, (_, i) => `tag${i}`),
      },
    });
    const content = buildPoiExportContent(loc, { scope: 'internal' });
    const body = buildGuruMapsDescription(content, { generatedAt: GEN_AT });
    const tagMatches = body.match(/#[a-zA-Z0-9áéíóúñ]+/g) ?? [];
    expect(tagMatches.length).toBeLessThanOrEqual(GURUMAPS_RENDERER_LIMITS.MAX_TAGS);
  });

  it('footer Vandits con fecha YYYY-MM-DD (no ISO completo)', () => {
    const content = buildPoiExportContent(makeMazingerZFixture(), { scope: 'internal' });
    const body = buildGuruMapsDescription(content, { generatedAt: GEN_AT });
    expect(body).toMatch(/— Vandits · 2026-05-24$/);
    expect(body).not.toContain('T00:00:00');
  });

  it('emoji literales presentes como separador visual', () => {
    const content = buildPoiExportContent(makeTorreHerculesFixture(), {
      scope: 'internal',
    });
    const body = buildGuruMapsDescription(content, { generatedAt: GEN_AT });
    expect(body).toContain('📍');
    expect(body).toContain('🏷');
    expect(body).toContain('📝');
    expect(body).toContain('🔗');
  });

  it('omite imagen del cuerpo pero mantiene image_url en ExtendedData del Placemark', () => {
    const loc = makeMazingerZFixture();
    const rec = mapToPoiExportRecord(loc, 'internal');
    const kml = serializePoiKml([rec], {
      scope: 'internal',
      documentName: 'Test',
      target: 'gurumaps',
    });
    // body description NO debe contener la URL de imagen
    const desc = kml.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/);
    expect(desc).not.toBeNull();
    expect(desc![1]).not.toContain('upload.wikimedia.org');
    // pero ExtendedData sí
    expect(kml).toContain('image_url');
    expect(kml).toContain('upload.wikimedia.org');
  });
});

describe('PR-EXPORT-6 · target switching y regresión generic', () => {
  it('target=generic sigue produciendo HTML con tags whitelisted', () => {
    const loc = makeTorreHerculesFixture();
    const kml = serializePoiKml([mapToPoiExportRecord(loc, 'internal')], {
      scope: 'internal',
      documentName: 'Test',
      target: 'generic',
    });
    expect(kml).toMatch(/<p>/);
    expect(kml).toContain('Generado por Vandits');
  });

  it('mismo content + target distinto produce outputs distintos', () => {
    const content = buildPoiExportContent(makeTorreHerculesFixture(), {
      scope: 'internal',
    });
    const guru = renderExportDescription(content, {
      format: 'kml',
      target: 'gurumaps',
      scope: 'internal',
      generatedAt: GEN_AT,
    });
    const generic = renderExportDescription(content, {
      format: 'kml',
      target: 'generic',
      scope: 'internal',
      generatedAt: GEN_AT,
    });
    expect(guru.rendererId).toBe('gurumaps-plain');
    expect(generic.rendererId).toBe('generic-html');
    expect(guru.body).not.toBe(generic.body);
    expect(guru.body).not.toMatch(/<p>/);
    expect(generic.body).toMatch(/<p>/);
  });

  it('serializePoiKml sin target explícito usa gurumaps (default canon)', () => {
    const loc = makeMazingerZFixture();
    const kml = serializePoiKml([mapToPoiExportRecord(loc, 'internal')], {
      scope: 'internal',
      documentName: 'Test',
    });
    const desc = kml.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/);
    expect(desc).not.toBeNull();
    expect(desc![1]).not.toMatch(/<p>/);
    expect(desc![1]).toContain('📍');
  });

  it('sanitiza ]]> en contenido para no romper CDATA', () => {
    const loc = makeMazingerZFixture({
      enrichedData: {
        ...makeMazingerZFixture().enrichedData!,
        descripcion: 'Texto malicioso ]]> intento de cierre CDATA.',
      },
    });
    const content = buildPoiExportContent(loc, { scope: 'internal' });
    const body = buildGuruMapsDescription(content, { generatedAt: GEN_AT });
    // Toda ocurrencia de ]]> debe ser parte del split seguro ]]]]><![CDATA[>
    expect(body).toContain(']]]]><![CDATA[>');
    const unsafe = body.replace(/\]\]\]\]><!\[CDATA\[>/g, '');
    expect(unsafe).not.toContain(']]>');
  });
});
