/**
 * PR-EXPORT-6 + PR-EXPORT-7 + PR-EXPORT-8 — GuruMaps target renderer.
 *
 * PR-EXPORT-8 ajustes:
 *   - Sin truncado artificial (highlight/longDesc/observation completos).
 *   - Ficha = popup completo. Incluye categoría, colección, fecha añadido.
 *   - Mantiene reglas duras: sin HTML, sin enlaces, sin hashtags,
 *     sin campos técnicos, sin ownerUserId, bloques vacíos omitidos.
 */
import { describe, it, expect } from 'vitest';
import { buildPoiExportContent } from '@/domains/content/lib/poi-export-content-model';
import { mapToPoiExportRecord } from '@/domains/content/lib/poi-export-mapper';
import { serializePoiKml } from '@/domains/content/lib/exporters';
import { buildGuruMapsDescription } from '@/domains/content/lib/exporters/gurumaps-description';
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

  it('mantiene estructura legible: ≥3 bloques separados por \\n\\n', () => {
    const content = buildPoiExportContent(makeTorreHerculesFixture(), {
      scope: 'internal',
    });
    const body = buildGuruMapsDescription(content, { generatedAt: GEN_AT });
    const blocks = body.split('\n\n').filter((b) => b.trim().length > 0);
    expect(blocks.length).toBeGreaterThanOrEqual(3);
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

  it('ExtendedData del Placemark conserva tags y web_reference aunque no aparezcan en cuerpo', () => {
    const loc = makeTorreHerculesFixture();
    const kml = serializePoiKml([mapToPoiExportRecord(loc, 'internal')], {
      scope: 'internal',
      documentName: 'Test',
      target: 'gurumaps',
    });
    expect(kml).toMatch(/tags|etiquetas|categories/i);
    const desc = kml.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/);
    expect(desc).not.toBeNull();
    expect(desc![1]).not.toMatch(/#[a-zA-Z]/);
    expect(desc![1]).not.toMatch(/https?:\/\//);
  });
});

describe('PR-EXPORT-8 · ficha completa sin truncado', () => {
  const LONG_DESC =
    'La Torre de Hércules es el único faro romano del mundo en funcionamiento. ' +
    'Construido en el siglo I d.C. por orden del emperador Trajano, su estructura ' +
    'original de granito fue restaurada en el siglo XVIII por el ingeniero Eustaquio ' +
    'Giannini. Fue declarado Patrimonio de la Humanidad por la UNESCO en 2009 y ' +
    'constituye el faro en activo más antiguo del mundo. Su silueta de granito domina ' +
    'el cabo y guía a los navegantes desde hace casi dos mil años. La torre se eleva ' +
    'sobre una colina rocosa de 57 metros de altura, y su lanterna alcanza los 49 ' +
    'metros sobre la base. Desde su cima, los visitantes pueden contemplar una vista ' +
    'panorámica espectacular del océano Atlántico, la bahía de A Coruña y la costa ' +
    'gallega. El recinto incluye también un parque escultórico al aire libre con ' +
    'obras de artistas contemporáneos que dialogan con el paisaje atlántico. Visitar ' +
    'la torre al atardecer es una experiencia que combina historia, naturaleza y arte ' +
    'en un mismo enclave irrepetible.';
  const LONG_HIGHLIGHT =
    'El único faro romano del mundo todavía en funcionamiento, construido en el ' +
    'siglo I d.C. y declarado Patrimonio de la Humanidad por la UNESCO en 2009 — ' +
    'una pieza viva de patrimonio universal que sigue guiando barcos cada noche.';
  const LONG_OBS =
    'Visita guiada disponible los fines de semana a las 11:00 y 17:00. Conviene ' +
    'reservar entrada online con varios días de antelación, especialmente en ' +
    'temporada alta. El acceso superior implica subir 234 escalones por una escalera ' +
    'estrecha — no apto para personas con movilidad reducida o claustrofobia.';

  function makeRichFixture() {
    return makeTorreHerculesFixture({
      enrichedData: {
        ...makeTorreHerculesFixture().enrichedData!,
        descripcion: LONG_DESC,
        punto_destacado: LONG_HIGHLIGHT,
        observacion: LONG_OBS,
      },
    });
  }

  it('NO trunca descripción larga', () => {
    const content = buildPoiExportContent(makeRichFixture(), { scope: 'internal' });
    const body = buildGuruMapsDescription(content, { generatedAt: GEN_AT });
    expect(body).toContain(LONG_DESC);
    expect(body).not.toMatch(/…|\.\.\./);
  });

  it('NO trunca highlight', () => {
    const content = buildPoiExportContent(makeRichFixture(), { scope: 'internal' });
    const body = buildGuruMapsDescription(content, { generatedAt: GEN_AT });
    expect(body).toContain(LONG_HIGHLIGHT);
  });

  it('NO trunca observación', () => {
    const content = buildPoiExportContent(makeRichFixture(), { scope: 'internal' });
    const body = buildGuruMapsDescription(content, { generatedAt: GEN_AT });
    expect(body).toContain(LONG_OBS);
  });

  it('conserva contenido completo del fixture rico (todos los slots presentes)', () => {
    const content = buildPoiExportContent(makeRichFixture(), { scope: 'internal' });
    const body = buildGuruMapsDescription(content, { generatedAt: GEN_AT });
    expect(body).toContain('📍 A Coruña · A Coruña · España');
    expect(body).toContain(LONG_HIGHLIGHT);
    expect(body).toContain(LONG_DESC);
    expect(body).toContain('📝');
    expect(body).toContain(LONG_OBS);
    expect(body).toContain('Categoría: Patrimonio histórico');
    expect(body).toContain('Colección: Faros del Atlántico');
    expect(body).toContain('Añadido: 2024-06-15');
    expect(body).toMatch(/— Vandits · 2026-05-24$/);
  });

  it('omite bloques vacíos (POI minimal sin observación/colección)', () => {
    const minimal = makeMazingerZFixture({
      customData: {}, // sin colección
      enrichedData: {
        ...makeMazingerZFixture().enrichedData!,
        observacion: undefined as unknown as string,
      },
    });
    const content = buildPoiExportContent(minimal, { scope: 'internal' });
    const body = buildGuruMapsDescription(content, { generatedAt: GEN_AT });
    expect(body).not.toContain('📝');
    expect(body).not.toMatch(/Colección:/);
    // pero footer sigue presente
    expect(body).toMatch(/— Vandits · 2026-05-24$/);
  });

  it('internal vs public se diferencian: public no expone colección ni fecha añadido', () => {
    const internal = buildGuruMapsDescription(
      buildPoiExportContent(makeTorreHerculesFixture(), { scope: 'internal' }),
      { generatedAt: GEN_AT },
    );
    const pub = buildGuruMapsDescription(
      buildPoiExportContent(makeTorreHerculesFixture(), { scope: 'public' }),
      { generatedAt: GEN_AT },
    );
    expect(internal).toContain('Colección:');
    expect(internal).toContain('Añadido:');
    expect(pub).not.toContain('Colección:');
    expect(pub).not.toContain('Añadido:');
  });

  it('jamás contiene ownerUserId, debug, ni claves prohibidas', () => {
    const content = buildPoiExportContent(makeTorreHerculesFixture(), {
      scope: 'internal',
    });
    const body = buildGuruMapsDescription(content, { generatedAt: GEN_AT });
    for (const key of [
      'ownerUserId',
      'owner_user_id',
      'user-vandits-owner',
      'debug',
      'raw_geocode',
      'apiKey',
      'secret',
    ]) {
      expect(body.toLowerCase()).not.toContain(key.toLowerCase());
    }
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
