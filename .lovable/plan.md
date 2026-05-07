## Diagnóstico

La lógica unificada de importación (`processImportedDocument`) hoy SOLO corre desde el cliente (FileUpload + WebImportPanel). El scraper server-side (`scrape-tick`) inserta puntos directamente y nunca finaliza el ciclo de vida según la norma `mem://logic/content/import-lifecycle-by-channel`.

Resultado en BD del caso `b1fac96a` (Atlas Obscura, 90/90 aprobados):
- `is_approved=true` (correcto, vía `autoApprove` del fix previo).
- `import_status='reviewing'` ❌ — debería ser `confirmed`.
- `status='draft'` (metadata editorial, OK).
- `metadata.pending_collection` nunca consumida → la colección que el usuario pidió al lanzar el scrape no se materializa nunca.
- No hay catalog-match contra puntos previos del usuario → posibles duplicados >250m no quedan en cola.

Misma asimetría afectará a cualquier futuro canal server-side (OneDrive bulk, RSS, integraciones). La única vía sostenible es **un helper único de finalización** invocable desde cliente Y desde edge functions.

---

## Plan transversal

### 1. Extraer "Lifecycle Finalization" a un helper compartido

Nuevo helper `finalizeImportedDocument(docId, supabaseClient, options)` colocado en:
- `supabase/functions/_shared/finalize-import.ts` (Deno, source of truth).
- Re-exportado/mirroreado para el cliente desde `src/domains/content/lib/finalize-import.ts` con la misma firma usando el `supabase` del SDK.

Lo que hace, por orden:
1. **Catalog match** (dedup vs catálogo del usuario, threshold 250m). Marca `custom_data.duplicate_of` y encola posibles duplicados (250m–1km).
2. **Auto-approve por canal** vía `shouldAutoApproveImport(source_type)`:
   - `web_import` / `manual` → `approveAllDocumentLocations(docId)` (que ya consume `pending_collection`).
   - resto → no aprueba; los puntos esperan acción manual.
3. **Auto-enrich** (opcional, si `options.autoEnrich`).
4. **Reconcile lifecycle**: si `approved == total > 0` o el canal es trusted, marca `import_status='confirmed'`; en cualquier caso garantiza coherencia.
5. Emite `document:processed` con summary.

`processImportedDocument` actual queda como wrapper cliente: corre primero geo-normalización (forward + backfill-admin-fks vía edge function) y luego delega en `finalizeImportedDocument`.

### 2. Conectar `scrape-tick` al helper

En `processJob`, cuando el job termina (`!items || items.length === 0`):
- Tras `attachJobToCollection`, llamar `await finalizeImportedDocument(documentId, supabase, { sourceType: 'web_import' })`.
- Esto cubre catalog-match, auto-approve, consumo de `pending_collection` y `import_status='confirmed'` server-side, sin esperar a que el usuario abra la app.

`persistPlace` deja de hardcodear `is_approved`; pasa a insertar siempre con `is_approved=false`. La aprobación se decide en la finalización (única fuente: `shouldAutoApproveImport`). Esto elimina la duplicación de la decisión y evita el caso "puntos aprobados pero `import_status=reviewing`".

### 3. Reconciliar documentos legacy

Helper idempotente `reconcileImportStatus(docId)` dentro de `finalize-import`:
- Si `total>0 && approved==total && import_status!='confirmed'` → marca `confirmed` y dispara `consumePendingCollection` si aplica.
- Lo invoca también `DocumentsPanel.fetchDocs` (best-effort por documento visible en la lista) para auto-curar docs antiguos como `b1fac96a` sin migración manual.
- One-shot SQL via migration: marca `import_status='confirmed'` para todos los docs ya 100% aprobados de canales trusted.

### 4. Aprovechar para limpiar UI desincronizada (`DocumentFocusView`)

Pendiente del plan anterior, no se hizo: el header del focus view sigue usando `docStatus === 'published'` en lugar del helper único `getDocumentIntegrationState`. Mismo cambio transversal:
- Badge derivado de `approved/total`, no de `documents.status`.
- CTA "Añadir" oculto cuando `integration.kind === 'full'`.
- Bulk actions "Aprobar"/"Retirar" sensibles al estado de la selección (sólo aparece "Aprobar" si hay pendientes seleccionados, sólo "Retirar" si hay aprobados).

### 5. Memoria

- Actualizar `mem://logic/content/import-lifecycle-by-channel`: el ciclo de vida es **un único helper** (`finalizeImportedDocument`) consumido por cliente y edge functions; ningún canal puede saltárselo.
- Actualizar `mem://logic/import/scrape-direct-enrichment`: scrape-tick inserta crudo y delega en `finalizeImportedDocument` al cerrar el job; ya no decide `is_approved` en el insert.
- Actualizar `mem://ui/documents-panel-actions` añadiendo que la regla aplica también a `DocumentFocusView`.

---

## Archivos a tocar

| Archivo | Cambio |
|---|---|
| `supabase/functions/_shared/finalize-import.ts` (nuevo) | Helper único: catalog-match + auto-approve + reconcile + opcional enrich |
| `supabase/functions/scrape-tick/index.ts` | `persistPlace` siempre `is_approved=false`; al cerrar job llama `finalizeImportedDocument` |
| `src/domains/content/lib/finalize-import.ts` (nuevo) | Wrapper cliente que reusa la misma lógica con el SDK |
| `src/domains/content/lib/process-imported-document.ts` | Tras geo-normalize, delega los pasos 3–5 en `finalizeImportedDocument` |
| `src/domains/content/components/DocumentFocusView.tsx` | Badge + CTA + bulk actions vía `getDocumentIntegrationState` |
| `src/domains/content/components/DocumentsPanel.tsx` | Llamar `reconcileImportStatus` por doc visible (best-effort) |
| Migration SQL one-shot | `UPDATE documents SET import_status='confirmed' WHERE source_type IN ('web_import','manual') AND import_status='reviewing' AND id IN (…todos aprobados…)` |
| Memorias `mem://logic/content/import-lifecycle-by-channel`, `mem://logic/import/scrape-direct-enrichment`, `mem://ui/documents-panel-actions` | Sincronizar con la nueva arquitectura |

## Lo que NO se toca

- Reglas de aprobación por canal (`shouldAutoApproveImport`) — siguen igual, ahora en un único punto de decisión.
- `documents.status` — sigue como metadata editorial libre, sin gobernar UI ni lifecycle.
- Geo-normalización (forward + backfill-admin-fks) — sigue siendo paso cliente, no aplica al scraper porque `persistPlace` ya resuelve FKs vía `resolve-admin-area`.
