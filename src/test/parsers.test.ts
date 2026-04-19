import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { parseGeoJSON, isValidGeoJSON } from '@/lib/geojson-parser';
import { parseCSV, isValidCSV } from '@/lib/csv-parser';
// KML and GPX parsers use DOMParser which requires jsdom (already in setup)
import { parseKML } from '@/lib/kml-parser';
import { parseGPX, isValidGPX } from '@/lib/gpx-parser';
import { parseKMZ, isKMZBuffer } from '@/lib/kmz-parser';
import { parseGeoFile } from '@/lib/geo-file-parser';

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

  it('parses Google Earth gx:Track as a route', () => {
    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">
  <Document>
    <name>Track Test</name>
    <Placemark>
      <name>My Track</name>
      <gx:Track>
        <when>2024-01-01T10:00:00Z</when>
        <when>2024-01-01T10:01:00Z</when>
        <gx:coord>-3.70 40.42 0</gx:coord>
        <gx:coord>2.35 48.85 0</gx:coord>
      </gx:Track>
    </Placemark>
  </Document>
</kml>`;
    const result = parseKML(kml, 'track.kml');
    expect(result.routes).toBeDefined();
    expect(result.routes!).toHaveLength(1);
    expect(result.routes![0].coordinates).toHaveLength(2);
    expect(result.routes![0].coordinates[0][0]).toBeCloseTo(40.42);
    expect(result.routes![0].coordinates[0][1]).toBeCloseTo(-3.70);
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

// ── KMZ ──────────────────────────────────────────────────────

const SAMPLE_KML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>KMZ Sample</name>
    <Placemark>
      <name>Madrid</name>
      <Point><coordinates>-3.7,40.4,0</coordinates></Point>
    </Placemark>
  </Document>
</kml>`;

async function buildKMZBuffer(kmlContent = SAMPLE_KML, entryName = 'doc.kml'): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file(entryName, kmlContent);
  return await zip.generateAsync({ type: 'arraybuffer' });
}

describe('parseKMZ', () => {
  it('extracts and parses the inner doc.kml', async () => {
    const buffer = await buildKMZBuffer();
    const document = await parseKMZ(buffer, 'sample.kmz');
    expect(document.locations).toHaveLength(1);
    expect(document.locations[0].name).toBe('Madrid');
  });

  it('finds a KML entry even when not named doc.kml', async () => {
    const buffer = await buildKMZBuffer(SAMPLE_KML, 'FullTrips.kml');
    const document = await parseKMZ(buffer, 'FullTrips.kmz');
    expect(document.locations).toHaveLength(1);
  });

  it('throws when the archive contains no KML', async () => {
    const zip = new JSZip();
    zip.file('readme.txt', 'no kml here');
    const buffer = await zip.generateAsync({ type: 'arraybuffer' });
    await expect(parseKMZ(buffer, 'empty.kmz')).rejects.toThrow(/no contiene/i);
  });

  it('throws on a corrupted/non-zip buffer', async () => {
    const buffer = new TextEncoder().encode('not a zip').buffer;
    await expect(parseKMZ(buffer, 'bad.kmz')).rejects.toThrow();
  });
});

describe('isKMZBuffer', () => {
  it('detects ZIP magic bytes', async () => {
    const buffer = await buildKMZBuffer();
    expect(isKMZBuffer(buffer)).toBe(true);
  });
  it('returns false for plain text', () => {
    const buffer = new TextEncoder().encode('<?xml version="1.0"?>').buffer;
    expect(isKMZBuffer(buffer)).toBe(false);
  });
});

describe('parseGeoFile (KMZ integration)', () => {
  it('routes KMZ buffers through parseKMZ', async () => {
    const buffer = await buildKMZBuffer();
    const result = await parseGeoFile(buffer, 'sample.kmz');
    expect(result.success).toBe(true);
    expect(result.format).toBe('kmz');
    expect(result.document?.locations).toHaveLength(1);
  });

  it('still handles plain string input for text formats', async () => {
    const result = await parseGeoFile(SAMPLE_KML, 'sample.kml');
    expect(result.success).toBe(true);
    expect(result.format).toBe('kml');
  });
});
