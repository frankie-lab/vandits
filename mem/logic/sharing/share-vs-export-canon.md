---
name: Share vs Export canon (PR-SHARE-1 v1)
description: Sharing humano/social = URL pública Vandits; Export técnico = archivo. Helpers independientes, ShareSheet único, dominio centralizado.
type: feature
---

# Share vs Export canon (PR-SHARE-1 v1)

**Regla dura**: Share != Export. Coexisten dos pipelines independientes
que NUNCA se invocan mutuamente:

- **Share** (humano/social, URL pública Vandits):
  `src/domains/sharing/` con `share-url.ts` (SoT dominio),
  `share-eligibility.ts` (`evaluatePoiShare`, `partitionForShare`),
  `share-payload.ts`, `channel-adapters.ts` y `<ShareSheet />` global.
  Abrir con `openShareSheet(target)`. Adaptadores secundarios: Google
  Maps y Apple Maps (sólo `kind='poi'`, reciben `GeoLocation`).

- **Export** (técnico, archivo): `evaluatePoiExport` en
  `poi-export-eligibility.ts` (PR-EXPORT-1). Intacto.

## URLs v1

`/p/{poiId}`, `/c/{collectionId}`, `/r/{routeId}`. Dominio
`vandits.lovable.app` SÓLO en `share-url.ts` (+ `index.html`). Override
runtime: `VITE_PUBLIC_BASE_URL`.

## Elegibilidad share

POI-9 / POI-10 + `isPointEnriched` + `isShareablePoi`.
POI-1b-editorial excluido (`editorial-only-1b`). NO exige ownership.

## Entry points v1 (wired)

- Popup POI footer (`data-action="share-poi"`, dispatch en
  `use-popup-actions.ts`).
- `SelectionActions` botón "Compartir" (kind `collection`, locations =
  selección resuelta).
- `CollectionFocusView` header botón share.

## Deuda v1.1 (documentada)

- Páginas públicas `/p` `/c` `/r` con `react-helmet-async` + OG/JSON-LD.
- `RoutesListPanel` per-route share dropdown.
- Tests `share-url`, `share-eligibility`, `share-payload`,
  `share-channels`, grep estático de dominio y separación share/export.
- `/z` (selecciones efímeras), slugs humanos, server-side OG.

## Fuera de alcance (no tocar)

- `evaluatePoiExport`, `kml-parser`, niveles POI, `isShareablePoi`,
  `isPointEnriched`, RLS, edge functions.

Ver `docs/contracts/share-vs-export-contract.md`.
