# Map Viewport Culling v1 (final)

Aprobado con los tres ajustes finales: hash barato O(n·k) sin strings gigantes, variable `shouldRebuild` calculada antes del flush del ref, y QA obligatorio z14/z16 con popup y ruta.

## Bandas

```
z ≤ 12       sin culling
z 13–15      culling activo, pad 0.75
z ≥ 16       culling estricto, pad 0.5
```

## keep-always (6 fuentes explícitas, todas puntuales o acotadas)

```
focusedLocationId
openPopupLocationId
activeRouteWaypointIds
activeSearchResultIds
duplicatePanelLocationIds
proximityContextLocationIds
```

`selectedLocationId` queda **fuera** (riesgo bulk).

## Helper único — `src/components/map/viewport-culling.ts` (nuevo)

```ts
import type L from 'leaflet';
import type { GeoLocation } from '@/types/location';

export function shouldCullByViewport(zoom: number): boolean {
  return zoom >= 13;
}

export function getViewportPadForZoom(zoom: number): number {
  if (zoom >= 16) return 0.5;
  if (zoom >= 13) return 0.75;
  return 0;
}

export function applyViewportCulling(
  locations: GeoLocation[],
  bounds: L.LatLngBounds | null,
  zoom: number,
  keepIds: Set<string>,
): GeoLocation[] {
  if (!bounds || !shouldCullByViewport(zoom)) return locations;
  const padded = bounds.pad(getViewportPadForZoom(zoom));
  return locations.filter(
    (loc) =>
      keepIds.has(loc.id) ||
      padded.contains([loc.latitude, loc.longitude]),
  );
}

/**
 * Firma barata del subset para evitar reconstrucciones innecesarias del cluster.
 * O(n·k) sin allocaciones grandes (no genera strings con todos los IDs).
 * Hash djb2-style sobre charCodes; combinado con length para discriminar tamaños.
 * No es criptográfico: colisiones posibles pero extremadamente raras en este uso.
 */
export function getLocationSubsetSignature(locations: GeoLocation[]): string {
  let hash = 0;
  for (const loc of locations) {
    const id = loc.id;
    for (let i = 0; i < id.length; i++) {
      hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
    }
  }
  return `${locations.length}:${hash}`;
}
```

Opcional DEV-only: en `import.meta.env.DEV` calcular además un sort+join y comparar contra el hash para detectar colisiones. Si aparecen, se documenta y se sustituye por una firma más fuerte. **No** se incluye en producción.

## Cambios en `src/components/LocationMap.tsx`

Estado nuevo:
```ts
const [viewportBounds, setViewportBounds] = useState<L.LatLngBounds | null>(null);
const [zoomState, setZoomState] = useState<number>(() => mapRef.current?.getZoom() ?? 6);
const [openPopupLocationId, setOpenPopupLocationId] = useState<string | null>(null);
```

Wiring (extender el handler `moveend`/`zoomend` ya existente y añadir `popupopen`/`popupclose`):
```ts
const m = mapRef.current!;
const onMoveOrZoom = () => {
  setViewportBounds(m.getBounds());
  setZoomState(m.getZoom());
};
m.on('moveend zoomend', onMoveOrZoom);

m.on('popupopen', (e: L.LeafletEvent & { popup: L.Popup }) => {
  const id = (e.popup.options as any)?.locationId ?? null;
  setOpenPopupLocationId(id);
});
m.on('popupclose', () => setOpenPopupLocationId(null));
```

(Cuando se construye el popup de un marker, marcar `popup.options.locationId = loc.id` para recuperarlo aquí. Si ya hay convención, reutilizarla.)

`keepIds`:
```ts
const keepIds = useMemo(() => {
  const ids = new Set<string>();
  if (focusedLocationId) ids.add(focusedLocationId);
  if (openPopupLocationId) ids.add(openPopupLocationId);
  for (const wp of activeRouteWaypointIds) ids.add(wp);
  for (const sr of activeSearchResultIds) ids.add(sr);
  for (const dp of duplicatePanelLocationIds) ids.add(dp);
  for (const pc of proximityContextLocationIds) ids.add(pc);
  return ids;
}, [
  focusedLocationId, openPopupLocationId,
  activeRouteWaypointIds, activeSearchResultIds,
  duplicatePanelLocationIds, proximityContextLocationIds,
]);
```

Subset y diff:
```ts
const markerLocations = useMemo(
  () => applyViewportCulling(locations, viewportBounds, zoomState, keepIds),
  [locations, viewportBounds, zoomState, keepIds],
);

const subsetSig = useMemo(
  () => getLocationSubsetSignature(markerLocations),
  [markerLocations],
);

const lastSubsetSigRef = useRef<string>('');

useEffect(() => {
  const shouldRebuild = subsetSig !== lastSubsetSigRef.current;

  if (import.meta.env.DEV) {
    console.debug('[map-culling]', {
      zoom: zoomState,
      filtered: locations.length,
      rendered: markerLocations.length,
      kept: keepIds.size,
      shouldRebuild,
    });
  }

  if (!shouldRebuild) return;
  lastSubsetSigRef.current = subsetSig;
  rebuildClusterLayers(markerLocations); // clearLayers + addLayers
}, [subsetSig, markerLocations, zoomState, locations.length, keepIds.size]);
```

Reemplazar `locations` → `markerLocations` **solo** en el path que alimenta `clusterGroup.addLayers(...)`. Todo lo demás (store, contadores, FilterBar, FloatingToolbar, gallery, listas, exportación) sigue leyendo `locations`/`getFilteredLocations()`.

## Documentación

- Nueva memoria `mem://logic/map/viewport-culling-v1`: bandas, pad por zoom, helper único, las 6 fuentes keep-always, regla "no reconstruir si firma no cambió", separación `filteredLocations` (verdad lógica) vs `markerLocations` (subset visual), regla "todo panel nuevo que seleccione un POI debe registrarlo en `keepIds`".
- Entrada Core en `mem://index.md`.

## Archivos a tocar

- `src/components/map/viewport-culling.ts` (nuevo)
- `src/components/LocationMap.tsx` (estado + memo + diff + reemplazo en path de cluster + wiring `popupopen/popupclose` con `locationId` en `popup.options`)
- `mem://logic/map/viewport-culling-v1`, `mem://index.md`

## Fuera de alcance

- Clustering (config y estrategia).
- Iconos / zoom bands / palette / health rings.
- Store de Content.
- Contadores, filtros, búsqueda, gallery, exportación.
- Backend.
- `selectedLocationId` en keepIds.

## QA obligatorio (cierre)

- **z14, pan corto repetido**: `[map-culling]` muestra `shouldRebuild: false` la mayoría de moveends; sin flicker.
- **z16, pan corto repetido**: ídem; polaroid no parpadea.
- **z14, pan largo cruzando padded bounds**: `shouldRebuild: true`, repintado limpio.
- **Popup abierto + pan que saca el marker del viewport ampliado**: marker permanece, popup sigue anclado.
- **Ruta activa con waypoints distantes + pan a un solo waypoint**: todos los waypoints siguen visibles.
- **Focused desde lista + pan lejos**: marker permanece y clicable.
- **Semantic search activa**: resultados visibles.
- **Sin regresión** en contadores, FilterBar, FloatingToolbar, listas, gallery, exportación.

## Riesgos

- **Hash colisión**: extremadamente raro; mitigación opcional comparación DEV con sort+join.
- **`popup.options.locationId` no convencionado**: si no existe hoy, añadirlo en el sitio único donde se crean los popups del marker.
- **Fuente keep-always olvidada**: cualquier panel futuro que seleccione un POI debe añadir su ID a `keepIds`. Documentado en la memoria.

## Criterio de éxito

- z8: `rendered ≈ filtered`.
- z14 urbano con 5k filtrados: `rendered` típicamente <500.
- z16: `rendered` solo viewport ampliado.
- 6 fuentes keep-always siempre presentes.
- Pan continuo sin popping ni reconstrucciones innecesarias.
- Sin regresión en contadores, filtros, listas ni rutas.
