## Objetivo

En el panel "Contexto cercano" (inline dentro del popup del POI sin localización clara), el botón **Enriquecer** debe estar asociado a **cada resultado** de la lista, no a un CTA global al pie. Así el usuario indica explícitamente cuál de los puntos cercanos es el lugar correcto para anclar la identidad y enriquecer.

## Diagnóstico

`src/domains/content/components/PointContextActions.tsx`:

- Hoy hay un solo CTA global en el footer (línea 882–885): "Enriquecer este punto", que llama a `handleEnrichWithContext` y pasa los 10 primeros vecinos como mero contexto al modelo, **sin** anclar a ninguno en concreto. Eso confunde porque el usuario percibe que "no está asignado a ninguno".
- Cada item se renderiza vía `<NearbyPointCard point={p} />` dentro de un `<div onClick={handleSelectPoint}>` (líneas 798–805). Al expandir el item ya hay acciones contextuales ("Reemplazar importado", "Punto personal"), pero no hay un "Enriquecer aquí" que adopte ese candidato.

`UnenrichedRecoveryBlock.tsx` ya tiene el patrón correcto en `handleAdoptCandidate` (líneas 176–210): UPDATE de `name` + `latitude` + `longitude` en `locations`, sync del store, `triggerEnrichLocation(id, { skipValidation: true })`. Reproducimos esa misma semántica aquí.

## Cambios

### 1. `PointContextActions.tsx` — nuevo handler `handleAdoptNearby`

Análogo a `handleAdoptCandidate`. Recibe un `NearbyPoint`, hace:
1. `UPDATE locations SET name = p.name, latitude = p.latitude, longitude = p.longitude WHERE id = location.id`.
2. `useLocationsStore.getState().updateLocation(location.id, { name, coordinates: { lat, lng }, updatedAt })`.
3. `triggerEnrichLocation(location.id, { focusAfter: false, skipValidation: true })`.
4. `enrichmentFailureStore.invalidate(location.id)` en éxito; `toast.error(...)` en error.
5. Estado local `adoptingId: string | null` para mostrar spinner sólo en la fila pulsada.

Importar `triggerEnrichLocation` y `enrichmentFailureStore` (ya disponibles en `domains/content`).

### 2. Render por fila — botón "Enriquecer aquí"

Dentro del `<div>` del resultado (líneas 798–866), justo debajo de `<NearbyPointCard />` y **siempre visible** (no requiere expandir/seleccionar la fila), añadir:

```tsx
<div className="flex items-center justify-end px-3 pb-2">
  <Button
    size="sm"
    variant="default"
    className="h-7 text-[11px] gap-1.5"
    disabled={adoptingId !== null}
    onClick={(e) => { e.stopPropagation(); handleAdoptNearby(p); }}
  >
    {adoptingId === p.id
      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
      : <Sparkles className="w-3.5 h-3.5" />}
    Enriquecer aquí
  </Button>
</div>
```

Las acciones existentes (Reemplazar / Personal / Guardar) que aparecen al seleccionar la fila se mantienen tal cual.

### 3. Footer — eliminar el CTA ambiguo

Sustituir el bloque de footer (líneas 877–887) por sólo el contador de progreso, sin botón:

```tsx
{!mergeMode && (
  <div className={`flex min-w-0 shrink-0 items-center justify-between gap-2 overflow-hidden border-t bg-background ${padX} py-2`}>
    <p className="truncate text-[10px] text-muted-foreground">
      {nearbyPoints.filter(p => hasRealEnrichment(p)).length} de {nearbyPoints.length} enriquecidos
    </p>
    <p className="truncate text-[10px] text-muted-foreground">
      Elige el punto correcto en la lista
    </p>
  </div>
)}
```

Eliminamos `handleEnrichWithContext` y `enriching` si dejan de usarse en otro sitio (verificar con `rg`); si están referenciados por la variante 'sidebar' en otra superficie, mantener pero sin renderizar el botón.

## Fuera de alcance

- No se cambia la consulta de vecinos (`search-nearby-osm`), ni el ranking, ni el agrupado por categoría.
- No se modifica `UnenrichedRecoveryBlock` ni el flujo de coherence-conflict (allí ya hay "Enriquecer aquí" por candidato).
- No se persisten preferencias nuevas; el comportamiento es idempotente por POI.
- `handleReplaceWithPoint` y "Punto personal" siguen disponibles al expandir la fila — son acciones distintas (no enriquecer, sino sustituir o crear personal).
