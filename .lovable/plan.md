# PR-ENRICH-PARITY-1 — Unificar el botón Enriquecer en POIs sin enriquecer

## Diagnóstico

En las dos capturas hay **dos botones "Enriquecer" distintos** sobre el mismo POI:

- **Naranja** — vive en `<UnenrichedRecoveryBlock>` (React, montado dentro del popup vía `popup-recovery-mount.ts`). Llama `triggerEnrichLocation(id, { focusAfter: false })`.
- **Púrpura** — vive en el HTML estático del popup (`map-popups.ts`, `data-action="enrich"`). Llama `triggerEnrichLocation(id, { regenerate: false })` con `focusAfter` por defecto = `true`.

### Por qué se comportan distinto

1. El **púrpura** tiene `focusAfter: true` → dispara `setFocusedLocation(id)` → un efecto de `LocationMap` regenera el `setPopupContent(...)`. El popup se redibuja con `isEnriched=true`. **Refresco por efecto colateral del foco**, no por contrato.
2. El **naranja** tiene `focusAfter: false` → no dispara ningún efecto que regenere el HTML del popup. La DB se actualiza, pero el popup sigue con el HTML viejo y el bloque React no se entera porque su `location` viene capturada por closure.

Resultado: la toast dice "Ficha enriquecida" pero el popup sigue exactamente igual → el usuario percibe que "no persiste".

### Causa raíz

1. **Doble fuente de verdad para el mismo CTA** (un naranja React + un púrpura HTML duplicado).
2. **Refresco del popup acoplado al cambio de foco** en lugar de ser una consecuencia directa del éxito de enriquecimiento.

## Cambios

### 1. `src/components/map/map-popups.ts` — eliminar el botón púrpura duplicado

En la rama `!isEnriched && canEditLocation`, **quitar** el `<button data-action="enrich">` púrpura. Su función la cubre `<UnenrichedRecoveryBlock>` (naranja), ya montado en el host `[data-recovery-root]` del popup.

Conservar el púrpura **solo** en la rama `isEnriched` (label "Re-enriquecer", `regenerate=true` — otra acción, no es duplicado).

### 2. `src/domains/content/components/UnenrichedRecoveryBlock.tsx` — leer del store

Sustituir el uso directo de `props.location` por una suscripción al store:

```ts
const fresh = useLocationsStore(s => {
  for (const d of s.documents) {
    const l = d.locations.find(l => l.id === location.id);
    if (l) return l;
  }
  return location;
});
const isEnriched = getPointVisualState(fresh) === 'enriched';
if (isEnriched) return null; // auto-desmontaje al éxito
```

Garantiza que cuando `triggerEnrichLocation` actualiza el store, el bloque se desmonta solo. Sin tocar foco, sin tocar mapa.

### 3. `src/components/LocationMap.tsx` — contrato de refresco del popup

**Esta es la regla canónica:**

```
enrich success
  → updateLocation(store)
  → emit 'location:enriched'
  → LocationMap listener: si hay popup abierto para ese id, regenerar HTML
```

Implementación: añadir un `useEffect` que escuche `window.addEventListener('location:enriched', ...)`. Para cada evento:

- Buscar el `marker` en `markersRef.current.get(detail.id)`.
- Si el marker tiene popup abierto (`marker.isPopupOpen()`), recalcular el contenido con `buildPopupContent(freshLocation, ...)` y llamar `marker.setPopupContent(nuevoHtml)`.
- También refrescar el icon del marker (ya hay un patrón equivalente en el listener de `subscribeFailureChange`).

**Sin tocar `setFocusedLocation`.** El refresco depende solo del evento, no del foco.

### 4. `src/domains/content/lib/enrich-location.ts` — desacoplar refresco de foco

- Cambiar el default de `focusAfter` a `false`.
- El evento `location:enriched` ya se emite (línea 279) — es el único contrato de refresco para popups abiertos.
- `focusAfter: true` queda **opt-in** para callers que realmente necesiten centrar el mapa (lista general, panel de documento), no para forzar refresco visual.

## Verificación

1. POI sin enriquecer → solo **un** botón "Enriquecer" (naranja, del bloque de recuperación).
2. Pulsarlo → toast "Ficha enriquecida" → bloque "Aún sin enriquecer" desaparece, popup pasa a "Enriquecido <fecha>" + "Re-enriquecer" púrpura. **Sin reposicionar el mapa, sin cerrar/reabrir popup.**
3. "Re-enriquecer" sobre un POI ya enriquecido sigue funcionando idéntico.
4. Si se llama `triggerEnrichLocation` con popup cerrado, el icono se actualiza vía pipeline existente (sin nada que refrescar en el popup — no panic).
5. `bunx vitest run` verde.
6. QA visual en `/`.

## Memorias a actualizar

- `mem://logic/content/enrichment-trigger-unified` — añadir nota:
  - "Único CTA visible para POIs sin enriquecer = `<UnenrichedRecoveryBlock>`. El popup HTML solo pinta `Re-enriquecer` (púrpura) cuando el POI ya tiene `enrichedData`."
  - "Contrato de refresco canónico: `enrich success → updateLocation → emit location:enriched → LocationMap regenera popup si está abierto`. Prohibido usar `focusAfter` como mecanismo de refresco."
- `mem://logic/content/in-place-enrichment-update` — reflejar el contrato anterior.
