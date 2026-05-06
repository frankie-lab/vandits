## Diagnóstico

Cuando se hace scraping web o se importa un archivo:

- `scrape-tick` y `saveDocumentToDatabase` insertan correctamente con `is_approved=false` → workspace, invisibles en mapa global.
- Pero `process-imported-document.ts` (catalog-match step, líneas 246-262) hace **auto-aprobado en silencio** de todo punto importado que coincida <250m con un punto ya aprobado del usuario:
  ```ts
  await supabase.from('locations').update({
    is_approved: true,
    name: m.existingLocation.name,
    enriched_data: ...
  }).eq('id', m.newLocation.id);
  ```

Resultado: tras importar, una parte de los puntos aparece en el mapa general sin que el usuario lo haya pedido. Además crea duplicados visuales (el original aprobado + el recién importado, ambos `is_approved=true`).

Esto contradice:
- Regla `mem://logic/map/visibility-rule-approval-gated`: solo `is_approved=true` aparece en mapa, y la aprobación la hace el usuario.
- El flujo de UI: panel de documento ofrece "Aprobar todos / Añadir a colección / Eliminar" justamente para que el usuario decida.

## Cambios

### 1. Quitar el auto-aprobado del dedup
`src/domains/content/lib/process-imported-document.ts`:
- En el bucle de `result.autoDiscarded`, **NO** poner `is_approved: true`. Mantener el `name` canonicalizado y la herencia de `enriched_data` (eso sí ayuda al usuario a revisar), pero el punto sigue `is_approved=false` hasta que el usuario decida.
- Persistir el match en un campo (`custom_data.duplicate_of = existingLocation.id`) para que la UI pueda mostrar la insignia "Ya existe en tu catálogo" en la lista del documento.

### 2. UI: badge "duplicado de catálogo" en la vista del documento
`src/components/document-view/...` (la lista de puntos del documento, pestaña "Importados"):
- Si `location.customData?.duplicate_of` existe, mostrar chip ámbar "Ya en tu catálogo" junto al nombre.
- Tooltip: "Coincide con [name]. Se omitirá al aprobar para evitar duplicados."

### 3. Aprobar excluyendo duplicados
`src/services/document-add.service.ts`, función `applyCatalog`:
- Antes del UPDATE, filtrar `ids` quitando los que tengan `custom_data.duplicate_of` no nulo. Devolver `{ updated, skippedDuplicates }`.
- En el dialogo `Aprobar todos (N)`, mostrar "Se aprobarán N puntos. M coinciden con tu catálogo y se omitirán."

### 4. Tests
`src/test/document-visibility.test.ts` ya cubre la matriz; añadir un test nuevo en `src/test/process-imported-document.test.ts` (crear si no existe) que verifique: tras catalog-match, los matches NO quedan con `is_approved=true`.

### 5. Memoria
Actualizar `mem://logic/import/enrichment-prioritization` (que hoy menciona "Auto-enrichment for <250m matches") aclarando que el auto-link **NO aprueba**, solo marca `custom_data.duplicate_of` y hereda nombre/enrichment.
Añadir nota corta al Core: "Importaciones nunca auto-aprueban: workspace hasta que el usuario lo decida".

## Archivos

- `src/domains/content/lib/process-imported-document.ts` (bug principal)
- `src/services/document-add.service.ts` (filtrar duplicados al aprobar)
- componente de lista de puntos del documento (mostrar badge)
- `src/test/process-imported-document.test.ts` (nuevo)
- memoria

## Fuera de alcance (confirmar después)

- Geocodificación: ya existe job único (`useGeocodingJobStore + backfill-admin-fks`), no se toca.
- El flujo manual "Aprobar todos / Añadir a colección" del panel ya funciona — solo hay que respetarlo no aprobando antes.
