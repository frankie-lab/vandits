## Diagnóstico

El toast "Error al cargar datos guardados" lo dispara `useDatabaseSync` cuando `fetchAllLocationsPaginated()` falla. Los logs lo confirman:

```
code: "57014"
message: "canceling statement due to statement timeout"
```

El query es:

```ts
supabase.from('v_locations_resolved')
  .select('*')
  .is('deleted_at', null)
  .range(from, to)
  .order('created_at', { ascending: true });
```

`v_locations_resolved` resuelve la geografía con **7 LEFT JOIN a `admin_areas`**. Sobre 5.073 locations + RLS por fila + `ORDER BY created_at` (sin índice en esa columna ni en `(deleted_at, created_at)`) el planner termina haciendo un sort completo tras RLS y joins. Resultado: supera el `statement_timeout` del rol `authenticated` (8 s por defecto) y aborta.

Detalles adicionales:
- Índice `idx_locations_deleted_at` es **parcial** `WHERE deleted_at IS NOT NULL`, así que NO ayuda al filtro `deleted_at IS NULL` que usamos en la app.
- No hay índice sobre `created_at` ni compuesto sobre `(deleted_at, created_at)`.
- El `ORDER BY` no se usa en la UI: en el cliente ya se reordena por jerarquía geográfica (`getLocationHierarchy / getFilteredLocations`) y por documento.

Mismo patrón se repite en `db-operations.ts` (segunda llamada a `fetchAllLocationsPaginated`).

## Cambios

### 1. Quitar el `ORDER BY` innecesario del fetch paginado

`src/domains/content/lib/db-transformers.ts` → `fetchAllLocationsPaginated`:

- Eliminar `.order('created_at', { ascending: true })`. La paginación con `range()` sin orden explícito devuelve un orden estable suficiente para nuestro uso (no exponemos ese orden al usuario; lo reordenamos client-side por jerarquía geográfica).
- Mantener `.is('deleted_at', null)` y `.range(from, to)`.

Esto elimina el sort sobre la vista y la consulta pasa a ser un scan secuencial con joins por hash/loop, mucho más rápido (<1 s para 5k filas).

### 2. Backoff + reintento ante 57014

En la misma función, envolver el `await supabase.from(...)` con un pequeño reintento (máx 2 intentos, espera 500 ms) solo cuando `error.code === '57014'`. Si tras los reintentos sigue fallando, se propaga el error (comportamiento actual).

Justificación: incluso con el query optimizado, una primera ejecución "fría" en Cloud puede tocar timeout puntual; el reintento evita que el usuario vea el toast por un único hipo.

### 3. Índice compuesto en la base de datos

Migración SQL:

```sql
CREATE INDEX IF NOT EXISTS idx_locations_alive_created
  ON public.locations (created_at)
  WHERE deleted_at IS NULL;
```

Cubre el filtro real (`deleted_at IS NULL`) y deja `created_at` ordenado por si en el futuro alguna otra ruta sí necesita orden temporal. No interfiere con `idx_locations_deleted_at` (que es para el caso opuesto, IS NOT NULL).

### 4. Aviso al usuario más claro al fallar

`use-database-sync.ts`: si tras el reintento la carga sigue fallando con `57014`, mostrar un toast accionable:

> "La carga del catálogo está tardando demasiado. Vuelve a intentarlo en unos segundos."

Con un botón "Reintentar" que dispare `window.dispatchEvent(new Event('reload-locations'))`. Para otros errores, mantener el mensaje genérico.

## Qué NO se toca

- No se cambia la vista `v_locations_resolved` (la single-source-of-truth de geografía resuelta sigue intacta — regla de memoria respetada).
- No se reduce `select('*')` aún. Si tras los cambios anteriores sigue habiendo timeouts, se evaluará en un segundo paso recortar columnas pesadas (`raw_geocode`, `enriched_data`) y cargarlas lazy.
- No se introduce progreso simulado en el overlay; el contador sigue siendo real (current/total).

## Validación

1. Recargar la home: la carga del catálogo completa en <2 s, sin toast de error, marcadores aparecen.
2. Forzar timeout artificial (ej. `setStatementTimeout` en una sesión psql aparte) y confirmar reintento + toast accionable.
3. Verificar plan del query con `EXPLAIN ANALYZE` antes/después del índice para confirmar que se usa `idx_locations_alive_created` o, al menos, que desaparece el sort sobre 5k+ filas.
4. Re-ejecutar `fetchAllLocationsPaginated` desde `db-operations.ts` (otra ruta) y confirmar mismo comportamiento.
