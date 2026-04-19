import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { parseKML } from '@/lib/kml-parser';
import { parseGPX } from '@/lib/gpx-parser';
import { parseGeoJSON } from '@/lib/geojson-parser';
import { parseKMZ } from '@/lib/kmz-parser';
import { normalizeColor } from '@/lib/parsers/shared';

// Mismo viaje sintético en KML / GPX / GeoJSON.
// Dos puntos europeos + una ruta que los une, con timestamp y color rojo.
//   P1: Madrid   -3.70, 40.42, 2024-03-15T10:00:00Z
//   P2: París     2.35, 48.85
// Color esperado: #ff0000 en los tres formatos.

const ISO = '2024-03-15T10:00:00Z';
const EXPECTED_DATE = new Date(ISO).getTime();

const KML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Trip</name>
    <Style id="redLine">
      <LineStyle>
        <color>ff0000ff</color>
      </LineStyle>
    </Style>
    <Placemark>
      <name>Madrid</name>
      <TimeStamp><when>${ISO}</when></TimeStamp>
      <Point><coordinates>-3.70,40.42,0</coordinates></Point>
    </Placemark>
    <Placemark>
      <name>Paris</name>
      <Point><coordinates>2.35,48.85,0</coordinates></Point>
    </Placemark>
    <Placemark>
      <name>Trip Route</name>
      <styleUrl>#redLine</styleUrl>
      <LineString>
        <coordinates>-3.70,40.42,0 2.35,48.85,0</coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>`;

const GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>Trip</name></metadata>
  <wpt lat="40.42" lon="-3.70">
    <name>Madrid</name>
    <time>${ISO}</time>
  </wpt>
  <wpt lat="48.85" lon="2.35">
    <name>Paris</name>
  </wpt>
  <trk>
    <name>Trip Route</name>
    <extensions>
      <line><color>#ff0000</color></line>
    </extensions>
    <trkseg>
      <trkpt lat="40.42" lon="-3.70"><time>${ISO}</time></trkpt>
      <trkpt lat="48.85" lon="2.35"></trkpt>
    </trkseg>
  </trk>
</gpx>`;

const GEOJSON = JSON.stringify({
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { name: 'Madrid', time: ISO },
      geometry: { type: 'Point', coordinates: [-3.70, 40.42] },
    },
    {
      type: 'Feature',
      properties: { name: 'Paris' },
      geometry: { type: 'Point', coordinates: [2.35, 48.85] },
    },
    {
      type: 'Feature',
      properties: { name: 'Trip Route', stroke: '#ff0000' },
      geometry: { type: 'LineString', coordinates: [[-3.70, 40.42], [2.35, 48.85]] },
    },
  ],
});

// KMZ = misma carga útil KML, comprimida en ZIP. Debe heredar la paridad.
async function buildKMZ(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file('doc.kml', KML);
  return await zip.generateAsync({ type: 'arraybuffer' });
}

type ParseFn = () => ReturnType<typeof parseKML> | Promise<ReturnType<typeof parseKML>>;
const cases: [string, ParseFn][] = [
  ['KML', () => parseKML(KML, 'trip.kml')],
  ['GPX', () => parseGPX(GPX, 'trip.gpx')],
  ['GeoJSON', () => parseGeoJSON(GEOJSON, 'trip.geojson')],
  ['KMZ', async () => parseKMZ(await buildKMZ(), 'trip.kmz')],
];

describe('Parity across KML/KMZ/GPX/GeoJSON parsers', () => {
  for (const [label, parse] of cases) {
    describe(label, () => {
      it('extracts exactly 2 points', async () => {
        const doc = await parse();
        expect(doc.locations).toHaveLength(2);
      });

      it('extracts exactly 1 route', async () => {
        const doc = await parse();
        expect(doc.routes).toBeDefined();
        expect(doc.routes!).toHaveLength(1);
      });

      it('preserves route color as #ff0000', async () => {
        const doc = await parse();
        expect(doc.routes![0].color).toBe('#ff0000');
      });

      it('preserves point timestamp on the first point', async () => {
        const doc = await parse();
        const madrid = doc.locations.find((l) => l.name === 'Madrid');
        expect(madrid).toBeDefined();
        expect(Math.abs(madrid!.createdAt.getTime() - EXPECTED_DATE)).toBeLessThan(2000);
      });

      it('computes continent = Europa for both points', async () => {
        const doc = await parse();
        for (const loc of doc.locations) {
          expect(loc.continent).toBe('Europa');
        }
      });
    });
  }
});
    });
  }
});

describe('normalizeColor helper', () => {
  it('handles numeric rgb', () => {
    expect(normalizeColor(16711680)).toBe('#ff0000');
  });
  it('handles "#rrggbb"', () => {
    expect(normalizeColor('#ff0000')).toBe('#ff0000');
  });
  it('handles KML aabbggrr → rrggbb', () => {
    // ff0000ff (KML alpha=ff, b=00, g=00, r=ff) → red
    expect(normalizeColor('ff0000ff')).toBe('#ff0000');
  });
  it('handles short hex', () => {
    expect(normalizeColor('#f00')).toBe('#ff0000');
  });
});
