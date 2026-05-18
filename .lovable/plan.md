
# PR-SHARE-1 — Share + Export v1

Separación canónica entre **sharing humano/social** (URL pública Vandits) y **export técnico** (archivo KML/GPX/CSV/JSON). Consume PR-EXPORT-1 sin tocarlo.

## 1. Alcance v1

Soportado:
- `/p/{poiId}` — POI individual
- `/c/{collectionId}` — colección
- `/r/{routeId}` — ruta

Fuera de v1 (deuda explícita, documentada en contrato):
- `/z` (zonas/selecciones efímeras) — requiere tabla `share_payloads`
- Shares efímeros / firmados
- Slugs humanos (usamos id base)
- Server-side OG (las previews de LinkedIn/Slack/FB sin JS verán solo el head estático; documentado)
- GPX exporter nuevo (si no existe en kml-parser, GPX de grupo queda como "próximamente" en UI; no se inventa)

## 2. Arquitectura — módulos nuevos

```text
src/domains/sharing/
├── lib/
│   ├── share-url.ts              SoT generación de URLs
│   ├── share-eligibility.ts      shareEligibility (NO export)
│   ├── share-payload.ts          buildSharePayload
│   └── channel-adapters.ts       whatsapp/sms/fb/ig/gmaps/amaps/copy/native
├── components/
│   ├── ShareSheet.tsx            modal/sheet unificado
│   └── EligibilityCounter.tsx    X/Y compartibles, N excluidos
└── types.ts                      ShareTarget, SharePayload, ShareChannel

src/domains/content/lib/poi-export-eligibility.ts   (ya existe, PR-EXPORT-1)
```

Regla dura: **Share != Export**. `share-eligibility.ts` y `poi-export-eligibility.ts` son helpers independientes. Coinciden hoy en POI individual (ambos exigen POI-9/10 + shareable) pero NUNCA se invocan mutuamente.

## 3. Tipos canónicos

```ts
type ShareTargetKind = 'poi' | 'collection' | 'route';

interface ShareTarget {
  kind: ShareTargetKind;
  id: string;
  // contexto opcional para preview/elegibilidad
  poi?: GeoLocation;
  locations?: GeoLocation[]; // para collection/route counters
}

interface SharePayload {
  url: string;            // URL canónica Vandits
  title: string;
  text: string;
  ogImage?: string;
  eligibleCount: number;
  totalCount: number;
  excludedCount: number;
}

type ShareChannel =
  | 'native' | 'copy' | 'whatsapp' | 'sms'
  | 'facebook' | 'instagram'
  | 'gmaps' | 'amaps';   // gmaps/amaps SOLO para kind='poi'
```

## 4. URLs — `share-url.ts`

Único punto que conoce el dominio. Lee de `import.meta.env.VITE_PUBLIC_BASE_URL` con fallback a `https://vandits.lovable.app`. Prohibido hardcodear el dominio fuera de este archivo (test estático con grep).

```ts
buildPoiUrl(poiId)         -> {BASE}/p/{poiId}
buildCollectionUrl(colId)  -> {BASE}/c/{colId}
buildRouteUrl(routeId)     -> {BASE}/r/{routeId}
```

## 5. Elegibilidad — `share-eligibility.ts`

```ts
type ShareExclusionReason =
  | 'invalid-coordinates' | 'not-enriched'
  | 'not-shareable' | 'curation-level-below-9'
  | 'editorial-only-1b';

evaluatePoiShare(loc): { eligible, reason? }
// reusa: isPointEnriched + isShareablePoi + getPoiCurationLevel
// NO exige owner (sharing es público por definición)

partitionForShare(locs): { eligible, excluded }
```

POI individual no shareable → el `ShareSheet` oculta "Compartir enlace Vandits", deja sólo "Copiar coords / Abrir en Maps".

Grupo: si `eligible.length === 0` → CTA "Compartir" disabled con tooltip "Ningún POI cumple los criterios".

## 6. ShareSheet — UI unificada

Un solo componente `<ShareSheet target={...} onClose={...} />`.

Layout:
- Header: título según `kind` ("Compartir punto" / "Compartir colección" / "Compartir ruta")
- `<EligibilityCounter>` (sólo grupo): "12 de 18 compartibles · 6 excluidos"
- URL preview + botón **Copiar enlace** (primario)
- Acciones primarias: Compartir nativo (si `navigator.share` existe), WhatsApp, SMS, Facebook, Instagram (deeplink/copy)
- Acciones secundarias (sólo `kind='poi'`): Abrir en Google Maps, Abrir en Apple Maps, Exportar este POI (si aplica)
- Footer (sólo grupo): link "¿Necesitas el archivo? **Exportar grupo →**" que cierra ShareSheet y abre `ExportPanel`

## 7. Puntos de entrada (call sites)

**POI individual** — entrada única = popup:
- `PopupFooter` (o el footer canónico `data-popup-footer="v1"`) añade botón "Compartir" que abre `<ShareSheet target={kind:'poi', id, poi}>`.
- Botones existentes "Abrir en Google Maps" se mueven dentro del ShareSheet como acción secundaria (no desaparecen, se reubican).

**Grupo** — entradas:
- `SelectionActions` (barra de selección múltiple): separar visualmente **[Compartir grupo]** | **[Exportar grupo]**.
- `CollectionPanelHeader`: botón "Compartir" + "Exportar".
- `RouteHeaderActions` (header de ruta en doc view): botón "Compartir" + "Exportar".

`ExportPanel` y `SelectionActions` siguen pasando `scope` explícito a `exportTo*` (contrato PR-EXPORT-1 intacto).

## 8. Adaptadores de canal — `channel-adapters.ts`

Funciones puras `(payload) => void | Promise<void>`:

```ts
shareNative(payload)   // navigator.share, fallback copy
copyLink(payload)
shareWhatsApp(payload) // https://wa.me/?text=...
shareSMS(payload)      // sms:?&body=...
shareFacebook(payload) // sharer.php?u=
shareInstagram(payload)// copia link + toast "Pega en Instagram"
openGoogleMaps(poi)    // https://www.google.com/maps/search/?api=1&query=lat,lng
openAppleMaps(poi)     // https://maps.apple.com/?ll=lat,lng&q=name
```

Google/Apple Maps reciben `GeoLocation` directamente, NO `SharePayload` (son adaptadores externos, no comparten URL Vandits).

## 9. OpenGraph (head per-route)

Instalar `react-helmet-async`, wrappear `<HelmetProvider>` en `main.tsx`.

Rutas públicas nuevas (componentes mínimos read-only, sin auth):
- `src/pages/PublicPoi.tsx` → `/p/:poiId`
- `src/pages/PublicCollection.tsx` → `/c/:collectionId`
- `src/pages/PublicRoute.tsx` → `/r/:routeId`

Cada página renderiza `<Helmet>` con:
- POI: `og:title`, `og:description` (descripcion IA recortada 160ch), `og:image` (enrichedData.imagen si existe), `og:url`, `twitter:card=summary_large_image`, JSON-LD `TouristAttraction`.
- Grupo: `og:title`, `og:description` (nombre + count), `og:image` (primer POI con imagen), `og:url`, JSON-LD `ItemList`.

Limitación documentada: crawlers sin JS (LinkedIn/Slack) sólo ven head estático de `index.html`. Aceptado en v1.

Contenido visible mínimo de la página pública: nombre + descripcion + mapa estático opcional + "Abrir en app". No reconstruimos UI completa en v1.

Remover `<link rel="canonical">` de `index.html` (cada ruta declara el suyo via Helmet).

## 10. Fuera de alcance (no tocar)

- `evaluatePoiExport`, `kml-parser`, niveles POI, `isShareablePoi`, `isPointEnriched`
- RLS, edge functions, server-side OG
- Rutas/tracks export GPX server-side
- Tabla `share_payloads` (para `/z` futuro)
- Auth en páginas públicas

## 11. Tests

- `src/test/share-url.test.ts` — buildPoiUrl/Collection/Route, dominio configurable.
- `src/test/share-eligibility.test.ts` — matriz POI-0/1a/1b/3/5/9/10.
- `src/test/share-payload.test.ts` — counters eligible/excluded, fallback sin imagen.
- `src/test/share-channels.test.ts` — URLs whatsapp/sms/fb/gmaps/amaps bien formadas.
- `src/test/share-vs-export-separation.test.ts` — grep estático: ningún módulo de `share/` importa `poi-export-eligibility` y viceversa.
- `src/test/share-no-hardcoded-domain.test.ts` — grep: `vandits.lovable.app` solo en `share-url.ts` + `index.html`.

## 12. Documentación + memoria

- `docs/contracts/share-vs-export-contract.md` — contrato canónico, matriz, deuda v1.
- `mem://logic/sharing/share-vs-export-canon` — referencia + entrada Core en `mem://index.md`.
- Actualizar `docs/contracts/poi-export-contract.md` con nota "Share canon vive en share-vs-export-contract.md".

## 13. Orden de implementación

1. `share-url.ts` + `share-eligibility.ts` + `share-payload.ts` + `channel-adapters.ts` + tipos
2. `<ShareSheet>` + `<EligibilityCounter>`
3. Cableo `PopupFooter` (POI individual)
4. Cableo `SelectionActions` + `CollectionPanelHeader` + `RouteHeaderActions` (grupo)
5. Helmet provider + rutas `/p` `/c` `/r` mínimas con OG
6. Tests (matriz + grep estático)
7. Docs + memoria + Core entry

## Definición de éxito

- Share y Export separados en código (módulos), UI (botones distintos) y semántica (URL vs archivo).
- Popup = único entrypoint POI individual; nunca exporta masivo.
- Colección/ruta/selección = únicos entrypoints de grupo.
- Google/Apple Maps son adaptadores secundarios dentro del ShareSheet, no SoT.
- `/p`, `/c`, `/r` resuelven con OG correcto.
- `vandits.lovable.app` hardcoded sólo en `share-url.ts` + `index.html`.
- `evaluatePoiExport` intacto. Contrato PR-EXPORT-1 sigue verde.
