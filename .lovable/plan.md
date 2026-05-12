# Location Toggle Contract — paridad arranque ↔ botón

Ámbito: solo `src/components/LocationMap.tsx`. Sin cambios en backend, MapCenterSettings, ni en `zoomToBounds`. Implementa un contrato único para "ir a mi ubicación" compartido por el arranque (`mode='geolocation'`) y por el botón "Centrar mi ubicación".

## Diagnóstico

Hoy hay dos caminos divergentes:

| | Arranque geolocation | Botón LocateFixed |
|---|---|---|
| GPS opts | `{enableHighAccuracy:true, timeout:10000}` | `{enableHighAccuracy:true, timeout:20000, maximumAge:0}` |
| Zoom | `INITIAL_GEOLOCATION_ZOOM` (12) | `13` (GPS) / `10` (IP) |
| Marca "centrado" | depende del listener `moveend` (timing) | depende del listener `moveend` (timing) |

Síntomas: zoom distinto al pulsar el botón, posición ligeramente distinta, el icono no cambia a Globe2.

## Contrato

```ts
async function centerOnUserLocation(source: 'startup' | 'button'): Promise<boolean>
```

Pasos comunes (siempre iguales):

1. Pide GPS con `GEOLOCATION_OPTS`.
2. `setUserLocation({ lat, lng, accuracy, source: 'gps' })`.
3. `flyTo([lat, lng], INITIAL_GEOLOCATION_ZOOM)` (o `setView` si arranque inmediato).
4. **Solo si los pasos anteriores tienen éxito** → `setIsCenteredOnUser(true)` optimista.
5. Devuelve `true` en éxito, `false` en fallo (GPS denegado / timeout / sin `navigator.geolocation`).
6. El listener `moveend/zoomend` ya existente confirma o revierte el flag tras pan/zoom manual.

### Manejo de errores (importante)

- Si GPS falla:
  - **`source='startup'`**: silencioso. **NO** toca `setIsCenteredOnUser` (queda `false`). El caller decide fallback (`zoomToBounds` si hay puntos).
  - **`source='button'`**: intenta fallback IP (comportamiento actual). Si IP tiene éxito → `setIsCenteredOnUser(true)` (se conserva la semántica vigente). Si IP también falla → **NO** toca el flag y muestra toast de error.
- En ningún caso se marca `isCenteredOnUser=true` antes de tener una posición real aplicada al mapa.

### Diferencias por `source`

- **`'startup'` — silencioso**: sin toasts, sin `setLocating`. Si falla, retorna `false` y `applyMapCenter` aplica su fallback existente.
- **`'button'` — interactivo**: gestiona `setLocating(true/false)` y los toasts existentes ("Solicitando ubicación…", éxito, error). Mantiene el fallback IP actual sin ampliarlo ni restringirlo.

## Constantes únicas

Cerca de `INITIAL_GEOLOCATION_ZOOM` (= `ZOOM_THRESHOLDS.richMin`):

```ts
const GEOLOCATION_OPTS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 60_000, // permite reutilizar la lectura del arranque
};
```

## Cambios concretos en `src/components/LocationMap.tsx`

1. **Crear `centerOnUserLocation(source)`** dentro del componente (`useCallback`), con la lógica y el contrato de error descritos arriba.

2. **`applyMapCenter`, rama `mode === 'geolocation'`**: reemplazar el `navigator.geolocation.getCurrentPosition(...)` inline por `await centerOnUserLocation('startup')`. Si retorna `false` y existe `navigator.geolocation`, no hacer nada extra (queda en el centro actual del mapa); si no existe `navigator.geolocation`, mantener el fallback actual a `zoomToBounds`. **No** se llama a `zoomToBounds` automáticamente cuando GPS tiene éxito (regla ya vigente).

3. **`handleLocateMe`**: pasa a ser un wrapper de `centerOnUserLocation('button')`. No duplica lógica de GPS/IP/zoom.

4. **Listener `moveend/zoomend`**: sin cambios. Sigue siendo la verdad reactiva: si el usuario hace pan/zoom y se aleja del GPS o baja del umbral `richMin`, marca `isCenteredOnUser=false`.

5. **Botón** (Globe2 ↔ LocateFixed): sin cambios estructurales.

6. **Modos `home` y `auto`**: intactos. No usan `centerOnUserLocation`.

## Criterio de cierre

- Arranque geolocation y click en "Mi ubicación" dejan **exactamente** el mismo centro, zoom (`richMin = 12`) y estado de botón (Globe2). Vista indistinguible.
- Arranque geolocation no muestra toasts ni spinner del botón.
- Si el GPS de arranque falla, `isCenteredOnUser` queda `false` (botón LocateFixed). Nunca se marca centrado por error.
- Tras pulsar Globe2 → `zoomToBounds(false)` → botón vuelve a LocateFixed.
- Pan/zoom manual lejos del GPS → botón vuelve a LocateFixed.
- Una sola fuente de verdad (`centerOnUserLocation`) para "ir a mi ubicación".

## Fuera de alcance

`MapCenterSettings`, modos `home`/`auto`, `zoomToBounds`, marker/círculo de usuario, backend, persistencia, política del fallback IP (se conserva tal cual hoy).
