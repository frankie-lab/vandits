## Botón "Localizarme" contextual

El botón flotante central pasa a tener **dos modos** que se conmutan según el estado real del mapa.

### Comportamiento

- **Modo A — "Centrar en mi ubicación"** (por defecto)
  - Icono: `LocateFixed`
  - Acción: comportamiento actual (`handleLocateMe` → `getCurrentPosition` → `flyTo` a `userLocation`).
  - Tooltip: "Centrar en mi ubicación".

- **Modo B — "Vista global"**
  - Icono: `Globe2` (Lucide).
  - Acción: `zoomToBounds(false)` (mismo helper que ya usa el botón `Maximize2` de la pill inferior derecha → fit a todos los puntos visibles/filtrados).
  - Tooltip: "Vista global".

### Detección (proximidad real)

Se calcula en cada `moveend`/`zoomend` del mapa, recordando el último valor en un `useState`:

```text
isCenteredOnUser =
  userLocation != null
  && distance(map.getCenter(), userLocation) < 150 m
  && map.getZoom() >= 13
```

- Si `isCenteredOnUser` → render Modo B (Vista global).
- En cuanto el usuario arrastra/zoom-out → vuelve a Modo A automáticamente.
- Si aún no hay `userLocation` capturada → siempre Modo A (igual que hoy).

### Detalles técnicos

Cambio único en `src/components/LocationMap.tsx` (bloque líneas 2175-2204):

1. Añadir `const [isCenteredOnUser, setIsCenteredOnUser] = useState(false)`.
2. `useEffect` que engancha `mapRef.current.on('moveend zoomend', recompute)` y limpia en cleanup. El recompute usa `map.distance(center, userLocation)` (Leaflet ya lo expone en metros) y `map.getZoom()`.
3. En el JSX del botón:
   - `onClick = isCenteredOnUser ? () => zoomToBounds(false) : handleLocateMe`
   - `aria-label` y `<TooltipContent>` cambian con `isCenteredOnUser`.
   - Icono: ternario `isCenteredOnUser ? <Globe2 /> : <LocateFixed />` (manteniendo `Loader2` cuando `locating`).
4. Importar `Globe2` desde `lucide-react` en el bloque de imports existente.

Sin tocar:
- Posición central del wrapper, estilos, `pointer-events`, ni el botón `Maximize2` de la pill inferior (que sigue siendo el atajo "ver todos").
- `handleLocateMe` ni `zoomToBounds` (se reutilizan tal cual).

### Verificación

1. Estado inicial: botón muestra `LocateFixed`, tooltip "Centrar en mi ubicación".
2. Click → mapa vuela a tu ubicación; al terminar el `moveend` el botón cambia a `Globe2` y tooltip "Vista global".
3. Click de nuevo → fit a todos los puntos; el botón vuelve a `LocateFixed`.
4. Arrastrar el mapa lejos de la ubicación o zoom-out por debajo de z13 → vuelve a modo A sin click.
