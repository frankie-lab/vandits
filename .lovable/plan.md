
El usuario quiere que al borrar el documento se elimine el documento (archivo + tracks + metadata) pero **se conserven los puntos ya importados** aunque pertenezcan a ese documento.

## Comportamiento propuesto

| Elemento | Acción al borrar documento |
|---|---|
| `documents` row | DELETE |
| `document-originals/...` (raw KML/GPX) | DELETE |
| `document_tracks` (polilíneas GPS) | DELETE (cascade) |
| `route_waypoints` ligados al doc | DELETE (cascade vía routes) |
| **`locations` del documento** | **PRESERVAR** → desvincular (`document_id = NULL`) |
| Enriquecimiento (`enriched_data`) | Intacto |
| `is_approved` / visibilidad | Sin cambios |

Los puntos quedan como **puntos manuales del usuario** (sin documento padre), igual que los creados a mano. Siguen visibles en su capa correspondiente (Workspace si `is_approved=false`, Catálogo si `true`).

## Problema técnico

La FK `locations.document_id → documents.id` está hoy con `ON DELETE CASCADE`. Hay que cambiarla a `ON DELETE SET NULL` para que el desvinculado sea automático y atómico. Misma decisión hay que tomar para `document_tracks` (estos sí se borran porque son geometría del archivo, no puntos del usuario).

## Plan

### 1. Migración SQL
- `ALTER TABLE locations DROP CONSTRAINT ... ; ADD CONSTRAINT ... FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL;`
- Confirmar que `document_tracks.document_id` mantiene `ON DELETE CASCADE` (las pistas GPS del archivo sí desaparecen).
- RLS de `locations` ya permite ver puntos sin documento porque la policy actual usa `EXISTS documents WHERE id = document_id` — eso fallaría tras desvincular. **Hay que ajustar `can_view_location` y la policy de DELETE/UPDATE/INSERT** para soportar `document_id IS NULL` usando el `pioneer_user_id` o un nuevo campo `owner_user_id` en `locations`.

### 2. Owner persistente en `locations`
Añadir columna `owner_user_id uuid` (poblada en migración desde `documents.user_id`) para que los puntos huérfanos sigan teniendo dueño y RLS. Backfill:
```sql
UPDATE locations SET owner_user_id = d.user_id 
FROM documents d WHERE d.id = locations.document_id;
```
Después actualizar las RLS policies para usar `owner_user_id = auth.uid()` como fallback cuando `document_id IS NULL`.

### 3. Código
- `deleteDocumentFromDatabase` (en `db-operations.ts`): añadir borrado del archivo de storage `document-originals/{user_id}/{doc_id}/...` antes del DELETE de la row.
- `removeDocument` en `locations-store.ts`: pasar a `async`, llamar `deleteDocumentFromDatabase`, y al recargar el store los puntos desvinculados aparecen como manuales (sin doc).
- `Header.tsx` + `UserMenu.tsx`: actualizar el diálogo de confirmación:
  > "Se eliminará «{nombre}» y su archivo original. Los {N} puntos importados se conservarán como puntos manuales en tu colección."

### 4. Memoria
Actualizar `mem://features/content/document-lifecycle-v3` con la norma: **borrar documento conserva los puntos como manuales**.

## Archivos a tocar

| Archivo | Cambio |
|---|---|
| Nueva migración SQL | FK `locations.document_id` → SET NULL, columna `owner_user_id`, backfill, RLS update |
| `src/domains/content/lib/db-operations.ts` | `deleteDocumentFromDatabase` borra storage |
| `src/domains/content/store/locations-store.ts` | `removeDocument` async + persistencia BD |
| `src/components/Header.tsx` | Diálogo informativo "puntos se conservan" |
| `src/components/UserMenu.tsx` | Mismo diálogo |
| `mem://features/content/document-lifecycle-v3` | Norma de preservación |

## Verificación

1. Importar KML con 10 puntos, enriquecer 3.
2. Borrar el documento.
3. Documento desaparece del panel, archivo raw eliminado del bucket, tracks GPS desaparecen.
4. Los 10 puntos siguen en el mapa (3 enriquecidos como teardrop, 7 como círculos), ahora sin documento padre.
5. Recargar página → puntos siguen ahí.
6. Editar/borrar uno de esos puntos manualmente sigue funcionando (RLS por `owner_user_id`).

## Pregunta abierta

Los **tracks GPS** (polilíneas del archivo) los eliminamos junto con el documento — no son puntos del usuario sino geometría del archivo. ¿De acuerdo, o prefieres también convertirlos en rutas independientes guardadas?
