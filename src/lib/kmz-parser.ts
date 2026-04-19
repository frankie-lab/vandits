import JSZip from 'jszip';
import { KMLDocument } from '@/types/location';
import { parseKML } from './kml-parser';

/**
 * Parser for KMZ files (Google Earth compressed KML).
 * KMZ is a ZIP archive that contains a `doc.kml` (or similar) plus optional
 * resources (icons, images). We extract the first KML file and delegate to
 * `parseKML`. Embedded icons/overlays are intentionally ignored — we only
 * extract geometry and metadata, matching how plain KML is handled today.
 */
export async function parseKMZ(input: ArrayBuffer | Uint8Array | Blob, fileName: string): Promise<KMLDocument> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(input as ArrayBuffer);
  } catch (e) {
    throw new Error(
      `No se pudo descomprimir el archivo KMZ "${fileName}". Verifica que no esté dañado.`,
    );
  }

  // Find the first .kml file inside the archive. Convention is `doc.kml`,
  // but some exports use other names (e.g. `FullTrips.kml`).
  const kmlEntry = Object.values(zip.files).find(
    (f) => !f.dir && f.name.toLowerCase().endsWith('.kml'),
  );

  if (!kmlEntry) {
    throw new Error(
      `El archivo KMZ "${fileName}" no contiene ningún archivo .kml en su interior.`,
    );
  }

  const kmlContent = await kmlEntry.async('string');
  // Use the original .kmz filename so downstream code shows it correctly.
  return parseKML(kmlContent, fileName);
}

/** Detect KMZ by ZIP magic bytes (PK\x03\x04) at the beginning of the buffer. */
export function isKMZBuffer(buffer: ArrayBuffer | Uint8Array): boolean {
  const view = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return view.length >= 4 && view[0] === 0x50 && view[1] === 0x4b && view[2] === 0x03 && view[3] === 0x04;
}
