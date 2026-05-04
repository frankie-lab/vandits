## Lo que pediste vs. lo que estaba proponiendo

Pediste: **una norma transversal** que evite que esto vuelva a ser equívoco.
Yo proponía: añadir una pregunta más en el diálogo de importar. Eso es un parche — el equívoco volvería en la siguiente entrada de datos (OneDrive, manual, API, drag-drop, edge function, lo que sea).

## Diagnóstico real (problema de modelo, no de UI)

La visibilidad de un punto en el mapa global se decide **hoy con dos columnas redundantes que nadie sincroniza**:

| Columna | Tabla | Significado real | Quién la pone | Quién la lee |
|---|---|---|---|---|
| `status` | `documents` | `'draft' \| 'in_review' \| 'published'` | Default `'draft'` al insertar; sólo `applyCatalog` la sube a `'published'` | `isLocationVisibleInGlobalMap` — **la única que decide** |
| `is_approved` | `locations` | "Está en Catálogo" | `applyCatalog` lo pone en `true` | UI (DocumentWaypointsTabs, layer type, marker styling) — **NO** decide visibilidad global |

Estado actual en BD del usuario:
- `documents`: 2 published, 1 draft
- `locations.is_approved`: 508 true, 2451 false

El doc "Pueblos más bonitos" en `draft` tiene 126 puntos invisibles **independientemente** de su `is_approved`. Y aunque promovamos manualmente, mañana otro flujo de ingesta volverá a insertar en `draft`. **El modelo permite el equívoco; cualquier UI nueva lo va a heredar.**

Razones por las que esto no se arregla con "una pregunta más en el diálogo":
1. Hay >5 entradas de datos (subir, OneDrive, manual desde mapa, manual desde popup, importadores futuros, edge functions). Cada una tendría que recordar preguntar.
2. La regla "draft = invisible" es una decisión de producto que ya no aplica: si el usuario importa, es porque **quiere ver sus puntos**. Mesa de Trabajo no debería significar "invisible", sólo "aún no curado".
3. Dos columnas para lo mismo → drift garantizado.

## Norma transversal (el cambio de modelo)

### Regla única de visibilidad

> Un punto es visible en el mapa global si **el usuario actual tiene permiso para verlo** (RLS), **no está borrado**, y **el usuario no lo ha ocultado** explícitamente. Punto.
>
> `documents.status` deja de gobernar visibilidad. Pasa a ser sólo una etiqueta de **madurez editorial** (Borrador / En revisión / Publicado) usada para filtros, badges y para que el dueño decida cuándo compartir con seguidores. Nada más.
>
> `locations.is_approved` desaparece como decisión de visibilidad. Queda únicamente como flag de "curado por el dueño" para distinguir Catálogo personal vs. Workspace en la UI del propio dueño (filtros, tabs, palette según `getPointVisualState`).

### Consecuencias de la regla

1. **`isLocationVisibleInGlobalMap` se simplifica**: devuelve `true` para todo lo que no esté `deleted`. La RLS ya filtra lo que el usuario no puede ver. Si el dueño quiere ocultar algo a sí mismo, usa el sistema de filtros (no el lifecycle).
2. **Importar deja de tener "destino"**: un punto importado se ve inmediatamente para su dueño, igual que un punto creado a mano. La distinción Catálogo/Workspace pasa a ser **clasificación interna** del dueño (color, filtros), no visibilidad.
3. **`applyCatalog` se renombra a `markAsCurated`**: sólo cambia `is_approved` y, opcionalmente, `visibility` (followers/public). No toca `documents.status`.
4. **Compartir con seguidores** depende de `locations.visibility` (que ya existe y la RLS ya respeta), no del status del documento. El usuario puede tener un doc "draft" con puntos `visibility='followers'` y funciona.
5. **`documents.status` queda como metadato** editable desde la vista del documento (chip clickable: Borrador → En revisión → Publicado) puramente informativo.

## Implementación (un solo helper, una sola migración)

### 1. Helper único de visibilidad

`src/domains/content/lib/document-visibility.ts` → reducir a:

```ts
export function isLocationVisibleInGlobalMap(loc: AnnotatedLocation): boolean {
  if (loc._deletedAt) return false;
  if (loc._userHidden) return false; // futura preferencia de filtro
  return true;
}
```

Cualquier llamador que pase `docStatusByDocId` se actualiza (compilador lo señala).

### 2. Migración de datos (cortesía única)

```sql
-- Promover a published cualquier doc que tenga puntos con is_approved=true
UPDATE documents SET status = 'published'
WHERE status = 'draft'
  AND id IN (SELECT DISTINCT document_id FROM locations WHERE is_approved = true);

-- El resto de drafts: el dueño decide si los publica desde la UI.
```

(La regla de visibilidad nueva ya no necesita esto, pero deja la BD consistente con el modelo nuevo).

### 3. Limpieza de llamadas

- `db-operations.ts saveDocumentToDatabase` → ya no se preocupa de `status`. Default DB sigue siendo `'draft'` (correcto: aún no curado), pero **ya no afecta a visibilidad**.
- `services/document-add.service.ts applyCatalog` → renombrar a `markPointsAsCurated`. Sólo toca `locations`. Eliminar el `update documents.status='published'`.
- `DocumentFocusView.tsx` → el botón "Añadir → Catálogo" se reetiqueta a "Marcar como curado" y deja de cambiar el status del doc.
- El status del doc se cambia desde un chip independiente (Borrador / En revisión / Publicado) sin efectos colaterales.

### 4. Actualizar memoria Core

Sustituir:
> Doc-status governs visibility, NOT palette: published → visible en mapa global...

Por:
> **Visibilidad = RLS + no borrado**. `documents.status` es metadato editorial sin efecto en visibilidad. `locations.is_approved` es clasificación interna del dueño (Catálogo vs Workspace), tampoco gobierna visibilidad. Helper único `isLocationVisibleInGlobalMap` no consulta status.

Y la entrada `mem://logic/map/workspace-document-scoped-visibility` se reescribe en consecuencia.

## Por qué esto sí es transversal

- Cualquier forma de meter un punto (subida, OneDrive, manual, edge function, futuro CSV, futuro API) **funciona igual sin pensarlo**: el punto se ve para su dueño.
- No hay diálogos a rellenar, no hay defaults a recordar, no hay status a sincronizar.
- El equívoco "lo importé pero no se ve" es estructuralmente imposible.
- Se conservan los conceptos Catálogo/Workspace y Borrador/Publicado, pero como **etiquetas editoriales** independientes y libres de efectos secundarios.

## Lo que NO entra en este plan

- No tocamos RLS (ya hace su trabajo).
- No tocamos `getPointVisualState` (la paleta sigue dependiendo de enrichment, no de status).
- No introducimos preferencia "destino por defecto" (ya no aplica).

## Archivos a modificar

- `src/domains/content/lib/document-visibility.ts` (simplificar)
- `src/domains/content/store/locations-store.ts` (eliminar `docStatusByDocId` map)
- `src/domains/content/lib/db-operations.ts` (eliminar lógica de status)
- `src/services/document-add.service.ts` (renombrar `applyCatalog`, quitar update de docs)
- `src/domains/content/components/DocumentFocusView.tsx` (separar UI: chip status independiente, botón curado independiente)
- `src/components/FilterBar.tsx` (eliminar el aviso "documentos en draft" — ya no aplica)
- `mem://index.md` (Core rule reescrita)
- Migración SQL única para consolidar datos existentes

## Resultado

Un único punto de verdad para visibilidad. Dos etiquetas (status y is_approved) que viven sin solaparse. Cero futuros "lo importé y no se ve".
