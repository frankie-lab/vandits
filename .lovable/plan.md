## Plan: paginar `admin_broken_locations_for_user` para superar el tope de 1000

**Diagnóstico**

- `admin_users_with_broken_geo_chain` cuenta correctamente los 2417 puntos rotos de Frankie (una sola fila por usuario, no choca con el tope).
- `admin_broken_locations_for_user` no tiene `LIMIT` interno, pero PostgREST aplica un tope de 1000 filas a las RPC y el `.range(0, 99999)` que añadí no lo desactiva en RPCs SECURITY DEFINER.
- Resultado: el árbol del centro recibe 1000 filas, la cabecera muestra "1000 puntos rotos" y la suma 1+23+976=1000 cuadra con el truncado, no con la realidad.

**Cambios**

1. **Migración SQL** — sustituir la RPC por una versión paginable manteniendo la misma firma para `_user_id` y añadiendo dos parámetros:
   ```
   admin_broken_locations_for_user(_user_id uuid, _limit int default 1000, _offset int default 0)
   ```
   - Mantiene el chequeo `_is_admin_or_master`, las mismas columnas devueltas y el mismo orden.
   - Añade `LIMIT _limit OFFSET _offset` al final del SELECT.
   - Defaults compatibles con cualquier llamada existente.

2. **Cliente — `src/components/admin/GeographyBackfillPanel.tsx`** (helper `loadBroken`):
   - Reemplazar la llamada única por un bucle que pida páginas de 1000 con `_offset` creciente hasta que una página devuelva menos de 1000 filas.
   - Concatenar resultados y volcar en `setBrokenLocations`.
   - Quitar el `.range(0, 99999)` (irrelevante con paginación explícita).
   - Mientras carga, ir actualizando `brokenLocations` por páginas para que el contador de la cabecera ("X puntos rotos") avance de 1000 → 2000 → 2417 en vivo.

3. **UI — cabecera y selección**:
   - El texto "1000 puntos rotos" pasa a leerse de `brokenLocations.length` (ya lo hace), por lo que mostrará 2417 al terminar.
   - El pie "0 / 1000 seleccionados" también se basa en el total real, no en la página.

**No se toca**

- `admin_users_with_broken_geo_chain`, RLS, geocodificación, ni ninguna otra parte de la UI.
- Lógica del botón "Reparar cadenas rotas": ahora recibirá los 2417 IDs reales en lugar de 1000.

**Resultado esperado**

- Frankie GMZ (2417 cadenas rotas) muestra cabecera "2417 puntos rotos" y un árbol con la suma exacta por continente/país/región.
- Sandbox Agent (131) sigue funcionando con una sola página.
- Cualquier usuario futuro con > 1000 puntos rotos verá el total correcto.
