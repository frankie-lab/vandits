## Lo que pides + mi lectura

Cinco cambios concretos en el panel **Colecciones** (`CollectionsListPanel` + `CollectionFocusView` + `collection-visibility`) y unas propuestas para que se sienta menos "tabla" y más asistente.

---

### 1. Contador de elementos en cada fila (sin desbordar)

En la fila de cada colección añadir un badge compacto `**12 · 3**` (puntos · rutas) o `15` total, entre el nombre y los iconos de acción. Para no desbordar:

- Pre-cargamos los conteos en lote con un único query `collection_items` agrupado por `collection_id` al montar el panel (no uno por colección).
- El badge usa `tabular-nums text-[10px]` y se contrae a sólo el número total si el ancho del panel < 320px.
- Se actualiza en vivo cuando se añade/quita un item (escuchamos `collection-items-changed` y reconteamos).

### 2. Ojo operativo de verdad

Hoy `toggleCollectionVisibility` emite `itinerary-focus` + `collection-visibility-changed`, pero el mapa sólo reacciona al focus de itinerario (oculta otros). Para que el ojo se note:

- **Visible activado**: el mapa muestra los miembros de la colección **con tinte** (anillo exterior color colección en marcadores, polilínea coloreada en rutas) y **sin ocultar el resto** del catálogo.
- **Visible desactivado**: vuelve al render normal del punto/ruta.
- Implementación: en `LocationMap.tsx` añadir listener de `COLLECTION_VISIBILITY_EVENT` que mantiene un `Map<locationId, color>` y `Map<routeId, color>`. Al pintar marcadores/rutas se aplica como overlay (un `<circle>` SVG anillo de 4px en el divIcon, y un `setStyle({color})` en la polyline).
- Si hay varias colecciones visibles que comparten un punto, mostramos un anillo segmentado bicolor (mismo patrón que ya usamos en `SplitCircle`).
- El icono del ojo se mantiene y se sincroniza con el set real de colecciones visibles (ya lo hace `Index.tsx`).

### 3. Lápiz = sólo renombrar

- Mover el dialog actual `CollectionAppearanceDialog` (color + icono + nombre) a un nuevo botón **paleta** (icono `Palette`) junto al lápiz.
- El lápiz abre **edición inline** del nombre en la propia fila (input + check/x), igual que ya hacemos para "Nueva colección". Más rápido y coherente.
- Persiste con `update(id, { name })`.

### 4. Orden lógico de los puntos dentro de la colección

Hoy `getItems` los devuelve por orden de inserción. Cambiar a un orden **geográfico y semántico**, reutilizando el helper que ya tenemos:

- En `CollectionFocusView`, tras cargar `places`, los pasamos por `**compareLocationsHierarchical**` / `**groupLocationsByHierarchy**` (memoria `mem://logic/content/geo-hierarchy-ordering`) → quedan agrupados por país → región → localidad.
- Render por grupos con header `País · Región` (chip pequeño, igual que vista de documento) y dentro orden alfabético.
- Para rutas, orden por `transport_mode` y luego nombre.
- Bonus: pequeño selector "Orden: Geográfico / Alfabético / Recientes" (3 chips) por si el usuario prefiere otro criterio.

### 5. Click en punto = enfocar en mapa

Ya está parcialmente: `handleFocusPlace` hace `setFocusedLocation` + `map-fly-to`. Pero al estar en `CollectionFocusView` el panel tapa el mapa y no se ve el highlight. Mejoras:

- Usar `**sidebar-aware centering**` (memoria `mem://ui/map/sidebar-aware-centering-logic`) para que el flyTo deje el punto visible al lado del panel, no debajo.
- Resaltar el marcador (anillo pulsante 1.5s) reemitendo `nearby-highlight-marker` con el id del punto, que ya está soportado.
- Click corto = focus + flyTo. Doble click = abrir popup completo (emitir `open-location-popup`).
- En la fila, mostrar pequeñas señales secundarias: chip de tipo (`getEffectivePlaceType`) y, si existe, índice IA (1-5 estrellas micro). Sin desbordar: `truncate` siempre y chips `shrink-0` a la derecha que se ocultan < 280px.

---

## Propuestas extra para parecer inteligente, no artificial

1. **Drag & drop entre colecciones**: arrastrar un punto de una colección a otra (o al mapa para quitarlo). Usa el grupo expandido inline ya existente.
2. **"Sugerir colección" automática**: al hacer click derecho en un punto del mapa, si IA detecta que encaja en una colección existente (mismo país + categoría + cercano a >2 miembros), proponemos "Añadir a *Pueblos bonitos de Italia*" sin abrir diálogo.
3. **Mini-mapa preview en la fila expandida**: al desplegar el chevron, mostrar un thumbnail estático (Leaflet → canvas) con los puntos de la colección. Genera sensación de "ya lo veo" sin tener que activar el ojo.
4. **Modo comparar**: shift-click sobre dos colecciones → activa ambas con tintes distintos a la vez y abre vista combinada con conteo de solapamientos ("3 puntos están en las dos").
5. **Auto-fit inteligente al activar el ojo**: si el bounding box de la colección está fuera del viewport actual, hacer flyToBounds suave; si ya está dentro, no mover el mapa (evita mareo).
6. **Estadísticas en el header de la vista enfocada**: "12 puntos · 4 países · 3 enriquecidos · 320 km de rutas" — datos derivados sin coste extra (ya en memoria).
7. **Exportar colección**: botón en el header que genera un KML/GPX descargable filtrando sólo los miembros (reutiliza el exportador del catálogo).
8. **Compartir colección con seguidores**: toggle público/privado por colección, respetando RLS de `collection_items`.

---

## Detalles técnicos / archivos a tocar

```text
src/components/CollectionsListPanel.tsx
  - prefetch counts en lote
  - badge tabular-nums responsive
  - lápiz → rename inline; nuevo botón Palette → CollectionAppearanceDialog
  - listener collection-items-changed para recontar

src/components/CollectionFocusView.tsx
  - import compareLocationsHierarchical / groupLocationsByHierarchy
  - render por grupos geográficos + selector de orden
  - flyTo con sidebar-aware offset + highlight pulsante
  - header con micro-estadísticas

src/components/LocationMap.tsx
  - listener COLLECTION_VISIBILITY_EVENT
  - mapas locationTint / routeTint
  - aplicar tinte como overlay SVG en marker, setStyle en polyline
  - sin ocultar el resto del catálogo

src/domains/content/lib/collection-visibility.ts
  - dejar de re-emitir 'itinerary-focus' (ya no se necesita ocultar resto)
  - exponer subscribeCollectionVisibility(cb) para componentes

(Opcionales para "modo inteligente": nuevos archivos
 - lib/collection-suggestions.ts
 - components/CollectionMiniMap.tsx)
```

Sin migraciones de DB. Sin breaking changes — el dialog existente se conserva tal cual y sólo se mueve a otro botón.

---

## ¿Qué confirmamos antes de implementar?

Si te parece bien procedo con **los 5 cambios pedidos** + **#5 (auto-fit inteligente)** y **#6 (estadísticas en header)** porque son bajo coste y de impacto inmediato. El resto (drag&drop, sugerencias IA, mini-mapa, comparar, exportar, compartir) los dejamos como segunda tanda. ¿Cambias algo?