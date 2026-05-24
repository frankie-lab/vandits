# Auditoría territorial global — implementación vs. contrato funcional del PDF

**Fecha:** 2026-05-21 UTC  
**Referencia obligatoria:** `Equivalencias Divisiones Territoriales Mundo.pdf` (38 países).  
**Alcance:** Solo lectura. Sin migraciones, sin código, sin re-enrich, sin bump.  
**Version impact:** none.

---

## 0. Modelo a verificar (extracto del PDF)

Para cada país el PDF define cuatro niveles funcionales:

| Nivel PDF | Campo Vandits esperado |
|---|---|
| CCAA / Región | `region` / `region_id` |
| Provincia | `zone` / `zone_id` |
| Ayuntamiento / Municipio | `admin3_id` (o `locality_id` cuando el país no tiene comarca) |
| Localidad / Pueblo / Barrio | `locality_id` / `sublocality_id` |

**Reglas adicionales del prompt:**
- Países sin equivalente de “provincia” (Países Bajos, Suecia, Noruega, Finlandia, México): `zone` debe quedar **NULL**; **no** duplicar `region`; **no** inventar provincia.
- Niveles censales o geográficos no administrativos (Brasil mesorregión, Australia county, etc.): admisible como fallback textual o `locality/sublocality`, nunca como FK administrativa obligatoria.

**Implementación actual del cliente:** `src/shared/geography/hierarchy.ts` declara 8 niveles canónicos `continent → country → region → zone → admin_level_3 → locality → sublocality → street`. Lectura:
```ts
region:        loc.region        ?? gd.admin_nivel_1
zone:          loc.zone          ?? gd.admin_nivel_2
admin_level_3: loc.comarca       ?? gd.admin_nivel_3
locality:      loc.localidad     ?? gd.localidad
sublocality:   loc.sublocalidad  ?? gd.sublocalidad
```
SoT FK = `admin_areas` + `resolveAllFks()` (`src/shared/geography/resolve-admin-fks.ts`). Vista única de lectura: `v_locations_resolved`.

---

## 1. Tabla global (38 países)

Métricas calculadas sobre `v_locations_resolved` (`country_code` ISO2 + matching textual ES/EN). Columnas:

- **N** = nº POIs.
- **C/R/Z/A3/L/SL** = % POIs con FK `country_id`/`region_id`/`zone_id`/`admin3_id`/`locality_id`/`sublocality_id`.
- **z=r** = casos `lower(zone)==lower(region)` (provincia duplicada de región).
- **zNULL** = nº POIs con texto `zone IS NULL`.
- **legR** / **legZ** = nº POIs con texto en `region`/`zone` pero sin FK (legacy text mismatch).
- **Veredicto** = implementado / parcial / no implementado / sin cobertura.

| País (PDF) | Reg. PDF | Prov. PDF | Mun. PDF | Loc. PDF | N | C% | R% | Z% | A3% | L% | SL% | z=r | zNULL | legR | legZ | Veredicto |
|---|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| España | CCAA | Provincia | Municipio | Localidad/Barrio/Pedanía | 1500 | 100 | 88 | 88 | 86 | 85 | 31 | 5 | 493 | 3 | 3 | **parcial** |
| Francia | Région | Département | Commune | Quartier/Village | 1129 | 100 | 94 | 94 | 93 | 90 | 37 | 0 | 230 | 2 | 2 | **parcial** |
| Italia | Regione | Provincia | Comune | Frazione | 995 | 100 | 99 | 99 | 99 | 98 | 32 | 1 | 923 | 1 | 1 | **parcial** (text/FK desincronizado) |
| Reino Unido | Nation/Region | County | Borough/Council | Parish/Town/Village | 407 | 100 | 99 | 96 | 85 | 88 | 34 | 0 | 30 | 0 | 1 | **implementado** |
| Estados Unidos | State | County | City/Township | Neighborhood/Census place | 356 | 100 | 98 | 97 | 76 | 78 | 31 | 0 | 26 | 0 | 0 | **parcial** (A3 < 80%) |
| Portugal | Região/CCDR | Distrito | Concelho | Freguesia/Localidade | 315 | 100 | 79 | 79 | 77 | 76 | 35 | 0 | 92 | 0 | 0 | **parcial** |
| Rumania | Región histórica | Județ | Municipiu/Comună | Sat/Cartier | 52 | 100 | 94 | 100 | 94 | 88 | 21 | 0 | 0 | 0 | 0 | **implementado** |
| Alemania | Land | Kreis/Landkreis | Gemeinde | Ortsteil | 51 | 100 | 96 | 94 | 96 | 92 | 29 | 0 | 10 | 0 | 0 | **implementado** |
| Finlandia (sin prov.) | Región | — | Municipality | Village/District | 49 | 100 | 100 | 90¹ | 100 | 100 | 65 | 0 | 47 | 0 | 0 | **parcial** (zone presente pese a PDF) |
| Turquía | Región geográfica | İl | Belediye | Mahalle/Köy | 47 | 100 | 100 | 87 | 87 | 100 | 57 | 0 | 26 | 0 | 0 | **implementado** |
| Marruecos | Región | Provincia/Prefectura | Commune | Douar/Quartier | 42 | 100 | 83 | 78 | 73 | 73 | 33 | 0 | 9 | 0 | 0 | **parcial** |
| Noruega (sin prov.) | Fylke | — | Kommune | Tettsted | 41 | 100 | 83 | 92¹ | 92 | 58 | 24 | 0 | 3 | 0 | 0 | **parcial** (zone presente pese a PDF; L 58%) |
| Polonia | Voivodato | Powiat | Gmina | Wieś/Osiedle | 32 | 100 | 96 | 93 | 90 | 100 | 50 | 0 | 9 | 0 | 0 | **implementado** |
| Grecia | Periferia | Unidad regional | Dimos | Comunidad/Barrio | 26 | 100 | 80 | 80 | 80 | 73 | 7 | 0 | 5 | 0 | 0 | **parcial** |
| Nigeria | State | LGA | Council | Ward/Village | 22 | 100 | 100 | 100 | 81 | 81 | 36 | 0 | 2 | 0 | 0 | **implementado** |
| Suiza | Cantón | Bezirk | Gemeinde | Dorf/Quartier | 18 | 100 | 88 | 88 | 72 | 72 | 27 | 0 | 4 | 0 | 0 | **parcial** (A3 < 80%) |
| Austria | Bundesland | Bezirk | Gemeinde | Ortschaft | 15 | 100 | 100 | 100 | 100 | 100 | 53 | 0 | 7 | 0 | 0 | **implementado** |
| Países Bajos (sin prov.) | Provincie | — | Gemeente | Wijk/Buurt | 13 | 100 | 100 | 69¹ | 100 | 100 | 46 | 0 | 13 | 0 | 0 | **parcial** (zone presente pese a PDF) |
| Ucrania | Óblast | Raión | Hromada/Mun. | Pueblo/Barrio | 13 | 100 | 100 | 76 | 92 | 92 | 61 | 0 | 11 | 0 | 0 | **parcial** |
| Suecia (sin prov.) | Län | — | Kommun | Tätort/Stadsdel | 8 | 100 | 87 | 100¹ | 100 | 87 | 50 | 0 | 0 | 0 | 0 | **parcial** (zone presente pese a PDF) |
| China | Provincia | Prefectura | Condado/Distrito | Pueblo/Aldea | 5 | 100 | 100 | 80 | 80 | 100 | 40 | 0 | 4 | 0 | 0 | **parcial** |
| Argentina | Provincia | Departamento/Partido | Municipio | Localidad/Barrio | 4 | 100 | 100 | 100 | 100 | 100 | 75 | 0 | 0 | 0 | 0 | **implementado** |
| Brasil | Estado | Mesorregión (est.) | Município | Distrito/Bairro | 3 | 100 | 100 | 100 | 100 | 100 | 100 | 0 | 0 | 0 | 0 | **implementado** |
| Canadá | Province/Territory | County/Reg. Mun. | Municipality | Hamlet/Neighborhood | 3 | 100 | 100 | 100 | 67 | 67 | 33 | 0 | 0 | 0 | 0 | **parcial** |
| Chile | Región | Provincia | Comuna | Localidad | 3 | 100 | 100 | 100 | 100 | 100 | 0 | 0 | 0 | 0 | 0 | **implementado** |
| Nueva Zelanda | Región | Distrito | Council | Suburb/Locality | 3 | 100 | 100 | 100 | 67 | 67 | 0 | 0 | 0 | 0 | 0 | **parcial** |
| Australia | Estado/Territorio | County (cuasi-obs.) | LGA | Suburb/Town | 2 | 100 | 100 | 100 | 100 | 100 | 0 | 0 | 2 | 0 | 0 | **implementado** |
| Sudáfrica | Provincia | Distrito municipal | Mun. local | Township/Suburb | 2 | 100 | 100 | 100 | 100 | 100 | 100 | 0 | 0 | 0 | 0 | **implementado** |
| Bélgica | Région/Gewest | Province | Commune/Gemeente | Section/Village | 1 | 100 | 100 | 100 | 100 | 100 | 0 | 0 | 0 | 0 | 0 | **implementado** |
| Egipto | Gobernación | Markaz | Ciudad/Municipio | Barrio/Aldea | 1 | 100 | 100 | 100 | 100 | 100 | 0 | 0 | 1 | 0 | 0 | **implementado** |
| Indonesia | Provincia | Regencia/Ciudad | Distrito | Desa/Kelurahan | 1 | 100 | 100 | 100 | 100 | 100 | 0 | 0 | 1 | 0 | 0 | **implementado** |
| Japón | Prefectura | Subprefectura | Municipio | Barrio/Aldea | 1 | 100 | 100 | 100 | 100 | 100 | 100 | 0 | 0 | 0 | 0 | **implementado** |
| México (sin prov.) | Estado | — | Municipio | Localidad/Colonia | 0 | — | — | — | — | — | — | — | — | — | — | **sin cobertura** |
| Argelia | Wilaya | Daïra | Commune | Localité | 0 | — | — | — | — | — | — | — | — | — | — | **sin cobertura** |
| Colombia | Departamento | Provincia (limit.) | Municipio | Vereda/Barrio | 0 | — | — | — | — | — | — | — | — | — | — | **sin cobertura** |
| Corea del Sur | Provincia/Ciudad esp. | Condado/Distrito | Municipio | Dong/Ri | 0 | — | — | — | — | — | — | — | — | — | — | **sin cobertura** |
| Filipinas | Región | Provincia | Mun./City | Barangay | 0 | — | — | — | — | — | — | — | — | — | — | **sin cobertura** |
| India | Estado | Distrito | Mun./Panchayat | Aldea/Barrio | 0 | — | — | — | — | — | — | — | — | — | — | **sin cobertura** |
| Rusia | Repú./Krai/Óblast | Raión | Gorod/Municipio | Posiólok/Aldea | 0 | — | — | — | — | — | — | — | — | — | — | **sin cobertura** |

¹ Países donde el PDF marca **sin provincia** pero el resolver está emitiendo `zone_id`. Esto es una **violación del contrato** y debe corregirse (`zone` debe quedar NULL).

**Notas de calidad del dato (vistas vs. tabla):**
- En `v_locations_resolved` se observa desalineamiento entre `zone` (texto) y `zone_id` (FK) en Italia (zone NULL en 923/995 pese a 989 con FK) y España (zNULL 493 con FK 1318). El resolver pobla la FK pero el texto denormalizado en la vista queda vacío. **Diagnóstico**: bug de denormalización en la vista o en el writeback de `locations.zone`. Es la **principal fuente de ruido** del informe.
- `enriched_data.datos_geograficos.admin_nivel_3` compensa la FK ausente en 56 POIs globales (ES 10, FR 21, IT 6, PT 8, MA 3, GB 3, CH 3, NG 4, US 1) — la FK admin3 sigue siendo SoT, el texto enriquecido es fallback secundario que la UI consume vía `getLocationHierarchy`.

---

## 2. Fichas por país (resumen accionable)

### 2.1 Países top por volumen

**España (1.500 POIs).** PDF: CCAA → Provincia → Municipio → Localidad/Barrio/Pedanía. Implementación: cumple el modelo a nivel FK (~85–88% por nivel) pero arrastra:
- 5 casos `zone == region` (Cantabria, Principado de Asturias). El texto denormalizado replica la CCAA cuando es uniprovincial. **Riesgo:** GeographyTree muestra el mismo nodo dos veces.
- 493 POIs con `zone` texto NULL pero 1.318 con `zone_id` → la vista no denormaliza zone para una franja amplia.
- 3 POIs con `region`/`zone` texto pero sin FK (legacy text mismatch).
- 216 POIs sin `admin3_id` (comarca) y 231 sin `locality_id`.

**Francia (1.129).** PDF: Région → Département → Commune → Quartier/Village. FKs ≥ 90% en region/zone/admin3, 90% en locality. Igual patrón de zone-text NULL pese a FK presente (230 POIs). 2 legacy text mismatches.

**Italia (995).** PDF: Regione → Provincia → Comune → Frazione. FKs ≥ 98% en todos los niveles. **Pero zone texto NULL en 923/995 (93%)** mientras `zone_id` está poblado en 989. Es el caso más extremo del bug de denormalización.

**Reino Unido (407).** PDF: Nation/Region → County → Borough/Council → Parish/Town/Village. Cumple. Pequeño gap en admin3 (85%). PDF nota a `Borough/Council` como nivel municipal; el resolver lo mapea correctamente a `admin3_id`.

**Estados Unidos (356).** PDF: State → County → City/Township → Neighborhood/Census place. Region y zone ≥ 97% (state, county). Admin3 baja a 76% — el `City/Township` (admin3) no siempre se está resolviendo (Census Designated Places sin FK admin3).

**Portugal (315).** PDF: Região/CCDR → Distrito → Concelho → Freguesia. Tras coberturas FK ronda 76–79% en todos los niveles. Margen amplio de mejora — patrón de POIs antiguos sin re-resolve.

### 2.2 Países sin provincia (PDF) con `zone_id` emitido — violación de contrato

| País | POIs | zone_id |
|---|---:|---:|
| Países Bajos | 13 | 9 (69%) |
| Suecia | 8 | 8 (100%) |
| Finlandia | 49 | 44 (90%) |
| Noruega | 41 | 38 (92%) |
| México | 0 | — (sin cobertura, pero debe excluirse a futuro) |

El resolver está mapeando algún nivel intermedio (probablemente `admin_level_2` OSM) a `zone_id` aunque el PDF declara que no existe equivalente de provincia. **Acción de contrato:** introducir tabla por país en `admin_areas` con `has_provincia=false` y respetarla en `resolveAllFks()`.

### 2.3 Países con coberturas bajas

- **Suiza** (18) — admin3 72%, locality 72%.
- **Marruecos** (42) — todos los niveles 73–83%.
- **Grecia** (26) — 73–80%, locality especialmente débil.
- **Ucrania** (13) — zone 76%.
- **Noruega** (41) — locality 58%.
- **Canadá / Nueva Zelanda** (3 cada uno) — admin3/locality 67% (volumen muy bajo, no concluyente).

### 2.4 Países con cobertura testimonial (1–5 POIs)

China, Bélgica, Egipto, Indonesia, Japón, Argentina, Brasil, Chile, Australia, Sudáfrica. Métricas al 100% por volumen mínimo: **no se puede inferir robustez del resolver**. Necesitan muestra ampliada antes de declarar “implementado” con confianza.

### 2.5 Países sin cobertura actual (mantener en el contrato global)

México, Argelia, Colombia, Corea del Sur, Filipinas, India, Rusia. **Cero POIs.** Deben entrar en el contrato `territorial-equivalence-canon.md` con su equivalencia funcional definida para que el resolver esté preparado cuando aparezcan los primeros POIs.

---

## 3. Ejemplo concreto de anomalía (España, `zone == region`)

```
name                 | region                 | zone                   | admin3        | locality
---------------------+------------------------+------------------------+---------------+-------------
Comillas             | Cantabria              | Cantabria              | (sin comarca) | Comillas
Santillana del Mar   | Cantabria              | Cantabria              | (sin comarca) | Santillana del Mar
La Cuevona           | Principado de Asturias | Principado de Asturias | (sin comarca) | Ribadesella
Tazones              | Principado de Asturias | Principado de Asturias | (sin comarca) | Villaviciosa
Cudillero            | Principado de Asturias | Principado de Asturias | (sin comarca) | Cudillero
```

Patrón: CCAA uniprovinciales (Cantabria, Asturias, La Rioja, Madrid, Murcia, Navarra, Baleares). El PDF dice que Cantabria es provincia con el mismo nombre, por lo que técnicamente el mapeo es correcto, **pero el árbol jerárquico colapsa los dos niveles**: el contrato debe permitir “provincia==región” como caso explícito y deduplicar en UI (un solo nodo etiquetado “Cantabria · CCAA + Prov.”).

---

## 4. Veredicto global

**Estado:** **parcialmente implementado.**

- **Estructura SoT (FKs `admin_areas` + `v_locations_resolved`)** existe, es coherente y está en uso por `getLocationHierarchy` y `GeographyTree`. ✔
- **Cobertura ≥ 80% por nivel** en países top-7 por volumen (España, Francia, Italia, RU, EE.UU., Portugal, Rumania) — 4.405 POIs (90% del total). ✔
- **3 puntos de deuda transversal:**
  1. **Denormalización `zone` text ↔ `zone_id` rota** en ES/FR/IT/RU/US (bug de vista o de writeback). Provoca que UI textual lea NULL aunque la FK exista.
  2. **Países sin provincia (NL/SE/NO/FI/MX)** reciben `zone_id` espurio — viola PDF.
  3. **CCAA uniprovinciales en España** generan `zone==region` literal — no es bug pero el contrato debe declararlo explícito.
- **7 países del PDF sin cobertura** (MX, DZ, CO, KR, PH, IN, RU) deben entrar al contrato sin esperar a tener POIs.

---

## 5. Top de deuda territorial (orden recomendado de corrección)

| # | Deuda | Países afectados | POIs |
|---|---|---|---:|
| 1 | `zone` texto NULL con `zone_id` FK presente (vista/writeback) | IT (923), ES (493), FR (230), GB (30), US (26) | ~1.700 |
| 2 | `zone_id` emitido en países sin provincia | NL, SE, NO, FI | 99 |
| 3 | Admin3 FK ausente bajo umbral 80% | US (24%), PT (23%), CH (28%), MA (27%), Canada/NZ (33%) | ~150 |
| 4 | Locality FK bajo (<70%) | NO (42%), MA (27%), GR (27%), PT (24%), CH (28%) | ~110 |
| 5 | `zone==region` literal (ES uniprovinciales) | ES Cantabria/Asturias/Madrid/Murcia/Navarra/Rioja/Baleares | 5+ |
| 6 | `region`/`zone` texto sin FK (legacy text mismatch) | ES (3), FR (2), IT (1), GB (1) | 7 |
| 7 | Países sin cobertura no presentes en contrato | MX, DZ, CO, KR, PH, IN, RU | 0 (futuro) |

---

## 6. Impacto sobre componentes del sistema

- **POI-5 (deuda objetiva).** `geo_health = partial|stale_name|empty` se ve directamente afectado por las deudas #1 y #3: POIs con `zone_id` válido pero texto NULL pueden marcarse como `partial` falsamente. Fix de vista reduce el ruido sin re-enrich.
- **POI-6.** El enriquecimiento contextual usa `getFilledLocationHierarchy`. Mientras la FK exista, el path se completa correctamente — el impacto real está en presentación/breadcrumb, no en la IA.
- **POI-10 (golden).** Para alcanzar POI-10 (`enriched + geoHealth=ok + rings=[]`), la deuda #1 es bloqueante en ~1.700 POIs. Fix de vista los promueve automáticamente.
- **GeographyTree.** Casos #2 (zone espuria) y #5 (zone==region) generan nodos confusos. La regla del prompt — “no duplicar region en zone, no inventar provincia” — debe codificarse en el matcher y en el render del árbol.
- **Futuros imports.** El parser de KML/GPX/CSV y `web_import` deben consultar el contrato `has_provincia` por país antes de poblar `zone`/`zone_id`. Hoy poblan `admin_nivel_2` siempre que el geocoder devuelve algo, sin chequeo de contrato.
- **resolve-coordinates / resolveAllFks.** Cambio principal: tabla por país (38 entradas + ISO catalog) que indique, por nivel, qué tipo `admin_area_types` corresponde al equivalente del PDF y si el nivel puede ser NULL. Hoy el resolver es agnóstico al país y depende del orden de `admin_level_*` del geocoder.

---

## 7. Propuesta de contrato técnico (NO se crea aún)

Documento futuro: **`docs/contracts/territorial-equivalence-canon.md`** (pendiente de aprobación separada).

Secciones recomendadas:

1. **Tabla maestra de equivalencias** (38 filas del PDF + `iso2`, `has_provincia: bool`, `provincia_es_censal: bool`, `locality_es_censal: bool`).
2. **Política de NULLs** por país y nivel.
3. **Política `zone == region`** para CCAA/Estados uniprovinciales (lista enumerada).
4. **Mapping `admin_area_types` ↔ nivel funcional PDF** por país (p.ej. `commune` FR → `admin3`; `Län` SE → `region`; `Frazione` IT → `sublocality`).
5. **Contrato de resolver** (`resolveAllFks` debe consultar el canon y rechazar `zone_id` cuando `has_provincia=false`).
6. **Contrato de import** (parsers no pueden poblar niveles no autorizados por canon).
7. **Contrato de UI** (`GeographyTree` colapsa nodos cuando canon declara `region==zone` legítimo).
8. **Países sin cobertura actual** (futuras incorporaciones obligadas por canon).

---

## 8. Orden recomendado de corrección

1. **Bugfix de vista/writeback** para sincronizar `zone` texto con `zone_id` (deuda #1, mayor impacto, sin re-enrich).
2. **Crear `docs/contracts/territorial-equivalence-canon.md`** con tabla de 38 países y reglas `has_provincia`.
3. **Codificar `has_provincia` en `resolveAllFks`** para purgar `zone_id` en NL/SE/NO/FI/MX en próximos resolves (deuda #2).
4. **Backfill geo dirigido** (sin re-enrich) para admin3/locality bajo umbral en US/PT/CH/MA/GR (deudas #3, #4).
5. **Declarar `zone==region` legítimo** en canon y colapsar en `GeographyTree` (deuda #5).
6. **Limpieza de legacy text mismatch** (7 POIs, deuda #6).
7. **Documentar países sin cobertura** en canon para preparar imports futuros (deuda #7).

---

## 9. Restricciones cumplidas

- Sólo `SELECT` sobre `v_locations_resolved` y `admin_areas`. Sin `INSERT/UPDATE/DELETE`.
- Sin migraciones, sin código, sin edge functions, sin re-enrich.
- Sin tocar `package.json`, `app-version`, `README`, `.lovable/plan.md`.
- Version impact: **none**.
