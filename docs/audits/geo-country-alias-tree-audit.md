# Auditoría — Duplicados de país en GeographyTree por alias/canonical name

Fecha: 2026-05-21
Scope: GeographyTree (sidebar filtros). Causa de "Espana 3" y "Spain 1306" como
nodos separados, y de "(sin país) 2".
Modo: read-only. NO UPDATE. NO código. NO bump.

---

## 1. Hallazgos en BD

### 1.1 Variantes textuales del país España

| `country` (texto) | `country_code` | `country_id`                            | nº POIs |
|---|---|---|---|
| `Espana` (sin tilde) | `ES` | **NULL** | **3** |
| `España` (con tilde) | `ES` | `3208c966-e90c-4be7-a783-91f64d8e3281` | 1306 |

#### IDs de los 3 "Espana"
- `1555901f-dd34-4096-a515-ea34c703edfb` — `beta-partial-1`
- `a2b185ee-ce9d-4b27-86b9-c7b77b7c2c8b` — `beta-partial-2`
- `2990233a-715b-4eb7-83b3-207fa368a89c` — `beta-partial-3`

Los tres son fixtures sintéticos (`beta-partial-*`). Tienen `country_code='ES'`
correcto pero `country_id` sin resolver. La FK al catálogo
(`admin_areas.id = 3208c966-…`) no fue cableada en su creación.

### 1.2 Los 2 "(sin país)"

| id | name | country | country_code | country_id | region_id |
|---|---|---|---|---|---|
| `f04b3b95-7308-4b74-b3c7-e2e000000001` | `E2E Fixture — Imported POI` | NULL | NULL | NULL | NULL |
| `f04b3b95-7308-4b74-b3c7-e2e000000002` | `E2E Fixture — Empty POI` | NULL | NULL | NULL | NULL |

Son fixtures E2E del sandbox-agent. NO tienen ni texto legacy ni FK ni iso2.
Caen legítimamente en el bucket `(sin país)` — placeholder canónico
(`LEVEL_PLACEHOLDER_LABELS.country`). No es un bug del árbol; es ausencia real
de dato.

---

## 2. Causa exacta de la duplicidad Espana ↔ Spain

Ruta del valor en el árbol (`src/shared/geography/hierarchy.ts:96`):

```ts
country: canonicalCountry(
  norm(loc.countryResolved ?? loc.country ?? gd?.pais)
)
```

Y `canonicalCountry` (`src/shared/geography/canonical-names.ts:72`) hace:

```ts
return COUNTRY_ALIASES[t] ?? t;
```

El mapa `COUNTRY_ALIASES` solo incluye **"España"** (con tilde). **"Espana"**
(sin tilde) NO está mapeado, por lo que pasa intacto como nodo "Espana"
distinto de "Spain".

Además, el resolver NUNCA consulta `country_code` ni `country_id` para
canonicalizar el label. La identidad del nodo país se calcula 100% desde
texto:

1. `loc.countryResolved` (texto del catálogo, ya canónico en inglés cuando hay FK)
2. `loc.country` (texto legacy)
3. `gd?.pais` (texto del enrich IA)

Para los 3 `beta-partial-*`, `country_id` es NULL ⇒ `countryResolved` es
undefined ⇒ cae al fallback `loc.country = "Espana"` ⇒ no hay alias ⇒
nodo "Espana" separado.

Este es el mismo patrón que **Europa/Europe** ya corregido (commit previo de
T1) — pero allí el fix se aplicó solo a `CONTINENT_ALIASES`. La regla
equivalente para country NO se completó (faltan variantes sin diacríticos).

### Confirmación: el árbol agrupa por LABEL textual

`groupLocationsByHierarchy` (`hierarchy.ts:209`) inserta nodos por
`value = h[lv] ?? UNCLASSIFIED_VALUE`. El `value` es el string devuelto por
`getLocationHierarchy`. NO hay clave alternativa por `country_id`/iso2.
Dos labels distintos ⇒ dos nodos distintos. Sin excepción.

---

## 3. Propuesta de fix mínimo (no aplicada)

### Fix A — Inmediato, 1 línea (resuelve el síntoma exacto)

Añadir variantes sin diacríticos al `COUNTRY_ALIASES` en
`src/shared/geography/canonical-names.ts`:

```ts
'Espana': 'Spain',          // alias ASCII de España
'Francia ': 'France',       // (no necesario, ya cubierto por trim)
// y por consistencia futura:
'Marruecos ': 'Morocco',
'Belgica':   'Belgium',
'Peru':      'Peru',        // si aparece
// …
```

- Coste: 1-3 líneas.
- Impacto: los 3 `beta-partial-*` se fusionan con el bucket "Spain" (1309).
- Riesgo: nulo (mapa append-only, sin colisiones).
- NO toca POI-N, NO toca datos, NO bump.

### Fix B — Canónico de medio plazo (recomendado tras Fix A)

`getLocationHierarchy` debe preferir identidad estructural (FK / iso2) sobre
texto cuando estén disponibles:

1. Exponer `countryCode` (iso2) y `countryId` en `GeoLocation`
   (`src/types/location.ts`) — hoy no están.
2. En `hierarchy.ts:96`, si `loc.countryCode` existe, resolver el label
   canónico por iso2 → nombre EN vía un mapa `ISO2_TO_CANONICAL_NAME`
   (derivado de `country-iso.ts` invertido). Texto solo como fallback.

Resultado: cualquier POI con `country_code='ES'` o `country_id` poblado
muestra "Spain" sin depender del texto. Inmuniza contra futuras variantes
ortográficas/idioma.

- Coste: ~20 líneas + un test.
- NO toca datos, NO toca POI-N.

### Fix C — Cobertura "Espana" en BD (NO recomendado ahora)

Renombrar `country='Espana'` → `'España'` en los 3 POIs. Descartado: viola
el principio "no UPDATE en auditoría" y no resuelve el problema estructural
(seguiríamos vulnerables al próximo alias). Fix A+B lo cubre sin tocar fila.

---

## 4. Sobre "(sin país) 2"

NO es bug. Es ausencia real de dato (`country IS NULL AND country_code IS NULL
AND country_id IS NULL`) en 2 fixtures E2E del sandbox. El placeholder
"(sin país)" funciona como debe. Si se quisiera ocultarlos del árbol global,
el camino canónico es la regla de visibilidad del sandbox-agent ya existente
(no tocar el árbol).

---

## 5. Aislamiento — confirmación

El fix mínimo (A) y el canónico (B) viven en:

- `src/shared/geography/canonical-names.ts` (mapa de alias)
- `src/shared/geography/hierarchy.ts` (resolver — solo lectura de FK/iso2)
- `src/types/location.ts` (exposición de campos ya existentes en BD)

NO requiere:
- ❌ tocar POI-N (los 3 `beta-partial-*` mantienen `country='Espana'` y
  `country_id=NULL` en BD; el fix actúa en presentación).
- ❌ migración SQL.
- ❌ re-enrich.
- ❌ cambios en `name`, `lat/lng`, `raw_geocode`, `enriched_data`, `tags`,
  colecciones, media.
- ❌ bump (cambio de presentación/cliente, no afecta contrato de datos).

---

## 6. Tickets abiertos por esta auditoría

- **T-GEO-ALIAS-1** — aplicar Fix A (1 línea: `'Espana': 'Spain'`) +
  ampliar mapa con variantes ASCII comunes.
- **T-GEO-ALIAS-2** — aplicar Fix B (resolver por iso2/country_id antes que
  texto, exponer campos en `GeoLocation`).
- **T-GEO-FK-BACKFILL** (opcional, futuro) — backfill de `country_id` para
  los 3 `beta-partial-*` usando `country_code='ES'` → `admin_areas.id`. No
  es prerequisito de los anteriores.

Sin acción de código en este pase.
