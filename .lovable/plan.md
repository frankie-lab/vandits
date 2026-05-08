## Job "Reparar cadenas rotas" multiusuario en Geografía universal

Ampliar el panel `GeographyBackfillPanel` para que un admin/master pueda lanzar `mode: 'repair'` sobre **cualquier usuario** del sistema (no solo el propio), viendo en la columna izquierda las cadenas rotas de ese usuario con el mismo selector jerárquico (continente / país / región / zona / …).

### Cambios

#### 1. Backend (RPCs nuevas, security definer + check de rol)

- `admin_users_with_broken_geo_chain()` → `(user_id uuid, username text, display_name text, broken_count int)`
  Lista usuarios con `count_locations_with_broken_geo_chain(user_id) > 0`, ordenado desc.
  Bloqueada salvo `has_role(auth.uid(),'admin'|'master')`.
- `admin_count_locations_with_broken_geo_chain(_user_id uuid)` → `int`
  Wrapper con check de rol que delega en la función existente.
- `admin_broken_locations_for_user(_user_id uuid)` → filas con `id, name, latitude, longitude, continent, country, region, zone, continent_id, country_id, region_id, zone_id`
  Devuelve TODAS las filas con cadena rota (sin paginar) para que la columna izquierda pueda agruparlas por jerarquía. Se cachea en cliente.

Nota: las funciones existentes `locations_with_broken_geo_chain` / `count_locations_with_broken_geo_chain` se mantienen tal cual (son las que usa el cron `geocoding-job-tick` para iterar). Solo añadimos la capa admin.

#### 2. Edge function `backfill-admin-fks`

- Aceptar `target_user_id` cuando lo invoca el cron con un `geocoding_jobs.user_id` cuyo dueño es admin/master y el job apunta a otro usuario. Hoy `repair` ya usa `job.user_id` como filtro; basta con permitir que `geocoding_jobs.user_id` sea el del **objetivo**, manteniendo `created_by` aparte.

#### 3. Tabla `geocoding_jobs`

- Añadir columna `created_by uuid` (nullable, FK lógica a auth.users).
- En el cliente, al lanzar como admin contra otro usuario:
  - `user_id = targetUserId` (sigue siendo dueño de los datos a reparar → RLS y cron actuales no cambian de comportamiento).
  - `created_by = auth.uid()` (admin que lo lanzó, para auditoría).
- Política RLS extra: admins/masters pueden `INSERT` filas con `user_id != auth.uid()` solo si `has_role(...)`.

#### 4. UI — `GeographyBackfillPanel`

Reorganización en 3 columnas cuando `isAdmin`:

```text
┌──────────────┬──────────────────────────┬──────────────┐
│ Usuarios     │ Cadenas rotas (árbol     │ Cobertura    │
│ con cadenas  │ jerárquico geográfico    │ + Modo       │
│ rotas        │ del usuario seleccionado)│ + Ejecución  │
└──────────────┴──────────────────────────┴──────────────┘
```

- **Col 1 (nueva, solo admin)**: lista virtualizada de usuarios devuelta por `admin_users_with_broken_geo_chain`, con badge de `broken_count`. Click selecciona usuario activo.
- **Col 2**: misma `GeographyScopeTree` que ya existe, pero alimentada con las locations de `admin_broken_locations_for_user(targetUserId)` en vez del store local. Mismo agrupado continent → country → region → zone → admin3 → locality. Multi-select de IDs idéntico.
- **Col 3**: cobertura (filtrada por `targetUserId`), modo (forzado a `repair` por defecto cuando hay cadenas rotas; `fill`/`reconcile`/`overwrite` siguen disponibles), botón Lanzar.

Para usuario sin rol admin, la UI cae al layout actual de 2 columnas operando solo sobre sí mismo (sin regresión).

#### 5. Lanzamiento del job

`useGeocodingJobStore.start()` recibe nuevo campo opcional `targetUserId`. Si presente y el caller es admin:
- Inserta `geocoding_jobs` con `user_id = targetUserId, created_by = auth.uid(), mode: 'repair'`.
- Resto del flujo (realtime, ETA, parar) sin cambios.

#### 6. Cobertura por usuario

- `v_geo_coverage` actual filtra por `auth.uid()`. Añadir RPC `admin_geo_coverage(_user_id)` que devuelve la misma estructura pero filtrada por usuario objetivo, con check de rol.

### Permisos

- Solo `master` y `admin` ven la columna 1, las RPCs `admin_*`, y la opción de lanzar contra otros.
- Para todos los demás roles el panel se comporta como hoy.

### Archivos a tocar

- `supabase/migrations/<new>.sql` — RPCs `admin_*`, columna `created_by`, RLS para insert cross-user.
- `supabase/functions/backfill-admin-fks/index.ts` — usar `job.user_id` como target sin asumir que es el caller (ya casi lo hace).
- `src/stores/geocoding-job-store.ts` — soportar `targetUserId` y `created_by`.
- `src/components/admin/GeographyBackfillPanel.tsx` — tres columnas, fetch admin, selector de usuario.
- `src/components/admin/GeographyScopeTree.tsx` — aceptar lista externa de locations precalculada (ya recibe `locations` por prop, sin cambios estructurales).
- Nuevo `src/components/admin/AdminBrokenUsersList.tsx`.

### Fuera de alcance

- No tocamos lógica de `resolve-admin-area` ni la pipeline de geocodificación; solo se expone el `repair` existente a admins.
- No hay cambios en el mapa principal ni en filtros de usuarios finales.