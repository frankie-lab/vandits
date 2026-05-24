# B5 — Camino R — `Monasterio de Sumela` resolve-coordinates

**Estado:** ejecutado.
**Versión app:** 1.3.5 (sin bump).
**Fecha:** 2026-05-21.
**ID:** `b41a33d7-10e7-45c0-9cc9-f95fbd775d13`.
**Snapshot pre-flight:** [`snapshots/b5-camino-r-sumela-preflight.csv`](./snapshots/b5-camino-r-sumela-preflight.csv).

---

## 1. Scope

Único POI real residual del plan B5 (cubo A). Ningún fixture soft-deleted tocado.

## 2. Pre-flight

| Campo | Valor |
|---|---|
| `name` | Monasterio de Sumela |
| `latitude`, `longitude` | 40.690064, 39.658438 (válidas) |
| `deleted_at` | NULL ✅ |
| `raw_geocode` | NULL ✅ |
| `enrichment_status` | enriched ✅ |
| `geo_health` (previo) | partial |
| `country` / `country_id` (previos) | Turquía / `8b1938c0…` |
| `region_id` / `zone_id` previos | `cb91693f…` / NULL |

## 3. Ejecución

### 3.1 Edge call

`POST /functions/v1/resolve-coordinates`

```json
{ "latitude": 40.690064, "longitude": 39.658438 }
```

Respuesta `200` (Nominatim doble pasada, `geo_confidence = 95`):

```json
{
  "canonical": {
    "continent": "Asia", "country": "Turquía", "country_code": "TR",
    "region": "Región del Mar Negro", "region_type": "Región",
    "zone": "Trabzon", "zone_type": "Provincia",
    "locality": "Maçka", "street": "Anabasis Yolu",
    "postal_address": "Anabasis Yolu", "postal_code": "61750"
  },
  "ids": {
    "continent_id": "3359210b-3571-4eb1-9a7b-435ad8732b58",
    "country_id":   "8b1938c0-465c-45ad-81f3-d36673413b6b",
    "region_id":    "1c4a630e-de74-41d2-8081-447297437a57",
    "zone_id":      "0302be3c-4eff-45e0-ba01-329e5d08601a",
    "admin3_id":    "4e8f50a1-3416-4fa2-8941-dfca196c4b55",
    "locality_id":  "1756d295-f060-4388-b543-8f3752582afb",
    "sublocality_id": null
  },
  "country_code": "TR", "postal_code": "61750",
  "geo_source": "nominatim", "geo_confidence": 95, "timezone": null
}
```

### 3.2 SQL ejecutado

`resolve-coordinates` no persiste por sí mismo, así que se aplicó UPDATE puntual restringido a los campos permitidos del plan B5 §3.2:

```sql
UPDATE public.locations
SET raw_geocode = <canonical>::jsonb,
    geo_source = 'nominatim',
    geo_confidence = 95,
    geo_resolved_at = now(),
    country_code = 'TR',
    postal_code = '61750',
    continent_id = '3359210b-3571-4eb1-9a7b-435ad8732b58',
    country_id   = '8b1938c0-465c-45ad-81f3-d36673413b6b',
    region_id    = '1c4a630e-de74-41d2-8081-447297437a57',
    zone_id      = '0302be3c-4eff-45e0-ba01-329e5d08601a',
    admin3_id    = '4e8f50a1-3416-4fa2-8941-dfca196c4b55',
    locality_id  = '1756d295-f060-4388-b543-8f3752582afb',
    updated_at   = now()
WHERE id = 'b41a33d7-10e7-45c0-9cc9-f95fbd775d13'
  AND deleted_at IS NULL
  AND raw_geocode IS NULL
  AND enrichment_status = 'enriched';
```

`geo_health` lo recalculó automáticamente el trigger `locations_set_geo_health`.

**No mutados:** `name`, `latitude`, `longitude`, `enriched_data`, `enrichment_status`, `country`, `region`, `zone` (cadenas), `street_name`, `timezone` (Nominatim devolvió NULL), `sublocality_id` (no aplica), `pioneer_user_id`, `owner_user_id`, colecciones.

## 4. Post-flight

| Métrica | Valor |
|---|---|
| `raw_geocode IS NOT NULL` | ✅ |
| `geo_source` / `geo_confidence` | `nominatim` / `95` |
| `geo_resolved_at` | `2026-05-21 12:02:00 UTC` |
| `geo_health` (recalculado) | **`ok`** ✅ (subió desde `partial`) |
| FKs admin | continent / country / region / zone / admin3 / locality poblados |
| `country_code` / `postal_code` | `TR` / `61750` |
| Coords intactas | 40.690064 / 39.658438 ✅ |
| `enrichment_status` intacto | `enriched` ✅ |
| **POI-N resultante** | **POI-9** (enriched + `geo_health='ok'` + 0 rings activos) |
| **Scope POI-3 residual total** | **0** ✅ |

## 5. Rollback

100 % reversible. Restaurar desde snapshot pre-flight:

```sql
-- UPDATE public.locations
-- SET raw_geocode    = NULL,
--     geo_source     = NULL,
--     geo_confidence = NULL,
--     geo_resolved_at= NULL,
--     country_code   = NULL,
--     postal_code    = NULL,
--     continent_id   = '3359210b-3571-4eb1-9a7b-435ad8732b58',
--     country_id     = '8b1938c0-465c-45ad-81f3-d36673413b6b',
--     region_id      = 'cb91693f-9046-4752-8a35-171c42486249',
--     zone_id        = NULL,
--     admin3_id      = NULL,
--     locality_id    = 'b9d7e1f4-b0b0-44ef-8a93-36f8c9bf6db2'
-- WHERE id = 'b41a33d7-10e7-45c0-9cc9-f95fbd775d13';
```

El trigger recalculará `geo_health → partial` al volver a anular `raw_geocode`.

## 6. Cierre del plan B5

| Lote | Estado | Count |
|---|---|---|
| G-piloto | ✅ ejecutado | 10 |
| G-1 | ✅ ejecutado | 169 |
| G-2 | ✅ ejecutado | 159 |
| **Cubo A (Camino R)** | ✅ **ejecutado** | **1** |

**Scope POI-3 final: 0.** Plan B5 cerrado sin bump, sin tocar contenido enriquecido, sin re-enrich.
