import { describe, it, expect } from 'vitest';
import { validateFeature } from '@/domains/v2/marker-validation';
import { resolveMarkerGrammar, _TEST_COLORS } from '@/domains/v2/marker-grammar';
import { mapLegacyLocationToMapFeature } from '@/domains/v2/legacy-to-feature.mapper';
import type { MapFeature, MapFeatureState } from '@/domains/v2/types';
import type { GeoLocation } from '@/types/location';

// ── Helpers ───────────────────────────────────────────────────

function makeFeature(overrides: Partial<MapFeature> & { entityType: MapFeature['entityType'] }): MapFeature {
  const defaults: MapFeature = {
    id: 'test-id',
    entityType: 'place',
    ownershipSource: 'own',
    renderContext: 'default',
    state: { isSelected: false, isVisited: false, isFavorite: false, isConflict: false },
    latitude: 40.0,
    longitude: -3.0,
    name: 'Test Feature',
    shape: 'circle-solid',
    fillColor: '',
    clickPayload: { entityId: 'test-id', entityType: 'place' },
  };
  return { ...defaults, ...overrides, state: { ...defaults.state, ...overrides.state } };
}

function makeGeoLocation(overrides: Partial<GeoLocation> = {}): GeoLocation {
  return {
    id: 'loc-1',
    name: 'Test Location',
    coordinates: { lat: 40.0, lng: -3.0 },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ══════════════════════════════════════════════════════════════
// Section 1 — Validation
// ══════════════════════════════════════════════════════════════

describe('marker-validation: validateFeature', () => {
  it('rejects place + isConflict', () => {
    const result = validateFeature(makeFeature({ entityType: 'place', state: { isSelected: false, isVisited: false, isFavorite: false, isConflict: true } }));
    expect(result.isValid).toBe(false);
    expect(result.reason).toContain('conflict');
  });

  it('rejects waypoint + isVisited', () => {
    const result = validateFeature(makeFeature({ entityType: 'waypoint', state: { isSelected: false, isVisited: true, isFavorite: false, isConflict: false } }));
    expect(result.isValid).toBe(false);
    expect(result.reason).toContain('visited');
  });

  it('rejects waypoint + isFavorite', () => {
    const result = validateFeature(makeFeature({ entityType: 'waypoint', state: { isSelected: false, isVisited: false, isFavorite: true, isConflict: false } }));
    expect(result.isValid).toBe(false);
    expect(result.reason).toContain('favorited');
  });

  it('rejects track + isFavorite', () => {
    const result = validateFeature(makeFeature({ entityType: 'track', state: { isSelected: false, isVisited: false, isFavorite: true, isConflict: false } }));
    expect(result.isValid).toBe(false);
  });

  it('rejects track + isVisited', () => {
    const result = validateFeature(makeFeature({ entityType: 'track', state: { isSelected: false, isVisited: true, isFavorite: false, isConflict: false } }));
    expect(result.isValid).toBe(false);
  });

  it('rejects track + isConflict', () => {
    const result = validateFeature(makeFeature({ entityType: 'track', state: { isSelected: false, isVisited: false, isFavorite: false, isConflict: true } }));
    expect(result.isValid).toBe(false);
  });

  it('rejects document renderContext without documentId', () => {
    const result = validateFeature(makeFeature({
      entityType: 'waypoint',
      renderContext: 'document',
      clickPayload: { entityId: 'test', entityType: 'waypoint' },
    }));
    expect(result.isValid).toBe(false);
    expect(result.reason).toContain('documentId');
  });

  it('rejects waypoint with non-own ownershipSource', () => {
    const result = validateFeature(makeFeature({
      entityType: 'waypoint',
      ownershipSource: 'followed',
    }));
    expect(result.isValid).toBe(false);
    expect(result.reason).toContain('own');
  });

  it('accepts valid place', () => {
    const result = validateFeature(makeFeature({ entityType: 'place' }));
    expect(result.isValid).toBe(true);
  });

  it('accepts valid waypoint with document context', () => {
    const result = validateFeature(makeFeature({
      entityType: 'waypoint',
      renderContext: 'document',
      clickPayload: { entityId: 'test', entityType: 'waypoint', documentId: 'doc-1' },
    }));
    expect(result.isValid).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════
// Section 2 — Grammar Snapshots
// ══════════════════════════════════════════════════════════════

describe('marker-grammar: resolveMarkerGrammar snapshots', () => {
  const { OWN_CATALOG_COLOR, OWN_WORKSPACE_COLOR, OWN_UNENRICHED_COLOR, OWNERSHIP_COLORS, CONFLICT_BORDER } = _TEST_COLORS;

  it('Place own enriched catalog → teardrop, sky blue, zIndex 200', () => {
    const result = resolveMarkerGrammar(makeFeature({
      entityType: 'place',
      shape: 'teardrop',
      isCatalog: true,
    }));
    expect(result).toMatchObject({
      shape: 'teardrop',
      fillColor: OWN_CATALOG_COLOR,
      zIndex: 200,
    });
    expect(result.decorations).toEqual([]);
  });

  it('Place own enriched workspace → teardrop, green, zIndex 200', () => {
    const result = resolveMarkerGrammar(makeFeature({
      entityType: 'place',
      shape: 'teardrop',
      isCatalog: false,
    }));
    expect(result).toMatchObject({
      shape: 'teardrop',
      fillColor: OWN_WORKSPACE_COLOR,
      zIndex: 200,
    });
  });

  it('Waypoint pending → circle-hollow, orange, zIndex 100', () => {
    const result = resolveMarkerGrammar(makeFeature({
      entityType: 'waypoint',
      shape: 'circle-hollow',
    }));
    expect(result).toMatchObject({
      shape: 'circle-hollow',
      fillColor: OWN_UNENRICHED_COLOR,
      zIndex: 100,
    });
  });

  it('Place own promoted (not enriched) → circle-solid, orange, zIndex 100', () => {
    const result = resolveMarkerGrammar(makeFeature({
      entityType: 'place',
      shape: 'circle-solid',
    }));
    expect(result).toMatchObject({
      shape: 'circle-solid',
      fillColor: OWN_UNENRICHED_COLOR,
      zIndex: 100,
    });
  });

  it('Waypoint conflict selected → circle-hollow, red border, [halo, warning], zIndex 1000', () => {
    const result = resolveMarkerGrammar(makeFeature({
      entityType: 'waypoint',
      shape: 'circle-hollow',
      state: { isSelected: true, isVisited: false, isFavorite: false, isConflict: true },
    }));
    expect(result).toMatchObject({
      shape: 'circle-hollow',
      borderColor: CONFLICT_BORDER,
      zIndex: 1000,
    });
    expect(result.decorations).toEqual(['halo', 'warning']);
  });

  it('Place followed → circle-solid, purple, zIndex 100', () => {
    const result = resolveMarkerGrammar(makeFeature({
      entityType: 'place',
      ownershipSource: 'followed',
      shape: 'circle-solid',
    }));
    expect(result).toMatchObject({
      shape: 'circle-solid',
      fillColor: OWNERSHIP_COLORS.followed,
      zIndex: 100,
    });
  });

  it('Track selected → circle-dashed, [halo], zIndex 1000', () => {
    const result = resolveMarkerGrammar(makeFeature({
      entityType: 'track',
      shape: 'circle-dashed',
      state: { isSelected: true, isVisited: false, isFavorite: false, isConflict: false },
    }));
    expect(result).toMatchObject({
      shape: 'circle-dashed',
      zIndex: 1000,
    });
    expect(result.decorations).toEqual(['halo']);
  });
});

// ══════════════════════════════════════════════════════════════
// Section 3 — Grammar Output Constraints
// ══════════════════════════════════════════════════════════════

describe('marker-grammar: output constraints', () => {
  it('Track never produces star, check, or warning', () => {
    const all: MapFeatureState = { isSelected: true, isVisited: true, isFavorite: true, isConflict: true };
    // Note: this combo is invalid per validator, but grammar should still be defensive
    const result = resolveMarkerGrammar(makeFeature({ entityType: 'track', shape: 'circle-dashed', state: all }));
    expect(result.decorations).not.toContain('star');
    expect(result.decorations).not.toContain('check');
    expect(result.decorations).not.toContain('warning');
  });

  it('Waypoint never produces check or star', () => {
    const all: MapFeatureState = { isSelected: true, isVisited: true, isFavorite: true, isConflict: true };
    const result = resolveMarkerGrammar(makeFeature({ entityType: 'waypoint', shape: 'circle-hollow', state: all }));
    expect(result.decorations).not.toContain('check');
    expect(result.decorations).not.toContain('star');
  });
});

// ══════════════════════════════════════════════════════════════
// Section 4 — Legacy-to-Feature Mapper
// ══════════════════════════════════════════════════════════════

describe('legacy-to-feature.mapper: mapLegacyLocationToMapFeature', () => {
  const baseOptions = {
    isOwn: true,
    isSelected: false,
    isFocused: false,
    isVisited: false,
    isFavorite: false,
    isCatalog: true,
  };

  it('enriched + isApproved → place + teardrop', () => {
    const loc = makeGeoLocation({
      isApproved: true,
      enrichedData: { descripcion: 'A description', verified: true, verification_notes: '', categoria: 'test', nombre_lugar: 'Test', localizacion: 'Here', punto_destacado: 'Notable', etiquetas: [], fuentes: [], datos_clave: { tipo: 'test', coordenadas: '40,-3' } } as any,
    });
    const feature = mapLegacyLocationToMapFeature(loc, baseOptions, 'default');
    expect(feature.entityType).toBe('place');
    expect(feature.shape).toBe('teardrop');
    expect(feature.isCatalog).toBe(true);
  });

  it('enriched + !isApproved → place + teardrop (workspace color)', () => {
    const loc = makeGeoLocation({
      isApproved: false,
      enrichedData: { descripcion: 'A description', verified: true, verification_notes: '', categoria: 'test', nombre_lugar: 'Test', localizacion: 'Here', punto_destacado: 'Notable', etiquetas: [], fuentes: [], datos_clave: { tipo: 'test', coordenadas: '40,-3' } } as any,
    });
    const feature = mapLegacyLocationToMapFeature(loc, { ...baseOptions, isCatalog: false }, 'default');
    expect(feature.entityType).toBe('place');
    expect(feature.shape).toBe('teardrop');
    expect(feature.isCatalog).toBe(false);
  });

  it('not enriched → waypoint + circle-hollow', () => {
    const loc = makeGeoLocation({ isApproved: false });
    const feature = mapLegacyLocationToMapFeature(loc, baseOptions, 'default');
    expect(feature.entityType).toBe('waypoint');
    expect(feature.shape).toBe('circle-hollow');
  });

  it('isApproved + not enriched → place + circle-solid (promoted)', () => {
    const loc = makeGeoLocation({ isApproved: true });
    const feature = mapLegacyLocationToMapFeature(loc, baseOptions, 'default');
    expect(feature.entityType).toBe('place');
    expect(feature.shape).toBe('circle-solid');
  });

  it('passes renderContext through directly', () => {
    const loc = makeGeoLocation({ documentId: 'doc-1' });
    const feature = mapLegacyLocationToMapFeature(loc, baseOptions, 'document');
    expect(feature.renderContext).toBe('document');
  });

  it('resolves ownershipSource from ownerInfo', () => {
    const loc = makeGeoLocation();
    const feature = mapLegacyLocationToMapFeature(loc, {
      ...baseOptions,
      isOwn: false,
      ownerInfo: { followedUserId: 'user-1' },
    }, 'default');
    expect(feature.ownershipSource).toBe('followed');
  });
});
