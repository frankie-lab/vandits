## Hallazgo del caso concreto

Doc `87a7d58c…` (Atlas Obscura, "Parcial 580/581"): 1 punto pendiente real (`Pinsapar de Grazalema`), insertado 8h después del documento, **no es duplicado**. Mismo patrón en `b1fac96a` (90/90).

**Causa raíz:** `scrape-tick/index.ts:289` hardcodea `is_approved: false` para TODOS los inserts, ignorando el canal del documento. El helper único `shouldAutoApproveImport(sourceType)` ya define la regla correcta por canal, pero el scraper no lo consulta. Cuando el job termina, `processImportedDocument` aprueba lo existente, pero los puntos que el scraper inserta más tarde nacen pendientes y nadie los vuelve a aprobar.

## Principio rector

**Cero hardcoding por canal.** Toda decisión de auto-approve en cualquier punto de inserción (cliente, edge function, scrape, manual, futuras fuentes) debe pasar por `shouldAutoApproveImport(document.source_type)`. Es ya el helper único declarado en memoria — solo falta que el scraper lo use.

## Cambios

### 1. `supabase/functions/scrape-tick/index.ts` — usar el helper

- Añadir versión Deno-compatible de `shouldAutoApproveImport` (importar el TS del cliente no es viable en edge function; replicar la regla en un módulo `_shared/lifecycle.ts` reutilizable por cualquier edge function actual o futura).
- En `processJob`, leer `documents.source_type` una vez y cachear `autoApprove = shouldAutoApproveImport(sourceType)`.
- En el insert (línea 289), `is_approved: autoApprove` en lugar de literal `false`.

Esto cubre **cualquier futura fuente**: si mañana se añade `instagram_import`, `mastodon_import`, etc., basta con declararlo en el helper único y todos los puntos de inserción lo respetan.

### 2. Sweep de huérfanos pre-existentes (one-shot, NO hardcoded por documento)

Update genérico que aplica la misma regla del helper a TODO el histórico:

```sql
UPDATE locations l
SET is_approved = true
FROM documents d
WHERE l.document_id = d.id
  AND d.source_type IN ('web_import','manual')
  AND l.is_approved = false
  AND l.deleted_at IS NULL
  AND (l.custom_data->>'duplicate_of') IS NULL;
```

La lista de canales (`web_import, manual`) está alineada con `shouldAutoApproveImport`. No menciona ningún documento concreto.

### 3. Auditoría transversal de inserts a `locations`

Verificar que **ningún otro insert** decida `is_approved` por su cuenta:
- `src/lib/database/saveDocumentToDatabase.ts`
- `enrich-location` edge function
- Edge functions de import (`fetch-remote-kml`, etc.)
- Cualquier otro caller localizado vía `rg "is_approved" supabase/functions src/lib`

Cualquiera que hardcodee el flag debe migrarse a `shouldAutoApproveImport(sourceType)`. Si alguno ya lo hacía bien, dejarlo igual.

### 4. UI — ocultar acciones inaplicables (transversal, sin condicionales por canal)

`DocumentsPanel.tsx`: la regla se basa **solo** en estado derivado, no en source_type:
- "Aprobar todos" — ya condicionado a `pendingApproval > 0`. Mantener.
- "Añadir…" — ocultar cuando `pendingApproval === 0 && !document.metadata?.pending_collection`. Sigue accesible desde "Abrir" → vista de documento.

Resultado uniforme para cualquier canal: docs 100% integrados muestran solo Abrir + Eliminar.

## Memorias a actualizar

- `mem://logic/import/scrape-direct-enrichment`: añadir "scrape-tick respeta `shouldAutoApproveImport(source_type)`; nunca hardcodea `is_approved`".
- `mem://logic/content/import-lifecycle-by-channel`: ampliar para incluir TODOS los puntos de inserción (cliente + edge functions). El helper es ley para cualquier insert nuevo.
- `mem://ui/documents-panel-actions`: añadir regla de ocultar "Añadir…" cuando ya está integrado.