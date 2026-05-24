# Share vs Export Contract (PR-SHARE-1 v1 — parcial)

Separación canónica entre **sharing humano/social** (URL pública Vandits)
y **export técnico** (archivo KML/CSV/JSON). Consume PR-EXPORT-1 sin
tocarlo.

## Regla dura

- **Share != Export.** Helpers independientes: `share-eligibility.ts`
  (este contrato) y `poi-export-eligibility.ts` (PR-EXPORT-1) NUNCA se
  invocan mutuamente.
- **URL Vandits** = canal humano/social. **Archivo** = canal técnico.
- **Google/Apple Maps son adaptadores externos**, no SoT de share.

## Single source of truth

- `src/domains/sharing/lib/share-url.ts` — únicas funciones que conocen
  el dominio (`vandits.lovable.app`). Prohibido hardcodearlo en otro
  módulo.
- `src/domains/sharing/lib/share-eligibility.ts` — `evaluatePoiShare`,
  `isPoiShareable`, `partitionForShare`. Reusa `isPointEnriched` +
  `isShareablePoi` + `getPoiCurationLevel`.
- `src/domains/sharing/lib/share-payload.ts` — `buildSharePayload`.
- `src/domains/sharing/lib/channel-adapters.ts` — WhatsApp / SMS / FB /
  IG / native / copy / Google Maps / Apple Maps.
- `src/domains/sharing/components/ShareSheet.tsx` — modal UI único.
  Se monta una vez en `App.tsx` y se abre con `openShareSheet(target)`.

## URLs canónicas v1

```text
/p/{poiId}          POI individual
/c/{collectionId}   Colección
/r/{routeId}        Ruta
```

Fuera de v1 (deuda explícita):
- `/z` (zonas/selecciones efímeras) — requiere tabla `share_payloads`.
- Slugs humanos.
- Server-side OG (LinkedIn/Slack sin JS sólo ven head estático).
- Páginas públicas `/p` `/c` `/r` con Helmet — pendientes en v1.1.
- RouteHeaderActions wiring — pendiente en v1.1.
- Tests automatizados completos — pendientes en v1.1.

## Elegibilidad de share

Un POI es shareable si pasa **todas**:

1. Coordenadas válidas.
2. `isPointEnriched(loc)` (descripción IA canónica).
3. `isShareablePoi(loc)` (geo `ok`, visibility ∈ {followers, public}).
4. Curación nivel ∈ `{9, 10}`.
5. NO es POI-1b-editorial (`editorial-only-1b`).

Sharing **NO exige ownership**: una URL pública es por definición ajena
al viewer.

## Entry points v1

| Entry | Target kind | Estado |
|-------|-------------|--------|
| Popup POI (footer) `data-action="share-poi"` | `poi` | wired |
| `SelectionActions` botón "Compartir" | `collection` | wired |
| `CollectionFocusView` header botón share | `collection` | wired |
| `RoutesListPanel` dropdown share | `route` | pendiente v1.1 |
| Páginas públicas `/p` `/c` `/r` con Helmet/OG | — | pendiente v1.1 |

## Open ↔ Export bridge

Desde el ShareSheet en modo grupo se emite el evento
`lovable:open-export-panel` que los call sites pueden escuchar para
abrir el ExportPanel y cerrar el sheet.

## Renderer invariance

Este contrato NO toca: popup renderer, marker grammar, niveles POI,
`isShareablePoi`, `isPointEnriched`, RLS, kml-parser.

Ver `mem://logic/sharing/share-vs-export-canon`.
