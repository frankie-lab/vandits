
El usuario quiere dos cosas claras:
1. Reparar el sistema para que cumpla su cometido.
2. Antes de tocar nada, que le explique **cómo está dispuesto que funcione**, **qué pasos tiene** y **qué opciones hay por paso**.

Esta segunda parte es esencialmente documental — debe ir en el plan como referencia clara, y luego presentar las reparaciones a aplicar. Voy a estructurarlo como: (A) la norma definida, (B) los fixes para que el código cumpla esa norma.

No necesito leer más código — ya hice la auditoría en mensajes anteriores y tengo claros los gaps. Mantengo el plan corto.

---

# Reparación del sistema de gestión de ficheros

## A. Cómo está dispuesto que funcione (la norma)

### Flujo en 2 pasos

```text
PASO 1 — UPLOAD                    PASO 2 — REVIEW & CONFIRM (diálogo único)
┌──────────────────────┐           ┌─────────────────────────────────────────┐
│ Drag & drop / picker │  ──────►  │ Preview Leaflet · Dedup · IA · Confirm  │
│ KML/GPX/GeoJSON/CSV  │           │                                         │
└──────────────────────┘           └─────────────────────────────────────────┘
```

### Paso 1 — Upload
- **Entrada**: archivo KML/GPX/GeoJSON/CSV vía `FileUploadZone`.
- **Acciones automáticas**:
  - Subir el archivo crudo a `document-originals` (bucket privado, inmutable).
  - Crear fila en `documents` con: `name`, `original_filename`, `original_file_path`, `source_type` (`kml|gpx|geojson|csv`), `import_status='reviewing'`.
  - Parsear puntos y rutas en memoria.
- **Opciones del usuario**: ninguna en este paso (cero fricción).

### Paso 2 — Review & Confirm (diálogo único)
Todo dentro de `UploadPreviewDialog`. El usuario ve:

1. **Preview Leaflet** con los puntos y rutas detectados (ya validados, descartando coords inválidas).
2. **Análisis de duplicados** (umbral 250m exacto / 1km aviso) con badges:
   - Verde "Nuevo": no existe en colección.
   - Ámbar "Ya existe": <250m a un punto propio → se vincula automáticamente.
   - Rojo "Conflicto": múltiples candidatos → requiere decisión manual.
3. **Categoría personal** (opcional): asignar etiqueta personalizada (icono Lucide + color).
4. **Toggle "Enriquecer con IA"** (por defecto ON para coincidencias, OFF para nuevos).
5. **Toggle "Añadir como itinerario"** si el archivo trae rutas: promueve los puntos al Catálogo (`is_approved=true`).
6. **Confirmar**: ejecuta inserción de waypoints, actualiza contadores, marca `import_status='confirmed'` y dispara enriquecimiento auto.

### Lifecycle del documento (v3)
```text
Original (bucket inmutable) → Workspace (is_approved=false) → Catálogo (is_approved=true)
   raw KML/GPX                 puntos visibles gris/naranja      puntos azul cielo
```

### Visibilidad
- Puntos importados → capa **Workspace** (círculos gris/naranja).
- Rutas → **ocultas por defecto**, solo visibles desde panel Itinerarios o vista de documento.

---

## B. Qué hay roto y qué hay que reparar

| # | Norma esperada | Estado actual | Fix |
|---|----------------|---------------|-----|
| 1 | `import_status` pasa de `reviewing` → `confirmed` al confirmar | Quedan 2 docs huérfanos en `reviewing` | Llamar `importService.confirmImport(documentId)` en `handlePreviewConfirm` |
| 2 | Contadores `total_waypoints/resolved/pending/conflict` actualizados | Todos a 0 | Llamar `importService.registerParsedContent(...)` tras insertar locations |
| 3 | `source_type` persistido (`kml`/`gpx`/...) | NULL | `documentV2Repository.setSourceType()` durante upload |
| 4 | Auto-enriquecimiento para matches <250m | No se dispara | Invocar `triggerAutoEnrich` en confirmación |
| 5 | Sin duplicar el mismo archivo subido dos veces | 2 copias del mismo KML | Pre-check: si ya existe `original_filename + size + user_id` con status `reviewing`, ofrecer "reanudar" o "sustituir" |
| 6 | Limpiar archivos huérfanos en bucket | 16 huérfanos | Migración de limpieza one-shot |

---

## C. Plan de implementación

### 1. Reparación del flujo (código)
- **`UploadPreviewDialog.tsx` → `handlePreviewConfirm`**: tras el `saveDocumentToDatabase` legacy, llamar a `importService.registerParsedContent(documentId, waypoints, tracks, sourceType)` y luego `importService.confirmImport(documentId)`. Esto sincroniza counters, source_type y status en una sola pasada.
- **`FileUploadZone.tsx`**: detectar el `source_type` desde la extensión y pasarlo al diálogo. Pre-check de duplicado de archivo (mismo nombre + size + user_id en estado `reviewing`) → si existe, mostrar diálogo "Ya tienes esta importación en revisión: [Reanudar] [Sustituir] [Cancelar]".
- **Auto-enriquecimiento**: tras `confirmImport`, encolar enriquecimiento para los waypoints con match <250m (reutilizar `triggerAutoEnrich` ya existente).

### 2. Limpieza retroactiva (one-shot)
- Para los 2 documentos huérfanos del usuario `b977aa23...`:
  - Mantener el más reciente (19 abr) → recalcular contadores y marcar `import_status='confirmed'`.
  - Borrar el del 17 abr y sus 2.452 locations + archivo en bucket.
- Eliminar los 16 archivos huérfanos del bucket `document-originals` que no tengan documento asociado.

### 3. Flag V2
- `v2_data_write_imports` no es necesario activar como toggle: `registerParsedContent` se invoca **siempre** porque solo escribe metadatos del propio documento (no datos paralelos). El bridge `dual-write-import.ts` se mantiene tal cual para escenarios futuros.

---

## D. Entrega

- 2 archivos modificados: `UploadPreviewDialog.tsx`, `FileUploadZone.tsx`.
- 1 migración de datos one-shot (limpieza de huérfanos + repair del documento del 19 abr).
- Verificación end-to-end: subir un KML pequeño, comprobar que aparece en BD con `source_type='kml'`, contadores correctos, `import_status='confirmed'` y los puntos visibles en capa Workspace.

Una vez aprobado, paso a modo default y aplico los cambios.
