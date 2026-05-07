## Unificación: un solo paso "Normalizar geografía"

### Objetivo
Colapsar Geocodificar + Clasificar país/región/zona + Renormalizar en **un único paso automático** durante la importación, usando siempre el normalizador canónico (`geo-normalizer.ts` + doble pasada Nominatim + placeholders). Cero intervención manual para imports nuevos.

### Garantía de no regresión
La unificación reusa funciones que ya existen y funcionan:
- `backfill-admin-fks` (con doble pasada + normalizador, ya validado).
- `geocode-batch.ts` (forward geocoding para puntos sin lat/lng).
- `resolve-admin-area` (placeholders, ya validado).
- `geocoding-job-store` (barra global, ya operativa).

Nada se borra hasta que la nueva ruta esté verde. El botón "Renormalizar" se conserva como red de seguridad para puntos legacy.

### Cambios

#### 1. `src/domains/content/lib/process-imported-document.ts`
Fusionar el paso 1 (`geocoding`) y 2 (`fk-resolve` + 2.b reverse-geocode loop) en un solo paso `geo-normalize`:

```text
Paso "Normalizar geografía":
  a) Forward-geocode puntos sin lat/lng (geocodeLocations) → UPDATE coords
  b) Llamar a backfill-admin-fks { document_id, force_renormalize: true, limit: 25 }
     en bucle hasta remaining=0 (con cap zero-progress)
  c) Emitir un único evento de progreso "geo-normalize"
```

Eliminar el bloque actual de `resolveAllFks` cliente-side (lo cubre la edge function con doble pasada). El estado de `fk-resolve` queda deprecated pero el evento se sigue emitiendo en `done` para compatibilidad con clientes antiguos del bus de eventos.

#### 2. `src/domains/content/components/ImportSummaryDialog.tsx`
- Reemplazar las dos filas (`geocoding` + `fk-resolve`) por **una sola**: "Normalizar geografía (coordenadas + país/región/zona)" con icono `Globe2`.
- El array `STEPS` pasa de 3 a 3 entradas pero distintas: `geo-normalize`, `catalog-match`, opcional `enrich`.
- Mantener compat: si llega un evento legacy `geocoding`/`fk-resolve` lo mapea a `geo-normalize`.

#### 3. `src/domains/content/components/DocumentsPanel.tsx`
- Renombrar botón **"Renormalizar" → "Renormalizar geografía"**.
- Mantenerlo visible siempre (red de seguridad para imports antiguos), pero mover a menú secundario `…` para reducir ruido visual. El CTA primario sigue siendo "Aprobar todos".

#### 4. `supabase/functions/backfill-admin-fks/index.ts`
Sin cambios funcionales. Solo añadir comentario aclarando que ahora es la **única** vía de normalización geográfica.

#### 5. `supabase/functions/batch-geocode/index.ts`
Marcar como **legacy/no usar desde imports nuevos**. Ya hace doble pasada y normalizador, así que sigue funcionando si alguien lo invoca, pero el flujo de import ya no pasa por aquí (lo hace `backfill-admin-fks`, que es más rico al manejar también placeholders y FKs).

### Lo que NO cambia (zona segura)
- `resolveAllFks` y `resolve-admin-area`: intactos. Siguen siendo el helper único para inserts puntuales (enrich-location, scrape-tick, saveDocumentToDatabase).
- Triggers DB (`locations_sync_admin_cache`, `set_location_owner_user_id`).
- `geocoding-job-store` y barra global.
- Schema: cero migraciones.
- Catálogo de match (`catalog-match`) y enrichment: pasos independientes, no se tocan.

### Orden de ejecución
1. Editar `process-imported-document.ts` → fusionar pasos.
2. Editar `ImportSummaryDialog.tsx` → 1 fila en vez de 2.
3. Editar `DocumentsPanel.tsx` → renombrar botón.
4. Probar import KML pequeño y verificar:
   - Aparece 1 sola fila "Normalizar geografía" con barra correcta.
   - Tras finalizar, los puntos tienen `country_id` + jerarquía completa con placeholders donde toque.
   - Botón "Renormalizar geografía" sigue funcionando para docs viejos.

### Archivos a modificar
- `src/domains/content/lib/process-imported-document.ts`
- `src/domains/content/components/ImportSummaryDialog.tsx`
- `src/domains/content/components/DocumentsPanel.tsx`

### Archivos no tocados pero relevantes
- `src/shared/geography/geocode-batch.ts` (sigue siendo el forward-geocode helper)
- `supabase/functions/backfill-admin-fks/index.ts` (motor único)
