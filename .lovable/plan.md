## Objetivo

Cambiar el comportamiento de **doble click sobre un POI**: que únicamente **centre la vista del mapa en ese punto**, sin tocar la selección múltiple ni filtrar/ocultar el resto de POIs.

## Diagnóstico

En `src/components/LocationMap.tsx` (líneas 1758–1760), el handler actual es:

```ts
marker.on('dblclick', () => {
  toggleLocationSelection(location.id);
});
```

`toggleLocationSelection` añade/quita el POI del set de selección múltiple. Como hoy la UI entra en modo "Seleccionar" al haber selección activa, el efecto colateral percibido es que "desaparecen los demás puntos" (el mapa pasa a mostrar sólo el subset seleccionado vía `subset-fit` / filtros del modo selección).

## Cambio

Reemplazar el handler de `dblclick` por un centrado puro de cámara sobre las coordenadas del POI, sin tocar selección, sin abrir popup, sin filtrar capas.

```ts
marker.on('dblclick', (e: L.LeafletMouseEvent) => {
  L.DomEvent.stop(e);                  // evita el zoom-in nativo de Leaflet
  const map = mapRef.current;
  if (!map) return;
  map.panTo(marker.getLatLng(), { animate: true, duration: 0.4 });
});
```

Notas:
- `L.DomEvent.stop` cancela el `doubleClickZoom` por defecto de Leaflet, para que el doble click **sólo centre** y no haga zoom-in.
- No se llama a `toggleLocationSelection`, no se dispara `requestSubsetFit`, no se modifican filtros — el resto de POIs siguen visibles tal cual.
- El click simple sigue abriendo el popup y centrándolo (línea 1753–1756) sin cambios.

## Fuera de alcance

- No se toca el click simple ni el popup.
- No se modifica el store de selección ni la UI del panel "Seleccionar".
- No se cambia ninguna lógica de filtrado, capas, ni subset-fit.
