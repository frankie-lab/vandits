# T2.3 — Plan de ejecución: Lote 0 + Lote 1 (PT)

> **Estado:** PLAN aprobado con bloqueos (IE + canon_gap). No ejecutar todavía. No UPDATE. No geocoder. No código. No bump.
>
> **Referencias:**
> - `docs/audits/t2-3-region-placeholder-dry-run.md`
> - `docs/contracts/territorial-equivalence-canon.md` (+ mirrors TS/Deno)
> - `docs/audits/t2-2-hasprovinciafalse-lote1-closure.md`

---

## 0bis. Gate canónico TERRITORIAL_CANON (regla DURA, ambos lotes)

Antes de tocar ningún POI, se evalúa `country_code` contra `TERRITORIAL_CANON` (`docs/contracts/territorial-equivalence-canon.md` + mirrors TS/Deno).

- **`country_code ∈ TERRITORIAL_CANON`** → POI elegible para resolución según el método del lote.
- **`country_code ∉ TERRITORIAL_CANON`** → **PRESERVAR**. Marcar `canon_gap=true` en postflight. **NO resolver automáticamente** ni por parent-chain, ni por Nominatim, ni por catálogo.
- **`country_code = 'IE'`** → **BLOQUEADO EXPLÍCITAMENTE** en L0, L1 y L2..L5. Listar y reportar como `canon_gap_blocked='IE'`. Requiere prerequisito **T2.3-IE** (ver §5) antes de cualquier corrección de sus ~55 POIs.

Este gate aplica antes que cualquier otro filtro de selección de universo y se documenta en cada postflight (`country_code`, conteo `eligible` vs `canon_gap` vs `canon_gap_blocked`).

---

## 0. Principios comunes

Aplican a Lote 0 y Lote 1.

### 0.1 Aislamiento (regla T2.x dura)

**NO se tocan** bajo ningún concepto:

- `name`
- `coordinates` / `lat` / `lon` / `raw_geocode`
- `country_id`, `country_code`, `zone_id` (salvo excepción documentada §2.4)
- `locality_id`, `sublocality_id`
- `enriched_data`
- `enrichment_status`
- `geo_health` (salvo trigger natural inevitable)
- `tags`, colecciones, media
- código fuente, migraciones, `package/app-version`
- IA, re-enrich, scraping, generación de contenido

**SE toca únicamente:**

- `region_id` (FK → `admin_areas`)
- `region` (texto canónico derivado del `admin_areas.name` resuelto)

### 0.2 Snapshot previo (obligatorio antes de cualquier UPDATE)

Para cada POI candidato, insertar fila en `location_geo_provenance`:

```sql
INSERT INTO location_geo_provenance
  (location_id, source, snapshot, captured_at)
SELECT id,
       't23_snapshot',
       jsonb_build_object(
         'region',       region,
         'region_id',    region_id,
         'zone_id',      zone_id,
         'admin3_id',    admin3_id,
         'locality_id',  locality_id,
         'country_id',   country_id,
         'country_code', country_code,
         'geo_health',   geo_health
       ),
       now()
FROM locations
WHERE id = ANY($1::uuid[]);
```

### 0.3 Rollback

```sql
UPDATE locations l
SET region    = (s.snapshot->>'region'),
    region_id = NULLIF(s.snapshot->>'region_id','')::uuid,
    geo_health = COALESCE(s.snapshot->>'geo_health', l.geo_health)
FROM location_geo_provenance s
WHERE s.location_id = l.id
  AND s.source = 't23_snapshot'
  AND s.captured_at = (
    SELECT MAX(captured_at)
    FROM location_geo_provenance
    WHERE location_id = l.id AND source = 't23_snapshot'
  );
```

Snapshot inmutable. Rollback siempre disponible vía `source='t23_snapshot'`.

### 0.4 Postflight (por lote)

- Recuento "(sin región)" antes / después.
- IDs movidos.
- IDs preservados (no resueltos).
- Diff `region` / `region_id` (texto antes → texto después).
- `geo_health` antes / después (debe permanecer salvo trigger natural).
- Confirmación: cero cambios en campos protegidos §0.1.

---

## 1. Lote 0 — Class A (pure-SQL, ~17 POIs)

### 1.1 Objetivo

Resolver `region_id` / `region` derivándolos de la cadena `admin_areas` ya existente, **sin geocoder**, **sin red**.

### 1.2 Universo

POIs donde:

- `country_code IN TERRITORIAL_CANON` **Y** `country_code <> 'IE'` (gate §0bis)
- `region_id IS NULL OR region IS NULL OR region = ''`
- **Y** al menos uno de `{admin3_id, zone_id, locality_id}` está poblado
- **Y** el ancestro depth=1 (región) es derivable navegando `admin_areas.path` hacia arriba

POIs cuyo `country_code` no está en TERRITORIAL_CANON, o es `IE`, quedan fuera del UPDATE y se reportan como `canon_gap` / `canon_gap_blocked` en §1.4.

Estimación dry-run: **~17 POIs** sujetos al recorte del gate canónico (los 17 originales pertenecen a países ya canonizados según T2.2, pero el gate se ejecuta igualmente como defensa en profundidad). Lista cerrada se materializa en §1.4.

### 1.3 Método de resolución

`parent-chain` puro:

```sql
WITH src AS (
`parent-chain` puro, con gate canónico aplicado en el `WHERE`:

```sql
WITH src AS (
  SELECT l.id AS loc_id,
         COALESCE(l.admin3_id, l.zone_id, l.locality_id) AS leaf_id
  FROM locations l
  WHERE (l.region_id IS NULL OR l.region IS NULL OR l.region = '')
    AND COALESCE(l.admin3_id, l.zone_id, l.locality_id) IS NOT NULL
    AND l.country_code <> 'IE'                          -- bloqueo explícito IE
    AND l.country_code = ANY($CANON_COUNTRY_CODES)      -- gate TERRITORIAL_CANON
),
chain AS (
  SELECT s.loc_id, aa.id AS anc_id, aa.name AS anc_name, aa.depth
  FROM src s
  JOIN admin_areas leaf ON leaf.id = s.leaf_id
  JOIN admin_areas aa   ON aa.id = ANY(leaf.path)
  WHERE aa.depth = 1            -- nivel región canónico
)
SELECT loc_id, anc_id, anc_name FROM chain;
```

`$CANON_COUNTRY_CODES` se materializa desde `TERRITORIAL_CANON` en pre-flight (lista cerrada de ISO2). Sin Nominatim, sin matching textual, sin heurística de coordenadas.

### 1.4 Listado a generar (no ejecutar todavía)

Antes del UPDATE, materializar y adjuntar al postflight:

```sql
-- Listar IDs + región actual placeholder + región propuesta + método
SELECT l.id,
       l.name,
       l.country_code,
       l.region                      AS region_actual,
       l.region_id                   AS region_id_actual,
       c.anc_name                    AS region_propuesta,
       c.anc_id                      AS region_id_propuesto,
       'parent-chain'                AS metodo
FROM locations l
JOIN chain c ON c.loc_id = l.id
ORDER BY l.country_code, l.id;
```

### 1.5 UPDATE (NO ejecutar en este paso)

```sql
UPDATE locations l
SET region    = c.anc_name,
    region_id = c.anc_id
FROM chain c
WHERE c.loc_id = l.id;
```

### 1.6 Impacto esperado

- GeographyTree: "(sin región)" baja en ~17.
- POI-N: sin cambios (solo nodo padre cambia).
- `geo_health`: sin trigger esperado (no cambian coords ni nombre).

### 1.7 Riesgos

- Bajo. Solo lee FKs ya validadas en T2.2.
- Si `admin_areas.path` está malformado para algún leaf → POI se preserva, no se toca.

---

## 2. Lote 1 — PT (~29 POIs, primer Class B')

### 2.1 Objetivo

Resolver `region_id` para los 29 POIs de Portugal sin región, usando **reverse-geocoding determinista** y match contra catálogo `admin_areas` ya existente.

### 2.2 Universo

```sql
SELECT id, name, country_code,
       latitude, longitude,        -- verificar nombre real de columnas en pre-flight
       region, region_id, zone_id, admin3_id, locality_id
FROM locations
WHERE country_code = 'PT'
  AND (region IS NULL OR region = '' OR region_id IS NULL)
ORDER BY id;
```

Esperado: **29 POIs** (alineado con dry-run).

Subdivisión visible en muestra dry-run:

- ~10 POIs ya tienen `region_id = cbeeecd6-...` + `admin3_id` poblado (Açores/Madeira) → posible re-clasificación a Lote 0 tras revisión.
- ~19 POIs con todas las FK geo en NULL → genuinos Class B'.

### 2.3 Método de resolución

Orden estricto, primer match gana:

1. **parent-chain** (igual que §1.3). Si resuelve → marca `metodo='parent-chain'`. No se llama a Nominatim.
2. **resolve-coordinates**: Nominatim reverse `lat,lon` con `zoom=8&addressdetails=1&accept-language=pt`.
   - Extraer `address.state` (PT depth=1, "Distrito" o "Região Autónoma").
   - Rate limit: 1 req/s. User-Agent identificable. Cache local por `(round(lat,4), round(lon,4))`.
3. **catálogo match** determinista contra `admin_areas`:

   ```sql
   SELECT id, name
   FROM admin_areas
   WHERE country_code = 'PT'
     AND depth = 1
     AND (
       lower(name)          = lower($1)
       OR lower(unaccent(name)) = lower(unaccent($1))
       OR $1 = ANY(aliases)
     )
   LIMIT 2;
   ```

   - **Exactamente 1 match** → asignar.
   - **0 matches** → preservar, marcar para revisión humana.
   - **≥2 matches** → preservar, marcar para revisión humana (no se elige automáticamente).

### 2.4 Excepciones documentadas

- Si Nominatim devuelve un país ≠ PT → **preservar**, NO tocar `country_code`/`country_id`. Anotar discrepancia en postflight.
- `zone_id` / `admin3_id` / `locality_id` **NO se modifican** en Lote 1. Si el resolver canónico los exigiera, se difiere a un lote posterior y se documenta aquí.

### 2.5 Sin IA

- Cero llamadas LLM.
- Cero re-enrich.
- Cero scraping de contenido.
- Solo Nominatim reverse + lookup SQL contra catálogo.

### 2.6 Pre-flight (read-only, antes del snapshot)

Materializar tabla en `docs/audits/t2-3-pt-preflight.md`:

| id | name | lat | lon | region_actual | metodo | region_propuesta | region_id_propuesto | confianza |
|----|------|-----|-----|---------------|--------|------------------|---------------------|-----------|

- `confianza ∈ {parent-chain, nominatim+catalog-unique, preserve-ambiguous, preserve-no-coords, preserve-foreign-country, canon_gap, canon_gap_blocked}`.
- PT está en TERRITORIAL_CANON → todos los 29 POIs pasan el gate §0bis. Las marcas `canon_gap*` quedan reservadas para reuso del mismo pre-flight schema en L2..L5.

### 2.7 Snapshot

Igual que §0.2, sobre el universo PT cerrado.

### 2.8 UPDATE (NO ejecutar en este paso)

```sql
UPDATE locations l
SET region    = r.region_propuesta,
    region_id = r.region_id_propuesto
FROM t23_pt_resolution r
WHERE r.id = l.id
  AND r.confianza IN ('parent-chain','nominatim+catalog-unique');
```

POIs con `confianza` de tipo `preserve-*` no se tocan.

### 2.9 Rollback

Igual que §0.3, filtrado por `location_id IN (universo PT)`.

### 2.10 Postflight (`docs/audits/t2-3-pt-postflight.md`)

- Recuento "(sin región)" PT antes / después.
- IDs resueltos por método (parent-chain vs nominatim+catalog).
- IDs preservados con razón.
- Diff `geo_health` (esperado: sin cambios).
- Confirmación campos protegidos §0.1 intactos.
- Cache Nominatim adjunto para reproducibilidad.

### 2.11 Impacto esperado

- GeographyTree: "(sin región)" PT → idealmente 0; realista ~5-8 preservados.
- POI-N: cero cambios.
- `geo_health`: sin trigger esperado.

### 2.12 Riesgos

- Nominatim PT puede devolver "Distrito de X" mientras catálogo tiene "X" → resolver con `unaccent` + alias antes de preservar.
- Açores/Madeira: nombres oficiales bilingües; verificar aliases en catálogo PT depth=1 antes de ejecutar.
- Rate limit Nominatim: secuencial, no paralelo.

---

## 3. Orden de aprobación

1. Aprobar este plan.
2. Ejecutar pre-flight Lote 0 (SELECT puro). Adjuntar listado IDs.
3. Aprobar Lote 0 → snapshot + UPDATE + postflight.
4. Ejecutar pre-flight Lote 1 PT (SELECT + Nominatim reverse, sin UPDATE). Adjuntar tabla §2.6.
5. Aprobar Lote 1 → snapshot + UPDATE + postflight.
6. Cierre documental T2.3 lotes 0+1 → abre T2.3-L2..L5 (resto Class B') y T2.3-L6 (Class C, catálogo backfill + revisión humana).

---

## 4. Fuera de alcance (explícito)

- Class B' no-PT (RO, NO, HR, etc.) → lotes posteriores **siempre que su `country_code` esté en TERRITORIAL_CANON**.
- Class C (catálogo incompleto: RS, XK, ME, MD) → requiere backfill `admin_areas` previo.
- Class D (fixtures sintéticos) → excluidos permanentemente.
- **IE / Irlanda → bloqueado en L0, L1, L2..L5** hasta completar prerequisito T2.3-IE (§5).
- Cualquier `country_code` ∉ TERRITORIAL_CANON → preservar y reportar `canon_gap`, sin resolución automática en ningún lote.
- Re-enrich, IA, scraping, cambios de `country_id`/`zone_id`/`locality_id`, bump de versión.

---

## 5. Prerequisito T2.3-IE (bloqueante para Irlanda)

**Estado:** abierto. Bloquea cualquier corrección de los ~55 POIs `country_code='IE'`.

### 5.1 Alcance

- Añadir entrada `IE` a `docs/contracts/territorial-equivalence-canon.md` con:
  - `hasProvincia` (decisión documentada: las 4 provincias históricas IE son culturales, no admin operativas → previsible `false`, a confirmar en T2.3-IE).
  - `municipioField` (probable `locality`; County Council como nivel admin real).
  - Mapping `region` → County (26 condados) o agrupación canónica.
  - Aliases bilingües EN/GA (Gaeilge).
- Sincronizar mirrors:
  - TS: `src/shared/geography/territorial-canon.ts` (o equivalente activo).
  - Deno: `supabase/functions/_shared/territorial-canon.ts`.
- Contract test de paridad TS↔Deno↔markdown para `IE`.

### 5.2 Restricciones

- Solo canon + mirrors. **No tocar POIs IE** en este prerequisito.
- No re-enrich. No migraciones de datos. No bump.

### 5.3 Salida

- `docs/audits/t2-3-ie-canon-prereq.md` con decisión `hasProvincia`, mapping, aliases y diff de canon.
- Una vez cerrado y aprobado → desbloquea **T2.3-IE-data** (lote dedicado de los ~55 POIs siguiendo el pipeline Class B' del Lote 1).

### 5.4 Reporte intermedio

Hasta entonces, todos los postflights de L0/L1/L2..L5 deben listar los POIs IE preservados bajo `canon_gap_blocked='IE'` con conteo explícito.

