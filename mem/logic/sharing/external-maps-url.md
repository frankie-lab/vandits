---
name: external maps URL resolver
description: Canon "Abrir en Google/Apple Maps" — referencia externa persistida con fallback a coordenadas
type: feature
---
"Abrir en Maps" desde el popup del POI usa una escalera única (helper `resolveGoogleMapsUrl` / `resolveAppleMapsUrl` en `src/domains/sharing/lib/external-maps-url.ts`):

1. Si `locations.external_refs.maps.google.placeId` existe → URL canónica `https://www.google.com/maps/place/?q=place_id:{id}` (`source: 'canonical'`).
2. Si no, si `external_refs.maps.google.url` es válida (host whitelist: `google.com`, `www.google.com`, `maps.google.com`, `goo.gl`, `maps.app.goo.gl`) → usar tal cual.
3. Si no → fallback `maps/search/?api=1&query=lat,lng` (`source: 'coords-fallback'`).

Misma escalera para Apple (whitelist: `maps.apple.com`, `beta.maps.apple.com`).

**Reglas**:
- `external_refs` es columna `jsonb` opcional en `locations` (formato `{ maps: { google: {placeId?, url?, verifiedAt?}, apple: {url?, verifiedAt?} } }`).
- `placeId` SIEMPRE preferido sobre `url` cuando ambos existen.
- Validación dura: `new URL()` + host whitelist. URL malformada o host no permitido cae al fallback, nunca se abre.
- Vista `v_locations_resolved` expone `external_refs` al cliente.
- Mapper único `dbLocationToGeoLocation` poblando `GeoLocation.externalRefs`.
- Adapters únicos `openGoogleMaps` / `openAppleMaps` en `channel-adapters.ts` delegan en el resolver. Renderer del popup no conoce el resolver.

**Fuera de alcance v1** (deuda explícita):
- Escritura desde el pipeline de enrichment (Places API New → placeId).
- UI admin para pegar manualmente placeId/URL.
- Validación periódica de `verifiedAt`.
- Otros providers (`waze`, `here`, …) — namespace `external_refs.{provider}` abierto pero no implementado.
- Backfill masivo: POIs existentes siguen 100% en fallback por coords (compat total).
