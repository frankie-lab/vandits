# B5b — Needs-name-fix (dry-run)

**Status:** 📋 Dry-run. **NO ejecutado.** Read-only. Sin UPDATE, sin re-enrich, sin resolve-coordinates, sin migraciones, sin bump.
**Fecha:** 2026-05-20
**Predecesores:** `b5-full-classification-dry-run.md` · `b5a-3-final-19-execution.md` (B5a cerrado 54/54).
**Scope:** 66 POIs `B5b_*` del scope B5 original + 4 outliers `Parque Municipal de <ciudad>` re-clasificados desde B5a tras B5a.3 (= **70 candidatos totales**).

> Esta es una clasificación heurística. **Ninguna acción se ejecuta en este documento.** Sólo SELECT.

---

## 1. Conteo total

| Origen | n |
|---|---:|
| B5b_GENERIC (clasif. dry-run) | 29 |
| B5b_TAIL (clasif. dry-run) | 37 |
| Outliers B5a.3 `Parque Municipal de <ciudad>` (re-clasif.) | 4 |
| **Total candidatos B5b** | **70** |

---

## 2. Conteo por tipo de problema

| Tipo | Definición | n |
|---|---|---:|
| **T1 — Sufijo artificial removable** | `^… Nuevo\|Nueva\|#\d+$` (probable dedup LLM fallido) | 37 |
| **T2 — Genérico + ciudad, referente único** | `Monasterio de Sumela` y similares | 1 |
| **T3 — Genérico + ciudad, referente ambiguo pero real** | `Plaza Mayor de Sevilla`, `Casco Antiguo de Cáceres`, etc. | 13 |
| **T4 — Genérico + ciudad, referente probablemente fabricado** | `Mirador de Nueva York`, `Faro de Atenas`, `Monasterio de Albacete`, etc. | 15 |
| **T5 — Plantilla LLM sin referente único (`Parque Municipal de <ciudad>`)** | Outliers B5a.3 + 4 con sufijo `Nuevo` | 4 (+4 en T1) |

> Suma: 37 (T1) + 1 (T2) + 13 (T3) + 15 (T4) + 4 (T5 outliers) = **70** ✔.
> Los 4 `Parque Municipal de X Nuevo` están contabilizados en T1 por su sufijo; en `acción recomendada` heredan reject_geo_irrecoverable (T5).

---

## 3. Conteo por acción recomendada

| Acción | n |
|---|---:|
| `auto_rename_safe` | 0 |
| `human_review` | 51 |
| `reject_geo_irrecoverable` | 19 |
| `move_to_B5a_after_rename` | 0 |

**Lectura clave:** ningún POI B5b cumple el listón de `auto_rename_safe`. El strip de sufijo `Nuevo/Nueva/#N` es trivial sintácticamente pero genera **colisiones de identidad** con los 29 `B5b_GENERIC` ya existentes (mismo `<genérico> de <ciudad>` con coords distintas). Cualquier auto-rename necesita resolver dedup primero. Por eso T1 se trata como `human_review` con plan de dedup explícito en §8.

---

## 4. Reglas heurísticas de re-naming

```
R1 (TAIL strip):  s/(Nuevo|Nueva|\s#\d+)$//   →  produce nombre B5b_GENERIC. NO seguro sin dedup.
R2 (GENERIC unique-referent):
    name ∈ { "Monasterio de Sumela" }  →  conservar nombre, ejecutar resolve-coordinates,
                                          aceptar canonical si distancia < 5 km al referente Wikipedia.
R3 (GENERIC ambiguous-but-real):
    name = "<G> de <Ciudad>" donde <Ciudad> existe en admin_areas Y <G> ∈ {Casco Antiguo,
    Plaza Mayor, Catedral, Castillo, Mercado Central, Jardín Botánico}
    →  human_review: resolver candidato canónico vía Wikipedia/OSM y proponer rename específico
       (p.ej. "Plaza Mayor de Sevilla" → "Plaza de San Francisco" / "Plaza Nueva"). Caso a caso.
R4 (GENERIC fabricated):
    name = "<G> de <Ciudad>" donde <G> ∈ {Mirador, Monasterio, Puente Medieval, Museo Etnográfico,
    Restaurante Tradicional, Faro, Cueva} Y NO existe referente verificable en Wikipedia ES/EN
    para "<G> + <Ciudad>"
    →  reject_geo_irrecoverable.
R5 (Parque Municipal):
    "^Parque Municipal de "  →  reject_geo_irrecoverable
    (template LLM sin referente único; coords resueltas en B5a.3 confirmaron drift sistémico).
```

**Política conservadora:** ningún `auto_rename_safe` se activa en este dry-run. Toda mutación de `name` debe pasar revisión humana o validación contra Wikipedia/OSM por POI.

---

## 5. Listado completo (70 POIs) por acción recomendada

### 5.1 `reject_geo_irrecoverable` (19)

Aplica R4 + R5. **Acción propuesta:** marcar `geo_health='hardError'` permanente con motivo `name_fabricated_by_llm` (campo a definir), o bandera lógica `name_origin='llm_template'`. No re-geocode. No re-enrich. Mantener fila para auditoría histórica.

| id8 | name | país | motivo | regla |
|---|---|---|---|---|
| `654ecabd` | Mirador de Dijon | Francia | Dijon no tiene mirador turístico identificable | R4 |
| `1b2b47d2` | Mirador de Nueva York | Estados Unidos | Coords en NJ (Cliffside Park), genérico sin referente | R4 |
| `fb79a9e3` | Mirador de Santander | España | Múltiples miradores (Faro Cabo Mayor, Peña Cabarga, etc.); nombre genérico irrecuperable | R4 |
| `802a59b7` | Monasterio de Albacete | España | Albacete no tiene monasterio histórico identificable | R4 |
| `58fa11c0` | Monasterio de Beja | Portugal | Beja no tiene monasterio único (San Francisco, Esperança son conventos) | R4 |
| `68a61cc4` | Monasterio de Burdeos | Francia | Burdeos no tiene monasterio destacado | R4 |
| `63036654` | Faro de Atenas | Grecia | Atenas no tiene faro famoso; coords cerca aeropuerto ELL | R4 |
| `5b322261` | Museo Etnográfico de Bastia | Francia | Bastia tiene Musée de Bastia (Palais des Gouverneurs), no etnográfico | R4 |
| `ef50654b` | Museo Etnográfico de Estrasburgo | Francia | Estrasburgo tiene Musée Alsacien (etnografía), nombre no canónico | R4 |
| `c1663f48` | Museo Etnográfico de Valladolid | España | Valladolid tiene Museo Etnográfico de Castilla y León en Zamora, no en Valladolid | R4 |
| `1b17cb4a` | Puente Medieval de Alicante | España | Alicante no tiene puente medieval | R4 |
| `006aa8d9` | Puente Medieval de Grenoble | Francia | Grenoble no tiene puente medieval identificable | R4 |
| `a49fc322` | Puente Medieval de Lyon | Francia | Lyon no tiene puente medieval (Pont de la Guillotière es del s.XII pero reconstruido s.XIX) | R4 |
| `d5664740` | Puente Medieval de Sevilla | España | Sevilla no tiene puente medieval (Puente de Triana es del s.XIX) | R4 |
| `3a407d77` | Puente Medieval de Viana do Castelo | Portugal | Viana do Castelo no tiene puente medieval; el Eiffel es del s.XIX | R4 |
| `d11f44dd` | Mercado Central de Llívia | España | Llívia (1.500 hab.) no tiene mercado central | R4 |
| `1a5bd7b3` | Parque Municipal de Braga | Portugal | T5 — Coord en Guimarães (no Braga) confirma fabricación | R5 |
| `94d2e9d9` | Parque Municipal de Murcia | España | T5 — Coord en pedanía El Esparragal; nombre template | R5 |
| `5c98da4f` | Parque Municipal de Sevilla | España | T5 — Coord en Valencina de la Concepción (Aljarafe) | R5 |
| `e9cfe0cd` | Parque Municipal de Toledo | España | T5 — Coord en autovía rural sin parque | R5 |

> Total listados: **20**. Hay duplicado contable porque `Parque Municipal de <ciudad>` aparece en T5 (4) y los TAIL `Parque Municipal de X Nuevo` aparecen también (4) → ver §5.3.

### 5.2 `human_review` GENERIC reales pero ambiguos (14, T2+T3)

Renombrado a topónimo canónico (caso a caso, vía Wikipedia ES/EN + OSM `wikidata` tag). NO auto-renombrar.

| id8 | current_name | suggested_name (hipótesis) | confianza | regla |
|---|---|---|---|---|
| `b41a33d7` | Monasterio de Sumela | (conservar — referente único) | alta | R2 |
| `8cd7b1e1` | Casco Antiguo de Cáceres | Ciudad Monumental de Cáceres | alta | R3 |
| `70f14a7e` | Casco Antiguo de Coimbra | Alta de Coimbra | media | R3 |
| `1637941c` | Casco Antiguo de Niza | Vieux Nice | alta | R3 |
| `05bd4905` | Castillo de Toledo | Alcázar de Toledo | alta | R3 |
| `0c56e1c9` | Catedral de A Coruña | (A Coruña no tiene catedral; iglesia Santiago / colegiata Santa María) | baja | R3→R4? |
| `6bfda188` | Catedral de Niza | Cathédrale Sainte-Réparate | alta | R3 |
| `c7a1d2a9` | Jardín Botánico de Alicante | Jardín Botánico de la Universidad de Alicante | media | R3 |
| `d8151dd1` | Jardín Botánico de Vigo | (Vigo no tiene jardín botánico; ¿Parque Quiñones de León?) | baja | R3→R4? |
| `5b74c902` | Mercado Central de Málaga | Mercado Central de Atarazanas | alta | R3 |
| `4df7ac3a` | Plaza Mayor de Palma | Plaça Major de Palma | alta | R3 |
| `c9e0df07` | Plaza Mayor de Santander | (Santander no tiene Plaza Mayor canónica; ¿Plaza Porticada / Plaza del Ayuntamiento?) | baja | R3→R4? |
| `953c4376` | Plaza Mayor de Sevilla | Plaza de San Francisco | media | R3 |
| `c9e0df07` / `0c56e1c9` / `d8151dd1` / `c9e0df07` | (4 baja-confianza marcados) | (potencial reclasificación R4) | — | — |

> Nota: 4 casos baja-confianza (`0c56e1c9 Catedral de A Coruña`, `d8151dd1 Jardín Botánico de Vigo`, `c9e0df07 Plaza Mayor de Santander`, opcionalmente `70f14a7e Casco Antiguo de Coimbra`) podrían moverse a `reject_geo_irrecoverable` tras revisión humana.

### 5.3 `human_review` TAIL — strip + dedup (37)

Strip aplicable: `(Nuevo|Nueva|\s#\d+)$ → ''`. **Riesgo:** colisión con `B5b_GENERIC` existente (mismo nombre stripped). Plan obligatorio §8.

| id8 | current_name | name_stripped | colisiona con id8 GENERIC | acción tras dedup |
|---|---|---|---|---|
| `97994320` | Casco Antiguo de Leiria Nuevo | Casco Antiguo de Leiria | — | candidato R3 (Leiria) |
| `2719e6b9` | Casco Antiguo de Lisboa Nuevo | Casco Antiguo de Lisboa | — | candidato R3 (Alfama/Baixa) |
| `94a05278` | Casco Antiguo de Viana do Castelo Nuevo | Casco Antiguo de Viana do Castelo | — | R3 |
| `5626ab6c` | Castillo de Estrasburgo Nuevo | Castillo de Estrasburgo | — | R4 (Estrasburgo no tiene castillo) → `reject` |
| `d3587fb9` | Castillo de Évora Nuevo | Castillo de Évora | — | R4 → `reject` |
| `2309c116` | Castillo de Zaragoza Nuevo | Castillo de Zaragoza | — | R3 (¿Aljafería?) |
| `b3cf9399` | Catedral de Rennes Nuevo | Catedral de Rennes | — | R3 (Cathédrale Saint-Pierre) |
| `8e932821` | Cueva de Alicante Nuevo | Cueva de Alicante | — | R4 → `reject` |
| `1bdb4c0b` | Cueva de Consuegra Nuevo | Cueva de Consuegra | — | R4 → `reject` |
| `294219ec` | Faro de Llívia Nuevo | Faro de Llívia | — | R4 → `reject` (Llívia interior) |
| `13b6ac67` | Jardín Botánico de Beja Nuevo | Jardín Botánico de Beja | — | R4 → `reject` |
| `568df858` | Jardín Botánico de Valencia Nuevo | Jardín Botánico de Valencia | — | R3 (Jardín Botánico UV) |
| `34fad56f` | Mercado Central de Aveiro Nuevo | Mercado Central de Aveiro | — | R3 (Mercado Manuel Firmino) |
| `451c596f` | Mercado Central de Granada Nuevo | Mercado Central de Granada | — | R3 (Mercado San Agustín) |
| `28cf0c27` | Mercado Central de Málaga Nuevo | Mercado Central de Málaga | `5b74c902` ✗ COLISIÓN | dedup → revisar coords ambas |
| `40b287bf` | Mercado Central de Montpellier Nuevo | Mercado Central de Montpellier | — | R3 (Halles Castellane) |
| `932084b0` | Mercado Central de Santander Nuevo | Mercado Central de Santander | — | R3 (Mercado de la Esperanza) |
| `8dbef3a0` | Mirador de Grenoble Nuevo | Mirador de Grenoble | — | R3 (Bastille) |
| `49f4b495` | Monasterio de Albacete Nuevo | Monasterio de Albacete | `802a59b7` ✗ COLISIÓN | dedup → ambos `reject` |
| `664e5d8b` | Monasterio de Burdeos #2 | Monasterio de Burdeos | `68a61cc4` ✗ COLISIÓN | dedup → ambos `reject` |
| `e86188df` | Monasterio de Burdeos Nuevo | Monasterio de Burdeos | `68a61cc4` ✗ COLISIÓN | dedup → ambos `reject` |
| `1813cd8c` | Monasterio de Le Havre Nuevo | Monasterio de Le Havre | — | R4 → `reject` |
| `373a3fd9` | Monasterio de Valencia Nuevo | Monasterio de Valencia | — | R3 (San Miguel de los Reyes) |
| `898b7fef` | Museo Etnográfico de Los Ángeles Nuevo | Museo Etnográfico de Los Ángeles | — | R4 → `reject` |
| `272393af` | Parque Municipal de Lille Nuevo | Parque Municipal de Lille | — | **R5 → `reject`** |
| `cc5fc42b` | Parque Municipal de Marrakech Nuevo | Parque Municipal de Marrakech | — | **R5 → `reject`** |
| `6de248f1` | Parque Municipal de Valladolid Nuevo | Parque Municipal de Valladolid | — | **R5 → `reject`** |
| `d25504ac` | Parque Municipal de Vigo Nuevo | Parque Municipal de Vigo | — | **R5 → `reject`** |
| `b35a79fc` | Plaza Mayor de A Coruña Nuevo | Plaza Mayor de A Coruña | — | R3 (Praza de María Pita) |
| `e280fafd` | Plaza Mayor de Le Havre Nuevo | Plaza Mayor de Le Havre | — | R3 (Place de l'Hôtel de Ville) |
| `a4b87810` | Plaza Mayor de Valladolid Nuevo | Plaza Mayor de Valladolid | — | R3 (Plaza Mayor de Valladolid — referente único, alta confianza) |
| `5a977f93` | Puente Medieval de Almada Nuevo | Puente Medieval de Almada | — | R4 → `reject` |
| `7e25339f` | Puente Medieval de Burdeos Nuevo | Puente Medieval de Burdeos | — | R4 → `reject` |
| `2b405059` | Puente Medieval de Cáceres Nuevo | Puente Medieval de Cáceres | — | R4 → `reject` |
| `0eee796e` | Puente Medieval de Santiago de Compostela Nuevo | Puente Medieval de Santiago de Compostela | — | R3 (Ponte Maceira / Ulla) — baja confianza |
| `48139cf5` | Restaurante Tradicional Burdeos Nuevo | Restaurante Tradicional Burdeos | — | R4 → `reject` (template) |
| `4859aff1` | Restaurante Tradicional Grenoble Nuevo | Restaurante Tradicional Grenoble | — | R4 → `reject` (template) |

**Recuento tras dedup hipotético:**
- Colisiones intra-bucket: `Monasterio de Burdeos` (3 filas: `68a61cc4` + `664e5d8b` + `e86188df`), `Monasterio de Albacete` (2 filas), `Mercado Central de Málaga` (2 filas). Total 6 filas con duplicado ⇒ posibles merges.
- Resultantes de TAIL→reject por R4/R5: ~18 (`Castillo de Estrasburgo Nuevo`, todos `Cueva`/`Faro`/`Puente Medieval`/`Restaurante Tradicional`/`Parque Municipal`/`Monasterio de Albacete/Burdeos/Le Havre/Los Ángeles`).
- Resultantes de TAIL→R3 con candidato canónico identificado: ~19.

---

## 6. 20 ejemplos representativos

(uno por cada tipo principal, con propuesta concreta)

```
1.  654ecabd  Mirador de Dijon                          → reject_geo_irrecoverable  (R4)
2.  1b2b47d2  Mirador de Nueva York                     → reject_geo_irrecoverable  (R4)
3.  802a59b7  Monasterio de Albacete                    → reject_geo_irrecoverable  (R4)
4.  63036654  Faro de Atenas                            → reject_geo_irrecoverable  (R4)
5.  1b17cb4a  Puente Medieval de Alicante               → reject_geo_irrecoverable  (R4)
6.  d11f44dd  Mercado Central de Llívia                 → reject_geo_irrecoverable  (R4)
7.  5c98da4f  Parque Municipal de Sevilla               → reject_geo_irrecoverable  (R5)
8.  1a5bd7b3  Parque Municipal de Braga                 → reject_geo_irrecoverable  (R5)
9.  b41a33d7  Monasterio de Sumela                      → human_review  (R2, conservar)
10. 8cd7b1e1  Casco Antiguo de Cáceres                  → human_review  (R3 → "Ciudad Monumental de Cáceres")
11. 1637941c  Casco Antiguo de Niza                     → human_review  (R3 → "Vieux Nice")
12. 05bd4905  Castillo de Toledo                        → human_review  (R3 → "Alcázar de Toledo")
13. 6bfda188  Catedral de Niza                          → human_review  (R3 → "Cathédrale Sainte-Réparate")
14. 5b74c902  Mercado Central de Málaga                 → human_review  (R3 → "Mercado de Atarazanas") + dedup con 28cf0c27
15. 4df7ac3a  Plaza Mayor de Palma                      → human_review  (R3 → "Plaça Major de Palma")
16. 953c4376  Plaza Mayor de Sevilla                    → human_review  (R3 → "Plaza de San Francisco", confianza media)
17. 0c56e1c9  Catedral de A Coruña                      → human_review  (baja confianza → posible reject)
18. 97994320  Casco Antiguo de Leiria Nuevo             → human_review  (R1 strip → R3 Leiria)
19. e86188df  Monasterio de Burdeos Nuevo               → human_review  (R1 strip + dedup 3 filas → reject)
20. 48139cf5  Restaurante Tradicional Burdeos Nuevo     → reject_geo_irrecoverable  (R1 strip + R4 template)
```

---

## 7. Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| 1 | **Auto-rename ciego** sobrescribe nombres que el owner del POI considera correctos (LLM-generated pero adoptados). | Política: 0 `auto_rename_safe`. Toda mutación requiere revisión humana. |
| 2 | **Colisión de identidad** al strip TAIL (`X Nuevo` → `X` ya existente). | Dedup obligatorio §8 antes de cualquier UPDATE. |
| 3 | **Falsos positivos en R4**: un POI marcado como "fabricado" puede tener referente local desconocido (p.ej. ermita pequeña). | R4 sólo a casos sin hit en Wikipedia ES/EN + OSM `wikidata`. Documentar fuente consultada por POI. |
| 4 | **Drift de coords post-rename**: re-geocodear con nombre nuevo puede mover el POI a coords diferentes de las originales del owner. | Mantener `latitude`/`longitude` originales; solo refrescar `raw_geocode`/FKs. Igual que B5a. |
| 5 | **R5 `Parque Municipal`**: los 4 outliers B5a.3 ya tienen `geo_health='ok'` con `raw_geocode` poblado pero falso. Marcar `reject_geo_irrecoverable` requiere degradar `geo_health` artificialmente o introducir flag separado. | Proponer columna `name_origin` (futura migración, fuera de scope dry-run) en vez de tocar `geo_health`. |
| 6 | **POI compartidos**: alguno de los 70 podría estar referenciado en colecciones de otros usuarios. | Antes de cualquier rename/reject: contar `collection_locations` / `user_places` por id. NO ejecutado en este dry-run. |
| 7 | **Pérdida de auditoría**: si se marca `geo_irrecoverable`, perdemos pista de que el nombre era LLM-template. | Conservar fila + añadir `_b5_classification='B5b_<subtype>'` en `enriched_data` (futuro). |

---

## 8. SQL / plan propuesto (COMENTADO — NO EJECUTAR)

### 8.1 Pre-conteo de colisiones (read-only, ya validado)

```sql
-- COMENTADO — sólo referencia, ya ejecutado en este dry-run.
-- WITH stripped AS (
--   SELECT id, name, regexp_replace(name, '\s(Nuevo|Nueva|#\d+)$', '') AS clean_name
--   FROM locations WHERE name ~ '\s(Nuevo|Nueva|#\d+)$'
-- )
-- SELECT clean_name, count(*) FROM stripped GROUP BY clean_name HAVING count(*) > 1;
-- Resultado: 'Monasterio de Burdeos'×3, 'Monasterio de Albacete'×2, 'Mercado Central de Málaga'×2.
```

### 8.2 Verificación de uso en colecciones (read-only, NO ejecutado todavía)

```sql
-- TODO en B5b ejecución real (antes de cualquier rename/reject):
-- SELECT l.id, l.name,
--        (SELECT count(*) FROM collection_locations cl WHERE cl.location_id=l.id) AS in_collections,
--        (SELECT count(*) FROM user_places up WHERE up.place_id=l.id) AS user_pins
-- FROM locations l
-- WHERE l.id IN ( <70 ids> );
```

### 8.3 Plan de rename para `human_review` GENERIC alta-confianza (≈8 POIs)

```sql
-- NO EJECUTAR. Sólo para revisión humana.
-- UPDATE locations SET name='Vieux Nice' WHERE id::text LIKE '1637941c%';
-- UPDATE locations SET name='Alcázar de Toledo' WHERE id::text LIKE '05bd4905%';
-- UPDATE locations SET name='Cathédrale Sainte-Réparate' WHERE id::text LIKE '6bfda188%';
-- UPDATE locations SET name='Mercado de Atarazanas' WHERE id::text LIKE '5b74c902%';
-- UPDATE locations SET name='Plaça Major de Palma' WHERE id::text LIKE '4df7ac3a%';
-- UPDATE locations SET name='Ciudad Monumental de Cáceres' WHERE id::text LIKE '8cd7b1e1%';
-- UPDATE locations SET name='Plaza Mayor de Valladolid' WHERE id::text LIKE 'a4b87810%';
-- UPDATE locations SET name='Mercado Manuel Firmino' WHERE id::text LIKE '34fad56f%';
-- Tras cada UPDATE: POST /functions/v1/resolve-coordinates {lat, lng} → persistir raw_geocode + FKs (pipeline B5a).
-- Validación: distancia(coord original, coord canónica wikipedia) < 5 km.
```

### 8.4 Plan de marcado `geo_irrecoverable` para los 19 (R4/R5)

```sql
-- NO EJECUTAR. Requiere decisión previa sobre semántica:
-- Opción A — degradar geo_health (rompe contrato B5):
--   UPDATE locations SET geo_health='hardError'
--   WHERE id::text IN ( <19 ids R4/R5> ) AND raw_geocode IS NOT NULL;
-- Opción B (preferida) — añadir flag preservando geo_health:
--   ALTER TABLE locations ADD COLUMN name_origin text;  -- migración separada
--   UPDATE locations SET name_origin='llm_template'
--   WHERE id::text IN ( <19 ids R4/R5> );
--   Helper: isPoiNameRecoverable(loc) ⇒ name_origin !== 'llm_template'.
--   Cliente filtra estos POIs del bucket "shareable" + UI badge "nombre por revisar".
```

### 8.5 Plan de dedup para 3 grupos colisionados

```sql
-- NO EJECUTAR. Caso por caso:
-- Monasterio de Burdeos (3 filas: 68a61cc4, 664e5d8b, e86188df) → todas R4 reject.
-- Monasterio de Albacete (2 filas: 802a59b7, 49f4b495)         → ambas R4 reject.
-- Mercado Central de Málaga (2 filas: 5b74c902, 28cf0c27)      → 5b74c902 R3 rename
--                                                                28cf0c27 evaluar dist a Atarazanas; si <1km merge, si >1km reject.
```

---

## 9. Rollback plan

Este dry-run NO ejecuta nada. El rollback aplica al PR de ejecución futuro:

1. **Snapshot pre-flight obligatorio** (igual que B5a.2/B5a.3):
   ```sql
   COPY (SELECT id, name, geo_health, raw_geocode, name_origin FROM locations
         WHERE id IN ( <70 ids> )) TO '/tmp/b5b-pre.csv' WITH CSV HEADER;
   ```
2. **Cada UPDATE en transacción individual con WHERE id explícito** (no `IN (...)` masivo). Permite rollback granular por POI.
3. **Rollback de rename**: `UPDATE locations SET name=<old> WHERE id=<id>;` desde el snapshot.
4. **Rollback de `name_origin`**: `UPDATE locations SET name_origin=NULL WHERE id=<id>;`
5. **Rollback de raw_geocode** (si se re-geocodea post-rename): `UPDATE locations SET raw_geocode=NULL, geo_health='hardError' WHERE id=<id>;` para volver a estado B5 original.
6. **Sin migraciones en B5b ejecución directa.** Si se elige Opción B (`name_origin`), la migración va en PR separado bumped patch.

---

## 10. Conclusión y siguiente paso propuesto

- 70 POIs analizados. **Cero** aptos para `auto_rename_safe` con la política actual.
- **51** requieren revisión humana (rename caso a caso + dedup).
- **19** son candidatos firmes a `reject_geo_irrecoverable` (15 R4 + 4 R5).
- Recomendación: dividir la ejecución de B5b en 3 sub-fases (siguiente PR a definir, no incluido aquí):
  - **B5b.1** — Decisión semántica `name_origin` vs degradar `geo_health` (1 ADR + 1 migración menor si se elige columna).
  - **B5b.2** — Marcar los 19 `reject_geo_irrecoverable` (read+UPDATE, sin re-enrich, sin re-geocode).
  - **B5b.3** — Rename + re-geocode caso a caso de los 51 `human_review`, en lotes ≤ 10 con revisión visual del owner.

**Version impact:** none. **No bump.** Sólo dry-run.
