

## Plan: Unificar disparadores de "Enriquecer" en los 3 puntos de entrada

### A. Helper único `triggerEnrichLocation`

Crear `src/domains/content/lib/enrich-location.ts` con la función central que extrae la lógica de `use-popup-actions.ts` (líneas 112-176):

```ts
triggerEnrichLocation(locationId, opts?: { regenerate?: boolean })
```

Hace:
1. Leer location del store (`useLocationsStore.getState()`).
2. `toast.loading('Enriqueciendo…')`.
3. `supabase.functions.invoke('enrich-location', { body: { location, skipValidation: true } })`.
4. UPDATE en `locations` con `enriched_data`, `enrichment_status='enriched'`, `place_type`, geo, `updated_at`.
5. `updateLocation()` in-place en el store (sin reload — `mem://logic/content/in-place-enrichment-update`).
6. `window.dispatchEvent(new CustomEvent('location:enriched', { detail: { id } }))`.
7. `setFocusedLocation(id)`.
8. `toast.success('Enriquecido')` o `toast.error(...)` con dismiss del loading.

### B. Refactor `src/domains/content/hooks/use-popup-actions.ts`

Reemplazar el bloque `if (action === 'enrich' || action === 'regenerate')` (líneas 112-176) por:
```ts
await triggerEnrichLocation(locationId, { regenerate: action === 'regenerate' });
```
Comportamiento idéntico, código deduplicado.

### C. Filas del documento — `DocumentWaypointsTabs.tsx`

En `VirtualWaypointList` (filas):
- **Cambiar el icono de "Ver contexto cercano"** de `Sparkles` ámbar a `Compass` (lucide) para evitar la colisión semántica con Enriquecer. Tooltip se mantiene "Ver contexto cercano". Visible para `isWaypoint` (sin enriquecer).
- **Añadir nuevo botón "Enriquecer"**: `Sparkles` violeta (`text-violet-600`) + tooltip dinámico "Enriquecer" / "Re-enriquecer" (según `isEnriched`). Visible siempre en hover, dispara `triggerEnrichLocation(loc.id, { regenerate: isEnriched })`.

Layout final por fila (lado derecho): `[Compass: contexto cercano (solo waypoints)] [Sparkles violeta: enriquecer (siempre)]`.

### D. `LocationList.tsx` general

Añadir, junto al botón papelera, un botón hover con `Sparkles` violeta:
- Tooltip "Enriquecer" si `!location.enrichedData?.descripcion`, "Re-enriquecer" si ya está enriquecido.
- onClick → `e.stopPropagation()` + `triggerEnrichLocation(location.id, { regenerate: !!location.enrichedData?.descripcion })`.
- Estado loading local (spinner) para no romper la UX.

### E. Coherencia visual

| Acción | Icono | Color | Dónde |
|---|---|---|---|
| Enriquecer / Re-enriquecer | `Sparkles` | Violeta `#7c3aed` | Popup, lista doc, lista general |
| Ver contexto cercano | `Compass` | Ámbar | Solo lista doc (waypoints) |

### QA de aceptación

1. Click "Enriquecer" en popup → toast loading + success, store in-place, evento `location:enriched`, foco al punto.
2. Click chispa violeta en fila documento → idéntico al popup.
3. Click chispa violeta en `LocationList` general → idéntico al popup.
4. Click `Compass` en fila documento → abre Proximity Context, **no** llama edge function, **no** modifica BBDD.
5. Punto ya enriquecido → los 3 botones violetas muestran tooltip "Re-enriquecer" y disparan con `skipValidation:true`.
6. Sin regresiones: el flujo del popup actual sigue funcionando igual (delegado al helper).

### Archivos afectados

```text
NEW   src/domains/content/lib/enrich-location.ts
EDIT  src/domains/content/hooks/use-popup-actions.ts
EDIT  src/domains/content/components/DocumentWaypointsTabs.tsx
EDIT  src/components/LocationList.tsx
```

Sin tocar: edge function `enrich-location`, schema BBDD, store core, popup HTML.

