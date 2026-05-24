/**
 * PR-EXPORT-5 — Export Content Model & Popup Parity.
 *
 * Verifica que el modelo de contenido por capas (`buildPoiExportContent`)
 * y los serializers KML/CSV/JSON/GeoJSON reflejan la ficha real del popup
 * (Torre de Hércules) y respetan las reglas de scope + capa H forbidden.
 */
import { describe, it, expect } from 'vitest';
import {
  buildPoiExportContent,
  FORBIDDEN_EXPORT_KEYS,
  EXPORT_FORMAT_MATRIX,
} from '@/domains/content/lib/poi-export-content-model';
import { mapToPoiExportRecord } from '@/domains/content/lib/poi-export-mapper';
import {
  serializePoiKml,
  serializePoiCsv,
  serializePoiJson,
  serializePoiGeoJson,
} from '@/domains/content/lib/exporters';
import { buildKmlDescriptionHtml } from '@/domains/content/lib/exporters/kml-description-html';
import {
  makeTorreHerculesFixture,
  TORRE_HERCULES_PUBLIC_IMAGE,
} from '@/test/fixtures/poi-torre-hercules-export';

const GEN_AT = '2026-05-24T00:00:00.000Z';

describe('PR-EXPORT-5 · content model layers', () => {
  it('internal scope incluye highlight, longDescription, observation, geography y userContext', () => {
    const loc = makeTorreHerculesFixture();
    const c = buildPoiExportContent(loc, { scope: 'internal' });
    expect(c.summary.highlight).toContain('Único faro romano');
    expect(c.summary.longDescription).toContain('Patrimonio de la Humanidad');
    expect(c.summary.observation).toContain('Visita guiada');
    expect(c.geography.country).toBe('España');
    expect(c.geography.region).toBe('Galicia');
    expect(c.geography.province).toBe('A Coruña');
    expect(c.geography.locality).toBe('A Coruña');
    expect(c.geography.address).toContain('Av. de Navarra');
    expect(c.media.imageUrl).toBe(TORRE_HERCULES_PUBLIC_IMAGE);
    expect(c.media.imageAttribution).toBe('Wikimedia Commons');
    expect(c.classification.tags).toEqual(
      expect.arrayContaining(['favorito', 'faro', 'galicia']),
    );
    expect(c.classification.category).toBe('Patrimonio histórico');
    expect(c.userContext).toBeDefined();
    expect(c.userContext?.collection).toBe('Faros del Atlántico');
    expect(c.userContext?.personalNotes).toContain('atardecer');
    expect(c.userContext?.ownState).toContain('rating=5');
    expect(c.provenance.webReference).toBe('https://torredeherculesacoruna.com');
    expect(c.provenance.sources.length).toBeGreaterThan(0);
  });

  it('public scope omite userContext', () => {
    const c = buildPoiExportContent(makeTorreHerculesFixture(), { scope: 'public' });
    expect(c.userContext).toBeUndefined();
  });

  it('public scope rechaza imágenes con signature/token (signed URLs)', () => {
    const loc = makeTorreHerculesFixture({
      enrichedData: {
        ...makeTorreHerculesFixture().enrichedData!,
        imagen: 'https://x.supabase.co/storage/v1/object/sign/foo?token=abc',
      },
    });
    const c = buildPoiExportContent(loc, { scope: 'public' });
    expect(c.media.imageUrl).toBeUndefined();
  });

  it('matriz formato × capa expone las 4 implementaciones y prohíbe capa H en todas', () => {
    for (const fmt of ['kml', 'csv', 'json', 'geojson'] as const) {
      expect(EXPORT_FORMAT_MATRIX[fmt].forbidden).toBe('never');
    }
  });
});

describe('PR-EXPORT-5 · KML popup parity (Torre de Hércules)', () => {
  // PR-EXPORT-6: default KML target = 'gurumaps' (plain-text móvil-first).
  // Para validar el renderer HTML clásico, pasamos `target: 'generic'`.
  it('KML internal (generic target) contiene longDescription, highlight, ubicación, observación e imagen HTML', () => {
    const loc = makeTorreHerculesFixture();
    const rec = mapToPoiExportRecord(loc, 'internal');
    const kml = serializePoiKml([rec], {
      scope: 'internal',
      documentName: 'Test',
      target: 'generic',
    });
    expect(kml).toContain('Patrimonio de la Humanidad');
    expect(kml).toContain('Único faro romano');
    expect(kml).toContain('A Coruña');
    expect(kml).toContain('Galicia');
    expect(kml).toContain('España');
    expect(kml).toContain('Visita guiada');
    expect(kml).toContain(TORRE_HERCULES_PUBLIC_IMAGE);
    expect(kml).toContain('<![CDATA[');
    expect(kml).toContain('Generado por Vandits');
  });

  it('KML public excluye notas privadas (capa F)', () => {
    const loc = makeTorreHerculesFixture();
    const rec = mapToPoiExportRecord(loc, 'public');
    const kml = serializePoiKml([rec], { scope: 'public', documentName: 'Test' });
    expect(kml).not.toContain('Subir al atardecer');
    expect(kml).not.toContain('Faros del Atlántico');
  });

  it('ningún output KML contiene capa H (ownerUserId / raw_geocode / secret)', () => {
    const loc = makeTorreHerculesFixture();
    for (const scope of ['public', 'internal'] as const) {
      const kml = serializePoiKml([mapToPoiExportRecord(loc, scope)], {
        scope,
        documentName: 'Test',
      });
      for (const key of FORBIDDEN_EXPORT_KEYS) {
        expect(kml.toLowerCase()).not.toContain(key.toLowerCase());
      }
    }
  });
});

describe('PR-EXPORT-5 · GuruMaps HTML compatibility', () => {
  it('HTML sólo usa tags whitelisted (<p>, <b>, <i>, <img>, <a>, <br/>)', () => {
    const loc = makeTorreHerculesFixture();
    const html = buildKmlDescriptionHtml(
      buildPoiExportContent(loc, { scope: 'internal' }),
      { generatedAt: GEN_AT },
    );
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<style/i);
    expect(html).not.toMatch(/\son[a-z]+=/i);
    expect(html).not.toContain('{"');
    const tagMatches = html.match(/<\/?([a-z][a-z0-9]*)/gi) ?? [];
    const allowed = new Set(['p', 'b', 'i', 'img', 'a', 'br']);
    for (const m of tagMatches) {
      const tag = m.replace(/[<\/]/g, '').toLowerCase();
      expect(allowed.has(tag), `tag <${tag}> no permitido en HTML KML`).toBe(true);
    }
  });
});

describe('PR-EXPORT-5 · CSV flatten + new columns', () => {
  it('CSV expone columnas planas: highlight, observation, address, category, links', () => {
    const loc = makeTorreHerculesFixture();
    const csv = serializePoiCsv([mapToPoiExportRecord(loc, 'internal')], {
      scope: 'internal',
    });
    const headers = csv.split('\n')[0];
    for (const h of [
      'highlight',
      'observation',
      'address',
      'category',
      'subcategory',
      'links',
      'collection',
      'personal_notes',
      'own_state',
    ]) {
      expect(headers).toContain(h);
    }
    expect(csv).toContain('Único faro romano');
    expect(csv).toContain('Av. de Navarra');
  });
});

describe('PR-EXPORT-5 · GeoJSON geometry válida', () => {
  it('GeoJSON FeatureCollection con coordinates [lng, lat] y properties enriquecidas', () => {
    const loc = makeTorreHerculesFixture();
    const out = serializePoiGeoJson([mapToPoiExportRecord(loc, 'internal')], {
      scope: 'internal',
      generatedAt: GEN_AT,
    });
    const parsed = JSON.parse(out);
    expect(parsed.type).toBe('FeatureCollection');
    expect(parsed.features[0].geometry.type).toBe('Point');
    const [lng, lat] = parsed.features[0].geometry.coordinates;
    expect(lng).toBeCloseTo(-8.4068);
    expect(lat).toBeCloseTo(43.3863);
    expect(parsed.features[0].properties.layeredContent).toBeDefined();
  });
});

describe('PR-EXPORT-5 · JSON es el formato más rico', () => {
  it('JSON expone el modelo por capas completo en internal', () => {
    const loc = makeTorreHerculesFixture();
    const json = serializePoiJson([mapToPoiExportRecord(loc, 'internal')], {
      scope: 'internal',
      generatedAt: GEN_AT,
    });
    const parsed = JSON.parse(json);
    const layered = parsed.items[0].layeredContent;
    expect(layered).toBeDefined();
    expect(layered.summary.highlight).toContain('Único faro');
    expect(layered.userContext?.collection).toBe('Faros del Atlántico');
    expect(layered.provenance.sources.length).toBeGreaterThan(0);
  });

  it('JSON nunca contiene ownerUserId aunque internal', () => {
    const loc = makeTorreHerculesFixture();
    for (const scope of ['public', 'internal'] as const) {
      const json = serializePoiJson([mapToPoiExportRecord(loc, scope)], {
        scope,
        generatedAt: GEN_AT,
      });
      expect(json.toLowerCase()).not.toContain('owneruserid');
      expect(json.toLowerCase()).not.toContain('raw_geocode');
    }
  });
});
