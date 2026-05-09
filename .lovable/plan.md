## Problema

La columna 1 ("Usuarios con cadenas rotas") siempre muestra los mismos números para cada usuario, independientemente del modo elegido:

- Frankie GMZ: **2427 / de 4747**
- Sandbox Agent: **132 / de 327**

Esos números vienen del RPC `admin_users_with_broken_geo_chain`, que devuelve un único `broken_count` (= todo lo no-`ok`) y `total_locations`. Por eso:

1. En modo **Rellenar huecos** (universo = 10 puntos) la lista sigue diciendo "2427/4747" en Frankie, cuando solo 10 de esos puntos pertenecen al universo del modo.
2. En modo **Revisar normalizados** (universo = 4747) Frankie debería poner "4747/4747", pero pone "2427/4747".
3. No puedes saber qué usuario contribuye al universo del modo activo, ni decidir lanzar el job sobre el total de un usuario sin abrir su árbol.
4. El título "Usuarios con cadenas rotas" miente cuando estás en Rellenar o Revisar.

## Solución

Hacer que la columna 1 sea **mode-aware**: cuente puntos del universo del modo activo por usuario.

### 1. Nuevo RPC `admin_users_geo_universe(_health_filter text[])`

Devuelve, para cada usuario con ≥1 punto en `v_location_geo_health` cuyo `health` cae en `_health_filter`:

```text
user_id | username | display_name | universe_count | total_locations
```

`SECURITY DEFINER`, exige `_is_admin_or_master(auth.uid())`. Reutiliza el índice ya creado en `locations(owner_user_id, geo_health)`.

El antiguo `admin_users_with_broken_geo_chain` se mantiene para no romper otros consumidores, pero el panel deja de usarlo.

### 2. `AdminBrokenUsersList` → `AdminGeoUniverseUsersList`

- Acepta props `healthFilter: GeoHealth[]` y `modeTitle: string`.
- Llama al nuevo RPC cada vez que cambia `healthFilter`.
- Reemplaza el título por algo dinámico: "Usuarios · {modeTitle}".
- Reordena descendente por `universe_count`.
- Oculta usuarios con `universe_count === 0` (no aportan al modo activo).
- El badge superior pasa a ser `universe_count` con el tono del modo (rojo Reparar / ámbar Rellenar / primario Revisar) en vez de siempre rojo.
- El subtexto "de N" sigue mostrando `total_locations` para conservar contexto.

### 3. Integración en `GeographyBackfillPanel`

- Sustituye `<AdminBrokenUsersList>` por `<AdminGeoUniverseUsersList healthFilter={healthFilter} modeTitle={MODE_META[mode].title} />`.
- Si el usuario auto-seleccionado (self) queda con `universe_count === 0` en el modo activo, se desmarca y se selecciona el primer usuario con puntos. Si la lista está vacía, columna 2 muestra "Sin puntos en este modo".
- `selectedIds` se vacía cuando cambia el modo (ya lo hacía).

### 4. Resultado UX

- Cambias a **Rellenar**: la lista filtra a los usuarios con `empty`+`partial`. Frankie aparece como `10/4747`, Sandbox desaparece si no aporta.
- Cambias a **Revisar**: cada usuario muestra `total/total`.
- Cambias a **Reparar**: `broken+stale_name / total`.

Con eso ya puedes elegir un usuario, ver de un vistazo cuántos puntos aporta al modo, y lanzar sobre todo su universo o fraccionarlo en el árbol de la columna 2.

## Ficheros tocados

- **Nuevo migration** `..._admin_users_geo_universe.sql` con el RPC.
- `src/components/admin/AdminBrokenUsersList.tsx` — renombrado a `AdminGeoUniverseUsersList.tsx` con la nueva firma. Se conserva el export de `BrokenUser` como alias para no tocar imports externos.
- `src/components/admin/GeographyBackfillPanel.tsx` — pasa `healthFilter` y `modeTitle`, ajusta el efecto de auto-selección para saltar a un usuario con puntos cuando el actual queda fuera del universo.

## Fuera de alcance

- No se toca el RPC viejo `admin_users_with_broken_geo_chain` (puede usarse en otros sitios).
- No se cambia el árbol (columna 2) ni el panel Lanzar (columna 3).
