# ADR 004 — Visibilidad y color de colecciones (única fuente)

Estado: Aceptado · 2026-05-06

## Contexto

La visibilidad de un punto/ruta en el mapa global y el "anillo de color" del marcador
estaban distribuidos en varios archivos: el centro del marcador lo decide
`getPointVisualState` (palette estado), pero el anillo se inyectaba aparte vía DOM
en `LocationMap.tsx`. Esto provocaba derivas: el panel de colecciones mostraba un
estado y el mapa otro; tras realtime/cluster/force-update, los anillos se perdían.

## Decisión

Existe **una única API pública** para visibilidad y tint de colecciones:

- `isLocationVisibleInGlobalMap(loc)` — visibilidad efectiva en el mapa global.
- `getTintForLocation(id)` / `getTintForRoute(id)` — color del anillo o `null`.
- `toggleCollectionVisibility(c)` / `getVisibleCollectionIds()` /
  `subscribeCollectionVisibility(cb)` — estado por sesión.
- `initSessionCollectionVisibility(uid)` / `resetSessionCollectionVisibility()`.

Todo lo demás de `collection-visibility.ts` es `@internal`.

### Matriz de reglas

| Estado del punto | Membresía en colecciones | Visible en mapa global | Anillo |
|---|---|---|---|
| Aprobado | Ninguna catálogo | Sí | No |
| Aprobado | ≥1 catálogo, **ninguna** visible | **No** | — |
| Aprobado | ≥1 catálogo, alguna visible | Sí | Color de la 1ª visible |
| No aprobado | En colección **privada** visible | Sí (forzado) | Color |
| No aprobado | Resto | Solo en vista doc | — |

Rutas: solo visibles si toggle Itinerarios o vista doc; mismo anillo.

`documents.status` no afecta. El centro del marcador (paleta enriched/imported/empty)
no se altera por colecciones.

### No-haz

- No decidir color/visibilidad de un punto inline en componentes.
- No leer `documents.status` para visibilidad.
- No tocar el centro del marcador desde lógica de colección (solo el anillo).
- No mantener un `Set` paralelo en `Index.tsx` ni en `CollectionsListPanel`:
  suscribirse a `subscribeCollectionVisibility`.

## Consecuencias

- El anillo se renderiza dentro de `createCustomIcon(..., tint?)` para que sobreviva
  a cualquier `setIcon` (cluster, realtime, force-update).
- Tests en `src/test/collection-visibility.test.ts` y
  `src/test/document-visibility.test.ts` cubren cada celda de la matriz.
- Cualquier PR que toque marker render o el panel de colecciones debe importar
  solo la API pública y pasar esos tests.

## QA visual (checklist transversal)

1. Mapa global: alternar ojo de una colección catálogo cambia visibilidad y anillo
   sin recargar.
2. Tras realtime INSERT/UPDATE: los anillos se mantienen.
3. Cluster: al hacer zoom, los marcadores recreados conservan anillo.
4. Re-mount de `Index` (sub-tab) no resetea el set de colecciones visibles.
