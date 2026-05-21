# T2A-wire — Plan: cablear el canon territorial global

**Fecha:** 2026-05-21 UTC
**Tipo:** Plan. **Sin** código, **sin** datos, **sin** migraciones, **sin** bump.
**Fase:** T2.1 / T2A-wire — paso final del piloto Portugal.
**Referencias:**
- [`docs/contracts/territorial-equivalence-canon.md`](../contracts/territorial-equivalence-canon.md) §1, §4, §5, §7.
- [`src/shared/geography/territorial-canon.ts`](../../src/shared/geography/territorial-canon.ts) (mirror TS, v1.3.13).
- [`supabase/functions/_shared/territorial-canon.ts`](../../supabase/functions/_shared/territorial-canon.ts) (mirror Deno).
- [`docs/audits/t2a-portugal-pilot-postflight.md`](./t2a-portugal-pilot-postflight.md) (datos PT migrados).
- [`docs/audits/t2-territorial-canon-application-plan.md`](./t2-territorial-canon-application-plan.md) §1.2–§1.4.

---

## 0. TL;DR

Cablear cuatro consumidores para que consulten `TERRITORIAL_CANON[iso2]` en lugar de aplicar la jerarquía territorial de forma agnóstica:

1. **`resolveAllFks`** (cliente + edge): aplica reglas §5 antes de asignar `zone_id`/`admin3_id`/`locality_id`. Emite warnings cuando `region==zone` fuera de whitelist.
2. **`getLocationHierarchy` + `GeographyTree`**: omite el nivel "Provincia" cuando `hasProvincia=false`, colapsa `region==zone` legítimo, silencia placeholders.
3. **Parsers de import** (KML/GPX/GeoJSON/CSV/web_import/manual): no pueblan `zone` en países `hasProvincia=false`; no inventan niveles inexistentes; fallback textual sólo temporal.
4. **Tests**: 6 contract tests nuevos + endurecimiento del lint anti-hardcode existente.

Sin remapeo de datos, sin re-enrich, sin migraciones, sin tocar POI-N, sin nuevos backfills. PT ya cumple las reglas (categoría A) — el cableado no cambia su comportamiento, pero sí lo blinda para el resto del catálogo (39 países).

**Version impact:** `patch` (1.3.13 → 1.3.14).

---

## 1. Archivos a tocar

### 1.1 Núcleo (lectura/escritura)

| Archivo | Tipo de cambio | Notas |
|---|---|---|
| `src/shared/geography/resolve-admin-fks.ts` | edit | Consume `getCountryCanon` antes de cada asignación FK. |
| `supabase/functions/_shared/resolve-admin-fks.ts` *(si existe; sino: cualquier edge que llame al resolver)* | edit | Espejo Deno del mismo cableado. **Verificar primero** que existe; si no, la responsabilidad queda en el resolver cliente + edge que reciba payload sanitizado. |
| `src/shared/geography/hierarchy.ts` | edit | `getLocationHierarchy` colapsa zone si `!hasProvincia(iso2)` o si `isRegionEqZoneLegit`. |
| `src/components/filters/GeographyTree.tsx` | edit | No renderiza nodos `(sin …)` como nodo real; oculta el sub-árbol Provincia para países `hasProvincia=false`. |

### 1.2 Imports / parsers

| Archivo | Tipo de cambio | Notas |
|---|---|---|
| `src/shared/import/canon-validator.ts` *(NUEVO)* | create | Helper único `applyCanonToParsed(parsed, iso2)`. Llamado por todos los parsers tras geocode/best-guess. |
| `src/lib/kml-parser.ts` | edit | Hook al validator antes de devolver POIs. |
| `src/lib/kmz-parser.ts` | edit | idem. |
| `src/lib/gpx-parser.ts` | edit | idem. |
| `src/lib/geojson-parser.ts` | edit | idem. |
| `src/lib/csv-parser.ts` | edit | idem. |
| `src/lib/parsers/shared.ts` | edit | Punto único de hook si la convergencia es por aquí (preferido). |
| `supabase/functions/scrape-atlas-obscura/index.ts` | edit | `web_import` aplica validator antes de upsert. |
| `supabase/functions/enrich-location/index.ts` *(si escribe FKs)* | edit (defensivo) | Si el enrich completa `zone`, respeta canon. Sólo si aplica. |

### 1.3 Tests (nuevos)

| Archivo | Cobertura |
|---|---|
| `src/test/territorial-canon-wire-resolver.test.ts` | Reglas §5 en `resolveAllFks`. |
| `src/test/territorial-canon-wire-hierarchy.test.ts` | `getLocationHierarchy` omite/colapsa según canon. |
| `src/test/territorial-canon-wire-geography-tree.test.ts` | `GeographyTree` no muestra Provincia ni placeholders. |
| `src/test/territorial-canon-wire-imports.test.ts` | Parsers descartan `zone` en países `hasProvincia=false`. |
| `src/test/territorial-canon-wire-region-eq-zone.test.ts` | Whitelist permite; fuera de whitelist marca `geo_health.review`. |
| `src/test/territorial-canon-no-hardcode.test.ts` | **Existe ya** — extender scope a `src/lib/parsers/**` y `src/components/filters/GeographyTree.tsx`. |

### 1.4 Maintenance

| Archivo | Cambio |
|---|---|
| `docs/tech-debt.md` | Marcar T2A-wire DONE; abrir entrada T2.2 (otros países sin provincia). |
| `package.json` | Bump `1.3.13 → 1.3.14`. |

---

## 2. Cambios exactos por archivo

### 2.1 `resolve-admin-fks.ts`

Pseudo-cableado:

```ts
import { getCountryCanon, hasProvincia, getMunicipioField, allowsRegionEqualsZone }
  from '@/shared/geography/territorial-canon';

function resolveAllFks(input: GeocodeBestGuess): ResolvedFks {
  const canon = getCountryCanon(input.iso2); // null si país desconocido → fallback agnóstico actual

  // 1. zone_id sólo si el país tiene provincia
  let zoneId = input.zoneCandidateId;
  if (canon && !canon.hasProvincia) {
    zoneId = null; // país sin provincia: nunca poblar zone_id
  }

  // 2. municipio → admin3_id vs locality_id
  let admin3Id = input.admin3CandidateId;
  let localityId = input.localityCandidateId;
  if (canon?.municipioField === 'locality') {
    // El municipio aterriza en locality. No forzar admin3.
    localityId = localityId ?? input.admin3CandidateId;
    admin3Id = null;
  }

  // 3. region==zone: permitir sólo si whitelist
  if (zoneId && zoneId === input.regionCandidateId) {
    const ok = canon
      ? allowsRegionEqualsZone(canon.iso2, input.regionName ?? '')
      : false;
    if (!ok) {
      // No duplicar: zone se descarta, geo_health.review marca el caso
      zoneId = null;
      review.push('zone-equals-region-unlisted');
    }
  }

  return { regionId, zoneId, admin3Id, localityId, review };
}
```

**Reglas duras:**
- `hasProvincia=false` ⇒ `zone_id` SIEMPRE NULL.
- `municipioField='locality'` ⇒ `admin3_id` SIEMPRE NULL; el id del municipio se enruta a `locality_id`.
- `region==zone` sin whitelist ⇒ `zone_id=NULL` + `geo_health.review='zone-equals-region-unlisted'`. Nunca crear duplicado.
- País desconocido ⇒ comportamiento legacy (fallback agnóstico). No bloquea.

### 2.2 `hierarchy.ts` (`getLocationHierarchy`)

```ts
const canon = getCountryCanon(loc.country_code);

// Omitir Provincia en países sin provincia
if (canon && !canon.hasProvincia) {
  hierarchy.zone = null;        // No emitir nivel
}

// Colapsar region==zone legítimo
if (
  canon &&
  hierarchy.region &&
  hierarchy.zone &&
  hierarchy.region === hierarchy.zone &&
  allowsRegionEqualsZone(canon.iso2, hierarchy.region)
) {
  hierarchy.zone = null;        // 1 nivel etiquetado región
  hierarchy.regionEqualsZoneCollapsed = true;
}

// SoT textual: *Resolved primero (T1-fix ya implementado)
// Placeholders no entran como nivel real
if (/^\(sin /i.test(hierarchy.zone ?? '')) hierarchy.zone = null;
if (/^\(sin /i.test(hierarchy.region ?? '')) hierarchy.region = null;
```

### 2.3 `GeographyTree.tsx`

- Antes de renderizar el sub-árbol Provincia, consultar `hasProvincia(iso2)` del nodo país. Si `false` ⇒ saltar nivel (los hijos suben un grado).
- Si un nodo tiene `name.startsWith('(sin ')` y `count===0` ⇒ no renderizar (ya es invariante T1, formalizar aquí).
- Si `region==zone` colapsado, render etiqueta única con tooltip "Región uniprovincial".

### 2.4 `canon-validator.ts` (NUEVO)

```ts
export function applyCanonToParsed(p: ParsedPoi, iso2?: string): ParsedPoi {
  const canon = iso2 ? getCountryCanon(iso2) : null;
  if (!canon) return p;

  // hasProvincia=false → no inventar zone
  if (!canon.hasProvincia) {
    p.zoneText = null;
    p.zoneId = null;
  }
  // municipioField='locality' → el municipio textual del KML va a locality
  if (canon.municipioField === 'locality' && p.admin3Text && !p.localityText) {
    p.localityText = p.admin3Text;
    p.admin3Text = null;
  }
  return p;
}
```

Llamado por cada parser inmediatamente antes de devolver el batch al `import.service`.

### 2.5 Lint anti-hardcode

Extender el test ya creado para scanear:
- `src/shared/geography/**`
- `src/components/filters/GeographyTree.tsx`
- `src/lib/parsers/**`
- `src/lib/*-parser.ts`
- `src/shared/import/**`
- `supabase/functions/_shared/**`

Patrón prohibido: literal `country === '<ISO2>'` o `country === '<Name>'` para cualquier país del canon, salvo en `territorial-canon.ts` y `src/test/**`.

---

## 3. Tests (detalle)

| Test | Caso | Esperado |
|---|---|---|
| **wire-resolver** | `iso2='SE'` (hasProvincia=false), input con zone candidate | `zoneId=null` |
| **wire-resolver** | `iso2='CL'` (municipioField=`locality`), input con admin3 candidate | `admin3Id=null`, `localityId=<id>` |
| **wire-resolver** | `iso2='DE'`, `region==zone`, region `Berlin` | `zoneId` mantenido (whitelist OK) |
| **wire-resolver** | `iso2='FR'`, `region==zone`, region `Île-de-France` | `zoneId=null`, review `zone-equals-region-unlisted` |
| **wire-resolver** | `iso2='XX'` (desconocido) | fallback legacy, sin throw |
| **wire-hierarchy** | `iso2='AU'` (hasProvincia=false) | `hierarchy.zone === null` |
| **wire-hierarchy** | `iso2='AR'`, region/zone = `CABA` | colapso `regionEqualsZoneCollapsed=true` |
| **wire-hierarchy** | nombre `(sin región)` en zone | no se emite como nivel |
| **wire-geography-tree** | snapshot SE con POIs | árbol no muestra nivel Provincia |
| **wire-geography-tree** | nodo `(sin …) count=0` | no se renderiza |
| **wire-imports** | KML con `<Region>` en JP (hasProvincia=false) | `parsed.zoneText===null` |
| **wire-imports** | CSV con columna `admin3` en BR | enruta a `localityText` |
| **wire-region-eq-zone** | tabla parametrizada por whitelist | cada par país/region pasa/falla según canon |
| **no-hardcode (extendido)** | grep `=== 'PT'` en parsers nuevos | falla CI |

Cobertura objetivo: 100% de las ramas de `applyCanonToParsed` y de las 3 reglas §5 del resolver.

---

## 4. Riesgos y mitigaciones

| # | Riesgo | Prob. | Mitigación |
|---|---|:-:|---|
| R1 | País desconocido (`iso2` fuera de los 39) cae en fallback agnóstico y revive comportamiento legacy | media | Diseño explícito. Log estructurado `canon-unknown-iso2` cuenta ocurrencias para priorizar ampliación. |
| R2 | KML/GPX legacy ya importados con `zone` poblado en países `hasProvincia=false` | alta (no nueva) | T2A-wire NO toca datos. Esos POIs quedan con zone hasta T2.2 (backfill por país). Documentar deuda. |
| R3 | `geo_health.review` se llena de `zone-equals-region-unlisted` por geocoder ruidoso | media | El review entra en `partial`, no en `hardError`. POI-N no degrada (regla `enriched + ok = sano`). Visible en panel admin. |
| R4 | `GeographyTree` cambia visualmente para países no-PT que ya estaban "OK" | baja | Países `hasProvincia=true` no ven cambios (la rama Provincia se renderiza igual). Sólo afecta SE/NO/FI/NL/BR/AU/JP/MX/CO. |
| R5 | Parser-validator pisa datos correctos cuando el usuario manualmente metió zone válido | baja | Aplicar SÓLO si `iso2` está en canon. País desconocido = no-op. Para hasProvincia=false el descarte es regla §1 dura, no opinable. |
| R6 | Hardcode introducido por error | media | Lint extendido §2.5 + revisión PR. |
| R7 | Drift TS ↔ Deno mirror | baja | Contract test `parity` ya en CI. Cualquier edit toca ambos espejos en el mismo PR. |

---

## 5. Orden de ejecución

Sub-fases atómicas, cada una en su PR si conviene, todas bajo el mismo bump patch:

1. **T2A-wire-1 (resolver):** editar `resolve-admin-fks.ts` (+ espejo Deno si aplica). Test `wire-resolver` + `wire-region-eq-zone`. **No** tocar parsers ni UI.
2. **T2A-wire-2 (hierarchy):** editar `hierarchy.ts`. Test `wire-hierarchy`. UI consume el cambio sin tocar componente.
3. **T2A-wire-3 (GeographyTree):** editar `GeographyTree.tsx`. Test `wire-geography-tree` (snapshot + interacción).
4. **T2A-wire-4 (imports):** crear `canon-validator.ts`, cablear en `parsers/shared.ts` (preferido) o en cada parser. Test `wire-imports`.
5. **T2A-wire-5 (lint + docs):** extender `no-hardcode` test, actualizar `docs/tech-debt.md`, bump a `1.3.14`.

Cada paso compila y testea en verde antes del siguiente. Roll-forward only.

---

## 6. Rollback

- **Por sub-fase:** `git revert` del PR específico. Cero impacto en datos (T2A-wire no escribe a BD).
- **Kill-switch runtime (opcional, recomendado):** flag `app_settings.feature.territorial_canon_enforcement` (boolean, default `true`). Si `false` ⇒ resolver/hierarchy/parsers usan rama legacy. Permite apagar sin revert ante regresión visible.
  - Coste: 1 lectura `app_settings` en boot (ya cacheada).
  - Beneficio: rollback sin migración.
- **Sin rollback de datos.** T2A-wire no modifica registros.

---

## 7. Version impact

| Componente | Versión actual | Tras T2A-wire | Tipo |
|---|---|---|---|
| `package.json` | 1.3.13 | **1.3.14** | patch |
| Mirror canon TS/Deno | sin cambio (sólo consumidores) | sin cambio | — |
| Schema BD | sin cambio | sin cambio | — |
| RLS / policies | sin cambio | sin cambio | — |

Justificación patch: cambio interno data-driven, sin nueva feature visible para el usuario final salvo la corrección del árbol territorial en países sin provincia (mejora UX, no breaking).

---

## 8. Fuera de alcance (explícito)

- **No remapear datos** (otros países). Esa es **T2.2 (data-otros)** y se planifica por separado.
- **No re-enrich**. `enriched_data.*` intacto.
- **No migraciones**. Schema intacto.
- **No POI-N**. `geo_health` puede ganar reviews `zone-equals-region-unlisted` para POIs nuevos importados, pero **no** se recomputa el bucket de existentes.
- **No nuevos backfills**. Sin job batch en este lote.
- **No otros países** del PDF en data. Sólo Portugal (ya hecho en T2A-data) consume el cableado en producción inmediata; el resto del catálogo se blinda para imports/edits futuros.

---

## 9. Criterios de aprobación

- [ ] Confirmación de que la rama `region==zone` fuera de whitelist debe **descartar** `zone_id` (vs. mantenerlo con flag review). Plan asume descartar.
- [ ] Confirmación del flag `app_settings.feature.territorial_canon_enforcement` como kill-switch (vs. revert puro).
- [ ] Confirmación de que `parsers/shared.ts` es el punto único de cableado (vs. cada parser individualmente).
- [ ] Confirmación de bump patch (vs. minor por cambio de comportamiento de UI en países sin provincia).

---

## 10. Restricciones respetadas

- Solo escritura de este documento.
- Sin código, sin datos, sin migraciones, sin bump.
- Sin `if country === '<X>'` propuesto — todo va por lookup ISO2 uniforme.
- Plan autocontenido y ejecutable en 5 sub-fases pequeñas.
