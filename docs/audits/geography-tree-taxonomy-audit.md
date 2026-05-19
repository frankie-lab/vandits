# Auditoría del árbol geográfico — Portugal vs España

**Tipo:** docs-only · **Version impact:** none · **tests/lint not run:** docs-only tree audit.

No se han tocado datos, Supabase, edge functions, código runtime, `package.json`, `README.md` ni versión. Lecturas read-only sobre `locations` (Cloud).

---

## 1. Pregunta de partida

Por qué el panel **Buscar y Filtrar** muestra:

- `Portugal → Región Norte: 2`
- `Portugal → (sin región): 247`
- `Spain → Galicia → provincias/comarcas`
- `Spain` con nodos `(sin comarca)`

…cuando ambos países usan el mismo pipeline de enriquecimiento.

---

## 2. Campos que usa el árbol

Helper único: `getLocationHierarchy(loc)` en `src/shared/geography/hierarchy.ts`. Lee, en orden:

| Nivel del árbol | Fuente primaria (columna) | Fallback (`enriched_data.datos_geograficos`) | Normalización runtime |
|---|---|---|---|
| continent | `loc.continent` | `…continente` → `continentLabelFromCoords(lat,lng)` | `canonicalContinent` (ES→EN) |
| country | `loc.country` | `…pais` | `canonicalCountry` (`España→Spain`, `Francia→France`, …). **`Portugal→Portugal` sin alias** |
| region | `loc.region` | `…admin_nivel_1` | ninguna |
| zone (provincia) | `loc.zone` | `…admin_nivel_2` | ninguna |
| admin_level_3 (comarca) | `loc.comarca` | `…admin_nivel_3` | ninguna |
| locality | `loc.localidad` | `…localidad` | ninguna |

Placeholders `(sin región)`/`(sin provincia)`/`(sin comarca)` se neutralizan a `undefined` por `isPlaceholderValue` antes de renderizar → todos caen en un único bucket "(sin …)".

**Campos del enriquecimiento IA:** `enriched_data.descripcion`, `enriched_data.datos_geograficos.{continente, pais, admin_nivel_1, admin_nivel_2, admin_nivel_3, localidad, sublocalidad}`. La edge `enrich-location` también backfillea las columnas `region`/`zone`/`comarca`/`localidad`.

**Campos del importador:** `country`, `region`, `zone` desde KML/CSV/GPX cuando vienen. `geo_source` queda vacío hasta que pasa por Nominatim.

---

## 3. Datos crudos

### 3.1 Cobertura jerárquica

| country | total | `region` poblado | `zone` poblado | `ed.admin_nivel_1` | `ed.admin_nivel_2` | `ed.admin_nivel_3` | enriched (`ed.descripcion`) |
|---|---|---|---|---|---|---|---|
| España | 1.497 | 1.314 (88 %) | 1.314 | 1.291 | 1.291 | 1.258 | 1.491 |
| Portugal | 315 | 249 (79 %) | 249 | 248 | 248 | 244 | 314 |
| Espana (alias) | 3 | 3 | 3 | 0 | 0 | 0 | 3 |

### 3.2 Distribución de `region` en Portugal

| region | count |
|---|---|
| `(sin región)` (literal) | 247 |
| NULL / vacío | 66 |
| `Región Norte` | 2 |

→ De los **314 POIs PT enriquecidos**, **246 tienen `region = "(sin región)"` literal**, 66 NULL y sólo **2** con valor real (`Región Norte`, naming no canónico).

### 3.3 Distribución de `region` en España (top)

Castilla y León 178 · Andalucía 162 · Cataluña 155 · Madrid 112 · Valenciana 93 · Galicia 91 · Aragón 87 · Castilla-La Mancha 80 · Canarias 71 · Asturias 59 · Extremadura 50 · Baleares 49 · Cantabria 39 · País Vasco 29 · Navarra 21 · Murcia 20 · La Rioja 17 · Melilla 1 · **183 con `region` vacía** (todos enriquecidos, IA dejó `admin_nivel_1` NULL).

### 3.4 Muestra `enriched_data.datos_geograficos` en POIs PT enriquecidos

```
LxFactory (Lisboa)
  admin_nivel_1: "(sin región)"
  admin_nivel_2: "Lisboa"
  admin_nivel_3: "(sin provincia)"
  localidad:      "Lisboa"

Jardín del Palacio de Estoi (Faro)
  admin_nivel_1: "(sin región)"
  admin_nivel_2: "Faro"
  admin_nivel_3: "(sin provincia)"
```

→ La edge `enrich-location` **escribe el literal `(sin región)` también dentro del JSON `enriched_data.datos_geograficos.admin_nivel_1`**, no sólo en la columna. El runtime lo neutraliza, pero el dato persistido es un sentinel.

### 3.5 Origen geográfico (`geo_source`)

| country | nominatim | vacío |
|---|---|---|
| España | 1.288 | 209 |
| Portugal | 247 | 68 |

Ambos pasan por Nominatim. Asimetría no es por canal de import.

---

## 4. Tabla de anomalías

| # | Nivel | Síntoma | Volumen | Causa probable | Impacto UI |
|---|---|---|---|---|---|
| A | region (PT) | `(sin región)` literal | 247 | Edge `enrich-location` escribe sentinel cuando IA/Nominatim no resuelve NUTS-II PT | bucket único bajo Portugal |
| B | region (PT) | NULL | 66 | POIs sin enriquecer (o IA dejó vacío) | mismo bucket "(sin región)" tras `isPlaceholderValue` |
| C | region (PT) | `Región Norte` | 2 | Falta diccionario canónico NUTS-II (forma esperada: `Norte`) | nodo huérfano |
| D | region (ES) | NULL en enriquecidos | 183 | IA dejó `admin_nivel_1` NULL (no escribió sentinel) | bucket `(sin región)` bajo Spain |
| E | zone (ES) | `(sin provincia)` literal | n | IA escribe sentinel cuando `admin_2 == nombre de comunidad` | provincia fantasma |
| F | admin_level_3 (ES) | `(sin comarca)` masivo | mayoría | Comarcas no resueltas | hoja artificial |
| G | country | `Espana` (3) y `España` (1.497) | 3 vs 1.497 | Falta alias `Espana → Spain` en `canonicalCountry` | rama separada de `Spain` |
| H | continent | `Europe/Europa`, `Africa/África` (auditoría previa) | 4 valores | Duplicados idiomáticos en BD | ya cubierto en `geography-taxonomy-audit.md` |

---

## 5. Causa raíz por caso

### 5.1 Por qué Portugal cae en `(sin región)`

1. La IA / Nominatim devuelve para PT el `admin_level=4` como **distrito** (Lisboa, Faro, Porto…), que la edge mapea a `admin_nivel_2`.
2. El equivalente NUTS-II (`Norte`, `Centro`, `Lisboa`, `Alentejo`, `Algarve`, `Madeira`, `Açores`) corresponde a `admin_level=6` en OSM, no se solicita ni se infiere.
3. Cuando `admin_nivel_1` queda vacío, **la edge escribe el literal `(sin región)`** en lugar de NULL, tanto en la columna `region` como en el JSON.
4. Resultado: 246/314 POIs PT enriquecidos sin región real y el árbol los agrupa en un único bucket.

### 5.2 Por qué España sí tiene Galicia / provincias / comarcas

1. Para ES, Nominatim devuelve `admin_level=4` = **comunidad autónoma** (mapea a `admin_nivel_1`) y `admin_level=6` = **provincia** (mapea a `admin_nivel_2`).
2. La IA conoce las 17 comunidades por nombre y rellena `admin_nivel_1` consistentemente (1.291/1.491 enriquecidos = 87 %).
3. Comarcas (`admin_nivel_3`) se rellenan a medias; cuando no, escribe `(sin comarca)`.

### 5.3 Aliases / normalización por país

| Concepto | Spain | Portugal |
|---|---|---|
| Alias country en `canonicalCountry` | Sí (`España→Spain`, `Espana→❌`) | No necesario |
| Alias region canónico | No (usa nombres ES tal cual) | **No existe** — falta NUTS-II PT |
| Sentinel cuando IA falla | `(sin región)` / `(sin provincia)` / `(sin comarca)` | Idem |

### 5.4 Mezcla idiomática visible

- `canonicalCountry` traduce `España → Spain` en runtime, pero **NO** toca `Portugal` (es el mismo nombre en ES/EN/PT).
- Resultado UI: rama `Spain` + rama `Portugal` (no `España` + `Portugal` ni `Spain` + `Portugal República`). Coherente con `admin_areas` pero rompe expectativa del usuario ES.
- Continente: `Europe/Europa` co-existen en BD (4 filas con `Europe`, 4.560 con `Europa`). Runtime las unifica vía `canonicalContinent`, pero queries SQL directas ven dos buckets.
- `Espana` (3 POIs) NO pasa por `canonicalCountry` y queda como rama tercera.

### 5.5 Enriquecidos con jerarquía vacía

- **PT:** 246 POIs enriquecidos con region literal `(sin región)` + 0 con region NULL pero admin_nivel_1 presente (la edge nunca deja columna vacía si tiene el dato).
- **ES:** 183 POIs enriquecidos con `region` NULL y `admin_nivel_1` NULL — agujero distinto, IA no devolvió comunidad. Requiere re-enrich o backfill manual.

---

## 6. Propuesta de normalización (NO se ejecuta en esta auditoría)

### Fase 1 — Limpieza visual no destructiva
- Añadir alias `Espana → Spain` a `canonicalCountry`.
- Documentar en `mem://geography/canonical-tree-spec` que `Portugal` no se traduce (alinea con `admin_areas`).
- Contract test que prohíbe persistir el literal `(sin región)`/`(sin provincia)`/`(sin comarca)` en columnas `region`/`zone`/`comarca` — siempre NULL.

### Fase 2 — Diccionario regiones PT
- Crear `PT_REGION_ALIASES` (`Região Norte | Region Norte | Norte → Norte`; `Lisboa e Vale do Tejo | Área Metropolitana de Lisboa → Lisboa`; etc.).
- Introducir helper `canonicalRegion(country, name)` paralelo a `canonicalCountry`. Consumir desde `getLocationHierarchy`.

### Fase 3 — Corrección server-side (`enrich-location`)
- Dejar de escribir placeholders `(sin …)`. Si IA/Nominatim no resuelve un nivel → NULL.
- Para PT, inferir NUTS-II desde coordenadas (similar a `continentLabelFromCoords`) o consultar `admin_level=6` explícitamente en la query Nominatim.

### Fase 4 — Backfill SQL (sólo tras Fases 1–3 validadas)
- `UPDATE locations SET region = NULL WHERE region LIKE '(sin %)';` (idem `zone`, `comarca`).
- Re-encolar enriquecimiento: 246 PT con `region (sin región)` + 66 PT NULL + 183 ES NULL.
- Merge alias country: `Espana → España` en columna (o canon EN si se decide migrar todo `country` a inglés).

---

## 7. Plan de corrección por fases

| Fase | Alcance | Riesgo | Reversible | Bloqueantes |
|---|---|---|---|---|
| 1 | docs + alias `Espana` + contract test | bajo | sí | — |
| 2 | helper `canonicalRegion` + dict PT | medio | sí | Fase 1 |
| 3 | edge `enrich-location`: stop placeholders + NUTS-II PT | medio | sí (versionado) | Fase 2 |
| 4 | migración SQL backfill + re-enrich | alto | parcial | Fases 1–3 desplegadas |

---

## 8. Riesgos antes de migrar datos

- Filtros guardados que apuntan literalmente a `(sin región)` se romperían tras el backfill.
- Re-enriquecer 246 PT + 183 ES genera coste IA y storm en realtime topic `locations`.
- Si la edge sigue escribiendo placeholders sin desplegar la Fase 3, cualquier limpieza SQL queda revertida en el siguiente enrichment.
- Cambiar canon ES (`España → Spain` en columna) impacta tests E2E y filtros usuario. **Recomendación**: mantener canon-en-runtime y NULL-en-BD, no canonicalizar columnas físicamente.
- Asignar NUTS-II PT por coordenadas requiere polígonos oficiales (NUTS 2021) o servicio externo; sin ellos, sólo se rellenan los POIs con `admin_level=6` recuperable de Nominatim.

---

## 9. Restricciones del documento

- Único archivo creado: `docs/audits/geography-tree-taxonomy-audit.md`.
- No se ha tocado `src/**`, edge functions, migraciones, datos, `package.json`, `README.md`, versión.
- **Version impact:** none · **tests/lint not run:** docs-only tree audit.
