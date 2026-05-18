import { GeoLocation, KMLDocument, EnrichedLocationData } from '@/types/location';
import {
  ParsedGeoContent,
  ParsedPoint,
  ParsedRoute,
  cleanText,
  getContinent,
  normalizeColor,
  parseFlexibleDate,
  pickTimestampFromCustomData,
  extractGeoMeta,
  stripGeoMetaAndDateKeys,
  toKMLDocument,
} from './parsers/shared';
import {
  evaluatePoiExport,
  type ExportScope,
  type ExportContext,
} from '@/domains/content/lib/poi-export-eligibility';
import { splitDescriptionParagraphs } from '@/shared/enrichment/format-description';

function extractCoordinatesPair(coordString: string): { lat: number; lng: number; altitude?: number } | null {
  const cleaned = coordString.trim();
  const parts = cleaned.split(',').map((p) => parseFloat(p.trim()));
  if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return {
      lng: parts[0],
      lat: parts[1],
      altitude: parts.length > 2 && !isNaN(parts[2]) ? parts[2] : undefined,
    };
  }
  return null;
}

function parseLineCoordinates(text: string | null | undefined): [number, number][] {
  if (!text) return [];
  const result: [number, number][] = [];
  text
    .trim()
    .split(/\s+/)
    .forEach((tuple) => {
      const c = extractCoordinatesPair(tuple);
      if (c) result.push([c.lat, c.lng]);
    });
  return result;
}

function parseExtendedData(placemark: Element): Record<string, string> {
  const customData: Record<string, string> = {};
  placemark.querySelectorAll('ExtendedData Data').forEach((data) => {
    const name = data.getAttribute('name');
    const value = data.querySelector('value')?.textContent;
    if (name && value) customData[name] = cleanText(value) || value;
  });
  placemark.querySelectorAll('ExtendedData SchemaData SimpleData').forEach((data) => {
    const name = data.getAttribute('name');
    const value = data.textContent;
    if (name && value) customData[name] = cleanText(value) || value;
  });
  return customData;
}

function parseTimestamp(placemark: Element, customData: Record<string, string>): Date | null {
  const candidates = [
    placemark.querySelector('TimeStamp when')?.textContent,
    placemark.querySelector('TimeSpan begin')?.textContent,
    placemark.querySelector('gx\\:TimeStamp when, TimeStamp when')?.textContent,
  ];
  for (const c of candidates) {
    if (c) {
      const parsed = parseFlexibleDate(c);
      if (parsed) return parsed;
    }
  }
  return pickTimestampFromCustomData(customData);
}

// Build a styleId → hex color lookup from <Style id="..."><LineStyle><color>...
function buildStyleColorMap(doc: Document): Map<string, string> {
  const map = new Map<string, string>();
  doc.querySelectorAll('Style[id]').forEach((style) => {
    const id = style.getAttribute('id');
    const colorText = style.querySelector('LineStyle > color')?.textContent;
    if (id && colorText) {
      const hex = normalizeColor(colorText.trim());
      if (hex) map.set(id, hex);
    }
  });
  // StyleMap normal → Style id
  doc.querySelectorAll('StyleMap[id]').forEach((sm) => {
    const id = sm.getAttribute('id');
    if (!id) return;
    const pairs = sm.querySelectorAll('Pair');
    pairs.forEach((pair) => {
      const key = pair.querySelector('key')?.textContent;
      const url = pair.querySelector('styleUrl')?.textContent?.replace(/^#/, '');
      if (key === 'normal' && url && map.has(url)) {
        map.set(id, map.get(url)!);
      }
    });
  });
  return map;
}

function getPlacemarkColor(placemark: Element, styleMap: Map<string, string>): string | undefined {
  // Inline style first
  const inline = placemark.querySelector(':scope > Style LineStyle > color')?.textContent;
  if (inline) {
    const hex = normalizeColor(inline.trim());
    if (hex) return hex;
  }
  // Referenced style
  const ref = placemark.querySelector(':scope > styleUrl')?.textContent?.replace(/^#/, '');
  if (ref && styleMap.has(ref)) return styleMap.get(ref);
  return undefined;
}

export function parseKMLToContent(content: string, fileName: string): ParsedGeoContent {
  const parser = new DOMParser();
  const doc = parser.parseFromString(content, 'text/xml');
  const parseError = doc.querySelector('parsererror');
  if (parseError) throw new Error('Error al parsear el archivo KML');

  const docName = cleanText(doc.querySelector('Document > name')?.textContent) || fileName.replace(/\.kml$/i, '');
  const styleMap = buildStyleColorMap(doc);

  const points: ParsedPoint[] = [];
  const routes: ParsedRoute[] = [];

  doc.querySelectorAll('Placemark').forEach((placemark, index) => {
    const name = cleanText(placemark.querySelector(':scope > name')?.textContent) || `Punto ${index + 1}`;
    const description = cleanText(placemark.querySelector(':scope > description')?.textContent);
    const customDataRaw = parseExtendedData(placemark);
    const timestamp = parseTimestamp(placemark, customDataRaw) || undefined;
    const geoMeta = extractGeoMeta(customDataRaw);
    const customData = stripGeoMetaAndDateKeys(customDataRaw);
    const placemarkColor = getPlacemarkColor(placemark, styleMap);

    // 1) LineString / MultiGeometry → ParsedRoute
    const lineStrings = placemark.querySelectorAll('LineString > coordinates');
    let hasRoute = false;
    lineStrings.forEach((coordsEl, i) => {
      const coords = parseLineCoordinates(coordsEl.textContent);
      if (coords.length > 1) {
        routes.push({
          id: crypto.randomUUID(),
          name: lineStrings.length > 1 ? `${name} (${i + 1})` : name,
          coordinates: coords,
          color: placemarkColor,
          date: timestamp,
          customData: Object.keys(customData).length > 0 ? { ...customData } : undefined,
        });
        hasRoute = true;
      }
    });

    // 1b) Google Earth gx:Track / gx:MultiTrack → ParsedRoute
    // Very common in KMZ exports. Format:
    //   <gx:Track><when>...</when><gx:coord>lng lat alt</gx:coord>...</gx:Track>
    // getElementsByTagName('gx:Track') works in DOMParser; some parsers also expose the
    // namespace-stripped name 'Track', so we try both.
    const gxTracks: Element[] = [];
    Array.from(placemark.getElementsByTagName('gx:Track')).forEach((t) => gxTracks.push(t));
    if (gxTracks.length === 0) {
      Array.from(placemark.getElementsByTagName('Track')).forEach((t) => gxTracks.push(t));
    }
    gxTracks.forEach((track, i) => {
      let coordEls = Array.from(track.getElementsByTagName('gx:coord'));
      if (coordEls.length === 0) coordEls = Array.from(track.getElementsByTagName('coord'));
      const coords: [number, number][] = [];
      coordEls.forEach((el) => {
        const parts = (el.textContent || '').trim().split(/\s+/).map(parseFloat);
        // gx:coord order is "lng lat [alt]"
        if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          coords.push([parts[1], parts[0]]);
        }
      });
      if (coords.length > 1) {
        routes.push({
          id: crypto.randomUUID(),
          name: gxTracks.length > 1 ? `${name} (${i + 1})` : name,
          coordinates: coords,
          color: placemarkColor,
          date: timestamp,
          customData: Object.keys(customData).length > 0 ? { ...customData } : undefined,
        });
        hasRoute = true;
      }
    });

    // 2) Point geometry
    const pointCoordEl = placemark.querySelector(':scope > Point > coordinates, :scope > MultiGeometry > Point > coordinates');
    if (pointCoordEl?.textContent) {
      const coords = extractCoordinatesPair(pointCoordEl.textContent);
      if (coords) {
        points.push({
          id: crypto.randomUUID(),
          name,
          description,
          coordinates: coords,
          timestamp,
          continent: getContinent(coords.lat, coords.lng),
          country: geoMeta.country,
          region: geoMeta.region,
          zone: geoMeta.zone,
          customData: Object.keys(customData).length > 0 ? customData : undefined,
        });
      }
      return;
    }

    // 3) If we already produced a route, do NOT also emit a synthetic endpoint.
    if (hasRoute) return;

    // 4) Polygon → centroid as a single point (legacy behaviour for area placemarks)
    const polyCoords = placemark.querySelector('Polygon coordinates')?.textContent;
    if (polyCoords) {
      const ring = parseLineCoordinates(polyCoords);
      if (ring.length > 0) {
        const lat = ring.reduce((s, p) => s + p[0], 0) / ring.length;
        const lng = ring.reduce((s, p) => s + p[1], 0) / ring.length;
        if (!isNaN(lat) && !isNaN(lng)) {
          points.push({
            id: crypto.randomUUID(),
            name,
            description,
            coordinates: { lat, lng },
            timestamp,
            continent: getContinent(lat, lng),
            country: geoMeta.country,
            region: geoMeta.region,
            zone: geoMeta.zone,
            customData: Object.keys(customData).length > 0 ? customData : undefined,
          });
        }
      }
      return;
    }

    // 5) LookAt fallback (camera anchor)
    const lookAt = placemark.querySelector('LookAt');
    if (lookAt) {
      const lat = parseFloat(lookAt.querySelector('latitude')?.textContent || '');
      const lng = parseFloat(lookAt.querySelector('longitude')?.textContent || '');
      if (!isNaN(lat) && !isNaN(lng)) {
        points.push({
          id: crypto.randomUUID(),
          name,
          description,
          coordinates: { lat, lng },
          timestamp,
          continent: getContinent(lat, lng),
          country: geoMeta.country,
          region: geoMeta.region,
          zone: geoMeta.zone,
          customData: Object.keys(customData).length > 0 ? customData : undefined,
        });
      }
    }
  });

  return {
    documentName: docName,
    fileName,
    points,
    routes,
  };
}

export function parseKML(content: string, fileName: string): KMLDocument {
  const parsed = parseKMLToContent(content, fileName);
  console.log(`Parsed ${parsed.points.length} points and ${parsed.routes.length} routes from KML`);
  return toKMLDocument(parsed);
}

function formatEnrichedDescription(loc: GeoLocation): string {
  const enriched = loc.enrichedData;
  if (!enriched) return loc.description || '';

  const parts: string[] = [];
  if (enriched.imagen) {
    parts.push(`<img src="${enriched.imagen}" style="max-width:100%;height:auto;margin-bottom:10px;" />`);
  }
  parts.push(`<b>${enriched.nombre_lugar}</b>`);
  parts.push('');
  parts.push(`<i>${enriched.localizacion}</i>`);
  parts.push('');
  parts.push(enriched.descripcion);
  parts.push('');
  parts.push(`<b></b> ${enriched.punto_destacado}`);
  parts.push('');
  if (enriched.observacion) {
    parts.push(`<i>${enriched.observacion}</i>`);
    parts.push('');
  }
  if (enriched.etiquetas && enriched.etiquetas.length > 0) {
    parts.push(enriched.etiquetas.join(''));
    parts.push('');
  }
  parts.push('---');
  parts.push(`<b>Tipo:</b> ${enriched.datos_clave.tipo}`);
  if (enriched.datos_clave.dimension_principal) parts.push(`<b>Dimensión:</b> ${enriched.datos_clave.dimension_principal}`);
  if (enriched.datos_clave.acceso) parts.push(`<b>Acceso:</b> ${enriched.datos_clave.acceso}`);
  if (enriched.datos_clave.estado_proteccion) parts.push(`<b>Protección:</b> ${enriched.datos_clave.estado_proteccion}`);
  parts.push(`<b>Coordenadas:</b> ${enriched.datos_clave.coordenadas}`);
  if (enriched.datos_clave.web_referencia) {
    const url = enriched.datos_clave.web_referencia.startsWith('http')
      ? enriched.datos_clave.web_referencia
      : `https://${enriched.datos_clave.web_referencia}`;
    parts.push(`<b>Web:</b> <a href="${url}" target="_blank">${enriched.datos_clave.web_referencia}</a>`);
  }
  parts.push('---');
  parts.push('');
  parts.push('<small><b>Fuentes:</b></small>');
  enriched.fuentes.forEach((fuente) => parts.push(`<small>• ${fuente}</small>`));
  return parts.join('<br/>');
}

/**
 * Plain-text formatter for Guru Maps (no HTML rendering in popups).
 * Strips any residual tags, splits long descriptions into paragraphs,
 * and uses real line breaks + Unicode separators.
 */
function formatEnrichedDescriptionPlain(loc: GeoLocation): string {
  const enriched = loc.enrichedData;
  const stripTags = (s: string) => (s || '').replace(/<[^>]+>/g, '').trim();

  if (!enriched) return stripTags(loc.description || '');

  const sep = '─'.repeat(20);
  const lines: string[] = [];

  lines.push(stripTags(enriched.nombre_lugar));
  if (enriched.localizacion) lines.push(stripTags(enriched.localizacion));
  lines.push('');

  // Description: split into paragraphs (helper)
  const paragraphs = splitDescriptionParagraphs(stripTags(enriched.descripcion));
  paragraphs.forEach((p, i) => {
    lines.push(p);
    if (i < paragraphs.length - 1) lines.push('');
  });
  lines.push('');

  if (enriched.punto_destacado) {
    lines.push(`Destacado: ${stripTags(enriched.punto_destacado)}`);
    lines.push('');
  }
  if (enriched.observacion) {
    lines.push(`Nota: ${stripTags(enriched.observacion)}`);
    lines.push('');
  }
  if (enriched.etiquetas && enriched.etiquetas.length > 0) {
    // Each tag prefixed with #, separated by spaces
    const tags = enriched.etiquetas
      .map(t => stripTags(t).replace(/^#+/, ''))
      .filter(Boolean)
      .map(t => `#${t}`)
      .join(' ');
    if (tags) {
      lines.push(tags);
      lines.push('');
    }
  }

  lines.push(sep);
  lines.push(`Tipo: ${stripTags(enriched.datos_clave.tipo)}`);
  if (enriched.datos_clave.dimension_principal) lines.push(`Dimensión: ${stripTags(enriched.datos_clave.dimension_principal)}`);
  if (enriched.datos_clave.acceso) lines.push(`Acceso: ${stripTags(enriched.datos_clave.acceso)}`);
  if (enriched.datos_clave.estado_proteccion) lines.push(`Protección: ${stripTags(enriched.datos_clave.estado_proteccion)}`);
  lines.push(`Coordenadas: ${enriched.datos_clave.coordenadas}`);
  if (enriched.datos_clave.web_referencia) {
    const url = enriched.datos_clave.web_referencia.startsWith('http')
      ? enriched.datos_clave.web_referencia
      : `https://${enriched.datos_clave.web_referencia}`;
    lines.push(`Web: ${url}`);
  }
  lines.push(sep);

  if (enriched.imagen) {
    lines.push('');
    lines.push(`Imagen: ${enriched.imagen}`);
  }

  if (enriched.fuentes && enriched.fuentes.length > 0) {
    lines.push('');
    lines.push('Fuentes:');
    enriched.fuentes.forEach((fuente) => {
      const clean = stripTags(fuente).replace(/^•\s*/, '');
      if (clean) lines.push(`• ${clean}`);
    });
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export type KMLExportTarget = 'general' | 'mymaps' | 'gurumaps';

/**
 * PR-EXPORT-1 — Filtro defensivo del motor. Aplica el contrato canónico
 * `evaluatePoiExport` antes de serializar. Es defensa en profundidad: la
 * puerta primaria está en los call sites de UI (ExportPanel, SelectionActions),
 * pero si alguien añade un call site nuevo sin filtrar, este assert evita
 * fugas (descarte silencioso + console.warn agregado).
 *
 * Compat: `scope` default = `'internal'`. ExportPanel y SelectionActions
 * pasan scope explícito SIEMPRE. Llamadas sin scope explícito emiten warn
 * único por sesión.
 */

const warnedDefaultScope = new Set<string>();
function maybeWarnDefaultScope(fnName: string, scopeProvided: boolean): void {
  if (scopeProvided) return;
  if (warnedDefaultScope.has(fnName)) return;
  warnedDefaultScope.add(fnName);
  // eslint-disable-next-line no-console
  console.warn(
    `[kml-parser] ${fnName} invocado sin scope explícito — compat temporal (PR-EXPORT-1). Fix call site para pasar scope: 'public' | 'internal'.`,
  );
}

function applyExportGate(
  locations: GeoLocation[],
  scope: ExportScope,
  ctx: ExportContext | undefined,
  fnName: string,
): GeoLocation[] {
  // Sin ctx (compat/test/legacy): NO chequeo de owner para internal.
  // Para public siempre chequeamos elegibilidad porque no requiere ctx.
  if (scope === 'public') {
    const result: GeoLocation[] = [];
    let dropped = 0;
    for (const loc of locations) {
      const r = evaluatePoiExport(loc, 'public', ctx ?? { currentUserId: null });
      if (r.eligible) result.push(loc);
      else dropped++;
    }
    if (dropped > 0) {
      // eslint-disable-next-line no-console
      console.warn(
        `[kml-parser] ${fnName} scope='public': descartados ${dropped}/${locations.length} POIs no elegibles (defensa en profundidad).`,
      );
    }
    return result;
  }
  // scope === 'internal'
  if (!ctx) return locations; // compat sin ctx
  const result: GeoLocation[] = [];
  let dropped = 0;
  for (const loc of locations) {
    const r = evaluatePoiExport(loc, 'internal', ctx);
    if (r.eligible) result.push(loc);
    else dropped++;
  }
  if (dropped > 0) {
    // eslint-disable-next-line no-console
    console.warn(
      `[kml-parser] ${fnName} scope='internal': descartados ${dropped}/${locations.length} POIs no elegibles (no-owner u otras razones).`,
    );
  }
  return result;
}

export function exportToKML(
  locations: GeoLocation[],
  documentName: string,
  target: KMLExportTarget = 'general',
  scope: ExportScope = 'internal',
  ctx?: ExportContext,
  options: { scopeProvided?: boolean } = {},
): string {
  maybeWarnDefaultScope('exportToKML', options.scopeProvided !== false);
  const filtered = applyExportGate(locations, scope, ctx, 'exportToKML');
  const isGuru = target === 'gurumaps';
  const placemarks = filtered
    .map((loc) => {
      const description = isGuru
        ? formatEnrichedDescriptionPlain(loc)
        : formatEnrichedDescription(loc);
      const snippet = isGuru && loc.enrichedData
        ? `<Snippet maxLines="2">${escapeXml(
            [loc.enrichedData.nombre_lugar, loc.enrichedData.localizacion]
              .filter(Boolean)
              .join(' — '),
          )}</Snippet>`
        : '';
      return `
  <Placemark>
    <name>${escapeXml(loc.name)}</name>
    ${snippet}
    ${description ? `<description><![CDATA[${description}]]></description>` : ''}
    <ExtendedData>
      <Data name="export_scope"><value>${scope}</value></Data>
      ${loc.continent ? `<Data name="continent"><value>${escapeXml(loc.continent)}</value></Data>` : ''}
      ${loc.country ? `<Data name="country"><value>${escapeXml(loc.country)}</value></Data>` : ''}
      ${loc.region ? `<Data name="region"><value>${escapeXml(loc.region)}</value></Data>` : ''}
      ${loc.zone ? `<Data name="zone"><value>${escapeXml(loc.zone)}</value></Data>` : ''}
      ${loc.enrichedData ? `<Data name="enriched"><value>true</value></Data>` : ''}
      ${loc.enrichedData?.etiquetas ? `<Data name="tags"><value>${escapeXml(loc.enrichedData.etiquetas.join(', '))}</value></Data>` : ''}
      ${Object.entries(loc.customData || {})
        .map(([key, value]) => `<Data name="${escapeXml(key)}"><value>${escapeXml(value)}</value></Data>`)
        .join('')}
    </ExtendedData>
    <Point>
      <coordinates>${loc.coordinates.lng},${loc.coordinates.lat}${loc.coordinates.altitude ? `,${loc.coordinates.altitude}` : ''}</coordinates>
    </Point>
  </Placemark>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:atom="http://www.w3.org/2005/Atom">
  <Document>
    <name>${escapeXml(documentName)}</name>
    <atom:author><atom:name>vandits-${scope}</atom:name></atom:author>
    ${placemarks}
  </Document>
</kml>`;
}

export function exportToCSV(
  locations: GeoLocation[],
  scope: ExportScope = 'internal',
  ctx?: ExportContext,
  options: { scopeProvided?: boolean } = {},
): string {
  maybeWarnDefaultScope('exportToCSV', options.scopeProvided !== false);
  const filtered = applyExportGate(locations, scope, ctx, 'exportToCSV');
  const headers = ['name', 'description', 'latitude', 'longitude', 'altitude', 'continent', 'country', 'region', 'zone', 'export_scope'];
  const customKeys = new Set<string>();
  filtered.forEach((loc) => Object.keys(loc.customData || {}).forEach((k) => customKeys.add(k)));
  const allHeaders = [...headers, ...Array.from(customKeys)];
  const rows = filtered.map((loc) => {
    const baseRow = [
      loc.name,
      loc.description || '',
      loc.coordinates.lat.toString(),
      loc.coordinates.lng.toString(),
      loc.coordinates.altitude?.toString() || '',
      loc.continent || '',
      loc.country || '',
      loc.region || '',
      loc.zone || '',
      scope,
    ];
    const customRow = Array.from(customKeys).map((key) => loc.customData?.[key] || '');
    return [...baseRow, ...customRow].map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',');
  });
  return [allHeaders.join(','), ...rows].join('\n');
}

export function exportToJSON(
  locations: GeoLocation[],
  scope: ExportScope = 'internal',
  ctx?: ExportContext,
  options: { scopeProvided?: boolean } = {},
): string {
  maybeWarnDefaultScope('exportToJSON', options.scopeProvided !== false);
  const filtered = applyExportGate(locations, scope, ctx, 'exportToJSON');
  return JSON.stringify({ export_scope: scope, locations: filtered }, null, 2);
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
