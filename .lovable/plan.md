## Objetivo

Mover el progreso de **Recuperar imágenes faltantes** al `BottomProgressBar` global (mismo carril visual que `EnrichmentLane` y `GeocodingLane`), en lugar de vivir dentro del propio `RecoverImagesPanel`. Así el admin puede cerrar el panel / cambiar de pantalla sin perder visibilidad del job, igual que pasa con los otros dos jobs de fondo.

## Por qué

Hoy `RecoverImagesPanel` corre el bucle `while` en su propio componente con `useState` locales:
- Si cierras el panel admin, el bucle muere (el componente se desmonta) y el job se pierde.
- El feedback de progreso solo es visible en esa tarjeta — incoherente con la norma transversal (toda tarea de fondo larga vive en `BottomProgressBar`).
- No hay forma de detenerlo desde el resto de la app.

## Arquitectura propuesta

Misma forma que `geocoding-job-store` + `GeocodingLane`:

```text
src/stores/image-recovery-job-store.ts       (Zustand singleton + bucle)
src/shared/progress/ImageRecoveryLane.tsx    (LaneRow visual, lee del store)
src/components/BottomProgressBar.tsx         (monta el nuevo lane)
src/components/admin/RecoverImagesPanel.tsx  (sólo configura + lanza/detiene)
```

### 1. `image-recovery-job-store.ts` (Zustand)

Estado:
- `running: boolean`, `stopping: boolean`
- `dryRun: boolean`, `scope`, `force`, `retryStaleDays`, `batchSize`
- Acumuladores: `waves`, `scanned`, `updated`, `skippedAlreadyAttempted`, `failedTransient`
- `recentItems: ItemLog[]` (últimos 30, igual que ahora)
- `startedAt: number | null`, `cursor: string | null`

Acciones:
- `start(config)`: setea estado, lanza loop interno encadenando `nextCursor` con `supabase.functions.invoke('recover-missing-images', …)`. Idempotente si `running === true`.
- `stop()`: marca `stopping=true`; el loop sale después del lote en curso.
- `reset()`: limpia acumuladores cuando no está corriendo.

El bucle vive en el store (no en un componente), por lo que el job sobrevive a desmontajes del panel admin y a cambios de ruta.

### 2. `ImageRecoveryLane.tsx`

Mismo patrón que `GeocodingLane`:
- `onActiveChange(running)` para que el shell aparezca/desaparezca.
- `LaneRow`:
  - `iconNode`: `ImageIcon` (o `Loader2` si `stopping`), `iconTone="violet"` para distinguirlo de amber/orange (geocoding) y del enrichment.
  - `title`: `dryRun ? 'Recuperando imágenes (dry-run)' : 'Recuperando imágenes faltantes'`
  - `subtitle`: lote actual + tasa de éxito `updated/scanned`.
  - `progressPct` indeterminado (no conocemos el total real upfront): segmento estilo "indeterminate" como en `GlobalLoadingBar`, o usar `scanned` vs un objetivo estimado solo si está disponible.
  - `metrics`: Encontradas (verde), Saltados (gris), Errores transitorios (amber).
  - `controls`: botón **Detener tras lote actual** (mismo patrón que `GeocodingLane`).
- `onClick` en la fila → `window.dispatchEvent(new CustomEvent('admin:open-data-sources'))` para abrir el panel donde está la tarjeta (cablear el listener en el componente que monta el panel admin de Fuentes de datos).

### 3. `BottomProgressBar.tsx`

Añadir un tercer lane con su propio `useState` de actividad:

```tsx
const [imageRecoveryActive, setImageRecoveryActive] = useState(false);
const anyActive = enrichmentActive || geocodingActive || imageRecoveryActive;
…
<EnrichmentLane … />
<GeocodingLane … />
<ImageRecoveryLane onActiveChange={setImageRecoveryActive} />
```

Sin tocar el shell, divisores `divide-y` ya separan los lanes.

### 4. `RecoverImagesPanel.tsx`

Se vuelve un **panel de configuración + disparador**:
- Mantiene controles (Alcance, Batch, Dry-run, Force, Retry stale).
- Botón principal pasa a llamar `useImageRecoveryStore.getState().start({...config})` y desaparece el bloque de stats locales.
- Lee `running` del store para deshabilitar inputs y mostrar “Job en marcha — ver barra inferior”.
- (Opcional) sección colapsable “Resultado del último lote” leyendo `recentItems` del store, para inspección sin tener que mirar la barra.

## Detalles técnicos

- **Persistencia ligera**: `recentItems` y `totals` viven en memoria del store. Recargar la página sigue cortando el bucle (igual que el comportamiento actual de Enrichment/Geocoding salvo que un job server-side esté en marcha — aquí el control vive en cliente, se documenta en JSDoc).
- **Tono visual**: usar `iconTone="violet"` (o crear `iconTone="indigo"` en `LaneRow` si no existe) para no chocar con amber (geo) ni con el verde de enrichment.
- **Listener `admin:open-data-sources`**: cablear en el wrapper que ya escucha `admin:open-geography` (para que el clic en la fila abra el panel correcto).
- **Sin cambios en el edge function** `recover-missing-images` ni en su contrato.
- **Compatibilidad con la regla transversal de Memory** (`mem://`): todo job de fondo largo se reporta vía `BottomProgressBar` lanes; este cambio alinea Image Recovery con esa norma.

## Fuera de alcance

- No tocar el edge function ni el flujo de escritura `enriched_data.imagen` (eso queda como pendiente del loop anterior).
- No cambiar la lógica de búsqueda multi-fuente.
- No añadir realtime/server-side persistence del job (sigue siendo un loop cliente, igual que hoy, solo que centralizado).
