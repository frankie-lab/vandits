# Territorial Equivalence Canon

**Versión:** 1.0  
**Fecha:** 2026-05-21 UTC  
**Status:** Contrato vigente (read-only hasta aplicación en código).  
**Referencias obligatorias:**
- `Equivalencias Divisiones Territoriales Mundo.pdf` (38 países).
- [`docs/audits/territorial-equivalence-global-implementation-audit.md`](../audits/territorial-equivalence-global-implementation-audit.md).
- Canon previo: [`docs/contracts/geo-territorial-canon.md`](./geo-territorial-canon.md) (containment v2).
- Norma raíz: `mem://geography/canonical-tree-spec`.

**Version impact:** none. Este documento NO modifica código, datos, migraciones, edge functions ni `package.json`. Codifica el contrato funcional que los siguientes PRs deberán cumplir.

---

## 0. Modelo canónico

Cuatro niveles funcionales universales derivados del PDF:

| Nivel funcional | Campo Vandits (FK) | Campo Vandits (texto resuelto en `v_locations_resolved`) |
|---|---|---|
| País | `country_id` | `country` |
| Región (CCAA / State / Région / Land / etc.) | `region_id` | `region` |
| Provincia (Provincia / Département / County / Provincia / etc.) | `zone_id` | `zone` |
| Municipio (Ayuntamiento / Commune / City / etc.) | `admin3_id` *o* `locality_id` cuando el país no tiene comarca intermedia | `admin_level_3` / `locality` |
| Localidad / Barrio / Pueblo | `locality_id` / `sublocality_id` | `locality` / `sublocality` |

**Reglas duras:**

1. **No inventar provincia.** Si el PDF declara `has_provincia=false`, `zone_id` y `zone` deben permanecer `NULL`. Nunca duplicar `region` en `zone`.
2. **No promover censal a administrativo.** Niveles censales o geográficos no administrativos (Brasil mesorregión, Australia county quasi-obsoleto, US Census Designated Place sin admin3) pueden quedar como texto en `locality`/`sublocality`, **nunca** como FK administrativa obligatoria.
3. **`region == zone` literal** solo es legítimo en regiones uniprovinciales declaradas explícitamente en §3.
4. **SoT de FK** sigue siendo `admin_areas` + `public.v_locations_resolved`. Texto (`region`, `zone`, etc.) es derivado, nunca fuente.

---

## 1. Tabla maestra de los 38 países

`has_provincia`: el país posee un nivel administrativo equivalente a "provincia" según el PDF.  
`region_eq_zone`: existen regiones uniprovinciales donde `region == zone` es legítimo (ver §3).  
`municipio_field`: dónde aterriza el municipio (`admin3` por defecto, `locality` si el país no tiene comarca/condado intermedio).  
`locality_field`: dónde aterriza la localidad/pueblo/barrio (`locality` o `sublocality`).

| # | País | iso2 | Región (PDF) | Provincia (PDF) | Municipio (PDF) | Localidad (PDF) | has_provincia | region_eq_zone | municipio_field | locality_field |
|---:|---|:---:|---|---|---|---|:---:|:---:|:---:|:---:|
| 1 | España | ES | CCAA | Provincia | Municipio | Localidad / Barrio / Pedanía | true | **sí** (uniprov.) | `admin3` | `locality` / `sublocality` |
| 2 | Francia | FR | Région | Département | Commune | Quartier / Village | true | no | `admin3` | `locality` / `sublocality` |
| 3 | Italia | IT | Regione | Provincia | Comune | Frazione | true | no | `admin3` | `locality` / `sublocality` |
| 4 | Reino Unido | GB | Nation / Region | County (Ceremonial) | Borough / Council | Parish / Town / Village | true | no | `admin3` | `locality` / `sublocality` |
| 5 | Estados Unidos | US | State | County | City / Township | Neighborhood / Census place | true | **sí** (DC) | `admin3` | `locality` / `sublocality` |
| 6 | Portugal | PT | Região / CCDR | Distrito | Concelho | Freguesia / Localidade | true | no | `admin3` | `locality` |
| 7 | Rumania | RO | Región histórica | Județ | Municipiu / Comună | Sat / Cartier | true | no | `admin3` | `locality` / `sublocality` |
| 8 | Alemania | DE | Land | Kreis / Landkreis | Gemeinde | Ortsteil | true | **sí** (ciudades-estado: Berlin, Hamburg, Bremen) | `admin3` | `locality` / `sublocality` |
| 9 | Finlandia | FI | Región / Maakunta | — | Municipality / Kunta | Village / District | **false** | n/a | `locality` | `sublocality` |
| 10 | Turquía | TR | Región geográfica | İl | Belediye / İlçe | Mahalle / Köy | true | no | `admin3` | `locality` / `sublocality` |
| 11 | Marruecos | MA | Región | Provincia / Prefectura | Commune | Douar / Quartier | true | no | `admin3` | `locality` / `sublocality` |
| 12 | Noruega | NO | Fylke | — | Kommune | Tettsted | **false** | n/a | `locality` | `sublocality` |
| 13 | Polonia | PL | Voivodato | Powiat | Gmina | Wieś / Osiedle | true | **sí** (ciudades con derechos de powiat) | `admin3` | `locality` / `sublocality` |
| 14 | Grecia | GR | Periferia | Unidad regional | Dimos | Comunidad / Barrio | true | no | `admin3` | `locality` / `sublocality` |
| 15 | Nigeria | NG | State | LGA | Council Ward | Ward / Village | true | no | `admin3` | `locality` / `sublocality` |
| 16 | Suiza | CH | Cantón | Bezirk | Gemeinde | Dorf / Quartier | true | **sí** (cantones sin distritos: GE, BS, NE, AI, AR, GL, UR, ZG, SH, NW, OW) | `admin3` | `locality` / `sublocality` |
| 17 | Austria | AT | Bundesland | Bezirk | Gemeinde | Ortschaft | true | **sí** (Wien) | `admin3` | `locality` / `sublocality` |
| 18 | Países Bajos | NL | Provincie | — | Gemeente | Wijk / Buurt | **false** | n/a | `locality` | `sublocality` |
| 19 | Ucrania | UA | Óblast | Raión | Hromada / Municipio | Pueblo / Barrio | true | no | `admin3` | `locality` / `sublocality` |
| 20 | Suecia | SE | Län | — | Kommun | Tätort / Stadsdel | **false** | n/a | `locality` | `sublocality` |
| 21 | China | CN | Provincia | Prefectura | Condado / Distrito | Pueblo / Aldea | true | **sí** (municipalidades directas: Beijing, Shanghai, Tianjin, Chongqing) | `admin3` | `locality` / `sublocality` |
| 22 | Argentina | AR | Provincia | Departamento / Partido | Municipio | Localidad / Barrio | true | **sí** (CABA) | `admin3` | `locality` / `sublocality` |
| 23 | Brasil | BR | Estado | Mesorregión (censal) | Município | Distrito / Bairro | **false (PDF: censal)** | n/a | `locality` | `sublocality` |
| 24 | Canadá | CA | Province / Territory | County / Reg. Mun. | Municipality | Hamlet / Neighborhood | true | no | `admin3` | `locality` / `sublocality` |
| 25 | Chile | CL | Región | Provincia | Comuna | Localidad | true | no | `admin3` | `locality` |
| 26 | Nueva Zelanda | NZ | Región | Distrito | Council | Suburb / Locality | true | no | `admin3` | `locality` / `sublocality` |
| 27 | Australia | AU | Estado / Territorio | County (cuasi-obs.) | LGA | Suburb / Town | **false (PDF: county obsoleto)** | n/a | `locality` | `sublocality` |
| 28 | Sudáfrica | ZA | Provincia | Distrito municipal | Mun. local | Township / Suburb | true | no | `admin3` | `locality` / `sublocality` |
| 29 | Bélgica | BE | Région / Gewest | Province | Commune / Gemeente | Section / Village | true | **sí** (Brussels-Capital) | `admin3` | `locality` / `sublocality` |
| 30 | Egipto | EG | Gobernación | Markaz | Ciudad / Municipio | Barrio / Aldea | true | **sí** (Cairo, Alexandria, Port Said, Suez, Luxor) | `admin3` | `locality` / `sublocality` |
| 31 | Indonesia | ID | Provincia | Regencia / Ciudad | Distrito (Kecamatan) | Desa / Kelurahan | true | **sí** (DKI Jakarta) | `admin3` | `locality` / `sublocality` |
| 32 | Japón | JP | Prefectura | Subprefectura | Municipio | Barrio / Aldea | **false (PDF: subpref. limitada a Hokkaidō / islas)** | n/a | `locality` | `sublocality` |
| 33 | México | MX | Estado | — | Municipio | Localidad / Colonia | **false** | n/a | `locality` | `sublocality` |
| 34 | Argelia | DZ | Wilaya | Daïra | Commune | Localité | true | no | `admin3` | `locality` |
| 35 | Colombia | CO | Departamento | Provincia (limitada) | Municipio | Vereda / Barrio | **false (PDF: provincia residual)** | n/a | `locality` | `sublocality` |
| 36 | Corea del Sur | KR | Provincia / Ciudad esp. | Condado / Distrito | Municipio / Eup-Myeon | Dong / Ri | true | **sí** (Seúl, Busan, Incheon, Daegu, Daejeon, Gwangju, Ulsan) | `admin3` | `locality` / `sublocality` |
| 37 | Filipinas | PH | Región | Provincia | Municipio / City | Barangay | true | **sí** (HUC sin provincia) | `admin3` | `locality` |
| 38 | India | IN | Estado | Distrito | Municipio / Panchayat | Aldea / Barrio | true | **sí** (territorios de la unión sin distritos) | `admin3` | `locality` / `sublocality` |
| 39 | Rusia | RU | República / Krai / Óblast | Raión | Gorod / Municipio | Posiólok / Aldea | true | **sí** (ciudades federales: Moscú, San Petersburgo, Sebastopol) | `admin3` | `locality` / `sublocality` |

> Nota: el PDF declara 38 países; Rusia se incluye como entrada operativa (catalogada en el PDF) y queda en la tabla aunque hoy no tiene POIs.

---

## 2. Política de NULLs por país

Regla general por nivel:

| Nivel | Cuándo es legítimo `NULL` |
|---|---|
| `country_id` | **Nunca.** Todo POI debe tener país resuelto. |
| `region_id` | Solo si el país carece de subdivisión de primer nivel administrativa (no aplica a ningún país del PDF). En la práctica: nunca. |
| `zone_id` / `zone` | Obligatoriamente `NULL` cuando `has_provincia=false` (FI, NO, NL, SE, BR, AU, JP, MX, CO). Permitido `NULL` puntual cuando el geocoder no devolvió `admin_level_2` válido en países con `has_provincia=true` (caso a saldar por backfill, no por contrato). |
| `admin3_id` | `NULL` admisible si `municipio_field='locality'` (el municipio entra en `locality_id`). En países con `municipio_field='admin3'`, `NULL` cuenta como deuda (`geo_health=partial`). |
| `locality_id` | `NULL` admisible en POIs no urbanos (parques naturales, picos, costa). No bloquea `POI-10` por sí solo. |
| `sublocality_id` | Siempre opcional. Nunca bloquea health. |

**Regla cross-nivel:**

- Si `zone_id IS NOT NULL` entonces `region_id IS NOT NULL` y `country_id IS NOT NULL` (jerarquía consistente).
- Si `admin3_id IS NOT NULL` y país tiene `has_provincia=true`, entonces `zone_id IS NOT NULL`.
- Si `locality_id IS NOT NULL` y país tiene `has_provincia=true` y `municipio_field='admin3'`, entonces `admin3_id IS NOT NULL` salvo excepción documentada (parish/village rural sin council).

---

## 3. Política para países sin provincia

Países `has_provincia=false`: **FI, NO, NL, SE, BR, AU, JP, MX, CO**.

Contrato:

1. `resolveAllFks()` **no puede asignar `zone_id`** en estos países, aun si el geocoder devuelve `admin_level_2`. Debe descartar el nivel.
2. `zone` (texto) debe quedar `NULL`. Prohibido copiar `region` en `zone`.
3. El municipio (`Kommune`, `Gemeente`, `Município`, `LGA`, etc.) aterriza en `locality_id`. `admin3_id` queda `NULL` por contrato.
4. Validadores de import (KML/GPX/CSV/`web_import`) deben rechazar `zone`/`zone_id` para estos países (warning + descarte silencioso del campo, sin abortar el import).
5. `GeographyTree` no renderiza nivel "Provincia" para estos países (nodo colapsado a 3 niveles: País → Región → Municipio → Localidad).

> Casos especiales fuera del PDF que aparezcan vía geocoder (Islandia, Mónaco, Liechtenstein, etc.): tratar como `has_provincia=false` por defecto hasta que el canon los incorpore.

---

## 4. Política para `region == zone` legítimo (uniprovinciales)

Casos donde `region_id == zone_id` (o nombre literalmente igual) es **correcto** y no debe tratarse como bug:

| País | Regiones / casos uniprovinciales legítimos |
|---|---|
| **ES** | Asturias, Cantabria, La Rioja, Madrid, Murcia, Navarra, Illes Balears, Ceuta, Melilla |
| **DE** | Berlin, Hamburg, Bremen (Stadtstaaten) |
| **AT** | Wien |
| **BE** | Brussels-Capital |
| **PL** | Ciudades con derechos de powiat (Warszawa, Kraków, Łódź, Wrocław, Poznań, Gdańsk, …) |
| **CH** | Cantones sin distritos: GE, BS, NE, AI, AR, GL, UR, ZG, SH, NW, OW |
| **AR** | CABA |
| **CN** | Municipalidades directas: Beijing, Shanghai, Tianjin, Chongqing |
| **EG** | Cairo, Alexandria, Port Said, Suez, Luxor |
| **ID** | DKI Jakarta |
| **KR** | Seúl, Busan, Incheon, Daegu, Daejeon, Gwangju, Ulsan |
| **PH** | Highly Urbanized Cities sin provincia (Manila, Cebu, Davao, …) |
| **IN** | Territorios de la unión sin distritos (Chandigarh, Lakshadweep, …) |
| **RU** | Ciudades federales: Moscú, San Petersburgo, Sebastopol |
| **US** | District of Columbia |

Contrato:

1. `resolveAllFks()` **puede** poblar `zone_id = region_id` cuando el geocoder lo confirme y la entrada esté en la lista anterior.
2. `GeographyTree` debe **colapsar** los dos niveles en un único nodo etiquetado `"<Nombre> · Región + Provincia"`.
3. `getLocationHierarchy()` debe deduplicar antes de renderizar breadcrumb.
4. Métrica `z=r` (zone == region) deja de contar como deuda cuando el caso está en lista blanca. Solo cuenta como ruido cuando aparece fuera de ella.
5. Casos nuevos detectados por el geocoder y no presentes en la lista: registrar en `docs/audits/` y proponer extensión del canon vía PR. No silenciar por defecto.

---

## 5. Contrato para `resolveAllFks`

`src/shared/geography/resolve-admin-fks.ts` debe operar bajo estas invariantes:

1. **Entrada obligatoria:** `country_code` (ISO2) resuelto antes de cualquier intento de FK regional/provincial.
2. **Consulta al canon:** antes de asignar `zone_id`, consultar la entrada del país en este documento (o su mirror codificado).
3. **Reglas duras:**
   - Si `has_provincia(country) === false` ⇒ **descartar** `admin_level_2` del geocoder. `zone_id := NULL`.
   - Si `municipio_field(country) === 'locality'` ⇒ municipio entra en `locality_id`, `admin3_id := NULL`.
   - Si `region_eq_zone(country, region)` está en lista blanca ⇒ permitir `zone_id = region_id`.
   - Si el geocoder devuelve `admin_level_2 == admin_level_1` y el país NO está en lista blanca ⇒ descartar `zone_id` y emitir warning estructurado (`geo_health.review='zone-equals-region-unlisted'`).
4. **Idempotencia:** dos llamadas consecutivas con las mismas coords y mismo geocoder deben producir el mismo set de FKs.
5. **Side-effects:** sólo `places`, `places_trunk` y `locations` (jerarquía territorial). Prohibido tocar `name`, `latitude`, `longitude`, `enriched_data.descripcion`, tags, colecciones, `raw_geocode`.
6. **No re-enrich.** Cambios de FK no disparan IA. Sólo afectan a `v_locations_resolved` y a `compute-geo-health`.

Mirror canónico (cuando se implemente): `src/shared/geography/territorial-canon.ts` (espejo TypeScript de §1) + espejo Deno `supabase/functions/_shared/territorial-canon.ts`. Contract test paritario obligatorio.

---

## 6. Contrato para imports

Aplica a todos los parsers: `KML/KMZ`, `GPX`, `GeoJSON`, `CSV`, `web_import`, `manual`, `scrape`.

1. Parsers **no pueden** poblar `zone`/`zone_id` en países con `has_provincia=false`. Si el origen lo trae, descartar y registrar warning estructurado en `import_warnings`.
2. Parsers **no pueden** poblar `admin3_id` en países con `municipio_field='locality'`. El municipio aterriza en `locality_id`.
3. Parsers **no pueden** inferir `region`/`zone`/etc. desde el nombre del POI. Solo desde geocoder o desde el propio origen (KML `<ExtendedData>` explícito).
4. Lifecycle `import_lifecycle_by_channel` no cambia: `kml/gpx/geojson/csv` siguen quedando en `normalized` (no auto-aprueban). El canon solo restringe **qué campos** se aceptan en `normalized`.
5. POIs importados sin `country_code` resoluble se marcan `geo_health='empty'` y entran al backlog de geo-repair. No se inventa país por coords arbitrarias.

---

## 7. Contrato para GeographyTree

`src/.../GeographyTree.tsx` debe:

1. **Colapsar nivel "Provincia"** cuando `has_provincia(country) === false`. Render: País → Región → Municipio → Localidad (4 niveles).
2. **Colapsar nodos `region==zone` legítimos** (§4) en un único nodo etiquetado `"<Nombre>"` con tooltip `"Región + Provincia"`. No mostrar el mismo texto dos veces seguidas en el breadcrumb.
3. **No mostrar `zone` texto vacío con `zone_id` presente.** Mientras la deuda #1 del audit (denormalización texto NULL con FK) no esté resuelta, GeographyTree debe leer la FK y resolver el nombre vía join (no confiar en `zone` texto).
4. **No emitir nodo "Provincia" inferido** desde `admin_level_2` cuando `has_provincia=false`. Aun si el dato existe, debe ignorarlo.
5. **Indicador visual de comparado vs. canónico:** opcional. Si un POI tiene `zone_id` espurio (país sin provincia) marcarlo en QA panel, no en UI usuario.

`getLocationHierarchy` debe respetar las mismas reglas. SoT de la jerarquía es esta función + `v_locations_resolved`.

---

## 8. Impacto sobre POI-5 / POI-6 / POI-10

### POI-5 (deuda objetiva, `geo_health`)

- Helper `compute-geo-health` debe consultar el canon antes de marcar `partial` por `zone NULL`:
  - `has_provincia=false` ⇒ `zone NULL` es **OK**, no `partial`.
  - `municipio_field='locality'` ⇒ `admin3_id NULL` es **OK**, no `partial`.
- `geo_health='partial'` se reserva para faltas reales contra el canon (no contra un modelo universal idealizado).
- Resolver la deuda #1 del audit (texto NULL con FK) sin canon ya promueve ~1.700 POIs a `ok`. Aplicar canon además limpia falsos `partial` en países sin provincia.

### POI-6 (enriquecimiento contextual)

- `getFilledLocationHierarchy` debe operar sobre la jerarquía canon-corregida. Países sin provincia no añaden ruido al prompt IA.
- Sin re-enrich masivo. Solo afecta nuevos enriquecimientos y re-runs explícitos.

### POI-10 (golden POI)

- Criterio `geoHealth='ok'` se vuelve **más estricto y a la vez más permisivo**: estricto para países con provincia (exige `zone_id`), permisivo para países sin provincia (no exige `zone_id`).
- Aplicar canon promueve automáticamente POIs en NL/SE/NO/FI/MX/BR/AU/JP/CO que hoy podrían estar bloqueados por exigencia inválida de `zone_id`.
- Estado personal sigue sin afectar health (regla dura del canon de curation levels).

---

## 9. Países sin cobertura actual

`MX, DZ, CO, KR, PH, IN, RU` — 0 POIs hoy. **Entran al canon** para que `resolveAllFks` y los parsers de import estén preparados cuando aparezcan los primeros POIs.

Cuando un POI de estos países entre, debe resolverse al primer intento sin necesidad de patch retroactivo.

---

## 10. Cambios futuros del canon

1. Cualquier modificación a §1, §3 o §4 requiere PR con label `canon-change` y referencia al PDF (o a una versión actualizada del PDF).
2. Adición de un país nuevo (fuera de los 38 del PDF) sigue el mismo flujo: PR con justificación, mapping completo (`has_provincia`, `municipio_field`, `locality_field`, `region_eq_zone`).
3. Contract tests obligatorios cuando se implemente el mirror TS/Deno:
   - `territorial-canon-parity.test.ts` — espejo TS ↔ Deno.
   - `territorial-canon-pdf-conformance.test.ts` — espejo TS ↔ tabla §1.
   - `resolve-admin-fks-canon.test.ts` — `resolveAllFks` respeta `has_provincia` y `region_eq_zone`.

---

## 11. Restricciones de este PR

- **No tocar código.**
- **No tocar datos.**
- **Sin migraciones.**
- **Sin re-enrich.**
- **Sin bump.** Version impact: **none**.
- Documento solo. Aplicación queda diferida a PRs separados, listados en [`docs/tech-debt.md`](../tech-debt.md).
