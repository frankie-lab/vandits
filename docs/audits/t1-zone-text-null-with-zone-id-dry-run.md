# T1 dry-run — `zone` texto NULL con `zone_id` presente

**Fecha:** 2026-05-21 UTC  
**Tipo:** Auditoría dry-run (solo SELECT).  
**Referencias:**
- [`docs/audits/territorial-equivalence-global-implementation-audit.md`](./territorial-equivalence-global-implementation-audit.md) §5 deuda #1.
- [`docs/contracts/territorial-equivalence-canon.md`](../contracts/territorial-equivalence-canon.md).
- Norma raíz: `mem://geography/canonical-tree-spec`, `mem://logic/content/locations-resolved-view`.

**Version impact:** none. Sin código, sin migraciones, sin datos, sin re-enrich, sin bump.

---

## 1. Scope exacto (top 5 países con provincia)

Filtro: `deleted_at IS NULL` ∧ `zone_id IS NOT NULL` ∧ `locations.zone IS NULL` ∧ `country_code ∈ {IT, ES, FR, GB, US}`.

| País | POIs con `zone_id` | `zone` texto NULL | `zone_resolved` (vía FK) NULL | Resolved OK pero texto NULL |
|---|---:|---:|---:|---:|
| IT | 988 | **918** | 0 | **918** |
| ES | 1.310 | **314** | 0 | **314** |
| FR | 1.065 | **168** | 0 | **168** |
| US | 347 | **17** | 0 | **17** |
| GB | 391 | **15** | 0 | **15** |
| **Total** | **4.101** | **1.432** | **0** | **1.432** |

> Las cifras del audit global (IT 923 / ES 493 / FR 230 / GB 30 / US 26) eran estimaciones por matching textual. Esta tabla es el conteo exacto por `country_code` ISO2. Diferencia explicada por: (a) `country_code` ISO2 ≠ `country` texto (más estricto); (b) algunos POIs sin ISO2 quedan fuera; (c) snapshot temporal.

**Hallazgo clave:** En el 100% de los casos `zone_resolved` (derivado del JOIN `admin_areas` vía `zone_id`) está poblado correctamente. El problema afecta **únicamente** a la columna legacy `locations.zone` (texto denormalizado).

---

## 2. Causa raíz

Definición efectiva de `v_locations_resolved` (verificada vía `pg_get_viewdef`):

```sql
SELECT
  l.zone,                  -- columna legacy en `locations`
  ...
  zn.name AS zone_resolved -- derivado de admin_areas via zone_id
  ...
FROM locations l
LEFT JOIN admin_areas zn ON zn.id = l.zone_id
```

**Diagnóstico:**

1. ❌ **No es bug de la vista.** El JOIN está bien y `zone_resolved` sale correcto en los 1.432 casos.
2. ❌ **No es bug de `admin_areas`** (type / path / depth). `admin_areas.name` está poblado y los paths son consistentes (depth 2–3, type `province` / `zone`).
3. ❌ **No es JOIN incorrecto.** El FK resuelve siempre a una fila válida.
4. ✅ **Falta writeback de `locations.zone`.** El pipeline que pobla `zone_id` (`resolveAllFks` + edge `resolve-admin-area`) **no actualiza** la columna textual legacy `locations.zone`. El resultado: FK correcta, cache textual NULL.

**SoT vs. cache:**

| Campo | Rol |
|---|---|
| `locations.zone_id` (FK) + `admin_areas.name` | **SoT** territorial. Único origen de verdad. |
| `v_locations_resolved.zone_resolved` | Derivación canónica de la SoT vía JOIN. Lectura preferida en cliente. |
| `locations.zone` (text) | **Cache legacy denormalizado.** Reliquia previa a `admin_areas`. No es SoT. |

El cliente (`hierarchy.ts`, `GeographyTree`) hoy hace `loc.zone ?? gd.admin_nivel_2` y NO consume `zone_resolved`. Por eso los 1.432 POIs aparecen como "zone vacío" en UI aunque la FK exista.

---

## 3. Ejemplos (20 POIs con FK válido y texto NULL)

| # | id (corto) | name | country | region | zone (text) | zone_id (corto) | zone_area_name | zone type | depth |
|---:|---|---|---|---|---|---|---|---|---:|
| 1 | `7c628948` | '13, Rue del Percebe' Mural | ES | Comunidad de Madrid | NULL | `a98b9e9c` | Comunidad de Madrid | province | 3 |
| 2 | `1acc9829` | 'La Cabina' | ES | Comunidad de Madrid | NULL | `a98b9e9c` | Comunidad de Madrid | province | 3 |
| 3 | `eb747f94` | 'La Sardina Encallada' | ES | Región de Murcia | NULL | `679c6925` | Región de Murcia | province | 3 |
| 4 | `7a2394dc` | 'Tras Julia' | ES | Comunidad de Madrid | NULL | `a98b9e9c` | Comunidad de Madrid | province | 3 |
| 5 | `5dad209d` | Abandoned Hotel at Cala d'en Serra | ES | Illes Balears | NULL | `4d404202` | Illes Balears | province | 3 |
| 6 | `e3835764` | Ahuehuete del Buen Retiro | ES | Comunidad de Madrid | NULL | `a98b9e9c` | Comunidad de Madrid | province | 3 |
| 7 | `611d64f0` | Alcudia | ES | Illes Balears | NULL | `4d404202` | Illes Balears | province | 3 |
| 8 | `b9f7986a` | Alcúdia | ES | Illes Balears | NULL | `4d404202` | Illes Balears | province | 3 |
| 9 | `9a9d277e` | Alcúdia | ES | Illes Balears | NULL | `4d404202` | Illes Balears | province | 3 |
| 10 | `afba5f53` | Aledo | ES | Región de Murcia | NULL | `679c6925` | Región de Murcia | province | 3 |
| 11 | `89867d20` | Antarctica Roundabout | ES | Castilla-La Mancha | NULL | `ae4f1e51` | Castilla-La Mancha | **zone** | **2** |
| 12 | `5828fb51` | Aranjuez Bullfighting Museum | ES | Comunidad de Madrid | NULL | `a98b9e9c` | Comunidad de Madrid | province | 3 |
| 13 | `f1a8d14f` | Árbol de la Sidra | ES | Principado de Asturias | NULL | `797dbc93` | Principado de Asturias | province | 3 |
| 14 | `1c37040a` | Arenzana de Arriba | ES | La Rioja | NULL | `66bac18a` | La Rioja | province | 3 |
| 15 | `0479a7af` | Artajona | ES | Navarra | NULL | `df02973b` | Navarra | province | 3 |
| 16 | `b77d4de2` | As Veigas | ES | Principado de Asturias | NULL | `797dbc93` | Principado de Asturias | province | 3 |
| 17 | `5ce90d4a` | Atocha Station Tropical Garden | ES | Comunidad de Madrid | NULL | `a98b9e9c` | Comunidad de Madrid | province | 3 |
| 18 | `62a325ea` | Baños del Somogil | ES | Región de Murcia | NULL | `679c6925` | Región de Murcia | province | 3 |
| 19 | `10248f9f` | Bárcena Mayor | ES | Cantabria | NULL | `8d4c28fa` | Cantabria | province | 3 |
| 20 | `53a80d5d` | Bárcena Mayor | ES | Cantabria | NULL | `8d4c28fa` | Cantabria | province | 3 |

**Patrón visible:**
- Mayoría son CCAA uniprovinciales (Madrid, Asturias, Baleares, Murcia, La Rioja, Navarra, Cantabria) → casos `region==zone` legítimos del canon §4.
- 1 caso (#11) con `zone_type=zone` y `depth=2` (Castilla-La Mancha) sugiere que en algún POI antiguo el FK `zone_id` apunta al nivel "region" en lugar de a una provincia real. Anomalía menor, fuera del scope T1 (no genera mal render, solo etiqueta provincia con nombre de CCAA).

---

## 4. Top regiones con deuda dentro del scope (where `region==zone_resolved`)

| País | region | POIs |
|---|---|---:|
| FR | Isla de Francia | 158 |
| IT | Lacio | 130 |
| ES | Comunidad de Madrid | 110 |
| IT | Toscana | 86 |
| IT | Lombardia | 84 |
| IT | Campania | 71 |
| IT | Liguria | 56 |
| IT | Véneto | 56 |
| IT | Sardegna | 54 |
| ES | Principado de Asturias | 53 |
| IT | Sicilia | 53 |
| ES | Illes Balears | 49 |
| IT | Piemonte | 42 |
| IT | Emilia-Romagna | 41 |
| IT | Umbría | 39 |

> Lectura: en IT y FR el geocoder asignó `zone_id` apuntando al nivel "región" (no provincia real) en bastantes POIs. Esto no es bug del fix T1 — el JOIN sigue siendo correcto — pero confirma que parte del backlog vendrá etiquetado con nombres de región. UI y canon §4 deben preverlo.

---

## 5. Propuesta de corrección

### 5.1 Opción preferente — **promover `zone_resolved` como lectura canónica del cliente**

**Cambio:** `hierarchy.ts` (y cualquier consumidor) deben leer `zone_resolved` en lugar de `loc.zone`. La vista ya expone el campo.

**Pros:**
- Cero mutación de datos. `locations.zone` queda como cache legacy congelado.
- Idempotente. Si mañana cambia `admin_areas.name` (traducción, normalización), el cliente lo refleja automáticamente.
- SoT = FK + `admin_areas`. No introducimos duplicación nueva.

**Contras:**
- Requiere parche cliente coordinado: matcher, GeographyTree, breadcrumb, debug overlays.
- Hay que decidir qué hacer con la columna legacy: marcarla como `DEPRECATED` y dejarla read-only en imports.

### 5.2 Opción alternativa — **backfill textual `locations.zone` desde `admin_areas.name`**

**Cambio:** una migración SQL `UPDATE locations SET zone = a.name FROM admin_areas a WHERE a.id = locations.zone_id AND locations.zone IS NULL AND locations.zone_id IS NOT NULL AND locations.deleted_at IS NULL`.

**Pros:**
- Una sola pasada. Resuelve 1.432 POIs sin tocar cliente.
- UI legacy que sigue leyendo `loc.zone` se beneficia sin parche.

**Contras:**
- Mantiene la denormalización viva. Cualquier nuevo import o re-resolve tiene que recordar escribir las dos columnas. Volveremos a derivar.
- No es escalable a los otros niveles (`country`, `region`) que sufren el mismo patrón.
- Mezcla SoT y cache.

### 5.3 Recomendación

**Opción 5.1 (lectura desde `zone_resolved`).** Es la única coherente con el canon territorial: SoT = FK + `admin_areas`. La 5.2 puede aplicarse como **paliativo táctico de un solo uso** mientras se migra el cliente, pero no como solución estructural.

Ruta sugerida:
1. PR `T1.A`: cliente lee `zone_resolved`. Sin tocar BD.
2. PR `T1.B` (opcional, post-aprobación): backfill SQL de `locations.zone` para reducir confusión en queries ad-hoc. Marcar columna como deprecated.
3. PR `T1.C` (futuro): mismo patrón para `country` / `region` text (mismo bug subyacente).

---

## 6. Impacto

### 6.1 `GeographyTree`
- Hoy: nodo "Provincia" vacío en 1.432 POIs (texto NULL). UI degradada.
- Con 5.1: nodo correcto vía `zone_resolved`. Aplicar colapso `region==zone` legítimo del canon §4/§7.
- Con 5.2: nodo correcto vía `loc.zone` rellenado; sigue requiriendo colapso para uniprovinciales.

### 6.2 POI-5 (`geo_health`)
- `compute-geo-health` debe reservar `partial` para faltas reales de FK, no de texto. Si hoy alguna ruta lo decide por `loc.zone IS NULL`, hay que migrarla a `zone_id IS NULL` (consultar canon §8).
- Estimación: hasta 1.432 POIs podrían dejar de ser falsos `partial` tras el fix.

### 6.3 POI-6 (enriquecimiento contextual)
- `getFilledLocationHierarchy` produce el contexto para IA. Si lee `loc.zone`, hoy emite contexto sin provincia. Tras 5.1 emite contexto completo. **Sin re-enrich**: solo nuevos enriquecimientos.

### 6.4 POI-10 (golden)
- Criterio `geoHealth='ok'` puede liberar hasta 1.432 POIs si la deuda #1 era el bloqueante. La cifra real será menor (otros rings pueden seguir activos).

### 6.5 Imports futuros
- Parsers `web_import`/`manual`/`kml/gpx/geojson/csv` deben seguir poblando `zone_id` (SoT) y pueden dejar de poblar `loc.zone` cuando el cliente migre. Mientras tanto, escribir ambas no rompe nada.
- Validador de canon (§6 del canon): rechazar `zone`/`zone_id` en países `has_provincia=false`. Independiente de T1.

### 6.6 `resolveAllFks`
- No requiere cambio funcional para T1.A. La FK ya queda bien.
- Para T1.B (opcional) podría añadir un side-effect `UPDATE locations SET zone = <name>` cuando resuelve. Discutible — preferible no añadir denormalización.

---

## 7. Lista blanca y exclusiones aplicadas

- **Países `has_provincia=false`** (FI, NO, NL, SE, BR, AU, JP, MX, CO): **excluidos** del scope. Cualquier caso suyo es deuda de canon §3, no de T1.
- **Casos `region==zone` legítimos** (canon §4): **incluidos** en el fix (la mayoría del backlog ES son uniprovinciales: Madrid, Asturias, Baleares, Murcia, La Rioja, Navarra, Cantabria). El fix los cura igual; el colapso visual es responsabilidad de `GeographyTree`/`getLocationHierarchy` por canon §7.
- **POIs `deleted_at IS NOT NULL`**: excluidos.

---

## 8. Restricciones cumplidas

- Solo `SELECT` sobre `v_locations_resolved`, `locations`, `admin_areas`, `place_types`. Sin `INSERT/UPDATE/DELETE`.
- Sin migraciones, sin código, sin edge functions, sin re-enrich.
- Sin tocar `package.json`, `app-version`, `README`, `.lovable/plan.md`.
- **Version impact:** none.

---

## 9. Próximo paso sugerido (requiere aprobación)

PR `T1.A` — migrar `hierarchy.ts` (y consumidores: `GeographyTree`, breadcrumb, matcher de geografía, debug overlays) a leer `zone_resolved` (vía `v_locations_resolved`) en lugar de `locations.zone`. Acompañar con:
- Contract test `hierarchy-reads-zone-resolved.test.ts`.
- Marca de `locations.zone` como `DEPRECATED` en `database/schema/*.md` (si existe).
- Telemetría temporal: contar accesos restantes a `loc.zone` y confirmar drift cero.

T1.B y T1.C quedan diferidos a discusión posterior.
