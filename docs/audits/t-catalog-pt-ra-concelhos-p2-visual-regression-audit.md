# T-CATALOG-PT-RA-CONCELHOS — P2 Visual Regression Audit

**Fecha:** 2026-05-21  
**Estado:** Auditoría sin cambios. No UPDATE / no Nominatim / no re-enrich / no bump.  
**Origen:** Reporte visual GeographyTree post-P2 muestra Açores y Madeira con sub-nodos incorrectos.

---

## 0. Reporte visual recibido

```
Portugal
├── Açores 29
│   ├── Lisboa 14
│   └── (sin provincia) 15
├── Madeira 11
│   └── (sin provincia) 11
└── (sin región) 2
    ├── Oporto 1
    └── (sin provincia) 1
```

---

## 1. Evidencia DB (estado real tras P2)

### 1.1 region_id / zone_id / admin3_id reales

`SELECT … FROM locations WHERE country_code='PT' GROUP BY region_id, zone_id, admin3_id`:

#### Açores (`ee871f7d-…`) — 29 POIs, **todos zone_id = NULL**

| admin3 (concelho)         | count |
| ------------------------- | ----- |
| Madalena (Pico)           | 14    |
| Ponta Delgada             | 5     |
| Angra do Heroísmo         | 3     |
| Povoação                  | 2     |
| Vila do Porto             | 1     |
| Vila Franca do Campo      | 1     |
| Lajes do Pico             | 1     |
| Velas                     | 1     |
| Ribeira Grande            | 1     |
| **Total**                 | **29** |

#### Madeira (`a0553c22-…`) — 11 POIs, **todos zone_id = NULL**

| admin3 (concelho) | count |
| ----------------- | ----- |
| Funchal           | 4     |
| Calheta           | 2     |
| Porto Moniz       | 2     |
| Câmara de Lobos   | 1     |
| Machico           | 1     |
| Santana           | 1     |
| **Total**         | **11** |

#### `(sin región)` (`cbeeecd6-…`) — 3 POIs (no 2 como en el reporte visual)

| id (corto) | name                            | zone_id (texto)       | admin3 (texto)         | lat, lng              |
| ---------- | ------------------------------- | --------------------- | ---------------------- | --------------------- |
| `07980212` | A Pérola do Bolhão              | Oporto                | (sin comarca)          | 41.148, -8.607        |
| `1a5bd7b3` | Parque Municipal de Braga       | Braga                 | (sin comarca)          | 41.521, -8.375        |
| `44da2def` | Santa Cruz da Graciosa Bullring | (sin región)          | Santa Cruz da Graciosa | 39.081, -28.003 (Açores) |

> El conteo visual `(sin región) 2` probablemente cuenta sólo los nodos hijo expandidos (Oporto + (sin provincia)). El tercero (Santa Cruz da Graciosa) está colocado bajo un placeholder zone `(sin región)` y se solapa con su propio padre en la UI.

### 1.2 `v_locations_resolved` — coherente con tabla base

`region_resolved`/`zone_resolved`/`admin_level_3` confirman:

- Açores: 29 con `zone_resolved = NULL`, admin3 = concelho real.
- Madeira: 11 con `zone_resolved = NULL`, admin3 = concelho real.
- Sin región: 3 (Bolhão, Braga Parque, Santa Cruz da Graciosa).

**La excepción insular P2 está aplicada correctamente en DB.** `zone_id`/`zone_resolved` son NULL para los 40 POIs insulares.

### 1.3 enriched_data legacy — origen del "Lisboa 14"

```sql
SELECT enriched_data->'datos_geograficos'->>'admin_nivel_2', count(*)
FROM locations
WHERE region_id IN ('ee871f7d…', 'a0553c22…') GROUP BY 1;
```

| `admin_nivel_2` legacy | count |
| ---------------------- | ----- |
| **Lisboa**             | **14** |
| (NULL/vacío)           | 26    |

Los **14 POIs de Madalena (Pico)** tienen `enriched_data.datos_geograficos.admin_nivel_2 = "Lisboa"` residual de una pasada IA antigua que confundió la freguesia/distrito "Madalena" con Lisboa. P2 limpió `locations.zone_id` y `locations.zone` pero **no tocó `enriched_data` (regla P2: no re-enrich)**.

---

## 2. Diagnóstico raíz

### 2.1 Causa: fallback en `getLocationHierarchy`

`src/shared/geography/hierarchy.ts:98`:

```ts
zone: norm(loc.zoneResolved ?? loc.zone ?? gd?.admin_nivel_2),
```

Orden de precedencia: **FK SoT → legacy texto → enriched_data**. Para Açores los dos primeros son NULL ⇒ cae al tercero (`gd?.admin_nivel_2`).

Resultado: GeographyTree recibe `zone = "Lisboa"` para los 14 Madalena, mismo string que la región peninsular Lisboa ⇒ se renderiza como hermano de `(sin provincia)` dentro de Açores.

### 2.2 Causa secundaria: canon territorial PT no expresa excepción insular

`TERRITORIAL_CANON.PT` declara `hasProvincia: true` (correcto para PT continental). El collapse de zone en `collapseZoneForCountriesWithoutProvincia` opera **a nivel país**, no región. Por tanto:

- PT continental con `hasProvincia: true` ⇒ GeographyTree espera nivel zone.
- PT insular (PT-20, PT-30) con `hasProvincia: true` heredado ⇒ GeographyTree también espera nivel zone, y cuando `zoneResolved` es NULL muestra placeholder `(sin provincia)` o, peor, el fallback `enriched_data.admin_nivel_2` espurio.

El canon territorial **no soporta hoy `provincePolicy` por región**. La excepción insular fue aplicada sólo a nivel data (P2 vacía `zone_id`), pero la UI sigue tratando PT-20/PT-30 como con-provincia.

### 2.3 Reporte visual reconciliado

- **Açores 29 > Lisboa 14**: 14 Madalena con `admin_nivel_2='Lisboa'` legacy en `enriched_data`. Bug UI (fallback enriched_data sobrevive a P2).
- **Açores 29 > (sin provincia) 15**: 15 POIs Açores restantes con `admin_nivel_2` NULL/vacío en `enriched_data` ⇒ placeholder canónico. Bug UI (no debería existir nivel zone para PT-20).
- **Madeira 11 > (sin provincia) 11**: Madeira sin contaminación enriched_data ⇒ todos al placeholder. Mismo bug UI estructural.
- **(sin región) 2 > Oporto 1 + (sin provincia) 1**: corresponde a Bolhão (zone="Oporto" legacy) + Braga Parque (zone="Braga" legacy, agrupado distinto) + Graciosa (no contado visual). Es deuda real distinta: 3 POIs con `region_id = placeholder (sin región)`.

---

## 3. Análisis de los 3 POIs `(sin región)`

| id (corto) | name                            | tipo de deuda                                                                                                  |
| ---------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `07980212` | A Pérola do Bolhão              | **No bbox-only**. Coordenadas en Oporto (PT-01 Norte). Falta reasignación de `region_id` desde admin3 textual. |
| `1a5bd7b3` | Parque Municipal de Braga       | **No bbox-only**. Coordenadas en Braga (PT-01 Norte). Igual que el anterior.                                   |
| `44da2def` | Santa Cruz da Graciosa Bullring | **Açores P2 incompleto**. El concelho `86796379` (Santa Cruz da Graciosa) no fue incluido en los 15 isla del lote P2. |

- Los dos primeros son candidatos a `T2.3-L1-PT-pre` (parent-chain por zone_id existente) o al sub-lote L1-PT-coords (Nominatim).
- El tercero indica que el listado de concelhos isla del dry-run P2 dejó fuera al menos Santa Cruz da Graciosa.

---

## 4. Contrato territorial — opciones de extensión

### Opción A (preferida): extender `CountryCanon` con excepciones por región

```ts
export interface CountryCanon {
  ...
  /** Regiones cuyo nivel zone se omite aunque hasProvincia=true. */
  readonly regionsWithoutProvincia?: ReadonlyArray<string /* iso_code */>;
}

PT: {
  hasProvincia: true,
  regionsWithoutProvincia: ['PT-20', 'PT-30'],
  ...
}
```

`getLocationHierarchy`: si `region` está en `regionsWithoutProvincia` ⇒ forzar `zone = undefined` **antes** del fallback `gd?.admin_nivel_2`.

`GeographyTree.collapseZoneForCountriesWithoutProvincia`: nuevo paso paralelo que recorre regiones y, si la región está en la lista, promueve nietos a hijos.

Ventajas:
- Data-driven, sin hardcode UI.
- Reutilizable para futuras regiones insulares (ES Canarias/Baleares ya están en `regionEqZoneWhitelist`, no es el mismo caso, pero el patrón sirve).
- Evita re-enrich masivo: el fallback `gd?.admin_nivel_2` queda neutralizado por canon, sin necesidad de tocar `enriched_data`.

### Opción B: limpiar `enriched_data.datos_geograficos.admin_nivel_2` para los 14 Madalena

Reescribir a NULL los 14 valores `"Lisboa"` legacy. No resuelve el problema estructural: Madeira seguiría mostrando `(sin provincia) 11`, y cualquier POI insular futuro lo reintroduce.

### Opción C: eliminar el fallback `gd?.admin_nivel_2` global

Riesgo alto: muchos POIs sin FK resolved dependen del fallback enriched para mostrar región/zone. Rompe Geo tree de países sin pipeline FK completo.

**Recomendación: Opción A + saneamiento opcional del 14 Madalena para evitar deuda zombie en futuras consultas SQL/export.**

---

## 5. Propuestas de corrección (no ejecutadas)

### T-CATALOG-PT-RA-CANON-1 (UI/contract)
1. Añadir `regionsWithoutProvincia: ['PT-20','PT-30']` a `TERRITORIAL_CANON.PT` (cliente + espejo Deno).
2. `getLocationHierarchy`: si `iso_code` de la región resuelta ∈ regionsWithoutProvincia ⇒ `raw.zone = undefined` antes del retorno.
3. `collapseZoneForCountriesWithoutProvincia`: extender para colapsar a nivel región.
4. Tests:
   - `territorial-canon-pt-insular-collapse.test.ts`
   - `geography-tree-pt-acores-no-zone.test.ts` (debe assert que Açores no tiene hijos de tipo `zone`).
5. Documentar en `docs/contracts/territorial-equivalence-canon.md` §X la excepción regional.

> Requiere conocer `iso_code` de la región en el contexto cliente. Hoy `loc.regionResolved` es texto. Necesita una vía: o bien añadir `region_iso_code` a `v_locations_resolved`, o bien lookup textual `Açores|Madeira` → flag.

### T-CATALOG-PT-RA-CONCELHOS-P2-ADDENDUM
- Incluir Santa Cruz da Graciosa (admin3 `86796379…`) en el grupo Açores: reparent d=? → d=3 bajo PT-20, mover el POI `44da2def` (region_id PT-20, zone_id NULL, admin3 promovido).
- Snapshot + rollback documentado.

### T2.3-L1-PT-pre-ADDENDUM (Bolhão + Braga Parque)
- Bolhão: `zone_id = da6059a5 (Oporto)` ya conocido. Derivar `region_id = PT-01 Norte` por parent-chain del zone_id.
- Braga Parque: `zone_id = 55b38c31 (Braga)` ya conocido. Derivar `region_id = PT-01 Norte` por parent-chain.
- Ambos preservan zone_id (PT continental con provincia).

### Saneamiento `enriched_data` (opcional, sub-lote separado)
- Limpiar `datos_geograficos.admin_nivel_2 = 'Lisboa'` para los 14 Madalena.
- Sub-lote independiente con dry-run previo. No bloqueante si se aplica Opción A.

---

## 6. Riesgos

- Modificar `getLocationHierarchy` afecta a TODOS los consumidores (FilterBar, popups, breadcrumbs, parsers de import indirectos). Requiere full test pass.
- Si la región resuelta llega como texto (`"Açores"` vs `"Azores"`) y no como `iso_code`, el matching necesita normalización tolerante a alias.
- El espejo Deno (`supabase/functions/_shared/territorial-canon.ts`) debe mantenerse en paridad — contract test `territorial-canon-parity` debe extenderse.
- Cambiar canon no resuelve los 3 POIs `(sin región)` ni Santa Cruz da Graciosa.

---

## 7. Conclusión

P2 cumplió su contrato a nivel DB (zone_id NULL en 40 POIs insulares). La regresión visual se debe a:

1. **Bug UI residual**: `getLocationHierarchy` cae al fallback `enriched_data.admin_nivel_2`, exponiendo legacy contaminado ("Lisboa 14"). No es un fallo de P2 — es un fallback existente que P2 no neutralizó porque P2 no podía tocar `enriched_data`.
2. **Falta de contrato**: `TERRITORIAL_CANON` no expresa la excepción insular PT-20/PT-30. La corrección estructural correcta es extender el canon (Opción A).
3. **Sub-lote P2 incompleto**: al menos un concelho insular (Santa Cruz da Graciosa) quedó fuera y arrastra al POI a `(sin región)`.
4. **Deuda independiente**: 2 POIs continentales (Bolhão, Braga Parque) sin region_id resuelto pendientes de L1-PT-pre.

**Sin cambios aplicados en este audit.** Pendiente ratificación para abrir los tickets T-CATALOG-PT-RA-CANON-1, T-CATALOG-PT-RA-CONCELHOS-P2-ADDENDUM y T2.3-L1-PT-pre-ADDENDUM.
