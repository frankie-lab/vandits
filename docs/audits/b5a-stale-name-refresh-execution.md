# B5a — Micro-refresh stale_name (pilot rows)

**Date:** 2026-05-20
**Scope:** 3 rows of the B5a pilot that closed in `geo_health='stale_name'` due to the ES↔FR translation issue fixed by Opción A (`_compute_location_geo_health_lookup` migration `20260520145016`).
**Goal:** Force recompute of `geo_health` without changing any semantic field, so the stored value reflects the new lookup logic (`name ∪ aliases ∪ name_translations`).

## Targets

| id | name | country | region | zone |
|---|---|---|---|---|
| `e623d113-596d-45e9-9bcd-763ecb4cffe7` | Autoire | Francia | Occitania | Lot |
| `fa4cec93-d7d4-4303-9893-668c57bda226` | Belcastel | Francia | Occitania | Aveyron |
| `1c1f98f3-564d-4e1c-9e31-6dcc76cbac2f` | Sant'Antonino | Francia | Córcega | Alta Córcega |

## Pre-check

Snapshot (selected fields):

| id | geo_health | latitude | longitude | country | region | zone |
|---|---|---|---|---|---|---|
| e623d113… | `stale_name` | 44.8532525 | 1.8205118 | Francia | Occitania | Lot |
| fa4cec93… | `stale_name` | 44.3879029 | 2.3365474 | Francia | Occitania | Aveyron |
| 1c1f98f3… | `stale_name` | 42.5883511 | 8.9048052 | Francia | Córcega | Alta Córcega |

Dry-run from `b5a-stale-name-dry-run.md` already confirmed that recompute under the new lookup yields `ok` for the three rows.

## Trigger analysis

`zzz_locations_set_geo_health` fires `BEFORE INSERT OR UPDATE OF latitude, longitude, continent_id, country_id, region_id, zone_id, country, region, zone, country_code, raw_geocode, enrichment_status`.

`updated_at` alone does **not** fire it (verified — first attempt left `geo_health` unchanged). The minimum-touch that fires the trigger without changing semantics is a self-assign on one of the listed columns. Used `raw_geocode = raw_geocode` (JSONB identity, no value change).

## Action executed

```sql
UPDATE locations
SET raw_geocode = raw_geocode
WHERE id IN (
  'e623d113-596d-45e9-9bcd-763ecb4cffe7',
  'fa4cec93-d7d4-4303-9893-668c57bda226',
  '1c1f98f3-564d-4e1c-9e31-6dcc76cbac2f'
);
```

No other field touched. No migration. No re-enrich. No `resolve-coordinates`.

## Post-check

| id | name | geo_health | country | region | zone | lat | lng |
|---|---|---|---|---|---|---|---|
| e623d113… | Autoire | **`ok`** ✅ | Francia | Occitania | Lot | 44.8532525 | 1.8205118 |
| fa4cec93… | Belcastel | **`ok`** ✅ | Francia | Occitania | Aveyron | 44.3879029 | 2.3365474 |
| 1c1f98f3… | Sant'Antonino | **`ok`** ✅ | Francia | Córcega | Alta Córcega | 42.5883511 | 8.9048052 |

Drift check vs. pre-snapshot:

- `latitude`, `longitude`: unchanged (identical bytes).
- `country`, `region`, `zone`: unchanged (still the ES Nominatim strings — alias-resolved by the new lookup).
- `name`, `enriched_data`, `enrichment_status`, media, tags, collections: not in UPDATE SET.

## Outcome

- 3/3 pilot rows now stored as `geo_health='ok'`.
- Opción A behaves as designed against persisted data.
- Closes the residual `stale_name` debt from the B5a pilot.

## Follow-ups

- B5a.2 (n=30) remains paused pending explicit go-ahead.
- A bulk recompute pass (`raw_geocode = raw_geocode` over the full `stale_name` set, or a dedicated `recompute_geo_health()` admin job) is the natural extension once B5a.2/B5a.3 close, but is **out of scope here**.

## Version impact

None. No bump.
