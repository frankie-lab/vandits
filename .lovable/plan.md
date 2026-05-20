## Plan — Backfill/limpieza POIs dañados (auditoría dry-run, post Fases 1–7)

Docs-only. Sin UPDATE/DELETE/migraciones/re-enrich/runtime/bump. Version impact: none.

### Entregable único
`docs/audits/geo-backfill-dry-run.md` — auditoría dry-run con SELECTs, conteos, muestras y propuesta de corrección por fases. No ejecuta nada.

### Estructura del documento

1. **Contexto** — referencia a `docs/contracts/enrichment-coord-coherence-contract.md` (Fases 1–7 ya aplicadas: entry gate, resolve-coordinates obligatorio, identity gate, prompt sin geo, geo_health honesto, assertGeoCoherence, places_trunk + zone≠region). Esta auditoría mide la deuda histórica que las fases previas ya bloquean en entrada pero no han limpiado.

2. **Tipos de daño auditados** — un bloque por categoría, cada uno con: definición, SQL `SELECT count(*)`, SQL `SELECT … LIMIT 10`, interpretación esperada.

   - **D1 — Coords nulas**: `latitude IS NULL OR longitude IS NULL` sobre `public.locations`.
   - **D2 — Null Island**: `ABS(latitude) < 1e-7 AND ABS(longitude) < 1e-7`.
   - **D3 — Fuera de WGS84**: `ABS(latitude) > 90 OR ABS(longitude) > 180 OR latitude = 'NaN'::float8 OR longitude = 'NaN'::float8`.
   - **D4 — Enriched sin raw_geocode**: `enrichment_status = 'enriched' AND raw_geocode IS NULL`.
   - **D5 — `geo_health='ok'` stale** (debería `hardError` según R2): unión lógica de D1∪D2∪D3∪D4 con `geo_health = 'ok'`.
   - **D6 — `zone == region`**: join `locations → admin_areas` para `zone_id` y `region_id`, comparando nombres normalizados (`unaccent + lower + trim`); también detectar caso textual legacy `lower(unaccent(zone)) = lower(unaccent(region))`.
   - **D7 — Placeholders persistidos** en columnas estructuradas y en `enriched_data → datos_geograficos.*`: literales `(sin región)`, `(sin provincia)`, `(sin comarca)`, `(sin localidad)`, `(sin país)` (regex `^\(sin .+\)$` case-insensitive).
   - **D8 — `places_trunk` con coords inválidas**: mismo predicado que D1∪D2∪D3 sobre `public.places_trunk` (lat/lng).

   Cada bloque incluye su SQL SELECT (sólo lectura). Sin CTEs de escritura. Todos los SELECT son seguros de ejecutar manualmente desde el panel admin o `supabase--read_query` cuando llegue el momento.

3. **Tabla de conteos esperados** — placeholder con columnas `categoria | count | % sobre total locations | observaciones`. Se rellena al ejecutar los SELECT manualmente (fuera de scope de este doc).

4. **Muestras (10 filas/tipo)** — los SELECT vienen ya con `LIMIT 10` y `ORDER BY updated_at DESC` para inspección rápida.

5. **Propuesta de corrección por fases** — ORDEN y AISLAMIENTO obligatorios. Cada fase escribirá su propio contrato cuando se apruebe; aquí sólo se describe.

   - **B1 — Sanea `places_trunk`** (D8). Purgar/anonimizar filas con coords inválidas. Primero porque envenena lookups futuros.
   - **B2 — Reset `geo_health` stale** (D5). Set `geo_health = 'hardError'` donde R2 lo exige. No toca coords ni `enriched_data`. Idempotente.
   - **B3 — `zone_id` = NULL cuando `zone == region`** (D6). No toca `region_id`. Aplica `shouldDropZone` retroactivo.
   - **B4 — Drop placeholders** (D7). Set NULL en columnas estructuradas; limpiar claves prohibidas en `enriched_data.datos_geograficos`. Sin cambiar `enrichment_status`.
   - **B5 — Re-encolar D1∪D2∪D3∪D4 a `geocoding-job`** en lotes pequeños con rate-limit. NO re-enrich IA; sólo reverse-geocode para rellenar `raw_geocode` y cadena admin. El IA gate sigue siendo manual.
   - **B6 — Re-evaluar `geo_health`** post-B5 (trigger ya lo cubre, pero se documenta verificación).

   Cada fase B1–B6 va en su propia migración + contrato + tests. NUNCA en bloque.

6. **Riesgos**
   - Falsos positivos en D6 por homonimia legítima (rara pero existe: ciudad llamada igual que su región).
   - D7 puede borrar valor textual usado por la UI legacy en breadcrumb si algún componente aún lee de `country/region` textual en lugar de `*_id`. Auditar consumidores antes de B4.
   - B5 puede saturar Nominatim → respetar `geocoding-job` cooldown existente.
   - B2 reclasifica masivamente a `hardError` → explosión visual de anillos rojos. Aceptable como señal real; coordinar con el owner antes.
   - Sin backup previo a B1/B4 no hay rollback granular. Recomendar snapshot lógico del subset afectado antes de cada batch.
   - `places_trunk` ya está protegido en entrada (R7), pero B1 puede romper lookups de POIs que apuntaban a filas trunk envenenadas — re-mapear o dejar `trunk_id = NULL`.

7. **Orden recomendado de ejecución**
   `B1 → B2 → B3 → B4 → B5 → B6`. Razón: sanear trunk antes de tocar locations evita que reverse-geocodes durante B5 reusen filas trunk corruptas. B2/B3/B4 son no-destructivos y se pueden iterar libremente. B5 es el único costoso (red + tiempo).

8. **Restricciones del documento** — sección final repitiendo: no UPDATE, no DELETE, no migraciones, no re-enrich, no runtime, no bump, version impact: none.

### Reporte final que daré tras crear el doc
- Archivo creado: `docs/audits/geo-backfill-dry-run.md`.
- Confirmación: ningún dato tocado, ningún SQL ejecutado, sólo SELECTs documentados.
- Confirmación: sin cambios en `src/`, `supabase/migrations/`, `supabase/functions/`, `package.json`, `README.md`, `app-version.ts`.

### Lo que NO incluye este plan
- Ejecutar los SELECT para rellenar conteos reales (requiere acceso DB; se hace en follow-up).
- Escribir las migraciones B1–B6 (cada una será su propio contrato aprobado).
- Tocar `.lovable/plan.md`.