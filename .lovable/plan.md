## Nueva regla de visibilidad por colecciones (catálogo + privadas)

Hoy el ojo de una colección catálogo solo cambia el tinte. Vamos a convertirlo en control real de visibilidad de sus puntos en el mapa global, manteniendo coherente la regla `is_approved`.

### Reglas finales (transversales)

Para cada punto aprobado en el mapa global:

1. **Sin colecciones**: siempre visible (no pertenece a ninguna colección catálogo).
2. **Con al menos una colección catálogo**: visible solo si AL MENOS UNA de sus colecciones catálogo tiene el ojo activado en sesión.
   - Todas las catálogo apagadas → el punto se oculta esa sesión.
   - Una encendida → el punto vuelve, con anillo del color de esa colección.
3. **Privadas (`inCatalog=false`)** (sin cambios): el ojo fuerza la visibilidad de sus puntos no aprobados durante la sesión.

Resultado en tu captura: con las 7 catálogo apagadas verás solo los puntos aprobados que no están en ninguna colección catálogo (probablemente ~0 según los conteos: 11+16+397+2452+382+157+126 = 3541 = total). El mapa quedaría prácticamente vacío hasta encender un ojo. Coincide con tu intención.

### Cambios técnicos

**1. `collection-visibility.ts` (helper único)**
- Sigue siendo SoT de sesión.
- Inicialización por defecto: TODAS las catálogo se cargan visibles (igual que ahora).
- Nueva API:
  - `isPointInAnyCatalogCollection(locationId)` → recorre TODAS las colecciones catálogo del usuario (cargadas en init, no solo las visibles).
  - `isPointVisibleViaCollections(locationId)` se amplía: devuelve `true` si pertenece a alguna colección visible (catálogo o privada). El nombre se reusa pero la semántica se documenta.
- Para el cálculo necesitamos también el universo de colecciones catálogo (no solo las visibles). Guardamos un segundo mapa `catalogMembership: Record<locationId, collectionIds[]>` cargado una sola vez en `initSessionCollectionVisibility`.

**2. `document-visibility.ts` → `isLocationVisibleInGlobalMap(loc)`**
Nueva fórmula:
```
visible =
  (loc.isApproved && !isPointInAnyCatalogCollection(loc.id))     // aprobado suelto
  || isPointVisibleViaCollections(loc.id)                          // alguna colección visible
```

**3. Recálculo reactivo**
- Ya bumpeamos `_docVersion` en `Index.tsx` al evento `COLLECTION_VISIBILITY_EVENT`. Suficiente para re-filtrar el store.
- Añadir broadcast también cuando cambian items de colección (`collection-items-changed`) para invalidar `catalogMembership`.

**4. UI `CollectionsListPanel`**
- Tooltip del ojo en colecciones CATÁLOGO pasa a:
  - ON → "Ocultar sus puntos del mapa (sesión)"
  - OFF → "Mostrar sus puntos en el mapa (sesión)"
- Badge "CATÁLOGO" / "PRIVADA" se mantiene.
- Sin cambios en privadas.

**5. Memoria**
Actualizar `mem://logic/collections/visibility-and-styling` y la Core rule "Visibilidad = is_approved" añadiendo la excepción: "los puntos miembros de colecciones catálogo además requieren que al menos una de sus colecciones esté visible en sesión".

### Archivos afectados
- `src/domains/content/lib/collection-visibility.ts` (ampliar API + cargar membership de catálogo)
- `src/domains/content/lib/document-visibility.ts` (nueva fórmula)
- `src/components/CollectionsListPanel.tsx` (tooltips)
- `mem://logic/collections/visibility-and-styling` y `mem://index.md` (Core rule actualizada)

### Fuera de alcance
- No se cambia el filtro por documento (`filterByDocumentId` sigue puenteando todo).
- No se toca el contador del FloatingToolbar (sigue contando aprobados; podemos abordarlo aparte si lo quieres restar por colecciones ocultas).
- Rutas siguen como hoy: solo el tinte cambia, no la visibilidad.
