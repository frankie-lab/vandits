

# Plan: Corregir los dos fallos pendientes en la importacion

## Cambio 1 — Pasar locations originales en flujo de deduplicacion

**Archivo**: `src/domains/content/components/FileUploadZone.tsx`, linea 680

```
// ANTES:
documentLocations: dedupedDocument.locations.filter(l => l.placeType !== 'route'),

// DESPUES:
documentLocations: document.locations.filter(l => l.placeType !== 'route'),
```

La variable `document` ya existe en el scope (linea 633, destructuring de `deduplicationState`). Contiene los 9 puntos originales del archivo.

## Cambio 2 — Priorizar catalogo en resolveLocationId

**Archivo**: `src/domains/content/components/FileUploadZone.tsx`, lineas 363-372

```
// ANTES:
const docMatch = findClosestLocation(lat, lng, linkingData.documentLocations);
if (!docMatch) return undefined;
if (matchingSet.has(docMatch.id)) {
  const catalogMatch = findClosestLocation(lat, lng, linkingData.catalogLocations);
  return catalogMatch?.id;
}
return docMatch.id;

// DESPUES:
const catalogMatch = findClosestLocation(lat, lng, linkingData.catalogLocations);
if (catalogMatch) return catalogMatch.id;
const docMatch = findClosestLocation(lat, lng, linkingData.documentLocations);
if (docMatch) return docMatch.id;
return undefined;
```

## Resultado

Con estos dos cambios, la proxima importacion de un documento:
- Proyectara los 9 puntos como parent waypoints del itinerario
- Los 5 que coinciden con catalogo tendran `location_id` apuntando al catalogo
- Los 4 nuevos tendran `location_id` apuntando al punto del documento
- El timeline mostrara los 9 puntos, igual que "Galicia"

