## Objetivo

1. **Normalizar TODOS los puntos desde sus coordenadas** (no solo "rellenar huecos") — sobreescribir los 8 niveles + tipo cuando difieran de lo que dice OSM.
2. **Eliminar todo `(sin …)` / `Desconocido` del árbol** "Buscar y filtrar" y vistas similares — siempre que haya coordenadas válidas, todo punto debe quedar al menos en Continente → País → Región (3–5 niveles).
3. **Permitir normalización manual punto a punto** desde su ficha, en cualquier momento.

---

## Cambios

### 1. Backfill universal — modo "reescribir desde coordenadas"

Edge function `backfill-coordinates` y `resolve-coordinates`:

- Añadir modo `mode: 'fill' | 'reconcile' | 'overwrite'` (default `reconcile`).
  - `fill` = solo huecos (comportamiento actual con `onlyMissing=true`).
  - `reconcile` = compara FKs actuales con los devueltos por OSM; si hay diferencia, sobrescribe y deja traza en `raw_geocode.previous`.
  - `overwrite` = sobrescribe siempre los 8 FKs + `type_id`, sin comparar.
- Ya NO se filtra por `geo_resolved_at IS NULL` cuando `mode != 'fill'`. Recorre TODOS los puntos con lat/lng válidas.
- No toca `name`, `description`, `enriched_data`, fotos, notas ni colecciones.
- Procesa en lotes (`limit` por invocación, default 50, máximo 500) con cursor por `created_at`.

### 2. UI: lanzador del backfill global (Admin)

En `AdminPanel` añadir bloque "Normalización geográfica":
- Tarjeta con cobertura actual (vista `v_geo_coverage`): % puntos con cada nivel resuelto.
- 3 botones: **Rellenar huecos** / **Reconciliar (recomendado)** / **Reescribir todo**.
- Barra de progreso reutilizando `useGeocodingJobStore` + `GeocodingProgressBar`.
- Bucle cliente que invoca `backfill-coordinates` por lotes hasta agotar.

### 3. Normalización manual de un punto

En la ficha del punto (popup + admin), nueva acción **"Renormalizar geografía"** (solo dueño / master):
- Llama a `resolve-coordinates` con `mode: 'overwrite'` para ese `locationId`.
- Toast con resumen ("Madrid, Comunidad de Madrid, España, Europa").
- Update in-place del store (sin recarga).

Helper único `renormalizeLocation(locationId)` en `src/shared/geography/renormalize.ts`. Lo usan popup, admin y ficha.

### 4. Árbol "Buscar y filtrar" — eliminar `(sin …)`

`src/shared/geography/hierarchy.ts`:
- `LEVEL_PLACEHOLDER_LABELS` deja de devolver `(sin continente/país/región)` para los 3 primeros niveles. En su lugar: si falta continente o país y el punto tiene coordenadas, se calcula on-the-fly un fallback determinista por bounding box (mapa estático lat/lng → continente y, vía `country_code`/coordenadas, país). Esto cubre puntos aún no normalizados sin mostrar "Desconocido".
- Para `region`, `zone`, `admin3`, `locality`, `sublocality`, `street` ausentes: **se omiten del árbol** (no se renderiza un nodo placeholder, simplemente el punto cuelga del último nivel resuelto).

`src/components/filters/GeographyTree.tsx`:
- Quitar el grupo "Sin clasificar" / `totalUnclassified`.
- Cambiar `getFilledLocationHierarchy` a `getLocationHierarchy` (sin placeholders) y construir el árbol saltando niveles vacíos.
- Profundidad mostrada por defecto: 5 niveles (Continente → País → Región → Provincia → Localidad). Resto colapsado.

Mismo cambio aplica a cualquier otra vista que use `getFilledLocationHierarchy` (revisar `BatchEnrichmentPanel`, `SelectionActions`, `locations-store.groupBy`).

### 5. Memoria

Actualizar `mem://geography/universal-layer-phase-4` y core rules:
- "Mapa global y árbol nunca muestran `(sin …)` cuando hay coordenadas."
- "Backfill modo `reconcile` es el por defecto."
- "Renormalización manual disponible por punto."

---

## Detalles técnicos

- **Mapa lat/lng → continente** (fallback determinista, sin red): tabla pequeña de bounding boxes en `src/shared/geography/continent-bbox.ts` (7 continentes ISO). Se usa SOLO en UI cuando falta `continent_id`.
- **Mapa lat/lng → país** (fallback): si falta `country_id`, se usa `country_code` si existe; si no, se muestra "Pendiente" con CTA inline "Normalizar ahora" que dispara `renormalizeLocation`.
- **Sin coordenadas válidas**: el punto se agrupa bajo "Sin coordenadas" (caso real distinto a "Desconocido"); aparece la acción "Editar coordenadas".
- **Rate limit**: Nominatim 1 req/s ya implementado en `resolve-coordinates`. El bucle cliente respeta el ritmo.
- **Idempotencia**: `mode=reconcile` no toca filas ya correctas (compara los 8 FKs + `place_type`). Diff exacto evita escrituras innecesarias.
- **Trazabilidad**: cada reescritura guarda en `raw_geocode.previous` los IDs anteriores y timestamp.

---

## Fuera de alcance

- Mover coordenadas mal puestas: queda en el flujo `name-coordinate-coherence` ya existente (banner ámbar).
- Cambiar nombres traducidos de regiones: se respeta lo que devuelve OSM.
