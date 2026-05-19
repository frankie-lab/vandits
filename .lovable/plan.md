
# Auditoría del árbol geográfico — Portugal vs España

Entregar **un único documento docs-only**: `docs/audits/geography-tree-taxonomy-audit.md`. No se tocan datos, Supabase, código runtime, package.json, README ni versión. tests/lint not run: docs-only tree audit. Version impact: none.

## Hallazgos confirmados (lectura read-only sobre `locations`)

### Tabla 1 — Cobertura jerárquica PT vs ES

| country | total | `region` poblado | `zone` poblado | `ed.admin_nivel_1` | `ed.admin_nivel_2` | `ed.admin_nivel_3` | enriched (`ed.descripcion`) |
|---|---|---|---|---|---|---|---|
| España | 1.497 | 1.314 (88%) | 1.314 | 1.291 | 1.291 | 1.258 | 1.491 |
| Portugal | 315 | 249 (79%) | 249 | 248 | 248 | 244 | 314 |
| Espana (alias) | 3 | 3 | 3 | 0 | 0 | 0 | 3 |

### Tabla 2 — Distribución `region` en PT

| region | count |
|---|---|
| `(sin región)` (placeholder literal) | 247 |
| NULL / vacío | 66 |
| `Región Norte` | 2 |

→ De los **314 POIs PT enriquecidos**, **246 tienen `region = "(sin región)"` literal** y **66 tienen `region` NULL**. Sólo 2 tienen valor real, y con naming inconsistente (`Región Norte` en vez de la forma NUTS-II canónica `Norte`).

### Tabla 3 — Distribución `region` en ES (top)

Castilla y León 178 · Andalucía 162 · Cataluña 155 · Madrid 112 · Valenciana 93 · Galicia 91 · Aragón 87 · Castilla-La Mancha 80 · Canarias 71 · Asturias 59 · Extremadura 50 · Baleares 49 · ... · 183 con `region` vacía (todos enriquecidos pero sin `admin_nivel_1`).

### Tabla 4 — Muestra `enriched_data.datos_geograficos` PT enriquecido

Ejemplo "LxFactory" (Lisboa):
`{admin_nivel_1: "(sin región)", admin_nivel_2: "Lisboa", admin_nivel_3: "(sin provincia)", localidad: "Lisboa"}`

→ Confirma que la edge function **enrich-location escribe el literal `(sin región)` también dentro de `enriched_data.datos_geograficos.admin_nivel_1`**, no sólo en la columna `region`. El runtime ya filtra estos placeholders vía `isPlaceholderValue` en `src/shared/geography/hierarchy.ts` → la UI muestra "(sin región)" como bucket único.

## Qué campos usa el árbol (revisar en doc)

`getLocationHierarchy(loc)` en `src/shared/geography/hierarchy.ts`:

| nivel | fuente primaria | fallback | normalización |
|---|---|---|---|
| continent | `loc.continent` | `enriched_data.datos_geograficos.continente` → `continentLabelFromCoords(lat,lng)` | `canonicalContinent` (ES→EN) |
| country | `loc.country` | `…pais` | `canonicalCountry` (`España→Spain`, `Francia→France`, …; **`Portugal→Portugal` sin alias necesario**) |
| region | `loc.region` | `…admin_nivel_1` | ninguna |
| zone | `loc.zone` | `…admin_nivel_2` | ninguna |
| admin_level_3 | `loc.comarca` | `…admin_nivel_3` | ninguna |
| locality | `loc.localidad` | `…localidad` | ninguna |

Placeholders `(sin ...)` se neutralizan a `undefined` antes de renderizar.

## Causas probables

1. **Cobertura de la IA / Nominatim asimétrica para PT.** Para España, `nominatim` devuelve admin_level=4 = comunidad autónoma; la edge function lo guarda íntegro. Para Portugal, el equivalente NUTS-II (`Norte`, `Centro`, `Lisboa`, `Alentejo`, `Algarve`, `Madeira`, `Açores`) no aparece o el postproceso del LLM lo descarta y reescribe el sentinel `(sin región)`. Result: **el árbol no tiene cómo separar POIs por región PT**.
2. **Sentinels persistidos en columnas Y en JSON.** El placeholder `(sin región)` está duplicado: el helper de UI lo neutraliza, pero cualquier filtro/exportación SQL directa los ve como valor real.
3. **Naming inconsistente para las 2 regiones PT que sí se rellenaron.** `Región Norte` no es la forma canónica NUTS-II (`Norte`). Sin diccionario de alias para PT.
4. **Mezcla idiomática visible en el árbol.** Runtime canonicaliza `España→Spain` (columna `country`) pero NO canonicaliza `Portugal` (mismo nombre en ES/EN/PT). Resultado UI: rama `Spain` junto a `Portugal` — coherente con `admin_areas` pero rompe expectativa visual ES.
5. **183 POIs ES enriquecidos sin región.** Sub-grupo donde la IA dejó `admin_nivel_1` NULL (no escribió placeholder). Es un agujero distinto, no resoluble por alias.
6. **3 POIs `Espana` sin enriched_data.datos_geograficos.** Canal de import distinto (no llegó a enrich-location). Alias `Espana → Spain` está pendiente.

## Anomalías → tabla resumen para el documento

| # | Nivel | Síntoma | Volumen | Causa probable | Impacto UI |
|---|---|---|---|---|---|
| A | region (PT) | `(sin región)` literal | 247 | placeholder escrito por enrich-location | bucket único en Portugal |
| B | region (PT) | NULL | 66 | POIs no enriquecidos | mismo bucket "(sin región)" tras `isPlaceholderValue` |
| C | region (PT) | `Región Norte` no canónico | 2 | falta diccionario NUTS-II | nodo huérfano |
| D | region (ES) | NULL en POIs enriquecidos | 183 | IA dejó admin_nivel_1 vacío | bucket `(sin región)` en España |
| E | zone (ES) | `(sin provincia)` literal | n | placeholder escrito por IA cuando admin2 = nombre de comunidad | provincia fantasma |
| F | admin_level_3 (ES) | `(sin comarca)` masivo | la mayoría | comarcas no resueltas | hoja artificial |
| G | country | `Espana` vs `España` | 3 | alias no canonicalizado | rama separada de `Spain` |
| H | continent | `Europe/Europa`, `África/Africa` (auditoría previa) | 4 | duplicados idiomáticos en BD | ya cubierto en `geography-taxonomy-audit.md` |

## Propuesta de normalización (sin ejecutar)

### Fase 1 — limpieza visual (no destructiva)
- Ampliar `canonicalCountry` con `Espana→Spain`.
- Documentar en `mem://geography/canonical-tree-spec` que `Portugal` no se traduce (alinea con `admin_areas`).
- Garantizar contract test que prohíbe persistir el literal `(sin región)` / `(sin provincia)` / `(sin comarca)` en columnas `region`/`zone`/`comarca` — usar siempre NULL.

### Fase 2 — diccionario regiones PT
- Añadir `PT_REGION_ALIASES` (`Região Norte | Region Norte | Norte → Norte`, `Lisboa e Vale do Tejo | Área Metropolitana de Lisboa → Lisboa`, etc.).
- Helper `canonicalRegion(country, name)` paralelo a `canonicalCountry`. Llamar desde `getLocationHierarchy`.

### Fase 3 — corrección backend de enrich-location
- Quitar la escritura de placeholders `(sin ...)`. Si la IA / Nominatim no resuelve un nivel, escribir NULL.
- Para PT, intentar inferencia desde coordenadas vs polígonos NUTS-II (similar a `continentLabelFromCoords`).

### Fase 4 — backfill SQL (después de Fases 1-3 verificadas)
- `UPDATE locations SET region = NULL WHERE region LIKE '(sin %)';` (idem zone/comarca).
- Re-encolar enriquecimiento de los 66 PT con `region IS NULL` y los 183 ES con `region IS NULL` enriquecidos.
- Merge `Espana → España` (o → `Spain` si se decide canon EN en BD).

## Plan de corrección por fases

| Fase | Alcance | Riesgo | Reversible | Estado |
|---|---|---|---|---|
| 1 | docs + canonical-names alias `Espana` | bajo | sí | pendiente |
| 2 | helper `canonicalRegion` + dict PT | medio | sí | pendiente |
| 3 | edge `enrich-location`: stop placeholders | medio | sí (versionado) | pendiente |
| 4 | migración SQL backfill + re-enrich | alto | parcial | pendiente, requiere Fases 1-3 |

## Riesgos antes de migrar datos

- Filtros guardados que apuntan literalmente a `(sin región)` se romperían tras el backfill.
- Re-enriquecer 246 PT genera coste IA y storm en realtime topic `locations`.
- Si la edge function sigue escribiendo placeholders sin desplegar la Fase 3, cualquier limpieza SQL queda revertida en el siguiente enrichment.
- Cambiar canon ES (`España` → `Spain` en columna) impacta tests E2E y filtros usuario; mantener canon-en-runtime y NULL-en-BD es opción más segura.

## Restricciones del documento

- Crear solamente `docs/audits/geography-tree-taxonomy-audit.md`.
- No tocar `src/**`, edge functions, migraciones, datos, `package.json`, `README.md`, versión.
- Cerrar reporte con confirmación de no-modificación, version impact: none, tests/lint not run.
