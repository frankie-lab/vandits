## P-POI-CURATION-3 (Fase 1) — Auto-advance validate-geo → enrich

Cuando el usuario pulse **Validar geografía**, el sistema no se limita a lanzar el job: encadena automáticamente recompute → enrich → recompute y muta el popup in-place hasta el siguiente bloqueo real o estado sano. Sin heal-rings, sin nuevos jobs server-side, sin UI nueva.

---

### 1. Helper nuevo

`src/domains/content/lib/advance-poi-curation.ts`

```ts
export type CurationStage = 'validate-geo' | 'enrich' | 'recompute';

export type CurationBlocker =
  | 'geo-conflict'         // geoHealth='broken' → POI-3
  | 'needs-identity'       // POI-0 (sin nombre validable)
  | 'enrichment-ambiguous' // llm_unverifiable | name_coordinate_mismatch | no_match
  | 'manual-rating'        // POI-9 visitado sin user_rating
  | 'none';                // POI-10 / sano final

export interface CurationAdvanceResult {
  startLevel: PoiCurationLevel;
  endLevel:   PoiCurationLevel;
  stagesRun:  CurationStage[];
  blocker:    CurationBlocker;
  message:    string;       // toast canon, ya en curación-language
}

export async function advancePoiCurationUntilBlocked(
  locationId: string,
  trigger: 'validate-geo',  // fase 1: único trigger
  popupId: string,
): Promise<CurationAdvanceResult>;
```

Flujo fase 1:

1. **Pre-recompute**: leer POI del store, calcular `startLevel = getPoiCurationLevel(loc).level`.
2. **Stage `validate-geo`**:
   - `setPopupOperationalState(popupId, 'loading', { label: 'Validando geografía…' })`.
   - `useGeocodingJobStore.getState().clearLastResult()`.
   - `start(1, { label, mode:'reconcile', locationIds:[id], source:'popup_validate_geo' })`.
   - Esperar finalización del job — **reutilizar el mecanismo que ya tiene el store**: suscribirse a `lastResult` mediante `useGeocodingJobStore.subscribe` y resolver cuando `lastResult.finishedAt` cambie y `jobId` coincida. Timeout de seguridad: 45s → tratar como `enrichment-ambiguous` con mensaje genérico de manual.
3. **Stage `recompute`**: tras el evento `reload-locations` que el store ya emite al completar, releer el POI del store. Si el store no se ha hidratado todavía con la nueva fila, hacer un fetch puntual a `locations` por id y aplicar `updateLocation(...)` con los nuevos campos (`continent/country/region/zone/geoHealth no se mapea en el store directamente — releer del store basta porque `reload-locations` ya lo refresca`). Recalcular nivel.
4. **Decisión post-validate-geo**:
   - `geoHealth === 'broken'` → STOP, `blocker = geo-conflict`, mensaje `Se requiere resolución manual: conflicto geográfico`.
   - `level === 0` → STOP, `blocker = needs-identity`, mensaje `Se requiere resolución manual: identificar el POI`.
   - `isPointEnriched(loc) === true` y `level ∈ {9,10}` → STOP, blocker derivado (`manual-rating` si POI-9 visitado-sin-rating; `none` en POI-10 o POI-9 no visitado).
   - `geoHealth === 'ok'` y `!isPointEnriched(loc)` → continuar a stage `enrich`.
   - Cualquier otro caso (incluido `geoHealth ∈ {partial, stale_name, empty}` que produciría POI-5) → STOP `blocker = none` con mensaje `Geografía validada` (heal-rings se cablea en fase 3.1, no ahora).
5. **Stage `enrich`** (si procede):
   - `setPopupOperationalState(popupId, 'loading', { label: 'Curando POI…' })` (muta solo `label`, P-POPUP-16 in-place, ya soportado).
   - `const r = await triggerEnrichLocation(locationId, { regenerate: false })`.
   - Mapear errores → blocker:
     - `name_coordinate_mismatch`, `llm_unverifiable` → `enrichment-ambiguous`.
     - `not_found` o `unknown` → `enrichment-ambiguous`.
     - éxito → continuar.
6. **Stage `recompute` final**: releer store + `getPoiCurationLevel`. Construir mensaje canon final:
   - `endLevel === 10` → `POI completamente curado`.
   - `endLevel === 9`  → `POI enriquecido`.
   - `endLevel === 5`  → `Geografía validada` (la deuda de rings queda visible; fase 3.1 la abordará).
   - `blocker !== 'none'` → mensaje específico ya definido arriba.

**Guard anti-bucle**: máximo 1 ejecución por stage; nunca más de 1 enrich.
**Guard anti-doble-click**: el caller ya invoca con `isPopupOperational(popupId)` previo; el helper no lo duplica.

---

### 2. Silenciar mensajería batch del store

En `src/stores/geocoding-job-store.ts`, dentro de `applyRow`, envolver los tres `toast.success/.message/.error` del bloque terminal (líneas 146-164) con:

```ts
const isPopupSource = (row.scope as any)?.source === 'popup_validate_geo';
if (!isPopupSource) {
  // toasts existentes
}
```

También suprimir el `toast.message('Geocodificación lanzada…')` final de `start()` cuando `scope?.source === 'popup_validate_geo'`. El orquestador emite el mensaje canónico una sola vez al final.

Los eventos `reload-locations` / `locations:refresh` / `locations:changed` se siguen emitiendo igual (los necesita el recompute).

---

### 3. Cableado en `use-popup-actions.ts`

Reemplazar el cuerpo actual de `curation-primary / validate-geo` (líneas 669-687) por:

```ts
if (curationAction === 'validate-geo') {
  setPopupOperationalState(popupId, 'loading', { label: 'Validando geografía…' });
  try {
    const result = await advancePoiCurationUntilBlocked(locationId, 'validate-geo', popupId);
    if (result.blocker === 'none' && result.endLevel >= 9) {
      toast.success(result.message);
    } else if (result.blocker === 'none') {
      toast.success(result.message); // 'Geografía validada'
    } else {
      toast.message(result.message);  // resolución manual / manual-rating
    }
  } catch (err) {
    console.error('[advance-poi-curation] error:', err);
    toast.error('No se pudo curar el POI');
  } finally {
    clearPopupOperationalState(popupId);
  }
  return;
}
```

`resolve-conflict`, `heal-poi`, `rate-experience`: **sin cambios** en esta fase. Siguen como están (toast pendiente / scroll a ratings).

---

### 4. Tests

Nuevo: `src/test/popup-curation-advance.test.ts`

1. POI-1 + geo job mock que persiste `geoHealth='ok'` + `triggerEnrichLocation` mock OK → `stagesRun = ['validate-geo','recompute','enrich','recompute']`, `endLevel ∈ {9,10}`, blocker `none`, mensaje `POI enriquecido` o `POI completamente curado`.
2. POI-1 + geo job mock → `geoHealth='broken'` → STOP, blocker `geo-conflict`, sin enrich, mensaje canónico.
3. POI-1 + geo OK + enrich devuelve `llm_unverifiable` → blocker `enrichment-ambiguous`.
4. POI-1 + geo OK + enrich devuelve `name_coordinate_mismatch` → blocker `enrichment-ambiguous`.
5. POI-9 visitado sin rating al inicio → `validate-geo` corre, geo ok, no enrich (ya enriched), blocker `manual-rating`.
6. POI-10 al inicio → STOP inmediato sin stages, blocker `none`, mensaje `POI completamente curado`.
7. **No batch language**: spy sobre `toast.success/message` durante todo el flujo no contiene los strings `job`, `puntos revisados`, `segundo plano`, `Geocodificación`.
8. **Overlay continuo**: `setPopupOperationalState` se llama con `loading` al menos 2 veces (validate-geo, curando) y `clearPopupOperationalState` sólo una vez al final.
9. **Shell estable** (regresión P-POPUP-16): identidad del nodo `#${popupId}` se conserva antes/después del pipeline.

Extender:
- `popup-curation-validate-geo.test.ts`: actualizar para reflejar que el overlay persiste hasta fin del pipeline y la mensajería ahora viene del orquestador.

Mantener verdes (sin tocar): `popup-golden-poi-contract`, `popup-curation-primary-action`, `poi-curation-level`, `popup-operational-state`, `popup-footer-persistent`, `popup-unified-renderer`, `popup-no-diag-badges`.

---

### 5. Fuera de scope (explícito)

- `heal-rings`, `_enqueue_geo_repair`, repair batch → **fase 3.1**.
- Cableado de `resolve-conflict` / `heal-poi` con el orquestador → fase posterior.
- Edge functions, RLS, schema, `geocoding-job-tick`, `_compute_location_geo_health*` → no se tocan.
- Renderer / shell / hero / breadcrumb / composer / ratings block / footer layout / marker grammar / PopupShell → no se tocan.

---

### 6. Memoria

Añadir entrada en `mem://index.md` Memories:
- `[Curation auto-advance (fase 1)](mem://logic/poi/curation-advance-pipeline)`

Crear `mem://logic/poi/curation-advance-pipeline` (type: feature) con: helper único `advancePoiCurationUntilBlocked`, stages fase 1 = `validate-geo|enrich|recompute`, blockers canon, mensajería sin batch, P-POPUP-16 in-place, fase 3.1 pendiente para heal-rings.

Actualizar `docs/contracts/poi-curation-levels.md` §3 con nota: "Fase 1 del auto-advance cubre solo `validate-geo → enrich`. Ver P-POI-CURATION-3."

---

### Criterio de aceptación

1. Click `Validar geografía` sobre POI-1 con geografía sanable y sin enriquecer → overlay `Validando geografía…` → muta a `Curando POI…` sin recrear el popup → toast final `POI enriquecido` (o `POI completamente curado`), popup en POI-9/10.
2. Click sobre POI-1 con conflicto → toast `Se requiere resolución manual: conflicto geográfico`, popup en POI-3, sin enrich.
3. Click sobre POI-1 que valida geo pero enrich devuelve ambiguo → toast `Se requiere resolución manual: datos ambiguos`, popup refleja estado real.
4. Ningún toast contiene "job", "puntos revisados", "segundo plano" o "Geocodificación" durante el flujo del popup.
5. Suite de tests popup + nuevo `popup-curation-advance.test.ts` en verde.
