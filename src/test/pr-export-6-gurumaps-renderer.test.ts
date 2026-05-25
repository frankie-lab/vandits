/**
 * PR-EXPORT-6 + PR-EXPORT-7 — GuruMaps target renderer.
 *
 * PR-EXPORT-7 ajustes:
 *   - NO bloque de enlaces (🔗) en el cuerpo visible.
 *   - NO hashtags generales (#tag) en el cuerpo visible.
 *   - SÍ etiqueta `Colección: <nombre>` cuando existe en userContext.
 *   - Descripción más larga (MAX_LONG_DESC=700, cap total ≤1200).
 *   - ExtendedData del Placemark sigue conservando links/tags.
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

  it('trunca longDescription enorme con ellipsis y respeta hard cap', () => {
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

  it('footer Vandits con fecha YYYY-MM-DD (no ISO completo)', () => {
    const content = buildPoiExportContent(makeMazingerZFixture(), { scope: 'internal' });
    const body = buildGuruMapsDescription(content, { generatedAt: GEN_AT });
    expect(body).toMatch(/— Vandits · 2026-05-24$/);
    expect(body).not.toContain('T00:00:00');
  });

  it('emoji literales presentes como separador visual (📍 y 📝 si hay observación)', () => {
    const content = buildPoiExportContent(makeTorreHerculesFixture(), {
      scope: 'internal',
    });
    const body = buildGuruMapsDescription(content, { generatedAt: GEN_AT });
    expect(body).toContain('📍');
    expect(body).toContain('📝');
  });

  it('omite imagen del cuerpo pero mantiene image_url en ExtendedData del Placemark', () => {
    const loc = makeMazingerZFixture();
    const rec = mapToPoiExportRecord(loc, 'internal');
    const kml = serializePoiKml([rec], {
      scope: 'internal',
      documentName: 'Test',
      target: 'gurumaps',
    });
    const desc = kml.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/);
    expect(desc).not.toBeNull();
    expect(desc![1]).not.toContain('upload.wikimedia.org');
    expect(kml).toContain('image_url');
    expect(kml).toContain('upload.wikimedia.org');
  });
});

describe('PR-EXPORT-7 · simplificación GuruMaps (no links, no hashtags, colección)', () => {
  it('NO renderiza bloque 🔗 Enlaces en el cuerpo visible', () => {
    const content = buildPoiExportContent(makeTorreHerculesFixture(), {
      scope: 'internal',
    });
    const body = buildGuruMapsDescription(content, { generatedAt: GEN_AT });
    expect(body).not.toContain('🔗');
    expect(body).not.toMatch(/Enlaces/i);
    expect(body).not.toMatch(/Wikipedia/i);
    expect(body).not.toMatch(/Web oficial/i);
    expect(body).not.toMatch(/Más info/i);
    expect(body).not.toMatch(/https?:\/\//);
  });

  it('NO renderiza hashtags generales en el cuerpo visible', () => {
    const base = makeTorreHerculesFixture();
    const loc = makeTorreHerculesFixture({
      enrichedData: {
        ...base.enrichedData!,
        etiquetas: ['monumento', 'historia', 'mirador', 'cultura', 'turismo'],
      },
    });
    const content = buildPoiExportContent(loc, { scope: 'internal' });
    const body = buildGuruMapsDescription(content, { generatedAt: GEN_AT });
    expect(body).not.toMatch(/#[a-zA-Z0-9áéíóúñ]+/);
    expect(body).not.toContain('🏷');
    expect(body).not.toMatch(/#monumento/);
  });

  it('SÍ renderiza colección si existe en userContext (scope=internal)', () => {
    const content = buildPoiExportContent(makeTorreHerculesFixture(), {
      scope: 'internal',
    });
    const body = buildGuruMapsDescription(content, { generatedAt: GEN_AT });
    expect(body).toContain('Colección: Faros del Atlántico');
  });

  it('NO renderiza colección en scope=public (userContext omitido)', () => {
    const content = buildPoiExportContent(makeTorreHerculesFixture(), {
      scope: 'public',
    });
    const body = buildGuruMapsDescription(content, { generatedAt: GEN_AT });
    expect(body).not.toMatch(/Colección:/);
  });

  it('Aprovecha espacio para descripción larga (>500 chars permitidos)', () => {
    const longText =
      'La Torre de Hércules es el único faro romano del mundo en funcionamiento. ' +
      'Construido en el siglo I d.C. por orden del emperador Trajano, su estructura ' +
      'original de granito fue restaurada en el siglo XVIII. Fue declarado Patrimonio ' +
      'de la Humanidad por la UNESCO en 2009 y constituye el faro en activo más ' +
      'antiguo del mundo. Su silueta domina el cabo y guía a los navegantes desde ' +
      'hace casi dos mil años, siendo un emblema de la ciudad de A Coruña.';
    const loc = makeTorreHerculesFixture({
      enrichedData: {
        ...makeTorreHerculesFixture().enrichedData!,
        descripcion: longText,
      },
    });
    const content = buildPoiExportContent(loc, { scope: 'internal' });
    const body = buildGuruMapsDescription(content, { generatedAt: GEN_AT });
    expect(body.length).toBeGreaterThan(500);
    expect(body.length).toBeLessThanOrEqual(GURUMAPS_RENDERER_LIMITS.HARD_TOTAL_CAP);
  });

  it('Orden canónico: 📍 → highlight → longDesc → 📝 → Colección → footer', () => {
    const content = buildPoiExportContent(makeTorreHerculesFixture(), {
      scope: 'internal',
    });
    const body = buildGuruMapsDescription(content, { generatedAt: GEN_AT });
    const idxLoc = body.indexOf('📍');
    const idxHi = body.indexOf('Único faro romano');
    const idxLong = body.indexOf('Patrimonio de la Humanidad');
    const idxNote = body.indexOf('📝');
    const idxCol = body.indexOf('Colección:');
    const idxFooter = body.indexOf('— Vandits');
    expect(idxLoc).toBeGreaterThanOrEqual(0);
    expect(idxHi).toBeGreaterThan(idxLoc);
    expect(idxLong).toBeGreaterThan(idxHi);
    expect(idxNote).toBeGreaterThan(idxLong);
    expect(idxCol).toBeGreaterThan(idxNote);
    expect(idxFooter).toBeGreaterThan(idxCol);
  });

  it('ExtendedData del Placemark conserva tags y web_reference aunque no aparezcan en cuerpo', () => {
    const loc = makeTorreHerculesFixture();
    const kml = serializePoiKml([mapToPoiExportRecord(loc, 'internal')], {
      scope: 'internal',
      documentName: 'Test',
      target: 'gurumaps',
    });
    // ExtendedData mantiene la información estructurada
    expect(kml).toMatch(/tags|etiquetas|categories/i);
    // cuerpo visible NO contiene hashtags ni URLs
    const desc = kml.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/);
    expect(desc).not.toBeNull();
    expect(desc![1]).not.toMatch(/#[a-zA-Z]/);
    expect(desc![1]).not.toMatch(/https?:\/\//);
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
    expect(body).toContain(']]]]><![CDATA[>');
    const unsafe = body.replace(/\]\]\]\]><!\[CDATA\[>/g, '');
    expect(unsafe).not.toContain(']]>');
  });
});
