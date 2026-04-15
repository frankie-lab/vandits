

# Plan: Simplificar el flujo de importacion a 2 pasos

## Problema actual

El flujo tiene 5 etapas con informacion duplicada:
- **UploadPreviewDialog** muestra opciones de rutas, enriquecimiento y categorias
- **DuplicatesDialog** repite las mismas opciones (nombre ruta, fecha, auto-enrich, visitados)
- **PostImportReviewPanel** presenta otra revision mas con acciones por punto

Resultado: el usuario configura lo mismo 2-3 veces.

## Nuevo flujo: 2 pasos

```text
PASO 1: SUBIDA                    PASO 2: REVISION Y CONFIRMACION
(FileUploadZone - sin cambios)    (UploadPreviewDialog unificado)
                                  
Arrastrar archivo                 Mapa con puntos + rutas (si visibles)
Condiciones (terminos, dupl.)     Resumen: X coincidentes + Y nuevos + Z descartados
Visibilidad                       Lista de todos los puntos:
                                    - Badge "Catalogo" (sky blue) para coincidentes
                                    - Badge "Nuevo" para unicos  
                                    - Badge "Descartado" (tachado) para auto-descartados
                                  Opciones de importacion (1 sola vez):
                                    - Rutas: guardar/no, nombre, fecha
                                    - Nuevos: Enriquecer IA / Categoria / Sin accion
                                    - Marcar visitados
                                    - Muestra parcial (solo archivos >500 pts)
                                  Boton "Importar" → guarda + cierra
```

## Cambios tecnicos

### 1. `UploadPreviewDialog.tsx` — Integrar deduplicacion

- Al abrir el dialogo, ejecutar `deduplicateLocations()` internamente (el mismo calculo que hoy hace `handlePreviewConfirm`)
- Mostrar los resultados directamente en la lista de contenido:
  - Puntos coincidentes con badge "Catalogo" (sky blue, no editables)
  - Puntos nuevos con badge "Nuevo"
  - Auto-descartados con badge "Descartado" (gris, tachado, colapsados)
- Eliminar la seccion de "Matching points info" separada; integrarla en la lista
- Las rutas solo se muestran si `document.routes?.length > 0`

### 2. `UploadPreviewDialog.tsx` — Unificar callback

- `onConfirm` pasara toda la informacion necesaria en un solo objeto:
  - `uniqueLocations`, `matchingPointIds`, `autoDiscardedIds`
  - Opciones de rutas, enrich, categoria, visitados
- El componente padre ya no necesita re-calcular la deduplicacion

### 3. `FileUploadZone.tsx` — Eliminar DuplicatesDialog

- Eliminar todo el estado `deduplicationState`, `showDuplicatesDialog`
- Eliminar las variables `dedupAutoEnrich`, `dedupMarkVisited`, `dedupSaveRoutes`, `dedupRouteName`, `dedupRouteDate`
- Eliminar el JSX del Dialog de duplicados (lineas 896-1044)
- Simplificar `handlePreviewConfirm`: recibe datos ya procesados, solo ejecuta guardado + enrich + eventos

### 4. `PostImportReviewPanel.tsx` — Eliminar

- Ya no se necesita un panel de revision posterior
- Las decisiones por punto se toman en el Paso 2
- Eliminar el evento `import:open-review` y sus listeners
- Eliminar `setPendingReviewLocationIds` / `clearPendingReviewLocationIds` del store

### 5. `locations-store.ts` — Limpiar estado de review

- Eliminar `pendingReviewLocationIds` y sus setters si ya no se usan en otro sitio

## Archivos afectados

| Archivo | Accion |
|---------|--------|
| `src/domains/content/components/UploadPreviewDialog.tsx` | Integrar deduplicacion, unificar UI |
| `src/domains/content/components/FileUploadZone.tsx` | Eliminar DuplicatesDialog, simplificar handler |
| `src/domains/content/components/PostImportReviewPanel.tsx` | Eliminar (o vaciar si hay imports externos) |
| `src/store/locations-store.ts` | Limpiar estado pendingReview si exclusivo |

## Resultado

- El usuario ve **1 solo dialogo** con toda la informacion: mapa, puntos (coincidentes + nuevos + descartados), opciones
- Las rutas solo aparecen si el archivo contiene rutas
- Un solo boton "Importar" ejecuta todo: guardado, rutas, enriquecimiento
- Sin repeticion de configuracion

