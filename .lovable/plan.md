## Plan — Ejecutar SELECTs read-only de `geo-backfill-dry-run.md` y rellenar conteos

Trabajo de pura lectura + edición docs-only. Necesito pasar a build mode para usar `supabase--read_query` (read-only por contrato del tool) y editar el doc.

### Pasos

1. Ejecutar en paralelo, vía `supabase--read_query`, las 10 queries de conteo del doc:
   - D1 — coords nulas
   - D2 — Null Island `(0,0)`
   - D3 — fuera WGS84 / NaN
   - D4 — `enriched` sin `raw_geocode`
   - D5 — `geo_health='ok'` stale (R2 falla)
   - D6a — `zone == region` textual
   - D6b — `zone_id` redundante FK (join `admin_areas`)
   - D7-struct — placeholders `^\(sin .+\)$` en columnas
   - D7-enriched — placeholders en `enriched_data.datos_geograficos.*`
   - D8 — `places_trunk` con coords inválidas
   - Total `locations` (denominador para %).

2. Ejecutar las queries de muestra `LIMIT 10 ORDER BY updated_at DESC` para cada categoría con `count > 0`. Saltar muestras para `count = 0` (no aportan).

3. Verificar nombre real de columnas en `public.places_trunk` (lat/lng vs latitude/longitude) con un `information_schema` SELECT antes de D8. Ajustar query si difiere.

4. Detectar si la extensión `unaccent` está disponible:
   ```sql
   SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname='unaccent') AS has_unaccent;
   ```
   Si NO está, sustituir `unaccent(x)` por `x` en D6/D7 y anotarlo en el doc como caveat (falsos negativos por tildes).

5. Editar **únicamente** `docs/audits/geo-backfill-dry-run.md`:
   - Rellenar la tabla §3 (count, % sobre total, observaciones puntuales).
   - Reemplazar cada bloque "Muestras" de §4 / §2 con los resultados reales en tabla markdown (máx 10 filas por daño, columnas relevantes acotadas para legibilidad).
   - Anotar fecha de ejecución (UTC) y rama `master` del esquema.
   - Anotar caveat `unaccent` si aplica.
   - Anotar nombre real de columnas trunk si difiere.

### Restricciones (ratificadas)

- Solo SELECT. Cero UPDATE/DELETE/INSERT/migraciones.
- No tocar código de runtime ni de tests.
- No bump de versión. `package.json` / `app-version.ts` / `README.md` / `version-history.md` intactos.
- `.lovable/plan.md` no editado.
- Único archivo modificado: `docs/audits/geo-backfill-dry-run.md`.
- **Version impact: none.**

### Reporte final que daré

- Tabla resumen D1–D8 con counts y %.
- Confirmación de cuántas categorías tenían muestras incluidas.
- Confirmación read-only: lista de queries ejecutadas, todas `SELECT`.
- Caveats encontrados (unaccent ausente, columnas trunk renombradas, etc.) si los hay.