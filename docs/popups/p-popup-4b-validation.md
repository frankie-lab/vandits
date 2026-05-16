# P-POPUP-4B — Collection Dedup (validation)

**Estado:** implementado y verde.
**Scope:** filtro puro sobre etiquetas personales del popup. Sin migraciones,
sin tocar `custom_data.tags`, sin tocar source/provenance, sin tocar UI de
colecciones.

---

## 1. Problema (auditoría sobre producción)

Auditoría sobre `locations` (5.447 POIs): **1.372 POIs (25,2%)** tienen al
menos una etiqueta en `enriched_data.etiquetas_personales` cuyo slug
normalizado coincide con el nombre de una colección a la que ese POI
pertenece. Distribución:

| Colección | POIs con duplicación | Tag personal observado |
|---|---|---|
| FullTrips | 1.343 | `#fulltrips` |
| Atlas Obscura_France | 18 | `#atlas obscura_france` |
| Les Plus Beaux Villages de France | 6 | `#les plus beaux villages de france` |
| Atlas Obscura_España | 4 | `#atlas obscura_españa` |
| Atlas Obscura_Italy | 1 | `#atlasobscura_italy` |

Las 12 colecciones restantes (creadas manualmente) **no** sufren
duplicación.

Causa raíz: pipelines antiguos de import (KML "FullTrips", scraper Atlas
Obscura, scraper Plus Beaux Villages) persistieron el nombre del documento
como tag personal **además** de crear la colección homónima. Hoy renderizamos
ambos por separado (chip de colección vía `LocationCollectionChips` +
hashtag vía `filterPersonalTags`), produciendo duplicación visual.

---

## 2. Regla canónica

> Si `tagSlug(personalTag) === tagSlug(collectionName)` para alguna colección
> a la que el POI pertenece, la etiqueta personal **no se renderiza**. El
> chip de colección permanece intacto.

- Normalización = `tagSlug` (única fuente, importada de
  `@/shared/popup/tags`): `lowercase` → strip `#` → `NFKD` + strip
  diacríticos → colapsar todo carácter no alfanumérico.
- Fuente de colecciones del POI = `getCollectionsForLocation(locationId)`
  (store que lee `collection_items WHERE item_type='place' AND
  item_id = location.id`, ya cacheado y sincronizado con
  `collection-items-changed`).

---

## 3. Implementación

Cambio único:

- `src/domains/content/lib/personal-tags-filter.ts` — sustituye su `toSlug`
  local por `tagSlug` canónico. La lógica de filtrado preexistente ya
  contemplaba la dedupe contra colecciones; el cambio garantiza que la
  normalización es **exactamente** la misma que la del resto de buckets
  (taxonomy / collection / semantic / user) en `dedupePopupTagBuckets`.

No se han tocado:

- `src/components/map/map-popups.ts` (sigue invocando `filterPersonalTags`).
- `src/domains/content/components/LocationCollectionChips.tsx` (fuente de
  verdad del chip).
- `src/services/document-add.service.ts` (no se purgan datos persistidos).
- Cualquier migración o scraper.

---

## 4. Tests

`src/test/personal-tags-collection-dedup.test.ts` — 12/12 verde:

1. `#fulltrips` ↔ FullTrips.
2. `#atlas obscura_france` ↔ Atlas Obscura_France.
3. `#les plus beaux villages de france` ↔ colección homónima.
4. `#atlas obscura_españa` ↔ Atlas Obscura_España (caso QA visible).
5. `#atlasobscura_italy` ↔ Atlas Obscura_Italy (sin espacio).
6. Conserva tags personales sin coincidencia.
7. Mezcla: suprime el duplicado, conserva el resto, preserva orden.
8. Separadores extra (`/`, `&`, `.`, `-`, paréntesis).
9. Deduplica entradas repetidas dentro del array.
10. Devuelve `[]` para input vacío / null / undefined.
11. Ignora entradas no-string y vacías.
12. **No** suprime cuando el POI no está en la colección homónima
    (regla solo aplica cuando hay colisión real con `collection_items`).

`src/test/popup-tags-canonical.test.ts` — sigue verde (13/13).

---

## 5. Validación esperada en producción

- POI Atlas Obscura España (caso QA): chip "Atlas Obscura_España"
  visible, hashtag `#AtlasObscura_España` ya no aparece como tag personal.
- POI de la colección FullTrips: chip "FullTrips" visible, `#fulltrips`
  suprimido.
- POIs con tags personales reales (`#favorito`, `#paratrip2027`, etc.):
  sin cambios.
- POIs cuyas colecciones cambian en runtime: el filtro se re-evalúa
  automáticamente (el popup se regenera vía `subscribeLocationCollections`
  + evento `collection-items-changed`).

---

## 6. Rollback

Un único punto de cambio (la importación de `tagSlug` en
`personal-tags-filter.ts`). Revertir = devolver el `toSlug` local previo.
Sin estado persistido, sin migración, sin coste de recuperación.

---

## 7. Out of scope (no se toca, queda registrado)

- `custom_data.tags` con `#AtlasObscura*` (1.703 filas): no se renderizan
  en UI hoy. Eso es **P-POPUP-4C — import-origin demote** (backfill / fix
  upstream de scraper).
- Source/provenance estructurada (`sourceKind`/`sourceId`): sigue inerte
  (P-POPUP-4A v1).
- Notas, estrellas/visited, geo hierarchy, lifecycle, cámara/subset-fit,
  F2, React migration, PopupShell: no se tocan.
- Saneamiento del dato persistido (purgar las 1.372 entradas duplicadas
  de `etiquetas_personales`): explícitamente **fuera de scope**. La regla
  vive en presentación.
