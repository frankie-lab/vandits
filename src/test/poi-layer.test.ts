/**
 * PR-POI-SOURCE-7 — Tests for resolveLayerGroupKey and resolveLayerVisibility.
 * Two SEPARATE functions: physical classification vs visibility decision.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveLayerGroupKey,
  resolveLayerVisibility,
  DEFAULT_ZOOM_GATES,
} from '@/domains/content/lib/poi-layer';
import type { ResolvedPoiSource } from '@/domains/content/lib/poi-source';
import type { LayerVisibilityState } from '@/hooks/use-layer-visibility';

const baseLayers = (): LayerVisibilityState => ({
  own: { visible: true, entityHidden: [], minVisibilityZooms: new Map() },
  catalog: { visible: true, entityHidden: [], minVisibilityZooms: new Map() },
  workspace: { visible: false, entityHidden: [], minVisibilityZooms: new Map() },
  followed: { visible: true, entityHidden: [], minVisibilityZooms: new Map() },
  app: { visible: true, entityHidden: [], minVisibilityZooms: new Map() },
  source: { visible: true, entityHidden: [], minVisibilityZooms: new Map() },
});

const own = (uid = 'u1'): ResolvedPoiSource => ({ type: 'own', ownerUid: uid, sourceId: null, groupId: null, hashtags: ['frankie'] });
const followed = (uid = 'other'): ResolvedPoiSource => ({ type: 'followed', ownerUid: uid, sourceId: null, groupId: null, hashtags: ['other'] });
const app = (groupId: string | null = 'playas'): ResolvedPoiSource => ({ type: 'app', ownerUid: null, sourceId: 'vandits-app', groupId, hashtags: ['vandits-app'] });
const source = (sourceId = 'osm'): ResolvedPoiSource => ({ type: 'source', ownerUid: null, sourceId, groupId: null, hashtags: [sourceId] });

// ── resolveLayerGroupKey ────────────────────────────────────

describe('resolveLayerGroupKey — clasificación física', () => {
  it('own → "own"', () => {
    expect(resolveLayerGroupKey(own())).toBe('own');
  });
  it('followed → "followed:<uid>"', () => {
    expect(resolveLayerGroupKey(followed('uid-123'))).toBe('followed:uid-123');
  });
  it('followed sin uid → "followed:__anon__"', () => {
    expect(resolveLayerGroupKey({ ...followed(), ownerUid: null })).toBe('followed:__anon__');
  });
  it('app con groupId → "app:<groupId>"', () => {
    expect(resolveLayerGroupKey(app('miradores'))).toBe('app:miradores');
  });
  it('app sin groupId → "app:default"', () => {
    expect(resolveLayerGroupKey(app(null))).toBe('app:default');
  });
  it('source → "source:<sourceId>"', () => {
    expect(resolveLayerGroupKey(source('tripadvisor'))).toBe('source:tripadvisor');
  });
});

// ── resolveLayerVisibility ──────────────────────────────────

describe('resolveLayerVisibility — decisión de visibilidad', () => {
  it('defaults sanos: gates 7/6/8', () => {
    expect(DEFAULT_ZOOM_GATES).toEqual({ followed: 7, app: 6, source: 8 });
  });

  describe('own', () => {
    it('visible si capa own activa (sin zoom gate)', () => {
      const r = resolveLayerVisibility(own(), { zoom: 0, layers: baseLayers() });
      expect(r).toEqual({ visible: true, reason: 'ok' });
    });
    it('oculto si capa own off', () => {
      const layers = baseLayers();
      layers.own.visible = false;
      const r = resolveLayerVisibility(own(), { zoom: 18, layers });
      expect(r).toEqual({ visible: false, reason: 'layer-off' });
    });
  });

  describe('followed', () => {
    it('visible si capa on, no muteado y zoom >= gate', () => {
      const r = resolveLayerVisibility(followed('u9'), { zoom: 7, layers: baseLayers() });
      expect(r.visible).toBe(true);
    });
    it('oculto bajo zoom gate', () => {
      const r = resolveLayerVisibility(followed('u9'), { zoom: 6, layers: baseLayers() });
      expect(r).toEqual({ visible: false, reason: 'below-zoom-gate' });
    });
    it('oculto si owner muteado', () => {
      const layers = baseLayers();
      layers.followed.entityHidden = ['u9'];
      const r = resolveLayerVisibility(followed('u9'), { zoom: 10, layers });
      expect(r).toEqual({ visible: false, reason: 'entity-muted' });
    });
    it('otros followed siguen visibles si solo X está muteado', () => {
      const layers = baseLayers();
      layers.followed.entityHidden = ['u9'];
      expect(resolveLayerVisibility(followed('u8'), { zoom: 10, layers }).visible).toBe(true);
    });
    it('oculto si capa followed off', () => {
      const layers = baseLayers();
      layers.followed.visible = false;
      const r = resolveLayerVisibility(followed('u9'), { zoom: 18, layers });
      expect(r).toEqual({ visible: false, reason: 'layer-off' });
    });
  });

  describe('app — modelo capa padre + grupos hijos', () => {
    it('visible cuando capa app on, grupo no muteado, zoom >= 6', () => {
      const r = resolveLayerVisibility(app('playas'), { zoom: 6, layers: baseLayers() });
      expect(r.visible).toBe(true);
    });
    it('toggle layers.app.visible=false oculta TODOS los grupos APP', () => {
      const layers = baseLayers();
      layers.app.visible = false;
      const r = resolveLayerVisibility(app('playas'), { zoom: 18, layers });
      expect(r).toEqual({ visible: false, reason: 'layer-off' });
    });
    it('mute grupo individual no afecta a otros grupos APP', () => {
      const layers = baseLayers();
      layers.app.entityHidden = ['playas'];
      expect(resolveLayerVisibility(app('playas'), { zoom: 10, layers })).toEqual({ visible: false, reason: 'entity-muted' });
      expect(resolveLayerVisibility(app('miradores'), { zoom: 10, layers }).visible).toBe(true);
    });
    it('oculto bajo zoom gate', () => {
      const r = resolveLayerVisibility(app('playas'), { zoom: 5, layers: baseLayers() });
      expect(r.reason).toBe('below-zoom-gate');
    });
  });

  describe('source', () => {
    it('visible cuando capa on, sourceId no muteado, zoom >= 8', () => {
      const r = resolveLayerVisibility(source('osm'), { zoom: 8, layers: baseLayers() });
      expect(r.visible).toBe(true);
    });
    it('oculto bajo zoom gate', () => {
      const r = resolveLayerVisibility(source('osm'), { zoom: 7, layers: baseLayers() });
      expect(r.reason).toBe('below-zoom-gate');
    });
    it('mute sourceId individual', () => {
      const layers = baseLayers();
      layers.source.entityHidden = ['osm'];
      expect(resolveLayerVisibility(source('osm'), { zoom: 10, layers }).reason).toBe('entity-muted');
      expect(resolveLayerVisibility(source('tripadvisor'), { zoom: 10, layers }).visible).toBe(true);
    });
    it('toggle capa padre source off oculta todas las fuentes', () => {
      const layers = baseLayers();
      layers.source.visible = false;
      expect(resolveLayerVisibility(source('osm'), { zoom: 18, layers }).reason).toBe('layer-off');
    });
  });

  it('zoomGates personalizados sobreescriben defaults', () => {
    const r = resolveLayerVisibility(followed('u9'), { zoom: 5, layers: baseLayers(), zoomGates: { followed: 4 } });
    expect(r.visible).toBe(true);
  });
});
