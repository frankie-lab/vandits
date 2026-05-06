## Diagnóstico

`GeographyTree.tsx` ya calcula y renderiza un `<Badge>` con `node.count` (y `node.count/node.totalCount` en ámbar cuando hay filtros no-geográficos activos) en cada fila. En la captura no se ve porque el layout actual lo está dejando fuera de viewport o con `min-w-0` colapsándolo:

- El nombre del nodo (`<span class="truncate flex-1">`) absorbe todo el espacio disponible.
- El `<Badge shrink-0>` queda al final pero, con paddings acumulados por nivel (`paddingLeft: depth * 12 + 8`), en niveles 5-7 (Comarca, Localidad, Barrio) el panel a 320 px ya no tiene hueco y el badge se queda pegado al borde derecho del scroll, fuera del recorte visible del panel.

Lo mismo ocurre en `PlaceTypeTree` y `TagsTree` (mismos hijos de "Buscar y filtrar"), conviene revisar en paralelo para mantener consistencia transversal.

## Cambios

### 1. Layout de fila (transversal a los 3 árboles)

Reservar siempre una **columna fija a la derecha** para el badge de conteo, fuera del `<button>` truncable:

```
[chevron] [checkbox] [button: icon + name truncate] [badge ──┐ slot fijo]
```

- Sacar el `<Badge>` (y su `Tooltip`) fuera del `<button>` y ponerlo como hermano alineado a la derecha del contenedor de fila.
- Contenedor: `flex items-center gap-1.5 ... pr-2` con el badge en posición final con `ml-auto shrink-0`.
- Mantener `truncate` solo en el `<span>` del nombre.

Resultado: el badge nunca se recorta, sea cual sea la profundidad.

### 2. Formato del badge

Mantener la lógica actual de dos modos:

- **Sin filtros no-geográficos**: `N` (color primario suave).
- **Con filtros activos**: `N/Total` (ámbar) — N = puntos que pasan los filtros en esa rama, Total = puntos totales en esa rama.

Añadir además, **siempre visible**, el indicador del nivel actual de filtro (cuando la rama corresponde al nodo seleccionado), que ya existe (`bg-primary/10 ring-1`).

### 3. Aplicar a los 3 árboles

- `src/components/filters/GeographyTree.tsx` — fix principal.
- `src/components/filters/PlaceTypeTree.tsx` — mismo patrón si renderiza badges igual.
- `src/components/filters/TagsTree.tsx` — idem.

Verificar primero qué renderizan los otros dos antes de tocar — si ya tienen el badge fuera del botón, no duplicar trabajo.

### 4. Sin cambios funcionales

No cambia la lógica de filtrado, conteo, selección o navegación. Solo es un ajuste de layout para garantizar visibilidad del conteo por nodo.

## Verificación

1. Abrir Buscar y filtrar → Geo, navegar hasta nivel 5-7 (Comarca/Localidad/Barrio): cada fila muestra el badge a la derecha.
2. Activar filtro de tipo o búsqueda: badges cambian a ámbar `N/Total`.
3. Repetir en pestañas Tipo y Tags si aplican el mismo cambio.
