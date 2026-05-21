# B5 — Backfill `raw_geocode` para enriched POI-3

**Estado:** plan, no ejecutado.
**Versión app:** 1.3.5 (sin bump).
**Scope:** `enrichment_status='enriched'` ∧ `raw_geocode IS NULL` ∧ `is_approved=true` ∧ `deleted_at IS NULL` ∧ coords válidas (no NULL, no `0/0`).
**Snapshot completo:** [`snapshots/b5-raw-geocode-backfill-scope.csv`](./snapshots/b5-raw-geocode-backfill-scope.csv) — 339 filas.

---

## 1. Hallazgos (auditoría pre-plan, sólo lectura)

| Métrica | Valor |
|---|---|
| Locations en scope | **339** |
| Creadas el `2026-05-14` (ráfaga única) | **338** |
| Owners únicos del batch | 2 (`08e0c12c-bdab-4db8-b147-7ef8ce7c5c76`=175, `ec870c6b-fe8f-41c3-8682-a70bd67cf128`=163) |
| `geo_health='hardError'` | 338 |
| `geo_health='partial'` | 1 |
| Con `country` poblado | 339 |
| Con `region` o `zone` poblados | 1 |
| Con `geo_confidence` o `geo_resolved_at` | 0 |

Distribución por país: ES 179 · PT 65 · FR 62 · US 7 · MA 6 · GR 5 · GB 5 · IT 5 · DE 2 · CH 2 · TR 1.

### 1.1 Patrón léxico

Clasificador regex sobre `name`:

- `synthetic_prefix` (`Bodega Artesanal …`, `Café Histórico …`, `Cascada Oculta …`, `Mirador Secreto …`, `Ruta del …`, `Sendero …`, `Punto Mágico …`, `Rincón …`): **48**.
- `synthetic_suffix` (`(Norte)`, `(Sur)`, `(Este)`, `(Oeste)`, `#N`, `Nuevo`, `Antiguo`, `Alto`, `Bajo`, `del Valle`, `de la Sierra`): **277**.
- 14 restantes del batch siguen plantillas equivalentes detectadas por muestreo (`Pueblo Encantado X`, `Mercado Central de X`, `Playa Secreta de X`, `Puente Medieval de X`, `Ruta de Senderismo X`, `Jardín Botánico de X`, `Casco Antiguo de X`, `Monasterio de X`, `Catedral de X`, `Plaza Mayor de X`, `Museo Etnográfico de X`, `Castillo de X`).

### 1.2 Clasificación 338 sintéticos / 1 real

| Cubo | Definición | n |
|---|---|---|
| **A — POI real** | `Monasterio de Sumela` (Turquía, `2026-05-06`, owner sandbox-agent `f04b3b95-7308-4b74-b3c7-7e819767c5fb`, único `geo_health='partial'`) | **1** |
| **B — Sintéticos del batch 2026-05-14** | Resto del scope. Plantillas léxicas + ráfaga single-day + 2 owners + 0 valor de catálogo verificable | **338** |

No se detectan `name_coordinate_mismatch` accionables: los nombres sintéticos no se verifican contra Wikipedia/Wikidata. No hay flags `geo_resolution_*` activos en scope.

---

## 2. Recomendación principal — **Camino G (governance)**

Purgar el batch sintético antes que reverse-geocodearlo.

**Razones:**

1. **No es deuda histórica real.** Es seed data del 14-mayo con nomenclatura plantilla, no contenido de catálogo curado.
2. **Promocionarlos pintaría verde en el mapa global.** Al tener ya `enriched_data.descripcion`, poblar `raw_geocode` los promovería de POI-3 a POI-7+ y aparecerían como POIs sanos del catálogo. Contaminación visible.
3. **Coste oportunidad nulo.** 338 reverse-geocodes vía Nominatim (~1.1 s/req → ~6 min) gastados en data sin valor.
4. **Reversible.** Soft-delete (`deleted_at = now()`) deja el rollback en un único UPDATE.

### 2.1 Lotes recomendados (Camino G)

| Lote | Selección | n | Acción propuesta |
|---|---|---|---|
| G-piloto | 10 IDs cubo B (ES, owners equilibrados, nombres claramente sintéticos) | 10 | Soft-delete + verificar desaparición de POI-3 sin secuelas UI |
| G-1 | Resto cubo B owner `08e0c12c-…` | 165 | Soft-delete batch |
| G-2 | Resto cubo B owner `ec870c6b-…` | 163 | Soft-delete batch |
| Cubo A | `Monasterio de Sumela` (POI real, Turquía) | 1 | Camino R (única aplicación legítima — ver §3) |

### 2.2 SQL propuesto (NO ejecutar)

```sql
-- G-piloto (no ejecutar hasta confirmación)
-- UPDATE public.locations
-- SET deleted_at = now()
-- WHERE id IN (<10 ids del piloto>);

-- Rollback piloto
-- UPDATE public.locations
-- SET deleted_at = NULL
-- WHERE id IN (<10 ids del piloto>);
```

Toda escritura iría por la herramienta de migrations/insert con `description` explícita. Ningún DELETE físico.

### 2.3 Campos permitidos en escritura (Camino G)

Sólo `deleted_at`. Nada más.

**Prohibido tocar** (regla DURA del request): `name`, `latitude`, `longitude`, `enriched_data`, media, tags, `enrichment_status`, colecciones, código, migraciones de schema, IA, re-enrich.

### 2.4 Validación post-flight (por lote)

1. `SELECT COUNT(*)` del scope baja exactamente `N_lote`.
2. Los IDs purgados desaparecen del mapa global (`isLocationVisibleInGlobalMap` exige `deleted_at IS NULL`).
3. Bucket POI-3 en la leyenda de Madurez decrementa `N_lote`.
4. Ningún POI fuera del scope cambia de estado visual ni de nivel de madurez.

### 2.5 Rollback Camino G

```sql
-- UPDATE public.locations SET deleted_at = NULL WHERE id IN (…);
```

Sin pérdida de datos: soft-delete reversible, sin transformación de campos, sin re-enriquecimiento.

---

## 3. Aplicación única de Camino R — Cubo A (`Monasterio de Sumela`)

Único candidato real para `resolve-coordinates` en este ticket.

### 3.1 Pipeline

`resolve-coordinates` (edge ya existente) → reverse-geocode Nominatim → `persist:true` aplica los campos permitidos vía trigger. Sin código nuevo.

```text
POST /functions/v1/resolve-coordinates
body: {
  "locationId": "b41a33d7-10e7-45c0-9cc9-f95fbd775d13",
  "lat": 40.690064,
  "lng": 39.658438,
  "persist": true
}
```

### 3.2 Campos permitidos en escritura (Camino R)

- `raw_geocode` (CanonicalGeo completo)
- `geo_source='nominatim'`
- `geo_confidence` (0–100)
- `geo_resolved_at=now()`
- `country_code`, `postal_code`, `timezone`
- `continent_id`, `country_id`, `region_id`, `zone_id`, `admin3_id`, `locality_id`, `sublocality_id`
- `country`, `continent`, `region`, `zone` **sólo si están NULL** (Sumela ya tiene `country='Turquía'`)
- `geo_health` recalculado por trigger / `computeHonestGeoHealth`

### 3.3 Rollback cubo A

Snapshot CSV pre-flight de las columnas mutables (§3.2). Rollback = UPDATE restaurando esas columnas; trigger recalcula `geo_health → hardError` al re-anular `raw_geocode`.

### 3.4 Validación post-flight cubo A

1. `raw_geocode IS NOT NULL` con JSON válido y al menos `country`.
2. `geo_source='nominatim'`, `geo_confidence > 0`, `geo_resolved_at` reciente.
3. `geo_health ∈ {ok, partial}`.
4. `computePoiMaturity(dbLocationToGeoLocation(row))` ≥ POI-7 (el POI ya tiene `enriched_data.descripcion`).

---

## 4. Apéndice — Camino R sobre cubo B (**NO RECOMENDADO**)

Documentado por trazabilidad. **No aplicar.**

### 4.1 Por qué no

- Los reverse-geocodes serían correctos para las coordenadas pero el `name` sintético no se valida contra ninguna fuente externa.
- El resultado promovería 338 fixtures a POI-7+ y los expondría como POIs sanos en mapa global.
- Si más tarde se decide purgar, el rollback debe revertir tanto los campos geo poblados como aplicar soft-delete — ruido innecesario respecto a Camino G directo.
- Consume rate-limit de Nominatim (~6 min) sin valor de catálogo.

### 4.2 Si aun así se quisiera ejecutar (escenario contrafactual)

Sólo registrar como referencia:

```text
POST /functions/v1/backfill-coordinates
body: { "limit": 50, "onlyMissing": true }
```

`backfill-coordinates` itera y por cada row llama internamente a `resolve-coordinates` con `persist:true`. Mismo set de campos permitidos que §3.2.

**Si se ejecuta por error**, rollback = restaurar desde snapshot CSV pre-flight (mismas columnas que §3.2) vía migration; el trigger volverá a marcar `geo_health='hardError'` al re-anular `raw_geocode`.

---

## 5. Riesgos

| Riesgo | Mitigación |
|---|---|
| Soft-delete masivo afecta colecciones / referencias cruzadas | Auditar `collection_items.item_id` antes del primer lote. Si hay refs, decidir cleanup en mismo lote o abandonar. |
| Owners del batch creen que es contenido propio legítimo | Confirmar con governance que `08e0c12c-…` y `ec870c6b-…` son cuentas de testing / no-prod antes del piloto. |
| Métricas del catálogo (POI-3 count) cambian bruscamente | Esperado y deseado. Documentar en changelog interno (sin bump de versión). |
| Camino R aplicado por error al cubo B | Hard rule: en este ticket sólo se invoca `resolve-coordinates` con `locationId` **explícito** del cubo A. `backfill-coordinates` con `limit≥2` queda prohibido. |
| Fixtures referenciados desde tests E2E | Verificar `e2e/` y `scripts/e2e/ensure-test-fixture.ts` antes del piloto; si dependen del seed, mover dependencia a fixture local antes del soft-delete. |

---

## 6. Decisión pendiente antes de ejecutar

Necesito confirmación explícita sobre **tres puntos** antes de tocar datos:

1. **Soft-delete vs hard-delete** para los 338 del cubo B. Recomendación: soft-delete (reversible, no rompe FKs).
2. **Owners del batch** (`08e0c12c-…` y `ec870c6b-…`): ¿confirmados como no-prod / fixtures?
3. **Camino R cubo A** (Sumela): ¿se aplica en la misma operación que el piloto G o se posterga a ticket separado de "resolve real residual"?

Ningún `UPDATE`, `DELETE`, llamada a `resolve-coordinates`, re-enrich, ni bump hasta tener las tres respuestas.

---

## 7. Anexo — 20 ejemplos del scope

(Lista completa en `snapshots/b5-raw-geocode-backfill-scope.csv`.)

| # | id | name | country | lat | lng | cubo |
|---|---|---|---|---|---|---|
| 1 | b41a33d7-10e7-45c0-9cc9-f95fbd775d13 | Monasterio de Sumela | Turquía | 40.690064 | 39.658438 | **A** |
| 2 | 96fb3645-8af4-4f4d-9ed4-0595690da8ab | Jardín Botánico de Múnich Alto | Alemania | 48.112758 | 11.686408 | B |
| 3 | 417c8935-b0db-493c-81d0-c59e023fda79 | Museo Etnográfico de Berlín (Sur) | Alemania | 52.456705 | 13.320147 | B |
| 4 | 4e1c7955-542a-485d-9b55-ba25a50da039 | Bodega Artesanal de Albacete de la Sierra | España | 39.024036 | -1.838012 | B |
| 5 | 8cc02c20-3964-47b6-8bad-804dc04ae1a3 | Bodega Artesanal de Ávila | España | 40.686475 | -4.585320 | B |
| 6 | 43285e14-cf72-4ef8-9cb9-57f449dccb12 | Bodega Artesanal de Ávila #2 | España | 40.743633 | -4.675148 | B |
| 7 | 3715fd65-093d-420c-812b-5887b792051c | Bodega Artesanal de Barcelona (Norte) | España | 41.459545 | 2.081020 | B |
| 8 | 31869808-cdc6-4050-b270-389893b0c430 | Bodega Artesanal de Madrid | España | 40.445491 | -3.597439 | B |
| 9 | 75a01dda-3c66-43de-a113-99cd7cab9bd4 | Bodega Artesanal de Murcia Antiguo | España | 38.055289 | -1.160170 | B |
| 10 | 4ebd1e53-ddf4-4791-a5aa-f62e99ac99a8 | Bodega Artesanal de Oviedo | España | 43.626698 | -5.572972 | B |
| 11 | e7d2d01f-cd27-4f76-8705-9a89c80a5004 | Bodega Artesanal de Sevilla | España | 37.412629 | -5.891039 | B |
| 12 | d3748235-7bab-4e00-b5ad-e06a71d90ba9 | Bodega Artesanal de Tenerife de la Sierra | España | 28.439295 | -16.196693 | B |
| 13 | f85747ae-c1a8-45dd-a703-86c7f9e1b19d | Café Histórico de Bilbao (Norte) | España | 43.265286 | -3.033182 | B |
| 14 | 8490d2d0-9ed3-4e89-a8cd-2c291791d69b | Café Histórico de Bilbao del Valle | España | 43.153039 | -2.967484 | B |
| 15 | fce87116-53ca-47ef-b1e5-ecaa5dbd3e4e | Café Histórico de Consuegra (Norte) | España | 39.836413 | -3.610980 | B |
| 16 | e99a4dd1-260e-4a68-b692-fdc43f433db7 | Café Histórico de Santander Nuevo | España | 43.370302 | -3.919017 | B |
| 17 | 6b19de97-dcb9-48e1-8a45-4c2eccf022d2 | Café Histórico de Valencia (Norte) | España | 39.448565 | -0.288979 | B |
| 18 | a61e18c2-a896-4389-9fc4-b8634d74ed90 | Cascada Oculta A Coruña | España | 43.362776 | -8.441932 | B |
| 19 | fa3c9dd9-90c5-4b44-bdd1-f290aee976d0 | Cascada Oculta Alicante (Norte) | España | 38.244427 | -0.556402 | B |
| 20 | 73e40cb6-f871-40b3-b850-e9b98c0a7561 | Cascada Oculta Barcelona de la Sierra | España | 41.405146 | 2.094323 | B |
