## Diagnóstico

Hoy tenemos **tres acciones paralelas** (Geocodificar, Renormalizar, Aprobar todos) que en realidad son **el mismo viaje**: pasar un punto recién importado al catálogo final. La fricción nace de tratar la "fuente" como una opción del usuario en lugar de como un **estado inicial automático**.

Tu propuesta lo resuelve mejor: *si los canales son distintos, los puntos deben **nacer en estados distintos***. Cada canal sabe cuánta confianza merece su contenido y aplica el lifecycle adecuado **sin preguntar**.

---

## Modelo de estados por canal de importación

Un único campo lógico (`lifecycle_stage`, derivado de `is_approved` + `documents.metadata.import_source`) describe en qué punto del viaje está cada location:

```text
raw → normalized → approved (catálogo)
```

| Canal de origen | Nace en | Normaliza | Aprueba | Acción manual restante |
|---|---|---|---|---|
| **Atlas Obscura / web scrape** (curado) | `approved` | sí, en background | sí, automático | ninguna |
| **OneDrive fotos** (geo-tag confiable) | `approved` | sí, en background | sí, automático | ninguna |
| **KML/GPX/GeoJSON/CSV importado** (bulk crudo) | `normalized` | sí, en background | NO (queda en workspace) | revisar y "Aprobar todos" si quiere publicarlo en catálogo |
| **Punto manual** (clic en mapa, búsqueda, contexto) | `approved` | sí, inline | sí | ninguna |
| **Punto adoptado de followee** | `approved` | hereda | sí | ninguna |

**Consecuencia clave:** la normalización geográfica deja de ser una acción visible. **Siempre ocurre en el background del import**, en TODOS los canales. El usuario nunca ve "Geocodificar" ni "Renormalizar" como CTA.

---

## Cambios concretos

### 1. Lifecycle como concepto de primera clase
- Añadir helper transversal `getLocationLifecycle(loc, doc)` en `src/domains/content/lib/location-lifecycle.ts`:
  - Devuelve `'raw' | 'normalized' | 'approved'` derivado de `is_approved`, presencia de FKs (`country_id`, `region_id`…) y `documents.metadata.import_source`.
- Migración trivial: añadir `documents.metadata.import_source` (`'atlas' | 'onedrive' | 'file' | 'manual' | 'adopted'`) ya implícito en `documents.source` para que el helper pueda decidir el destino inicial.

### 2. Auto-aprobación al importar (canales confiables)
- En `processImportedDocument.ts`, tras `geo-normalize` + `catalog-match`, si `import_source ∈ {atlas, onedrive, manual, adopted}`:
  - Llamar `approveAllDocumentLocations(docId)` automáticamente al final del pipeline.
  - Materializar la `pending_collection` también automáticamente.
- Si `import_source === 'file'` (KML/GPX/CSV bulk crudo): **no** auto-aprobar. Quedan en `normalized` (workspace, visibles solo en vista doc) hasta que el usuario revise.

### 3. Eliminar las 3 acciones redundantes del UI
- **`DocumentsPanel`**:
  - Quitar "Geocodificar" (ya ocurre en import).
  - Quitar "Renormalizar geografía" (ya ocurre en import; se ejecuta una vez en migración para legacy).
  - Mantener **solo** "Aprobar todos" y **solo cuando** el doc esté en `lifecycle: normalized` (es decir, archivos KML/GPX/CSV bulk con puntos sin aprobar).
- **`ImportSummaryDialog`**:
  - Quitar el switch "Aprobar al terminar" (era implícito antes). El comportamiento depende del canal, no de un toggle.
  - El paso `geo-normalize` se mantiene como progreso visible (informa, no pregunta).
  - Para `import_source === 'file'`, añadir un mensaje final: *"Los puntos quedan en tu workspace. Revísalos y púlsalos a tu catálogo cuando estén listos."*

### 4. Backfill legacy (una sola vez)
- Migración: para todos los `documents` existentes sin `metadata.import_source`, deducirlo de `documents.source`/`url`/`type`.
- Edge function de mantenimiento: barrer `locations` con `country IS NOT NULL AND country_id IS NULL` y disparar `backfill-admin-fks` con `force_renormalize: true` en lotes. Sin UI; corre una vez tras el deploy.

### 5. Memoria de proyecto
Añadir core rule:
> **Lifecycle por canal**: cada `import_source` define `nace_en` (`approved` o `normalized`). Geografía se normaliza **siempre** en background del import, nunca como CTA. "Aprobar todos" SOLO aparece para `lifecycle: normalized`. No reintroducir botones de Geocodificar/Renormalizar en UI.

---

## Resultado UX

- **Atlas / OneDrive / web / manual**: subes → ves los puntos en el catálogo en cuestión de segundos. Cero botones extra.
- **KML/GPX bulk**: subes → quedan en workspace del documento → 1 sola acción visible: "Aprobar todos" cuando los hayas revisado.
- **Renormalizar / Geocodificar**: desaparecen de la UI. Son detalles internos del pipeline.

## Ficheros tocados

- `src/domains/content/lib/location-lifecycle.ts` (nuevo, helper único)
- `src/domains/content/lib/process-imported-document.ts` (auto-approve por canal)
- `src/domains/content/components/DocumentsPanel.tsx` (acciones condicionales)
- `src/domains/content/components/ImportSummaryDialog.tsx` (sin toggle, mensaje final)
- 1 migración: añadir `import_source` a `documents.metadata` + backfill legacy + barrido de FKs faltantes
- `mem://logic/content/import-lifecycle-by-channel` (nueva memoria)
