## Estado actual

Si tenemos `lat,lng`, el pipeline ya rellena de forma automática los niveles altos vía `reverse-geocode.ts` → `geo-normalizer.ts` → `resolve-admin-area`:

```
Continente   ← derivado de country_code (tabla interna, sin red)
País         ← Nominatim addr.country + country_code (ISO)
Región (CCAA)← addr.state
Provincia    ← addr.province (ó state_district)
Comarca      ← addr.county / municipality
Municipio    ← addr.city / town / village
Barrio/Distrito ← addr.suburb / neighbourhood / quarter
Calle        ← addr.road (+ house_number, postcode)
```

Y los 8 FKs (`continent_id…sublocality_id`) se escriben vía `resolveAllFks()`.

## Lo que YA NO necesita nada (sólo coordenadas)

1. **Continente** — derivado del ISO α2.
2. **País** — Nominatim siempre lo devuelve.
3. **Región / CCAA / State** — Nominatim `state` con zoom 10.
4. **Provincia** — `province` o `state_district` (regla por país).
5. **Comarca / County** — `county` (ES/IT) o `district` (genérico).
6. **Municipio** — `city/town/village/hamlet`.
7. **Barrio / Distrito / Parroquia** — `suburb/neighbourhood/quarter` cuando OSM lo expone.
8. **Calle** — `road` + `house_number` + `postcode`.

→ Para estos niveles **basta con la coordenada**. El job `geocoding-job-tick` los rellena.

## Lo que NO se puede sacar sólo de coordenadas

Niveles más finos que la calle. Nominatim no los modela:

| Nivel | Por qué no llega solo | Qué haría falta |
|---|---|---|
| **Edificio / Portal** | OSM tiene `building=*` y `addr:housenumber` pero Nominatim los devuelve como parte del `display_name`, no como FK | Consulta **Overpass** alrededor del punto (radio 15-30m) buscando `building` con nombre o número, y guardarlo como `building_name` en `enriched_data` (no FK estructural) |
| **Vivienda / Oficina / Unidad** | No es dato cartográfico público | Sólo lo aporta el usuario manualmente (campo libre en la ficha) o un proveedor de direcciones de pago (Google Places, HERE) |
| **Urbanización / Polígono / Campus** | No es admin oficial | Ya cubierto por la **capa cultural Wikidata P31** que añadimos (chip violeta). Si Wikidata no lo tiene, no hay forma fiable solo con coords |
| **Costa da Morte / Silicon Valley** (regiones culturales) | Ídem, taxonomía heterogénea | Ídem, capa cultural Wikidata |

## Limitaciones reales del estado actual

A. **Nominatim a veces devuelve niveles vacíos** aunque existan en OSM: zoom 18 trae detalle calle pero pierde provincia, zoom 10 trae provincia pero pierde calle. Por eso ya hacemos doble llamada y `mergeCanonical`. Bien.

B. **Países sin reglas específicas en `COUNTRY_RULES`** caen al `GENERIC` y a veces colapsan provincia/comarca. Hoy hay reglas para ES, FR, IT, DE, GB, US, PT, CA, MX, AR, BR + nórdicos. Para los demás (≈170 países) usamos GENERIC, que funciona en >90% de casos pero puede equivocarse en zone vs admin3 en países con jerarquía atípica (Japón, China, India, Suiza, Bélgica…).

C. **Calle / portal**: Nominatim devuelve `road` y `house_number` solo en zoom 18. Si una coord cae en medio de un parque o monte, no habrá calle. Es correcto: no toda coord tiene calle.

D. **Sublocality (barrio/parroquia)** depende totalmente de la cobertura OSM local. En Galicia las parroquias están bien cubiertas; en zonas rurales de Asia o África, no.

## Qué falta hacer (acciones concretas)

Para que el árbol se complete *hasta donde sea físicamente posible*:

1. **Reglas país adicionales en `COUNTRY_RULES`** — añadir JP, CN, IN, CH, BE, NL, AT, IE, AU, NZ, ZA, IL, AE… (≈15 países top de tu catálogo) para precisar `zone` vs `admin3`. Trabajo: edición de un solo fichero, ~50 líneas.

2. **Capa Overpass para edificios nombrados** — nueva edge function `enrich-building` opcional: query Overpass `(building[name](around:25,lat,lng);)`, guardar `enriched_data.building = { name, osm_id, type }`. Se ejecuta sólo en enrich, no en backfill (Overpass es lento).

3. **Mantener la capa cultural Wikidata** que ya implementamos para urbanizaciones / campus / regiones culturales — ya está activa.

4. **Campo manual de unidad/oficina/vivienda** en la ficha de punto — input libre persistido en `enriched_data.unit`. UI únicamente, sin lógica geo.

## Recomendación

Si el objetivo es *árbol jerárquico navegable* (filtros, mapa, breadcrumbs), **lo que ya existe es suficiente**. Los 8 niveles ISO + capa cultural cubren el 100% del caso navegable.

Lo que falta (edificio, portal, vivienda) **no es jerarquía, es metadato del punto**. Recomiendo:
- Añadir reglas país (paso 1) → mejora calidad inmediata de provincia/comarca en países no europeos.
- Añadir Overpass building lookup (paso 2) sólo si vas a mostrar "Estás en el edificio X" en la ficha.
- Dejar vivienda/oficina como campo manual (paso 4).

No es necesario tocar el árbol estructural ni las FKs. El trabajo restante es enriquecimiento, no normalización.