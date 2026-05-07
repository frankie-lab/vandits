# Conteos jerárquicos coherentes en el árbol Geo

## Diagnóstico (verificado en BD)

`Castilla y León` tiene 175 puntos aprobados:
- 140 con `zone IS NULL` (sin provincia, no escrito)
- 29 con `zone = '(sin provincia)'` (placeholder textual ya escrito por `resolve-admin-area`)
- 6 con `zone = 'El Bierzo'`

El árbol solo pinta como hijos los que tienen string (NULL + placeholder = 35), por eso el padre 175 no cuadra con la suma visible. A nivel global hay **1.077 zonas NULL** y **603 zonas con placeholder textual** — mismo síntoma en muchas ramas (Andalucía, Cataluña, Comunidad de Madrid…).

Causa raíz en `src/components/filters/GeographyTree.tsx`: la construcción del árbol hace `if (!zone) return;` para cada nivel ausente, así el punto se cuenta en el padre pero no se añade a ningún hijo. Tampoco hay un único helper que normalice "ausente" (NULL o placeholder) → existen dos buckets para lo mismo (`(sin provincia)` aparece como nodo y los NULL desaparecen).

## Regla a aplicar (transversal)

> Para cualquier nivel jerárquico, **el conteo del padre = suma de los conteos de sus hijos**. Si un punto no tiene valor en el nivel N pero sí en N-1, debe colgar de un nodo placeholder único `(sin {nivel})` bajo su padre. NULL y el string `(sin ...)` se fusionan en el **mismo nodo**.

## Cambios

### 1. Helper único de placeholders (`src/shared/geography/hierarchy.ts`)
- Añadir `LEVEL_PLACEHOLDER_LABELS: Record<HierarchyLevel, string>` (continente / país / región / provincia / comarca / localidad / barrio / calle).
- Modificar `getLocationHierarchy(loc)` para que **rellene el path completo**: en cuanto un nivel sea NULL o coincida con `/^\(sin /i`, devolver el placeholder canónico para ese nivel **y propagarlo a todos los descendientes** (de modo que un punto sin región tampoco tenga zona/comarca/etc reales: cuelga de `(sin región) → (sin provincia) → ...` bajo el país).
- `compareLocationsHierarchical` y `groupLocationsByHierarchy` ya usan `UNCLASSIFIED_VALUE`; reusar la misma constante para mantener orden "placeholder al final" (ya implementado).

### 2. Árbol Geo (`src/components/filters/GeographyTree.tsx`)
- Eliminar todos los `if (!zone) return;`, `if (!region) return;`, `if (!comarca) return;`, etc.
- Construir el árbol siempre hasta el nivel más profundo disponible usando los valores de `getLocationHierarchy`, que ahora nunca devuelve undefined intermedio. Para los placeholders, usar la etiqueta canónica del helper.
- `totalTree` (mapa de cuentas globales) se construye con la misma lógica → así "filtered/total" del badge sigue siendo coherente.
- Los IDs siguen acumulándose en cada nivel (incluido el placeholder) → la checkbox y el contador "Seleccionar N puntos filtrados" siguen funcionando.

### 3. Estilo del nodo placeholder (sin cambios visuales, ya existe)
- `^\(sin /i` ya aplica `italic text-muted-foreground/70` y orden al final (cambio anterior). Reusar.

### 4. Filtro al hacer click en placeholder
- En `selectNode`, cuando un segmento del path empieza por `(sin `, el filtro debe machear puntos con NULL **y** con placeholder. Ajustar `matchesLocationFilters` (geo) para que un valor de filtro `(sin xxx)` se traduzca a `valor IS NULL OR valor ILIKE '(sin %'` en ese nivel.

### 5. (Opcional, no bloqueante) Limpieza de placeholders escritos en BD
- A futuro: dejar `(sin ...)` solo como representación de UI y **no escribirlo nunca** en columnas de `locations`. Hoy `resolve-admin-area` los escribe como cadena (línea 75 de `supabase/functions/resolve-admin-area/index.ts`). No se cambia ahora — el helper de UI ya los unifica.

## Archivos a tocar

```
src/shared/geography/hierarchy.ts                    (helper)
src/components/filters/GeographyTree.tsx             (consumidor principal)
src/domains/content/lib/location-filtering.ts        (matcher para filtro placeholder)
```

## Verificación post-implementación

- Castilla y León debe mostrar `(sin provincia) 169` + `El Bierzo 6` = 175.
- Spain debe mostrar suma de sus 17 CCAA + `(sin región) 39` + lo que toque sin región = 1292.
- Para cada nodo padre del árbol: `count(padre) === sum(count(hijos))`.

## Notas

- Cambio puramente de **presentación + helpers**, sin migraciones de datos.
- Cumple regla "App multiusuario — cambios transversales": toda la lógica geo pasa por `getLocationHierarchy`.
