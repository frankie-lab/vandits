## P-POPUP-13 — Unified popup renderer

Objetivo: `createPopupContent` deja de bifurcar visualmente entre `enriched` y `legacy`. Existe **un único shell canónico** (hero → scroll-body → footer persistente) que aplica P-POPUP-9/10/11/11.1/12. El estado enriched decide qué *fragments* existen, nunca qué *sistema visual* se usa.

### Criterio de aceptación (todos los POIs, con o sin enriched)

Ningún popup puede emitir:
- `Ficha IA actualizada`
- `+N campos más`
- chips territoriales antiguos (`#e0f2fe`, `#dcfce7`, `#fef3c7`, `#f3e8ff`)
- `customDataHtml` con bordes `#f0f0f0` y "Datos adicionales" uppercase
- gradiente verde `#16a34a → #22c55e` con `box-shadow` y `translateY` para "Añadir a mi colección"
- acordeones con `border: 1px / borderRadius / SECTION_HEADER.bgColor`
- footer antiguo (sin `data-popup-footer="v1"`)
- breadcrumb antiguo en vez de `buildTerritorialBreadcrumbHtml`

El POI sin `enriched.descripcion` se renderiza con **el mismo shell**: hero + breadcrumb + footer persistente, omitiendo los fragments cuyos datos faltan.

### Arquitectura propuesta

```text
createPopupContent(loc)
  └─ renderCanonicalPopupShell(loc, ctx)
       ├─ statusBarHtml                              (siempre)
       ├─ buildImageSection(...)                     (siempre — hero fija)
       ├─ <div class="popup-scroll-body">
       │    ├─ HEADER
       │    │    ├─ <h3> title editorial (FONT.title, weight 700, -0.01em)
       │    │    ├─ ownershipBadge (si !ownershipStripV1 / !isOwn)
       │    │    ├─ buildTerritorialBreadcrumbHtml(loc)   (siempre)
       │    │    └─ addToCollectionBtn (si !isOwn && !curator) — SIN gradient/shadow
       │    ├─ METADATA LINE
       │    │    └─ buildOwnEnrichedMetadataLineHtml | buildSourceMetadataLineHtml
       │    │       (degrada a fecha o '' si falta data)
       │    ├─ buildCollectionChipsPlaceholder
       │    ├─ buildPersonalTagsBlock
       │    ├─ BODY FRAGMENTS (composer canónico — cada uno devuelve '' si falta data)
       │    │    ├─ punto_destacado
       │    │    ├─ descripcion         ← omit si !enriched.descripcion
       │    │    ├─ enrichmentRating    ← omit si !rating
       │    │    ├─ personalState       ← omit si !isOwn / !visited / !rating
       │    │    ├─ observacion         ← omit si !enriched.observacion
       │    │    ├─ etiquetas (4 familias P-POPUP-12, omit familias vacías)
       │    │    └─ secundarios (datos_geograficos, datos_clave, … wrapCollapsibleSection discreto)
       │    ├─ FALLBACK BODY (solo si no hay enriched)
       │    │    ├─ location.description (si existe) — mismo estilo editorial que descripcion
       │    │    └─ customData filtrado — renderizado con wrapCollapsibleSection discreto,
       │    │       SIN "+N campos más", SIN bordes #f0f0f0, SIN uppercase eyebrow
       │    ├─ coords line (siempre, estilo muted actual)
       │    └─ route-waypoint actions (si aplica) — mismas reglas P-POPUP-11.1 (muted, sin gradient)
       └─ <div data-popup-footer="v1">
            └─ actionButtonsHtml (grid 32px·1fr·32px + pie "Enriquecido · <fecha>" si aplica)
```

### Cambios concretos en `src/components/map/map-popups.ts`

1. **Extraer helpers compartidos** (mismo archivo, sin nuevos módulos para no expandir scope):
   - `renderPopupHeaderHtml(loc, ctx)` — title + ownershipBadge + breadcrumb + addToCollection.
   - `renderPopupFallbackBodyHtml(loc, ctx)` — `location.description` + `customData` (discreto, sin `+N`).
   - `renderPopupSecondaryAccordions(loc, enriched|null, cardCfg)` — `datos_geograficos`/`datos_clave`/etc. Si `enriched=null`, devuelve `''`.
   - `renderPopupShell({ statusBarHtml, heroHtml, bodyHtml, footerHtml })` — wrapper único con `flex column`, `max-height`, scroll body y `data-popup-footer="v1"`.

2. **Colapsar la bifurcación**:
   - Borrar el `return` del bloque `if (isEnriched && enriched) { ... }` y el `return` legacy posterior.
   - Sustituir por una única llamada: `return renderPopupShell({ ..., bodyHtml: composeCanonicalBody(loc, enriched, ctx) })` donde `composeCanonicalBody` recibe `enriched: EnrichedData | null` y cada fragment hace `if (!enriched?.X) return '';`.
   - El composer canónico ya existe parcialmente (slots 7A.3). Extender para aceptar `enriched=null` → emite header+breadcrumb+metadata+fallback body+footer.

3. **Eliminar el bloque legacy visual** (L1706–L1864): toda esa rama se borra. Lo único rescatable y migrado:
   - `location.description` → renderizado con el mismo wrapper editorial que `descripcion` IA (sin background `#fafafa`, sin scroll interno `max-height:150px`).
   - `customData` (>0 entries) → `wrapCollapsibleSection` discreto con header `Datos adicionales`. **Sin `+N campos más`**: si excede límite razonable (p. ej. 12), `<details>` nativo dentro del accordion ya colapsado.
   - Botón "Añadir a mi colección" → estilo neutro (mismo lenguaje que `notesBtn`: `hsl(var(--muted))` / `hsl(var(--foreground))`, sin gradient, sin shadow, sin translateY).
   - Route-waypoint actions → re-estilados al lenguaje muted P-POPUP-11.1 (sin gradient amarillo, sin shadow).

4. **Estado IA del header**: la rama legacy ya no existe → `isPointEnriched=false` también muestra `data-popup-version` correcto. Se mantiene el flag de diagnóstico actual.

### Lo que NO se toca (restricción dura)

- `isPointEnriched` (semántica intacta).
- Schema / `EnrichedData` / `card-schema`.
- `marker-grammar`, `PopupShell` (Leaflet wrapper), `F2`, `popupClose`.
- Handlers (`map-popup-handlers.ts`, `data-action`, `data-location-id`).
- `composer` 7A.3 interno, `buildEnrichmentRatingBlock`, `buildPersonalStateBlock`.
- `buildImageSection`, hero chrome, visited overlay.
- `buildTerritorialBreadcrumbHtml`, `buildOwnEnrichedMetadataLineHtml`, `buildSourceMetadataLineHtml`, `buildCollectionChipsPlaceholder`, `buildPersonalTagsBlock`, `buildSourceHashtagsBlock`.
- `getCanonicalPopupTags`, `POPUP_TAG_CAPS`, `dedupePopupTagBuckets`, `filterPersonalTags`.
- `wrapCollapsibleSection` (ya discreto desde P-POPUP-11).
- `inlineTagBadge`, `card-style-tokens`.
- `mem://`, contratos de canon, taxonomy.

### Tests a añadir / actualizar

- **`src/test/popup-unified-renderer.test.ts`** (nuevo):
  - Para un POI con `enriched=null`: el output contiene `data-popup-footer="v1"`, `buildTerritorialBreadcrumbHtml` marker (`data-popup-geo-breadcrumb`), y NO contiene: `Ficha IA actualizada`, `+${moreDataCount}`, `+N campos más`, `#e0f2fe`, `#dcfce7` con padding 2px 8px (chip territorial antiguo), `linear-gradient(135deg, #16a34a, #22c55e)`, `border: 1px solid #f0f0f0`.
  - Para un POI con `enriched.descripcion`: idénticas invariantes.
- **`src/test/popup-footer-persistent.test.ts`** (extender): el footer existe en ambas ramas (test sobre `createPopupContent` con/sin `enriched`).
- **`src/test/popup-editorial-style.test.ts`** (extender): breadcrumb territorial aparece sin condicional `isPointEnriched`.
- Tests existentes (`popup-tags-canonical`, `popup-taxonomy-structured`, `popup-territorial-breadcrumb`, `popup-collection-metadata-line`, `popup-hero-chrome`, `popup-visited-*`) deben seguir verdes sin tocarse.

### Documentación

- `docs/popups/p-popup-13-unified-renderer.md` (nuevo): contrato del shell único, lista de fragments, política de degradación.
- `docs/contracts/popup-contract.md`: añadir sección "Renderer único — prohibido bifurcar shell por estado enriched".
- `mem://style/popup/canonical-body-composer`: añadir "Composer acepta `enriched=null`; emite header/breadcrumb/metadata/footer y fragments vacíos para campos ausentes".
- `mem://logic/popup/provenance-vs-collection-vs-tag`: nota — el shell legacy queda eliminado, no hay ruta alternativa de render.

### Validación visual (manual, post-merge)

1. POI propio sin `enriched.descripcion` (importado web) → breadcrumb territorial, footer persistente, sin chips azules, sin `+N`, sin botón verde con shadow.
2. POI seguido sin enriched → mismo shell, ownership badge, sin add-to-collection con gradient.
3. POI enriquecido completo → comportamiento actual P-POPUP-12 idéntico (regresión cero).
4. POI con `customData` >12 entries → accordion colapsado, sin `+N campos más`.

### Riesgo

Eliminar la rama legacy puede dejar al descubierto POIs con shapes inesperadas en `customData` o `location.description` larga. Mitigación: la rama fallback dentro del shell canónico mantiene esos datos accesibles, sólo cambia su lenguaje visual. Sin pérdida funcional.
