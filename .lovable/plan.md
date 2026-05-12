## Diagnóstico

El culling **sigue cableado** en `viewport-culling.ts` y `LocationMap.tsx` (líneas 1419–1422, listeners `zoomend`/`moveend` 1224–1246, `keepIds` 1409–1414).

Lo que cambió: con `microMax=10` y la nueva rampa, **z11 y z12 ya son banda `compact`** (markers ~12 px, no microdots). Pero el helper sólo activa culling en **z≥13**:

```text
z ≤ 12   → sin culling   ← agujero
z 13–15  → pad 0.75
z ≥ 16   → pad 0.5
```

Resultado en zonas densas (Madrid) a z11–12: se construyen todos los markers Leaflet del universo filtrado. Eso se percibe como "se ha perdido el filtrado por viewport". Antes del cambio de rampa, z11–12 caían en micro y la ausencia de culling no dolía.

## Cambio propuesto

Extender el culling a la banda compact con pad generoso para panning fluido:

```text
z ≤ 10   → sin culling           (banda micro, microdots baratos)
z 11–12  → culling activo, pad 1.0   ← NUEVO
z 13–15  → culling activo, pad 0.75
z ≥ 16   → culling estricto, pad 0.5
```

`pad 1.0` = duplica el viewport en cada eje. Suficiente para pan corto sin huecos.

## Archivos a tocar

- `src/components/map/viewport-culling.ts`
  - `shouldCullByViewport`: `zoom >= 11`.
  - `getViewportPadForZoom`: añadir rama `if (zoom >= 11) return 1.0;`.
  - Actualizar el comentario canónico al inicio del archivo.

```ts
export function shouldCullByViewport(zoom: number): boolean {
  return zoom >= 11;
}

export function getViewportPadForZoom(zoom: number): number {
  if (zoom >= 16) return 0.5;
  if (zoom >= 13) return 0.75;
  if (zoom >= 11) return 1.0;
  return 0;
}
```

Nada más. `keepIds`, firma de subset, listeners y separación `filteredLocations` vs `markerLocations` quedan idénticos.

## Validación

1. **z10 (micro)**: sin culling, microdots — comportamiento actual.
2. **z11 — A/B coste con vs sin culling** (zona densa, p.ej. Madrid):
   - Log DEV `[map-culling]` ya emite `filtered` y `rendered`. Comparar `rendered/filtered` ratio con la rama actual (1.0) y la nueva (debería bajar a ~0.3–0.5 según zoom y densidad).
   - Confirmar que `rendered` con pad 1.0 < `filtered` total — si no, el culling no aporta y habría que revisar pad.
   - Medir tiempo de reconstrucción del cluster (perf.now alrededor del effect 1442) en el mismo viewport antes/después.
3. **z11–12 panning**: pan corto no muestra huecos; pan largo repuebla en `moveend`.
4. **z13–15 / z≥16**: idéntico a hoy.
5. **`keepIds`** (focused + popup abierto) sobreviven aunque caigan fuera.

## Memoria

Actualizar `mem://logic/map/viewport-culling-v1` con la nueva tabla (z≥11 pad 1.0) y nota: el cambio responde a `microMax=10`, que dejó z11–12 fuera del régimen barato de microdots.
