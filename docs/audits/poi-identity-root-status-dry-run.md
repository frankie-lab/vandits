# Dry-run — POI Identity Root Status (A/B/C/D)

Status: **DRY-RUN read-only**. No UPDATE / INSERT / DELETE. Sin código UI.
Sin cambios en `computePoiMaturity`. Sin tocar marker fill. Sin bump.
Sin Nominatim. Sin IA. Sin re-enrich.

Contrato: `docs/contracts/poi-identity-root-status-contract.md`.
Canon territorial actual (v1.3.18, 49 países): `src/shared/geography/territorial-canon.ts`.

## 1. Universo

POIs visibles = `locations WHERE deleted_at IS NULL AND is_approved = true`.
**Total auditado: 5.100 POIs.**

## 2. Heurística aplicada (sin escribir)

```sql
CASE
  -- A: identidad mínima rota
  WHEN name IS NULL OR btrim(name)=''
    OR latitude IS NULL OR longitude IS NULL
    OR (latitude=0 AND longitude=0)
    OR latitude<-90 OR latitude>90 OR longitude<-180 OR longitude>180
    THEN 'A'
  -- C: nombre vs coordenadas incoherente
  WHEN geo_health IN ('broken','stale_name','empty')
    THEN 'C'
  -- B: sistema/canon/backfill
  WHEN (country_code IS NOT NULL AND country_code NOT IN TERRITORIAL_CANON)
    OR country_id IS NULL
    OR geo_health = 'partial'
    OR (has_descripcion AND region_id IS NULL)
    THEN 'B'
  -- D: identidad confirmada, apto enrich
  ELSE 'D'
END
```

`TERRITORIAL_CANON` = lista de 49 ISO2 cableada hoy en el canon (post P0 World
Canon Coverage). Cualquier `country_code` fuera de esa lista cuenta como
**canon-gap → B**, no como error del usuario.

`has_descripcion` = `enriched_data.descripcion` no vacío.

Orden de evaluación: **A > C > B > D**.

## 3. Distribución global

| Root | Count | % | Color aux | Owner | Apto enrich |
|------|------:|---:|-----------|-------|:-----------:|
| **A** Incompleto real | 1 | 0,02 % | rojo | user | NO |
| **B** Canon/backfill pendiente | 97 | 1,90 % | amarillo | system | NO |
| **C** Identidad incoherente | 8 | 0,16 % | naranja | user | NO |
| **D** Identidad confirmada | 4.994 | **97,92 %** | verde | auto | SÍ |
| **Total** | **5.100** | 100 % | — | — | — |

Cola operativa real (A+B+C) = **106 POIs** = 2,08 %.
Catálogo apto para enriquecimiento automático = **4.994 POIs**.

## 4. Desglose por motivo

### 4.1 A — Incompleto real

| Motivo | Count |
|--------|------:|
| `coords-zero` | 1 |
| **Total A** | **1** |

### 4.2 B — Canon/backfill pendiente

| Motivo | Count |
|--------|------:|
| `canon-gap` (país fuera de TERRITORIAL_CANON) | 86 |
| `geo-partial` (FK resoluble por backfill) | 7 |
| `country-id-null` | 3 |
| `enriched-no-region` (enriched pero `region_id` NULL) | 1 |
| **Total B** | **97** |

> **88,7 %** de B se cierra automáticamente con la siguiente ola del canon
> mundial (Wave P1+). Ningún POI B requiere acción del usuario.

### 4.3 C — Identidad incoherente

| Motivo | Count |
|--------|------:|
| `geo-broken` | 6 |
| `geo-empty` (incluye 2 fixtures E2E) | 2 |
| **Total C** | **8** |

C real (sin fixtures E2E) = **6 POIs**.

### 4.4 D — Identidad confirmada

| Sub-bucket | Count |
|-----------|------:|
| Ya enriquecidos (`enriched_data.descripcion` no vacío) | 3.723 |
| **Pendientes de enrichment** (aptos auto-enrich) | **1.271** |
| **Total D** | **4.994** |

> Cola IA recomendada = filtrar `root='D' AND has_descripcion=false` → **1.271 POIs**.

## 5. Top países por B (canon-gap dominante)

| ISO2 | Count | Motivo dominante |
|------|------:|------------------|
| EE | 9 | canon-gap |
| LT | 8 | canon-gap |
| KE | 8 | canon-gap |
| ET | 5 | canon-gap |
| LV | 4 | canon-gap |
| GE | 4 | canon-gap |
| DK | 4 | canon-gap |
| NO | 3 | geo-partial |
| ME | 3 | canon-gap |
| CU | 3 | canon-gap |
| BA | 3 | canon-gap |
| MD | 3 | canon-gap |
| FO | 3 | canon-gap |
| XK | 3 | canon-gap (Kosovo, status especial) |
| ES | 3 | geo-partial (fixtures `beta-partial-*`) |
| CR | 2 | canon-gap |
| SG | 2 | canon-gap |
| FR | 2 | geo-partial |
| TZ | 2 | canon-gap |
| (resto) | 1 c/u | canon-gap |

## 6. Lista completa de `canon-gap` (países B fuera del canon actual)

ISO2 distintos en B con `canon-gap`: **38**.

```
EE(9), LT(8), KE(8), ET(5), LV(4), GE(4), DK(4), ME(3), CU(3),
BA(3), MD(3), FO(3), XK(3), CR(2), SG(2), TZ(2),
AL(1), BY(1), CD(1), CY(1), EC(1), GL(1), IL(1), JO(1), KG(1),
KY(1), MG(1), MN(1), MR(1), MT(1), PE(1), SD(1), SM(1), TD(1),
TM(1), YE(1)
```

Esta lista alimenta directamente la **Wave P1+ del roadmap World Canon
Coverage** (`docs/audits/t-global-canon-world-docx-coverage-audit.md`). Orden
recomendado por volumen: EE → LT → KE → ET → LV → GE → DK → ME/CU/BA/MD/FO/XK.

XK (Kosovo) es una de las 5 entidades de "anexo" del documento mundial; su
inclusión requiere decisión política/ISO previa.

## 7. geo_health × root

| root | geo_health | count |
|------|------------|------:|
| A | hardError | 1 |
| B | ok | 87 |
| B | partial | 10 |
| C | broken | 6 |
| C | empty | 2 |
| D | ok | 4.994 |

D al 100 % en `geo_health='ok'`: el eje root y el eje geo_health coinciden
para el bloque limpio.

## 8. enrichment_status × root

| root | enrichment_status | count |
|------|-------------------|------:|
| A | enriched | 1 |
| B | (null) | 77 |
| B | enriched | 20 |
| C | (null) | 8 |
| D | enriched | 3.708 |
| D | (null) | 1.284 |
| D | unresolved | 2 |

> 20 POIs en B ya están `enriched` pese a canon-gap → confirma §5.3 del
> contrato: B **no** debe bloquear render ni penalizar al usuario. Solo
> bloquea promoción visual a POI-7+ hasta que el sistema cierre canon/FKs.

## 9. Lista A — completa (1)

| id | name | cc | reason |
|----|------|----|--------|
| `89867d20-bc1e-4a12-82fa-ba4820a5cdab` | Antarctica Roundabout | ES | coords-zero |

> Acción: usuario completa coordenadas o se descarta.

## 10. Lista C — completa (8)

| id | name | cc | reason |
|----|------|----|--------|
| `f04b3b95-…-e2e000000001` | E2E Fixture — Imported POI | — | geo-empty (fixture) |
| `f04b3b95-…-e2e000000002` | E2E Fixture — Empty POI | — | geo-empty (fixture) |
| `2bb2d2e6-b40f-4499-af05-bd8523edc054` | beta-chain-1 | MA | geo-broken (fixture) |
| `435a2dcf-4609-40ec-92ca-b5caeeaf914c` | beta-chain-2 | MA | geo-broken (fixture) |
| `2b81c378-b3d5-4a80-b26a-fa82569d14ef` | Castillo de Malbork | PL | geo-broken |
| `f9d5f63d-1759-4eeb-bbcb-84c4d54e9f83` | Cârlibaba | RO | geo-broken |
| `2584a104-8fbe-495f-be3b-c52793579796` | Șirnea | RO | geo-broken |
| `47c49cf2-50f1-4a03-8c8f-c98dffbf968b` | Biertan | RO | geo-broken |

C real (descontando 4 fixtures E2E + sintéticos `beta-chain-*`) = **4 POIs reales**
de revisión: Castillo de Malbork, Cârlibaba, Șirnea, Biertan.

## 11. Ejemplos B (20)

| id | name | cc | reason |
|----|------|----|--------|
| `42ed6f90-…` | Dhërmi | AL | canon-gap |
| `eabef499-…` | Mostar | BA | canon-gap |
| `c7a10ae7-…` | Blagaj | BA | canon-gap |
| `5a918768-…` | Mostar | BA | canon-gap |
| `2ba62c82-…` | Brest Fortress | BY | canon-gap |
| `23485e21-…` | Virunga National Park | CD | canon-gap |
| `cacdaf0d-…` | Parque de Las Esferas | CR | canon-gap |
| `b38d9174-…` | Playa Manuel Antonio | CR | canon-gap |
| `3710c9d0-…` | Necrópolis Cristóbal Colón | CU | canon-gap |
| `77010a7f-…` | Playa de Varadero | CU | canon-gap |
| `34522458-…` | Playa Pilar | CU | canon-gap |
| `dc2eca21-…` | Nissi Beach | CY | canon-gap |
| `f4902944-…` | The Sand-Covered Church | DK | canon-gap |
| `98386169-…` | Castillo de Egeskov | DK | canon-gap |
| `8eeb0cd7-…` | Lindholm Høje Museum | DK | canon-gap |
| `fe9f8b4a-…` | Rubjerg Knude Lighthouse | DK | canon-gap |
| `c2ae43b1-…` | Pailon Del diablo | EC | canon-gap |
| `2c933a55-…` | Lahemaa rahvuspark | EE | canon-gap |
| `b709cfb4-…` | Haapsalu Airfield | EE | canon-gap |
| `1da3f26e-…` | Zapovednik Matsalu | EE | canon-gap |

## 12. Ejemplos D (20)

| id | name | cc |
|----|------|----|
| `59286b30-…` | Cementerio de la Recoleta | AR |
| `6b872a54-…` | Funes | AR |
| `febaddaa-…` | Catamarca | AR |
| `a66c5fa5-…` | Tolar Grande | AR |
| `20dbd409-…` | Schmetterlinghaus | AT |
| `f382568f-…` | Castillo de Hohenwerfen | AT |
| `55ddc895-…` | Hohenwerfen Castle | AT |
| `bd22e678-…` | Eisriesenwelt | AT |
| `c64cad18-…` | Stephansdom Crypt | AT |
| `58e47ff1-…` | Hallstatt | AT |
| `8da1f8b9-…` | Kreuzenstein Castle | AT |
| `58e1a7bc-…` | Zentralfriedhof | AT |
| `2492248c-…` | Riegersburg | AT |
| `ba9365f8-…` | Schönbühel-Aggsbach | AT |
| `286a8239-…` | Alpbach | AT |
| `a22b1716-…` | Mattsee | AT |
| `e0c89f8f-…` | St. Peter Stiftskulinarium | AT |
| `7179bdd7-…` | Burg Hochosterwitz | AT |
| `3f280875-…` | Schichenauerstraße | AT |
| `d0eb9fb8-…` | Bahía de Botany | AU |

## 13. POI-N × root (estimación informativa)

`computePoiMaturity` no se ejecuta en este dry-run. Por la heurística del
contrato §3, el encaje **esperado** es:

| root | POI-N esperado |
|------|----------------|
| A (1) | POI-0..POI-3 |
| B (97) | POI-4..POI-6 capado por canon/FK |
| C (8) | POI-3..POI-4 con flag |
| D (4.994) | POI-4..POI-10 según señales |

Validación cuantitativa POI-N × root queda para una segunda iteración cuando
se materialice el campo derivado (§16).

## 14. Cuántos D están listos para enrich

D pendiente de enrichment (`has_descripcion = false`) = **1.271 POIs**.
D ya enriquecidos = **3.723 POIs**.

Cola IA recomendada por país-top-D (sin desglose detallado en este dry-run):
ES, FR, IT, GB, US, PT lideran.

## 15. Cuántos B se resolverían por canon/backfill

| Subcola B | Count | Resolución |
|-----------|------:|-----------|
| `canon-gap` | 86 | Wave P1+ del canon mundial (sin tocar datos del POI) |
| `geo-partial` | 7 | `backfill-admin-fks` |
| `country-id-null` | 3 | `backfill-admin-fks` |
| `enriched-no-region` | 1 | `backfill-admin-fks` |
| **Total** | **97** | **100 % automatizable** |

Cero acciones de usuario requeridas en B.

## 16. Recomendaciones (NO ejecutar sin aprobación)

1. **Wave P1 del canon mundial**: incorporar EE, LT, KE, ET, LV, GE, DK
   (≥4 POIs) para reducir B en ~42 POIs (−43 %).
2. **Wave P2**: ME, CU, BA, MD, FO, CR, SG, TZ (≥2 POIs) → otros ~16 POIs.
3. **Backfill FKs**: ejecutar `backfill-admin-fks` sobre los 11 POIs B con
   motivo `geo-partial / country-id-null / enriched-no-region`.
4. **Cola enrich automática**: filtrar `D AND has_descripcion=false` → 1.271
   POIs aptos. Resto (A/B/C) skip silencioso.
5. **Revisión usuario**: 4 POIs reales (Malbork, Cârlibaba, Șirnea, Biertan)
   + 1 A (Antarctica Roundabout). Total = **5 POIs** que requieren acción
   humana en todo el catálogo.
6. **XK (Kosovo)**: pendiente de decisión política/ISO antes de incorporar
   al canon. Mantener en B con flag `annex-pending`.
7. **Materialización futura** (§6 del contrato): si la heurística se valida
   ≥7 días sin discrepancias, crear `identity_root_status`,
   `identity_action_owner`, `identity_reason` como columnas derivadas
   (trigger o job), con index parcial `WHERE root IN ('A','B','C')`.

## 17. Lo que este dry-run NO hizo

- No escribió ninguna columna en `locations`.
- No creó `identity_root_status` / `identity_action_owner` / `identity_reason`.
- No tocó `admin_areas`, `enriched_data`, `raw_geocode`.
- No llamó Nominatim ni re-enrich ni IA.
- No movió POI-N de ningún punto.
- No tocó marker fill ni paleta.
- No subió versión.

## 18. Próximas decisiones a tomar

Después de revisar este dry-run, decidir:

- ¿Se materializa A/B/C/D como campo derivado en `locations`?
- ¿Se expone en panel admin (filtro + cola de trabajo)?
- ¿Se añade filtro A/B/C/D en Discovery?
- ¿Se cablea como pre-filtro duro de la cola IA (`enrich-location` skip
  si `root ∈ {A,B,C}`)?
- ¿Se cablea como badge auxiliar en tooltip de marker propio (sin tocar fill)?
