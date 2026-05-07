## Objetivo

Cerrar la fase de UI de la normalización geográfica universal:
1. Botón **"Renormalizar desde coordenadas"** en la ficha de cualquier punto.
2. Bloque **"Geografía universal"** en `AdminPanel` para lanzar el backfill global (fill / reconcile / overwrite) con barra de progreso e informe de cobertura.
3. Garantizar que el árbol de "Buscar y filtrar" muestre la jerarquía postal real (ej. Galicia → 4 provincias → ayuntamientos → localidades → barrios/calles), sin niveles huecos.

No se toca lógica de enriquecimiento, fotos, notas, colecciones ni nombres.

---

## 1. Botón en ficha de punto

**Helper ya existe:** `renormalizeLocation(locationId)` en `src/shared/geography/renormalize.ts`.

Añadir un botón único, reutilizable:

- Componente nuevo: `src/shared/geography/RenormalizeButton.tsx`
  - Props: `locationId`, `variant` (`icon` | `full`), `onDone?`.
  - Icono Lucide `Compass` (o `RefreshCw`) + label "Renormalizar geografía".
  - Estado loading, toast de éxito/fallo, dispara `dispatchEvent('locations-changed')` para refresco in-place.

Insertarlo en los 3 puntos donde hoy se ve la ficha:
- Popup del mapa: `src/domains/content/components/LocationPopup*` (sección de acciones secundarias, junto a Sparkles/Compass).
- Vista de documento: tarjeta de punto en `DocumentDetailPanel` (acciones inline).
- Admin masivo: columna "acciones" en `AdminPanel > Markers` o lista de puntos (variante `icon`).

Regla: el botón llama `renormalizeLocation` con `mode: 'overwrite'` (forzado, ya que es manual).

## 2. Bloque "Geografía universal" en AdminPanel

Ubicación: nueva pestaña en `AdminPanel.tsx` con `id: 'geography'`, label "Geografía".

Contenido (componente nuevo `src/components/admin/GeographyBackfillPanel.tsx`):

- **Tarjeta de cobertura** (lectura de la vista `v_geo_coverage`):
  - Tabla compacta con % resuelto por nivel: continent / country / region / zone / admin3 / locality / sublocality / street / type.
  - Total de puntos analizados y "última ejecución".

- **Selector de modo**:
  - `fill` — solo huecos (rápido, no destructivo).
  - `reconcile` — sobrescribe si difiere de OSM, guarda histórico en `raw_geocode.previous` (recomendado).
  - `overwrite` — fuerza re-resolución completa (más coste).

- **Botón "Lanzar backfill"**:
  - Loop client-side sobre `backfill-admin-fks` con `batchSize: 50`, integrado con `useGeocodingJobStore` y la `GeocodingProgressBar` global (ya cableada).
  - Muestra "X / Total puntos · Y errores".
  - Cancelación mediante el store existente.

- **Filtros opcionales** (checkboxes):
  - "Solo de mis usuarios" / "Todos" (gated por rol `master`/`admin`).
  - "Solo puntos sin `geo_resolved_at`" (equivalente a forzar `fill`).

## 3. Árbol jerárquico — verificación

El cambio funcional ya está hecho en `src/shared/geography/hierarchy.ts` y `GeographyTree.tsx` (sin `(sin ...)` placeholders, fallback de continente por bbox).

Para que Galicia muestre exactamente sus 4 provincias hace falta que los puntos tengan `zone` resuelto. Esto solo ocurre cuando se ejecuta el backfill en modo `reconcile` u `overwrite` (los datos viejos solo tienen `region`).

Por tanto: tras añadir el panel admin, lanzar **una vez** en modo `reconcile`. Esto es operación, no código — se documenta en el panel mediante un mensaje:
> "Galicia mostrará sus 4 provincias y la cascada postal completa una vez termine el backfill en modo reconcile/overwrite."

## 4. Memoria

Actualizar `mem://geography/universal-layer-phase-4`:
- Añadir entrada sobre el botón manual y el bloque de admin.
- Confirmar que el árbol depende de la cobertura de `zone_id`/`locality_id` resuelta por el backfill.

---

## Detalles técnicos

- `RenormalizeButton` usa el bus `locations-changed` para que el mapa y listas reflejen el nuevo path sin recargar.
- `GeographyBackfillPanel` reutiliza el job store ya existente (`useGeocodingJobStore`) — no introduce un sistema paralelo de progreso.
- La vista `v_geo_coverage` ya existe (Phase 4); si falta algún nivel (admin3/sublocality/street) se añade en la misma migración SQL al desplegar el panel.
- Sin emojis: iconos Lucide vía `icon-utils.tsx`.
- Tokens semánticos del sistema de paneles (PanelShell + PanelSection).

## Out of scope

- Migración ni borrado de datos existentes.
- Cambios en el flujo de enriquecimiento.
- Traducción de nombres OSM (se respetan tal cual vienen).
- Corrección de coordenadas erróneas (sigue gestionada por `name-coordinate-coherence`).