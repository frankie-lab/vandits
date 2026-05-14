
## Diagnóstico

`v_locations_resolved` está creada con `security_invoker=on`. PostgREST aplica `.range(from, to)` sobre la vista **antes** de que RLS filtre filas. Una página de 1000 puede devolver 97 si el viewer no tiene permiso sobre las otras 903.

`fetchAllLocationsPaginated` (`src/domains/content/lib/db-transformers.ts`) usa la heurística `returned < page_size → fin del dataset`. Esa heurística es inválida con vistas `security_invoker`: el bucle termina prematuramente y se pierden filas posteriores al primer corte.

Por eso los 337 puntos de sandbox-agent (clonados en bloque, IDs en las primeras páginas) entran enteros, y los 8 de Alpha (UUIDs dispersos, varios caen tras la primera página recortada) no llegan al cliente. No es nada del sandbox, es el paginador.

## Cambio (único archivo)

`src/domains/content/lib/db-transformers.ts`, función `fetchAllLocationsPaginated`.

1. **Mantener `.order('id', { ascending: true })`** sobre `v_locations_resolved`. Paginar sin orden estable es incorrecto y reintroduciría duplicados/huecos a futuro. Se queda.

2. **Cambiar la condición de salida del bucle**:
   - Hoy: `if (returned < PAGE_SIZE) break`.
   - Nuevo: seguir paginando hasta que **una página devuelva 0 filas** (`returned === 0`). Las páginas parciales son legítimas con `security_invoker`.

3. **Cap estricto de seguridad** (defensa contra loop infinito si algo va mal):
   - `MAX_PAGES = 50` (≈ 50 000 filas con page_size 1000).
   - `MAX_ROWS  = 50_000`.
   - Si se alcanza cualquiera de los dos: `console.warn('[paginator] CAP reached', { pages, total, lastFrom, lastTo })` y romper el bucle. **No silenciar** — el warning es la señal de que hay que subir el cap o repaginar por owner.

4. **Conservar la instrumentación reciente**: `[paginator] page=N from=A to=B returned=K`, `TRACK_IDS` con los IDs de Alpha (y permitir extender el tracker a Beta vía constante en el módulo), `[paginator] DONE total=… tracker hits=X/Y`.

## Validación post-fix (criterio de éxito)

No basta con "se ven más puntos". Hay que confirmar con el tracker:

- `[paginator] DONE` cubre todas las páginas hasta `returned=0` (o hasta CAP con warning explícito).
- **Alpha: `tracker hits = 8/8`**.
- **Beta: `tracker hits = 10/10`** (los que pasen RLS para el viewer; si alguno es `private` de Beta y el viewer no es owner ni follower aceptado, ese ID legítimamente no debería aparecer — anotar en consola cuáles entran y cuáles no, sin marcarlo como fallo).
- `[user-filter funnel]` para Alpha: `dbLocs_in_uid_docs ≥ 8`.
- Sandbox conserva sus 337 sin regresión.
- Ningún warning `[paginator] CAP reached` en flujo normal.

## Fuera de alcance (queda registrado, no bloquea)

- **`documents_of_uid: 0` para Alpha** (documento existe en BD pero el store no lo carga → bug en `use-database-sync.ts`). Los markers pueden renderizar por `ownerUserId` aunque el documento no esté en el store, así que el fix del paginador no depende de esto. Se aborda en una segunda iteración para arreglar agrupación por documento y filtros que dependan de `documents`.
- Errores no relacionados ya descartados: `batch-enrich ERR_HTTP_PROTOCOL_ERROR`, `getAllChildMarkers undefined`, warnings `[V2 Flags]`.
