## Objetivo

Crear un usuario "sandbox" en la base de datos cuya sesión yo pueda iniciar desde el navegador del sandbox, poblado con una muestra representativa de tus contenidos (5 documentos × ~50 puntos, sus tracks, fotos, notas, colecciones, categorías personales, índice OneDrive y preferencias). Después ejecutar tests de verificación, helpers y UI.

## Paso 1 — Crear usuario sandbox

- Insertar en `auth.users` un usuario con email `sandbox-agent@vandits.test` y password fijo conocido (`SandboxAgent!2026`).
- Trigger `handle_new_user` creará automáticamente su `profiles` row.
- Guardar el UUID generado para los siguientes pasos.

## Paso 2 — Clonar contenido (top-N por documento)

Origen: tu `user_id` (lo detecto como el único usuario con datos masivos en `documents`/`locations`). Destino: `sandbox_user_id`.

Para cada tabla, INSERT … SELECT con remap de IDs (gen_random_uuid()) y reasignación de `user_id`/`owner_user_id`:

| Tabla | Selección |
|---|---|
| `documents` | 5 docs variados (mezcla source_type: upload, onedrive, scrape si existen) |
| `locations` | 50 por documento clonado (preservando `is_approved`, `enriched_data`, FKs geo y type) |
| `document_tracks` | todos los tracks de esos 5 docs |
| `collections` | hasta 8 colecciones tuyas (mezcla catálogo y privadas) |
| `collection_items` | items que apunten a las locations clonadas (remap item_id) |
| `location_photos` | todas las fotos de las locations clonadas |
| `location_notes` | todas las notas de las locations clonadas |
| `personal_categories` | todas tus categorías personales |
| `onedrive_photo_index` | hasta 100 entradas |
| `preference_values` | tus filas con `scope_type='user'` y `scope_id=tu_uid` |
| `profiles` | copiar `home_*`, visibilidades, ranking, etc. del tuyo al sandbox |

Todo en una sola migración transaccional, idempotente (DELETE previo de cualquier dato del sandbox por si re-ejecuto).

## Paso 3 — Tests automatizados (vitest)

Crear `src/test/sandbox-data.test.ts` con queries directas vía supabase-js anon key + login del usuario sandbox:

- Cuenta de docs == 5, locations == ~250, tracks > 0, collections > 0, photos > 0, notes > 0.
- Cada `location.owner_user_id` == sandbox uid.
- Helper `getPointVisualState` devuelve los 3 estados (verde/gris/naranja) para muestras del dataset.
- Helper `getBucketStats` devuelve `myCatalog > 0` y consistente.
- `isLocationVisibleInGlobalMap` aplica regla approval-gated correctamente.
- `getLocationHierarchy` ordena por los 8 niveles sin errores.

## Paso 4 — Test de UI con browser logueado

- `navigate_to_sandbox` a `/auth`, login con `sandbox-agent@vandits.test` / `SandboxAgent!2026`.
- Verificar mapa con markers (palette correcta), abrir panel Contenido (docs visibles), abrir panel Colecciones (toggles + anillos de color sobre markers), abrir un documento, abrir popup de un punto, comprobar Proximity Context en un waypoint sin enriquecer.
- Screenshot final como evidencia.

## Paso 5 — Reporte

Resumir: conteos clonados, tests pasados/fallidos, capturas, y cualquier hallazgo (anillos colección, palette, etc.) que quieras revisar antes de seguir.

## Limpieza

El usuario sandbox queda permanente para futuras sesiones. Si en algún momento quieres borrarlo, basta con `DELETE FROM auth.users WHERE id = '<sandbox_uid>'` (cascadea por owner_user_id/document.user_id).

## Detalles técnicos

- La inserción en `auth.users` se hace vía migración SQL (INSERT directo con `encrypted_password = crypt('SandboxAgent!2026', gen_salt('bf'))` y `email_confirmed_at = now()` para evitar verificación).
- El remap de IDs usa CTEs con tablas temporales `id_map_documents`, `id_map_locations`, `id_map_collections` para traducir referencias cruzadas (collection_items, document_tracks, photos, notes).
- Tests vitest se ejecutan con `bunx vitest run src/test/sandbox-data.test.ts`.
