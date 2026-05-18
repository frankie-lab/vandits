# Contract — Popup

## Propósito
Garantizar que **a lo sumo un popup** está abierto, que su marker no se desmonte mientras esté abierto y que el cierre desencadene el deselect canónico.

## Variables canónicas
| Variable | Tipo | Ámbito |
|---|---|---|
| `openPopupLocationId` | `string \| null` | Local a `LocationMap` (useState) |
| `keepIds` | `Set<string>` | Derivado: `focusedLocationId ∪ openPopupLocationId` |
| `preservedId` | `string \| null` | `openPopupLocationId` durante reconciliación de markers |

## Ownership
- `LocationMap` es el ÚNICO escritor de `openPopupLocationId`.
- Ningún otro componente puede `setOpenPopupLocationId`.
- Listener `map.on('popupclose')` registrado UNA sola vez en el `useEffect` de inicialización del mapa.

## Source of truth
`LocationMap.openPopupLocationId` (local). No vive en el store porque:
1. Su ciclo de vida es 1:1 con la instancia Leaflet.
2. Su consumo cross-component (vía `keepIds`) se resuelve por re-render del componente padre.

## Eventos canónicos
| Evento | Origen | Efecto |
|---|---|---|
| `marker.openPopup()` | click usuario / acción programática | `setOpenPopupLocationId(id)` |
| `map.on('popupclose')` | Leaflet | `setOpenPopupLocationId(prev => prev===closedId ? null : prev)` + posible deselect del focus |

## Forbidden writes
- Llamar a `marker.closePopup()` desde un side-effect que también borre el marker en el mismo tick (race con `popupclose`).
- Registrar `marker.on('popupclose')` por marker — depende de `focusedLocationId` y crea stale closures.
- Mantener `openPopupLocationId` en el store global.

## Invariantes
1. Si un marker pertenece a `keepIds`, su instancia NO puede ser eliminada por la reconciliación.
2. El handler `popupclose` es **único, a nivel de mapa**.
3. Reabrir el popup tras un re-render preserva el id mediante `preservedId`.

## Ejemplos válidos
- Click en marker enriquecido → `setOpenPopupLocationId(id)` → popup abre → cambio de filtros → marker se preserva → usuario cierra popup → `popupclose` limpia state.

## Anti-patrones detectados
- (Histórico) Cada marker registraba `marker.on('popupclose')` con stale closure sobre `focusedLocationId`. Resuelto en ADR-0001 centralizando en `map.on('popupclose')`.
- Comentario residual en `LocationMap.tsx:1801` recuerda no volver a añadir handlers per-marker.

## Validation Notes (revisión manual contra código real)

| Inv. | Estado | Archivo | Símbolo | Evidencia | Backlog |
|---|---|---|---|---|---|
| 1 (preserva marker en `keepIds`) | **validated** | `src/components/LocationMap.tsx` | reconciliación de markers L.1660-1714 | `preservedId = openPopupLocationId` (L.1662); `nextMarkers.set(preservedId!, preservedMarker)` (L.1689); skip de eliminación L.1684, L.1712 | — |
| 2 (handler `popupclose` único a nivel mapa) | **validated** | `src/components/LocationMap.tsx` | `mapRef.current.on('popupclose', …)` en init effect | Único registro L.1436; comentario guardarraíl L.1801-1803 prohíbe per-marker | BL-002 (vigilancia) |
| 3 (reabrir tras re-render preserva id vía `preservedId`) | **validated** | `src/components/LocationMap.tsx` | bloque reconciliación L.1660-1714 | `preservedId` reusa marker existente; sincroniza `keepIds` L.1885 | — |
| `selectedLocations` no gobierna popup | **validated** | `src/components/LocationMap.tsx` + `src/domains/content/store/locations-store.ts` | `keepIds` L.1616-1618 | Solo une `focusedLocationId ∪ openPopupLocationId`; `selectedLocations` no entra en `keepIds` | — |
| `openPopupLocationId` permanece local (no en store) | **validated** | `src/components/LocationMap.tsx` | `useState<string\|null>` L.684 | No referenciado en `locations-store.ts` (rg confirmado) | — |
| Stale closure per-marker | **validated** (resuelto histórico) | `src/components/LocationMap.tsx` L.1801-1803 | Comentario normativo presente | — | BL-001 |

## Referencias
- ADR-0001 (popupclose centralization)
- mem://logic/map/popup-persist-on-rebuild
- Código: `src/components/LocationMap.tsx` líneas ~684, ~1436-1446, ~1616-1618, ~1660-1714, ~1801-1803, ~1885

## Ratings del popup (P-POPUP-14.2)

El bloque unificado de ratings (helper único `buildEnrichmentRatingBlock`, slot semántico `enrichmentRating` del composer canónico) consta de DOS filas:

### Contrato

| Concepto              | Fila  | Owner          | Editable                          |
|-----------------------|-------|----------------|-----------------------------------|
| `enrichmentRating`    | Row 1 | POI / IA       | NO — siempre read-only            |
| `personalRatingState` | Row 2 | Usuario viewer | Sólo si `customData.visited==='true'` |

`enrichmentRating ≠ personalRatingState`. Ambos coexisten en el mismo
contenedor visual (`data-popup-ratings-block="v1"`) por canon editorial; no
deben separarse en bloques independientes.

### Reglas Row 2 (personalRatingState)

La Row 2 **nunca desaparece** salvo en dos contextos contractuales:
1. POI curator (`ownership.isCuratorPoint === true`).
2. Popup en contexto nearby (`isNearbyPopupContext(location.id) === true`).

`visited` gobierna si la valoración personal es editable, **no si la fila
existe**. Tres estados visuales mutuamente excluyentes:

| Estado          | Trigger                                | Label                       | Estrellas                | Color   | Interacción |
|-----------------|----------------------------------------|-----------------------------|--------------------------|---------|-------------|
| `not-visited`   | `visited !== 'true'`                   | `Pendiente`                 | 5☆ disabled              | gris    | read-only, sin `data-action="set-rating"`, `aria-disabled="true"` |
| `visited-empty` | `visited === 'true'` && `user_rating===0` | `Pendiente de valoración`   | 5☆ interactivas          | verde   | 5 botones `data-action="set-rating"` con `data-rating="1..5"` |
| `visited-rated` | `visited === 'true'` && `user_rating>0`   | `Tu valoración`             | ★ activas + `✕` clear    | verde   | `set-rating` + `data-action="clear-rating"` |

Marcador estable: contenedor de estrellas de Row 2 lleva siempre
`data-personal-rating-state="not-visited" | "visited-empty" | "visited-rated"`.

### Forbidden

- Sustituir Row 2 por una barra/link "Valorar" colapsable.
- Ocultar Row 2 cuando el POI no está visitado (regresión pre-14.2).
- Renderizar el rating personal fuera de este bloque (p. ej. en
  `buildPersonalStateBlock`, que sólo gobierna el toggle de visitado).
- Cambiar el orden Row 1 → Row 2.

### Tests canónicos

`src/test/popup-personal-state-hierarchy.test.ts` — escenarios:
not-visited, visited-empty, visited-rated, curator, nearby, layout
label↔stars.

## Golden POI popup (P-POPUP-15)

**Regla**: Todo POI de usuario usa el renderer canónico único
(`createPopupContent`, shell P-POPUP-13). NO existen variantes visuales
legacy por estado `enriched` / `no-enriched` / `visited`. La degradación
ocurre por ausencia de datos (slots vacíos se omiten), nunca por otro
renderer.

### Referencia canónica

- Fixture: `src/test/fixtures/golden-poi-popup.ts`
  - `GOLDEN_POI` — POI completo (ejercita los 10 slots editoriales).
  - `GOLDEN_POI_DEGRADED` — POI sin enriched, sin visited, sin rating.
  - `GOLDEN_POI_VISITED_UNRATED` — POI visitado sin rating personal.
- Contrato test: `src/test/popup-golden-poi-contract.test.ts`.

### Slots editoriales (orden inmutable)

1. Hero (imagen)
2. Título (`enriched.nombre_lugar` o fallback `location.name`)
3. Breadcrumb territorial (P-POPUP-9, global→local)
4. Metadata line (collections + source)
5. Entradilla (`punto_destacado`)
6. Descripción (`descripcion` o fallback `location.description`)
7. Ratings (P-POPUP-14.2: Row 1 IA + Row 2 personal state)
8. Taxonomía editorial (clasificación + etiquetas)
9. Secundarios discretos (`observacion`, `datos_clave`)
10. Footer persistente (`data-popup-footer="v1"`)

### Markers canónicos obligatorios

| Marker DOM                                | Significado                              |
|-------------------------------------------|------------------------------------------|
| `data-popup-version="geo-canonical-v1"`   | Shell único activo                       |
| `data-popup-geo-breadcrumb="1"`           | Breadcrumb territorial (si hay jerarquía)|
| `data-popup-ratings-block="v1"`           | Bloque ratings unificado (siempre)       |
| `data-popup-footer="v1"`                  | Footer persistente único                 |

### Degradación graciosa

| Dato ausente                    | Efecto                                          |
|---------------------------------|-------------------------------------------------|
| `enriched.descripcion`          | Slot descripción se omite (o usa `location.description` si existe). |
| `enriched.punto_destacado`      | Slot entradilla se omite.                       |
| `enriched.indice_interes`       | Row 1 del bloque ratings se omite; Row 2 sigue. |
| `enriched.clasificacion`        | Slot taxonomía se omite.                        |
| jerarquía geográfica vacía      | Breadcrumb territorial se omite (resto sigue).  |
| `customData.visited !== 'true'` | Row 2 = `not-visited` (gris, disabled).         |

El shell (markers, footer, bloque ratings, breadcrumb container) sigue
siendo el mismo.

### Forbidden (golden contract)

- `Ficha IA actualizada` (string legacy).
- `+N campos más` o variantes (`moreDataCount`).
- Chips territoriales antiguos (`background: #e0f2fe / #dcfce7 / #f3e8ff`).
- Gradient verde legacy (`linear-gradient(135deg, #16a34a, #22c55e)`).
- Borde gris legacy (`border: 1px solid #f0f0f0`).
- Múltiples `data-popup-footer="v1"` en el mismo popup.
- Link/barra colapsable `>Valorar<` o `data-personal-rating-state="collapsed"`.

Si en el futuro un POI vuelve a mostrar UI legacy, el contrato golden
(`src/test/popup-golden-poi-contract.test.ts`) DEBE fallar.

## Affordance sin hover (mobile/touch) — P-POPUP-10.2


Las acciones clicables esenciales del popup (breadcrumb territorial, links de
colección en la metadata line, filter-links inline) **no pueden depender
únicamente de hover** para comunicar interactividad. Deben mantener una señal
visible por defecto — underline sutil persistente (`border-bottom 1px
hsl(var(--muted-foreground) / 0.35)`) o equivalente. Hover y `:focus-visible`
pueden reforzar la señal, nunca sustituirla. Aplica a touch y a accesibilidad
por teclado. Norma transversal: cualquier nuevo link clicable dentro del popup
debe cumplirla.

## Two-rail body (P-POI-CURATION-2.10)

El `popup-scroll-body` (`data-popup-scroll-body="v1"`) admite **dos tipos de
hijos directos**, no intercambiables:

1. **Carril editorial** — `<div style="padding: 16px 16px 8px 16px;">` que
   envuelve hero, breadcrumb, ratings (P-POPUP-14.2), descripción,
   observación y custom-data. Padding de 16px laterales para ritmo de
   lectura.
2. **Slots interactivos full-width** — emitidos como hijos directos del
   `popup-scroll-body`, sin gutter editorial heredado:
   - `data-recovery-root` (mount de `UnenrichedRecoveryBlock`, POI-1b
     Contexto cercano).
   - `data-route-waypoint-actions="v1"` (grid de acciones para waypoints
     de ruta editables; mantiene su propio `margin: 8px 16px` autocontenido
     porque su carril es de botones, no editorial).

### Reglas duras

- **Prohibido** envolver slots interactivos dentro del wrapper editorial:
  reintroduce gutter de prosa sobre grids interactivas.
- **Prohibido** compensar el gutter heredado con `margin` negativo en el
  slot. La solución correcta es estructural (sacar el slot del wrapper),
  no de layout.
- El renderer del slot interactivo (`NearbyPanel` inline) ya está preparado
  para vivir edge-to-edge: usa `padX='px-0'` y `rootClass` con `border-t`
  superior como separador del bloque previo.
- Hero, breadcrumb, ratings y descripción NO cambian visualmente al
  aplicar este canon: siguen dentro del wrapper editorial intacto.

### Gutter del rail interactivo (P-POI-CURATION-2.11)

El rail interactivo NO usa full-bleed absoluto. Tiene un gutter propio
ligero (`margin: 0 8px 8px 8px` para `data-recovery-root`) que da
respiración a buscador, filas y badges sin reintroducir la sensación de
caja editorial. Jerarquía visual canónica:

- Rail editorial → 16px laterales (lectura).
- Rail interactivo → 8px laterales (densidad funcional, mitad del editorial).
- `route-waypoint-actions` mantiene `margin: 8px 16px` porque es grid de
  botones, no lista densa.

Está prohibido volver a `margin: 0 0 8px 0` (full-bleed 2.10) o subir a
16px (gutter editorial).

### Test canónico

`src/test/popup-poi-1b-recovery-mount-margin.test.ts` verifica:

- Wrapper editorial presente con padding 16px.
- `data-recovery-root` con `margin: 0 8px 8px 8px;` (gutter ligero 2.11).
- `data-recovery-root` emitido DESPUÉS del cierre del wrapper editorial.
- Ausencia de regresiones a canon 2.5 (`margin: 0 16px`), 2.6
  (`margin: 0 4px`) o 2.10 (`margin: 0 0`).
- Sin márgenes negativos.
- Slot `data-route-waypoint-actions="v1"` presente.

### Fila seleccionada — primaria + secundaria (P-POI-CURATION-2.12)

Cuando el usuario selecciona un candidato en Contexto cercano, la fila
expandida ofrece **una sola decisión visible**, no dos checkboxes paralelos.

**La pregunta:** *¿qué hacemos con este candidato?* — implícita, no rotulada.

**Acción primaria (única, contextual):**

| Estado del POI abierto | Primaria | Slug |
|---|---|---|
| Reparable (`canReplaceCurrentPoi(loc, { mismatch }) === true`) | "Usar como este punto" | `replace` |
| No reparable (enriquecido sano sin mismatch) | "Guardar como punto personal" | `personal` |

La primaria se renderiza como **botón sólido full-width** del rail
interactivo. Nunca como checkbox.

**Acción secundaria (opcional, solo cuando primaria = `replace`):**

Link discreto con underline persistente (touch affordance) debajo del
botón primario:
`+ Guardar también como punto personal`

Al expandirla:
- Aparece el category picker inline (sin caja `border + bg-muted/30`).
- La primaria muta a CTA combinado: **"Reemplazar y guardar personal"**.
- Aparece micro-link `× cancelar` que colapsa la secundaria.

Si la primaria ya es `personal`, **no se renderiza secundaria** — el
category picker es obligatorio para habilitar el CTA.

**Helper único:** `canReplaceCurrentPoi(loc, { mismatch })` en
`src/domains/content/lib/can-replace-current-poi.ts`. Criterio:

- `mismatch != null` → siempre `true`.
- `!isPointEnriched(loc)` → `true`.
- En caso contrario → `false`.

Prohibido:
- Dos `<input type="checkbox">` paralelos (`Reemplazar importado`, `Punto personal`).
- Permitir personal sin replace mediante un toggle independiente cuando el POI es reparable.
- CTA "Guardar ambas acciones" (literal eliminado).
- Duplicar la lógica de reparabilidad fuera del helper.

**Marcadores estables:**
- `data-selected-row-actions="v1"` — contenedor del slot interactivo.
- `data-selected-row-primary="replace|personal"` — primaria.
- `data-selected-row-secondary="expand-personal|cancel-personal"` — secundaria.
- `data-replaceable="true|false"` — espejo del helper.

**Test canónico:** `src/test/popup-poi-2-12-selected-row-action-canon.test.ts`.


## Adopción nearby + re-curación (P-POI-CURATION-2.13)

Cuando el usuario confirma la acción primaria **"Usar como este punto"**
sobre un candidato nearby con `source ∈ {osm, followed}`, el POI abierto
se promociona a la nueva identidad y se re-cura end-to-end **sin cerrar
el popup**.

### Flujo canónico
1. `UPDATE locations SET name, latitude, longitude, place_type,
   description=NULL, enriched_data=NULL, enrichment_status='pending'`.
2. `updateLocation` en store, in-place (sin remount).
3. `enrichmentFailureStore.invalidate(id)`.
4. `setNearbyPopupContextId(null)` — el popup deja de ser vista de vecino.
5. `advancePoiCurationUntilBlocked(id, 'validate-geo', popupId)` reusa el
   pipeline existente: validate-geo → recompute → enrich → recompute.
6. Toast final según `result.blocker`.

### Invariantes
- `osm` y `followed` convergen en el **mismo** flujo de re-curación
  (sin rama exclusiva osm que llame `triggerEnrichLocation` paralelo).
- Popup nunca se cierra ni se desmonta durante el pipeline. Overlay
  P-POPUP-16 cubre todo el flujo con label mutante.
- `enriched_data` previo se descarta antes de relanzar — la regeneración
  editorial es coherente con la nueva identidad.
- `source='own'` queda fuera: sigue siendo merge clásico (soft-delete del
  POI abierto + `onClose()`).

### Prohibido
- `triggerEnrichLocation(id).catch(() => {})` fire-and-forget en este path.
- Pipeline ad-hoc validate-geo o enrich fuera del orquestador único.
- Cerrar el popup tras adoptar (osm/followed).
- Conservar `enriched_data` o `enrichment_status` previo tras promoción.

**Test canónico:** `src/test/popup-poi-2-13-adopt-nearby-recuration.test.ts`.
