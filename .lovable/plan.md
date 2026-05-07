## Bug detectado

`useGeocodingJobStore.start()` acepta `forceRenormalize` pero no propaga el campo `mode` al edge function `backfill-admin-fks`. Como la edge function distingue `fill | reconcile | overwrite`, hoy:

- "Rellenar huecos" → fill ✓
- "Reconciliar (recomendado)" → cae a fill ✗ (debería sobrescribir si difiere)
- "Reescribir todo" → overwrite ✓ (vía alias `force_renormalize`)

## Cambios

### 1. `src/stores/geocoding-job-store.ts`
- Añadir `mode?: 'fill' | 'reconcile' | 'overwrite'` a `GeocodingScope`.
- En la llamada a `supabase.functions.invoke('backfill-admin-fks', { body })` incluir `mode: scope.mode` cuando esté definido.
- Mantener `force_renormalize` por compatibilidad con otros lanzadores existentes (DocumentsPanel etc.).

### 2. `src/components/admin/GeographyBackfillPanel.tsx`
- En `handleStart`, pasar `mode` explícito al scope:
  ```ts
  start(total, { label: MODE_LABELS[mode].title, mode })
  ```
- Quitar el truco `forceRenormalize: mode === 'overwrite'` (lo cubre el `mode`).
- Confirmar visualmente que el sufijo del CTA cambia según radio (ya está, solo aclarar copy: "Lanzar — Rellenar huecos" en lugar de "Lanzar backfill (Rellenar huecos)" para que sea evidente).

### 3. Verificación
- Tras el cambio, los logs de la edge function deben mostrar `mode=reconcile` cuando se elige esa opción.

## Out of scope
- No se toca la edge function (ya soporta los tres modos).
- No se cambia el flujo de DocumentsPanel ni de imports.