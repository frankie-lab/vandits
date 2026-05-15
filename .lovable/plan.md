## Comportamiento al seleccionar una fila del popover de "mis POI"

Extiende el contrato ya implementado con dos reglas de feedback inmediato.

## Contrato de selección

Al hacer click en una fila del popover:

1. **Se aplica el filtro** según el eje (mismo flujo ya implementado):
   - "Ver todos" → `ownershipFilter='mine'`, limpia ambos ejes.
   - Item de **Estado del punto** → `ownershipFilter='mine'` + `visualState=value`, limpia `healthFilter`.
   - Item de **Salud operativa** → `ownershipFilter='mine'` + `healthFilter=value`, limpia `visualState`.
   - Re-click sobre el item activo → vuelve a "Ver todos".

2. **Cierre del popover** (nuevo):
   - **Salud operativa** → el popover **se cierra** tras el click. Razón: dispara `requestSubsetFit` y el usuario debe ver el zoom resultante sin que el popover tape el mapa.
   - **Estado del punto** → el popover **permanece abierto**. Razón: no mueve cámara, el usuario puede comparar buckets seguidos sin reabrir.
   - **"Ver todos"** → permanece abierto (no mueve cámara, igual que visualState).
   - Click fuera o `Escape` → cierra siempre (comportamiento estándar Radix).

3. **Efecto en el mapa** (confirmación):
   - **Estado del punto**: SOLO filtra `markerLocations`. NO mueve cámara. (Coherente con la norma: Geo/Tipo/Tags/visualState no mueven cámara.)
   - **Salud operativa**: filtra + dispara `requestSubsetFit` vía `useHealthFilterFit` (path existente, ya cableado).

4. **Feedback visual constante** (ya implementado, sin cambios):
   - Botón verde muestra `ring-2 ring-emerald-500/40` mientras haya `visualState || healthFilter`.
   - El número verde sigue siendo `myCatalog` total (no cambia con sub-filtros).
   - La fila activa del popover queda resaltada (anillo + fondo).

## Implementación técnica

Cambio mínimo en **`src/components/toolbar/MyCatalogQuickFilters.tsx`**:

1. Convertir el estado `open` del `Popover` en controlado: `const [open, setOpen] = useState(false)` y pasarlo a `<Popover open={open} onOpenChange={setOpen}>`.
2. Mover `<PopoverTrigger>` y `<PopoverContent>` dentro del mismo componente exportado (en vez de exportar solo el `Content`), y consumirlo desde `FloatingToolbar` como un único bloque.
3. En los handlers:
   - `applyHealth(h)` → `setOpen(false)` después de `setFilters(...)`.
   - `applyVisual(v)` y `applyAll()` → no cierran (dejan el popover abierto).

Esto requiere refactor mínimo en **`FloatingToolbar.tsx`**:
- Reemplazar el bloque `<Popover>...<PopoverTrigger asChild><button>...</button></PopoverTrigger><MyCatalogQuickFiltersContent /></Popover>` por `<MyCatalogQuickFiltersButton count={catalogStats.myCatalogCount} ownershipFilter={ownershipFilter} />` que encapsula trigger + content + estado controlado.
- El nuevo componente recibe el count y el `ownershipFilter` como props para renderizar el botón verde con el mismo aspecto y ring actuales.

## Lo que NO cambia

- Helper `getMyCatalogQuickCounts` — sin cambios.
- `useHealthFilterFit` — sin cambios; el subset-fit ya se dispara automáticamente cuando `filters.healthFilter` cambia.
- Matcher, `getBucketStats`, contador azul, FilterBar, palette, health rings, iconos.
- Reflejo bidireccional del estado FilterBar ↔ popover (sigue funcionando porque ambos leen `filters`).

## Criterio de aceptación

1. Click en "Rellenar huecos" / "Reparar cadena" / "Revisar" / "Rotos" → filtro aplicado, **popover cerrado**, mapa hace subset-fit a esos POIs.
2. Click en "Enriquecidos" / "Sin actualizar" / "Vacíos" → filtro aplicado, **popover sigue abierto**, mapa NO mueve cámara.
3. Click en "Ver todos" → ambos ejes limpios, `mine` mantenido, **popover sigue abierto**, sin movimiento de cámara.
4. Re-click sobre el item activo → vuelve a "Ver todos" con la misma regla de cierre del eje correspondiente (health cierra, visual no).
5. Click fuera o Escape → cierra el popover sin cambiar filtros.
6. El botón verde mantiene su número (`myCatalog` total) y muestra el ring mientras haya sub-filtro activo.
