import { describe, it, expect } from 'vitest';
import {
  haversineDistance,
  formatDuration,
  formatDistance,
  getRouteColor,
  parseApiResponse,
  generateGreatCircleArc,
  extractFlightLabel,
  extractPortNames,
  TRANSPORT_CODE_TO_ROUTE_MODE,
} from '@/domains/routes/lib/route-engine';

// ── haversineDistance ─────────────────────────────────────────

describe('haversineDistance', () => {
  it('returns 0 for same point', () => {
    expect(haversineDistance(40, -3, 40, -3)).toBe(0);
  });

  it('calculates ~9000km Madrid → New York', () => {
    const d = haversineDistance(40.4168, -3.7038, 40.7128, -74.006);
    const km = d / 1000;
    expect(km).toBeGreaterThan(5700);
    expect(km).toBeLessThan(5800);
  });

  it('detects maritime crossing > 8km (Strait of Gibraltar)', () => {
    // Tarifa (Spain) → Tangier (Morocco)
    const d = haversineDistance(36.0143, -5.6044, 35.7595, -5.834);
    const km = d / 1000;
    expect(km).toBeGreaterThan(8);
    expect(km).toBeLessThan(50);
  });

  it('short distance < 1km within same city', () => {
    // Two points ~500m apart in Madrid
    const d = haversineDistance(40.4168, -3.7038, 40.42, -3.7038);
    expect(d).toBeLessThan(1000);
    expect(d).toBeGreaterThan(100);
  });
});

// ── formatDuration ───────────────────────────────────────────

describe('formatDuration', () => {
  it('formats seconds', () => {
    expect(formatDuration(30)).toBe('30s');
  });

  it('formats minutes', () => {
    expect(formatDuration(300)).toBe('5 min');
  });

  it('formats hours and minutes', () => {
    expect(formatDuration(5400)).toBe('1h 30min');
  });

  it('formats exact hours', () => {
    expect(formatDuration(7200)).toBe('2h');
  });
});

// ── formatDistance ────────────────────────────────────────────

describe('formatDistance', () => {
  it('formats meters', () => {
    expect(formatDistance(500)).toBe('500 m');
  });

  it('formats kilometers', () => {
    expect(formatDistance(15000)).toBe('15.0 km');
  });
});

// ── getRouteColor ────────────────────────────────────────────

describe('getRouteColor', () => {
  it('returns a color string', () => {
    expect(getRouteColor(0)).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('wraps around for large indices', () => {
    const c0 = getRouteColor(0);
    const c14 = getRouteColor(14);
    expect(c14).toBe(c0); // 14 colors in array
  });
});

// ── TRANSPORT_CODE_TO_ROUTE_MODE ─────────────────────────────

describe('TRANSPORT_CODE_TO_ROUTE_MODE', () => {
  it('maps walking modes correctly', () => {
    expect(TRANSPORT_CODE_TO_ROUTE_MODE['walking']).toBe('walking');
    expect(TRANSPORT_CODE_TO_ROUTE_MODE['bicycle']).toBe('walking');
  });

  it('maps driving modes correctly', () => {
    expect(TRANSPORT_CODE_TO_ROUTE_MODE['own_car']).toBe('driving');
    expect(TRANSPORT_CODE_TO_ROUTE_MODE['camper_van']).toBe('driving');
  });
});

// ── generateGreatCircleArc ───────────────────────────────────

describe('generateGreatCircleArc', () => {
  it('returns correct number of points', () => {
    const arc = generateGreatCircleArc(40, -3, 48, 2, 10);
    expect(arc).toHaveLength(11); // 0..10 inclusive
  });

  it('starts and ends at the correct coordinates', () => {
    const arc = generateGreatCircleArc(40, -3, 48, 2, 50);
    expect(arc[0][0]).toBeCloseTo(-3); // lng
    expect(arc[0][1]).toBeCloseTo(40); // lat
    expect(arc[arc.length - 1][0]).toBeCloseTo(2);
    expect(arc[arc.length - 1][1]).toBeCloseTo(48);
  });

  it('handles same point (degenerate case)', () => {
    const arc = generateGreatCircleArc(40, -3, 40, -3, 5);
    expect(arc).toHaveLength(2);
  });
});

// ── parseApiResponse ─────────────────────────────────────────

describe('parseApiResponse', () => {
  it('parses a normal route result', () => {
    const data = {
      segments: [{ geometry: { type: 'LineString', coordinates: [] }, distance: 1000, duration: 60, transportMode: 'driving' }],
      totalDistance: 1000,
      totalDuration: 60,
    };
    const result = parseApiResponse(data);
    expect(result.primary).not.toBeNull();
    expect(result.primary!.totalDistance).toBe(1000);
    expect(result.impossible).toBeNull();
  });

  it('parses an impossible route', () => {
    const data = {
      routeImpossible: true,
      reason: 'no_road_connection',
      directDistanceKm: 500,
      suggestedModes: ['flight', 'ferry'],
      alternatives: [],
    };
    const result = parseApiResponse(data);
    expect(result.primary).toBeNull();
    expect(result.impossible).not.toBeNull();
    expect(result.impossible!.reason).toBe('no_road_connection');
    expect(result.impossible!.directDistanceKm).toBe(500);
  });

  it('parses alternatives', () => {
    const data = {
      segments: [],
      totalDistance: 100,
      totalDuration: 10,
      alternatives: [
        { mode: 'ferry', label: 'Ferry A→B', segments: [], totalDistance: 200, totalDuration: 3600 },
      ],
    };
    const result = parseApiResponse(data);
    expect(result.alternatives).toHaveLength(1);
    expect(result.alternatives[0].mode).toBe('ferry');
  });
});

// ── Label extraction ─────────────────────────────────────────

describe('extractFlightLabel', () => {
  it('returns IATA codes when available', () => {
    const result = {
      segments: [
        { transportMode: 'flight', originAirport: { name: 'Barajas', iata: 'MAD' }, destinationAirport: { name: 'CDG', iata: 'CDG' } },
      ],
    };
    expect(extractFlightLabel(result)).toBe('MAD → CDG');
  });

  it('returns fallback label when no flight segment', () => {
    expect(extractFlightLabel({ segments: [] })).toBe('Vuelo');
  });
});

describe('extractPortNames', () => {
  it('returns port names when available', () => {
    const result = {
      segments: [
        { transportMode: 'ferry', originPort: { name: 'Tarifa' }, destinationPort: { name: 'Tánger' } },
      ],
    };
    expect(extractPortNames(result)).toBe('Tarifa → Tánger');
  });

  it('returns fallback when no ferry segment', () => {
    expect(extractPortNames({ segments: [] })).toBe('Ferry');
  });
});
