import { describe, it, expect } from 'vitest';
import { parseGeoJSON, isValidGeoJSON } from '@/lib/geojson-parser';
import { parseCSV, isValidCSV } from '@/lib/csv-parser';
// KML and GPX parsers use DOMParser which requires jsdom (already in setup)
import { parseKML } from '@/lib/kml-parser';
import { parseGPX, isValidGPX } from '@/lib/gpx-parser';

// ── GeoJSON ──────────────────────────────────────────────────

describe('parseGeoJSON', () => {
  it('parses a FeatureCollection with Point features', () => {
    const geojson = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'Point', coordinates: [-3.7, 40.4] }, properties: { name: 'Madrid' } },
        { type: 'Feature', geometry: { type: 'Point', coordinates: [2.35, 48.85] }, properties: { name: 'Paris' } },
      ],
    });
    const result = parseGeoJSON(geojson, 'test.geojson');
    expect(result.locations).toHaveLength(2);
    expect(result.locations[0].name).toBe('Madrid');
    expect(result.locations[0].coordinates.lat).toBeCloseTo(40.4);
    expect(result.locations[0].coordinates.lng).toBeCloseTo(-3.7);
  });

  it('parses a single Feature', () => {
    const geojson = JSON.stringify({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [0, 0] },
      properties: { name: 'Origin' },
    });
    const result = parseGeoJSON(geojson, 'single.geojson');
    expect(result.locations).toHaveLength(1);
  });

  it('throws on invalid JSON', () => {
    expect(() => parseGeoJSON('not json', 'bad.geojson')).toThrow();
  });

  it('throws on GeoJSON with no valid points', () => {
    const geojson = JSON.stringify({ type: 'FeatureCollection', features: [] });
    expect(() => parseGeoJSON(geojson, 'empty.geojson')).toThrow();
  });

  it('handles bare array of features', () => {
    const geojson = JSON.stringify([
      { type: 'Feature', geometry: { type: 'Point', coordinates: [1, 2] }, properties: { name: 'A' } },
    ]);
    const result = parseGeoJSON(geojson, 'array.json');
    expect(result.locations).toHaveLength(1);
  });
});

describe('isValidGeoJSON', () => {
  it('returns true for valid FeatureCollection', () => {
    expect(isValidGeoJSON('{"type":"FeatureCollection","features":[]}')).toBe(true);
  });
  it('returns false for invalid JSON', () => {
    expect(isValidGeoJSON('not json')).toBe(false);
  });
  it('returns false for random JSON', () => {
    expect(isValidGeoJSON('{"foo":"bar"}')).toBe(false);
  });
});

// ── CSV ──────────────────────────────────────────────────────

describe('parseCSV', () => {
  it('parses standard lat/lng CSV', () => {
    const csv = 'name,lat,lng\nMadrid,40.4,-3.7\nParis,48.85,2.35';
    const result = parseCSV(csv, 'test.csv');
    expect(result.locations).toHaveLength(2);
    expect(result.locations[0].name).toBe('Madrid');
  });

  it('parses CSV with alternate column names', () => {
    const csv = 'nombre,latitude,longitude\nBerlin,52.52,13.405';
    const result = parseCSV(csv, 'alt.csv');
    expect(result.locations).toHaveLength(1);
    expect(result.locations[0].name).toBe('Berlin');
  });

  it('skips rows with invalid coordinates', () => {
    const csv = 'name,lat,lng\nGood,40,-3\nBad,abc,xyz\nAlsoGood,48,2';
    const result = parseCSV(csv, 'mixed.csv');
    expect(result.locations).toHaveLength(2);
  });

  it('throws when no coordinate columns found', () => {
    const csv = 'name,value\nTest,42';
    expect(() => parseCSV(csv, 'nocoords.csv')).toThrow();
  });

  it('throws on empty file', () => {
    expect(() => parseCSV('', 'empty.csv')).toThrow();
  });

  it('handles semicolon delimiter', () => {
    const csv = 'name;lat;lng\nRome;41.9;12.5';
    const result = parseCSV(csv, 'semi.csv');
    expect(result.locations).toHaveLength(1);
  });
});

describe('isValidCSV', () => {
  it('returns true for CSV with coordinate headers', () => {
    expect(isValidCSV('name,lat,lng\nA,1,2')).toBe(true);
  });
  it('returns false for CSV without coordinate headers', () => {
    expect(isValidCSV('name,value\nA,1')).toBe(false);
  });
});

// ── KML ──────────────────────────────────────────────────────

describe('parseKML', () => {
  it('parses KML with Point placemarks', () => {
    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Test</name>
    <Placemark>
      <name>Madrid</name>
      <Point><coordinates>-3.7,40.4,0</coordinates></Point>
    </Placemark>
  </Document>
</kml>`;
    const result = parseKML(kml, 'test.kml');
    expect(result.locations).toHaveLength(1);
    expect(result.locations[0].name).toBe('Madrid');
    expect(result.locations[0].coordinates.lat).toBeCloseTo(40.4);
  });

  it('returns empty locations for KML with no placemarks', () => {
    const kml = `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Empty</name></Document></kml>`;
    const result = parseKML(kml, 'empty.kml');
    expect(result.locations).toHaveLength(0);
  });

  it('throws on malformed XML', () => {
    expect(() => parseKML('not xml at all <<<', 'bad.kml')).toThrow();
  });
});

// ── GPX ──────────────────────────────────────────────────────

describe('parseGPX', () => {
  it('parses GPX with waypoints', () => {
    const gpx = `<?xml version="1.0"?>
<gpx version="1.1">
  <wpt lat="40.4" lon="-3.7">
    <name>Madrid</name>
    <ele>650</ele>
  </wpt>
</gpx>`;
    const result = parseGPX(gpx, 'test.gpx');
    expect(result.locations).toHaveLength(1);
    expect(result.locations[0].name).toBe('Madrid');
    expect(result.locations[0].coordinates.altitude).toBeCloseTo(650);
  });

  it('parses GPX with tracks as routes', () => {
    const gpx = `<?xml version="1.0"?>
<gpx version="1.1">
  <trk>
    <name>My Track</name>
    <trkseg>
      <trkpt lat="40.0" lon="-3.0"></trkpt>
      <trkpt lat="41.0" lon="-2.0"></trkpt>
    </trkseg>
  </trk>
</gpx>`;
    const result = parseGPX(gpx, 'track.gpx');
    expect(result.routes).toHaveLength(1);
    expect(result.routes![0].name).toBe('My Track');
  });

  it('throws on GPX with no waypoints and no tracks', () => {
    const gpx = `<?xml version="1.0"?><gpx version="1.1"></gpx>`;
    expect(() => parseGPX(gpx, 'empty.gpx')).toThrow();
  });

  it('throws on malformed XML', () => {
    expect(() => parseGPX('not xml', 'bad.gpx')).toThrow();
  });
});

describe('isValidGPX', () => {
  it('returns true for valid GPX', () => {
    expect(isValidGPX('<?xml version="1.0"?><gpx></gpx>')).toBe(true);
  });
  it('returns false for non-GPX XML', () => {
    expect(isValidGPX('<?xml version="1.0"?><kml></kml>')).toBe(false);
  });
});
