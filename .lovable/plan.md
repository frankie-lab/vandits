## Cambios al panel "Geografía universal"

Tres problemas a resolver de una vez:

1. **Combos no despliegan**: aunque subimos z-index a `z-[100]`, el `SelectContent` sigue tapado por el chrome del panel/Dialog que usa capas más altas. La solución correcta es eliminar los `Select` y usar otro patrón.
2. **Limitación de la cascada**: solo permite UN país de UN continente. Imposible "Spain + France", o "Spain + Mexico".
3. **Layout poco aprovechado**: las 4 secciones apiladas (Cobertura · Ámbito · Modo · Lanzar) desperdician el ancho del panel.

### Solución propuesta

**Layout en 2 columnas** dentro del panel:

```text
┌────────────────────────────────────┬──────────────────────────────┐
│ COLUMNA IZQUIERDA — Selección      │ COLUMNA DERECHA — Acciones   │
│                                    │                              │
│ [árbol Geo multi-check]            │ Cobertura geográfica         │
│  ▾ Europe         (4537)           │  Total: 5074                 │
│   ▸ ☐ Spain       (1292)           │  Resueltos: 4747 (94%)       │
│    ▾ ☑ Galicia    (180)            │  ...                         │
│     ▸ ☐ A Coruña  (62)             │                              │
│   ▸ ☑ France      (1067)           │ Modo de normalización        │
│   ▸ ☐ Italy       (990)            │  ◉ Reconciliar (recomend.)   │
│   ...                              │  ○ Rellenar huecos           │
│  ▾ Americas       (...)            │  ○ Reescribir todo           │
│   ▸ ☐ Mexico      (...)            │                              │
│                                    │ [▶ Lanzar sobre selección    │
│ Mostrando rama por defecto         │     (1247)              ]    │
│ Sin coincidencias para…            │                              │
└────────────────────────────────────┴──────────────────────────────┘
```

En pantallas estrechas (< ~900px de panel) cae a una sola columna apilada (árbol arriba, acciones abajo) usando `lg:grid-cols-[1fr_320px]`.

### Árbol de selección (columna izquierda)

- **Mismo patrón visual** que `GeographyTree` de "Buscar y Filtrar" (jerarquía continente → país → región → zona → ... con expand/collapse y badges de conteo).
- **Pero independiente del store de filtros** (`useLocationsStore`): este árbol NO debe filtrar el mapa global; solo recolectar IDs de POIs para el job de geografía.
- Cada nodo tiene un **checkbox tri-estado**:
  - vacío → ningún descendiente seleccionado
  - check → todos los descendientes seleccionados
  - indeterminado → selección parcial
- Marcar un nodo padre selecciona todos sus descendientes (cascada). Permite combinaciones libres (Spain + France + Mexico simultáneamente).
- **Fuente de datos**: `getAllLocations()` del propio store (ya está cargado en el cliente — son los POIs del usuario). Calculamos el árbol con el helper canónico `getLocationHierarchy` / `getFilledLocationHierarchy`. Esto evita pegarse contra `admin_areas` y refleja exactamente lo que el usuario ve.
- **Búsqueda rápida** opcional arriba del árbol (input "Filtrar nodos…") para encontrar "Galicia" sin expandir todo.
- **Footer del árbol**: contador `N seleccionados · Limpiar`.
- **Altura**: ocupa todo el alto disponible del cuerpo del panel con scroll interno.

### Columna derecha — Acciones

Tres bloques compactos (los que ya existen, pero apilados en menor ancho):

1. **Cobertura geográfica** (sin cambios funcionales).
2. **Modo de normalización** (sin cambios funcionales).
3. **Ejecución**:
   - Botón único `Lanzar sobre selección (N)` donde N = total de IDs en `selectedIds`.
   - Si N = 0 → label `Lanzar (todos mis puntos)` y se manda sin filtro.
   - Mientras corre: barra de progreso, ETA y botón Detener (idéntico a hoy).

### Limpieza

- Se **elimina** la sección "Ámbito" actual con sus 4 `Select` y la lista plana de POIs (innecesaria: el árbol ya muestra la jerarquía y los conteos).
- Se conserva 100% del backend: el job sigue mandando `location_ids` al edge `backfill-admin-fks`. **No se toca** `geocoding-job-store`, `geocoding-job-tick` ni la migración SQL.

### Archivos a editar

- `src/components/admin/GeographyBackfillPanel.tsx` — reescribir layout y estado de selección.
- **Nuevo** `src/components/admin/GeographyScopeTree.tsx` — árbol multi-check reutilizable, leyendo de `useLocationsStore.getAllLocations()` y emitiendo `Set<string>` de IDs al padre vía callback. No toca `filters` del store.

### Fuera de alcance

- No se modifica `GeographyTree` de filtros (sigue su rol en "Buscar y Filtrar").
- No se cambia el contrato del job ni los edge functions.
- No se añade selección por colección/documento (puede ser una iteración futura).

### Verificación

- Abrir panel → ver árbol a la izquierda, acciones a la derecha.
- Marcar `Spain` y `France` → contador "1247 seleccionados", botón "Lanzar sobre selección (1247)".
- Expandir Spain → Galicia → marcar solo Galicia → botón "Lanzar sobre selección (180)".
- Sin selección → botón "Lanzar (todos mis puntos)".
- Reducir el ancho del panel → layout cae a una columna.
