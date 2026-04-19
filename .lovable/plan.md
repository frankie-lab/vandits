
El usuario quiere que verifique paso a paso que el sistema de gestión de ficheros funciona como está definido. No es una tarea de implementación todavía — es una **auditoría funcional** del flujo de import contra las normas documentadas.

## Qué tengo que comprobar

Las normas documentadas son:
1. **Flujo 2 pasos**: Upload → Diálogo unificado de Review/Confirm con preview Leaflet, dedup <250m, toggle enriquecimiento IA.
2. **Lifecycle v3**: Original (inmutable en bucket `document-originals`) → Workspace (`is_approved=false`) → Catalog (`is_approved=true`).
3. **Persistencia**: archivo crudo en bucket privado `document-originals`; rutas vinculadas vía `documentId`.
4. **Contadores documento**: `total_waypoints`, `resolved_count`, `pending_count`, `conflict_count`, `source_type`, `import_status` deben actualizarse tras parsear.
5. **Visibilidad**: rutas ocultas por defecto; puntos como círculos gris/naranja en capa Workspace.
6. **Dedup**: 250m auto-link, 1km warning.
7. **Enriquecimiento**: auto para matches <250m, opcional para nuevos.

## Qué ya sé del estado actual (datos reales)

- 2 documentos del usuario, ambos `FullTrips_Map.kml`, **duplicados** (17 abr y 19 abr).
- 2.452 locations cada uno → la lectura del archivo SÍ funciona.
- `total_waypoints=0`, `resolved_count=0`, `pending_count=0` → **los contadores NO se actualizan**.
- `source_type=NULL` → **el tipo de fuente no se persiste**.
- `import_status='reviewing'` ambos → quedaron a medias, **nunca se confirmó**.
- `enriched_count=0` → no se enriqueció nada.

Esto ya apunta a fallos claros, pero quiero hacer la auditoría completa antes de proponer cambios.

## Plan de auditoría (read-only)

Voy a inspeccionar el código del flujo extremo-a-extremo y contrastarlo con datos reales.

### Paso 1 — Entrada: FileUploadZone
Leer `src/domains/content/components/FileUploadZone.tsx` y `UploadPreviewDialog.tsx` para ver:
- ¿Sube el archivo crudo a `document-originals`?
- ¿Crea fila en `documents` con `source_type` y `original_filename`?
- ¿Llama al diálogo unificado de revisión?

### Paso 2 — Parseo y registro
Leer `src/services/import.service.ts` (`registerParsedContent`):
- ¿Se está llamando desde el flujo de UI?
- ¿Actualiza counters via `documentV2Repository.updateAuditCounters`?
- ¿Marca `import_status='reviewing'` y luego `'confirmed'`?

### Paso 3 — Diálogo unificado
Buscar el componente que ejecuta dedup + preview Leaflet + toggle IA. Verificar que existe un único diálogo (no dos pasos separados) y que llama a `confirmImport` al finalizar.

### Paso 4 — Persistencia de raw file
Comprobar storage `document-originals` para ver si los 2 KML existen físicamente.

### Paso 5 — Capas y visibilidad
Leer cómo se asigna `_layerType` (catalog vs workspace) tras importar; cruzar con `is_approved` real en BD.

### Paso 6 — Diagnóstico de los 2 documentos huérfanos
Confirmar por qué quedaron en `reviewing` con counters a 0:
- ¿Se cerró el diálogo sin confirmar?
- ¿Falló el callback que actualiza counters?
- ¿Hay un bug que evita pasar de `reviewing` a `confirmed`?

## Entrega

Tabla "Norma esperada vs Comportamiento observado" con:
- ✅ lo que funciona
- ⚠️ lo que funciona parcialmente
- ❌ lo que está roto

Y al final, lista priorizada de fixes (sin aplicarlos todavía — espero tu OK).

Sin cambios en código en esta fase.
