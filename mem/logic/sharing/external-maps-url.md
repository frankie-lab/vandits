---
name: external maps URL canon v2
description: Canon "Abrir/Buscar en Google/Apple Maps" — helper único buildExternalMapLink con mode + confidence + label
type: feature
---
"Abrir en Maps" desde popup POI / ShareSheet usa un helper único:

`buildExternalMapLink(loc, provider)` en `src/domains/sharing/lib/external-maps-url.ts` devuelve `{ url, provider, mode, confidence, label }`.

**Escalera de prioridad (idéntica Google y Apple)**:

1. **placeId estructurado** (`external_refs.maps.{provider}.placeId`) → `mode='place_id'`, `confidence='high'`.
2. **name + coords válidas** → `mode='name_coords'`, `confidence='medium'`.
3. **solo coords** → `mode='coords'`, `confidence='low'`.
4. **URL persistida** (`external_refs.maps.{provider}.url`, host whitelist) → último recurso cuando no hay placeId/name/coords. NUNCA es identidad principal.

**Labels (estrictos por confidence, NO mezclar)**:
- `high`   → `"Abrir en {Google|Apple} Maps"`
- `medium` → `"Buscar en {Google|Apple} Maps"`
- `low`    → `"Abrir coordenadas en {Google|Apple} Maps"`

**Formato URL Google**:
- `place_id`: `https://www.google.com/maps/search/?api=1&query={name||lat,lng}&query_place_id={placeId}` (ejemplo validado: Elevador del Monte de San Pedro).
- `name_coords`: `https://www.google.com/maps/search/?api=1&query={encName} {lat},{lng}` (query única "nombre lat,lng" — PROHIBIDO `query_coords`, no es API pública).
- `coords`: `https://www.google.com/maps/search/?api=1&query={lat},{lng}`.

**Formato URL Apple**:
- `name_coords`: `https://maps.apple.com/?q={encName}&ll={lat},{lng}`.
- `coords`: `https://maps.apple.com/?ll={lat},{lng}`.
- Apple no tiene placeId estructurado público equivalente hoy — rama 1 reservada para cuando se añada.

**Reglas**:
- Validación dura: `new URL()` + host whitelist (Google: `google.com`, `www.google.com`, `maps.google.com`, `goo.gl`, `maps.app.goo.gl`; Apple: `maps.apple.com`, `beta.maps.apple.com`).
- placeId SIEMPRE preferido sobre URL persistida.
- Las URLs largas persistidas se deprioritizan al último escalón (no son identidad principal, sólo backup cuando todo falla).
- Vandits sigue siendo SoT del share. Google/Apple son adaptadores externos en acciones secundarias del popup overflow menu y ShareSheet.
- UI debe consumir `link.label` directamente (no hardcodear "Abrir en X Maps"). Si `link.url === null`, omitir el item.

**Wrappers legacy** (`resolveGoogleMapsUrl` / `resolveAppleMapsUrl`):
- Devuelven `{ url, source: 'canonical' | 'coords-fallback' }`.
- Mapeo: `mode ∈ {place_id, name_coords}` → `'canonical'`; `mode === 'coords'` → `'coords-fallback'`.
- Consumidos por `channel-adapters.ts` (`openGoogleMaps`/`openAppleMaps`).

**Fuera de alcance v2** (deuda explícita):
- Escritura de `placeId` desde el pipeline de enrichment (Places API New).
- UI admin para pegar manualmente placeId/URL.
- Apple `placeId` estructurado (no existe campo público equivalente hoy).
- Otros providers (`osm`, `wikidata`, `here`, `waze`) — namespace `external_refs.{provider}` abierto pero no implementado.
- Backfill masivo: POIs existentes siguen 100% en `name_coords` o `coords` (compat total).
- Parsear URLs largas de Google Maps para extraer CID/placeId (rechazado: frágil).
