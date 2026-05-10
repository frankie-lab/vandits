## Objetivo

Aprovechar el enriquecimiento (Wikidata) para colgar de cada punto un nivel extra **no-administrativo** (regiones culturales, áreas funcionales, microtopónimos) cuando Wikidata lo identifique. Sin tocar el árbol ISO/Nominatim que ya está en marcha.

## Estado actual (no se modifica)

- Jobs de re-geocodificación corriendo en background (~50/min, ~1h30m). Galicia → 4 provincias, UK → 4 regiones, etc.
- `geo-normalizer.ts` es helper único; toda ingestión nueva pasa por él automáticamente.
- Árbol canónico vivo: Continente → País → Región → Provincia → Comarca → Municipio → Distrito/Barrio → Calle.

## Qué se añade

### 1. Capa Wikidata "tipo de lugar extendido"

Durante `enrich-location` (que ya consulta Wikidata), leer la propiedad **P31 (instance of)** y mapear a una taxonomía cerrada de tipos no-administrativos:

```text
Q1620908  región cultural          → cultural_region
Q1907114  área metropolitana       → metro_area
Q3957     ciudad                   → (ya cubierto)
Q1187811  campus universitario     → campus
Q2143825  polígono industrial      → industrial_park
Q123705   barrio                   → (ya cubierto: sublocality)
Q11315    centro comercial         → shopping_center
Q1248784  aeropuerto               → (ya cubierto: type_id)
Q183061   urbanización             → urbanization
Q2074737  zona funcional/distrito  → functional_zone
Q15243209 región histórica         → historical_region
... (lista cerrada ~20 tipos)
```

Lo no mapeado se ignora (no se inventan nodos).

### 2. Persistencia

- **NO** crear nuevos `place_types` administrativos ni nuevos slots FK en `locations`.
- Guardar el resultado en `enriched_data.cultural_context`:
  ```json
  {
    "cultural_context": {
      "wikidata_id": "Q1054397",
      "type_code": "cultural_region",
      "type_label": "Región cultural",
      "name": "Costa da Morte",
      "source": "wikidata"
    }
  }
  ```
- Es información **enriquecida**, no estructural. No rompe el árbol ISO.

### 3. UI

- En la ficha/popup, debajo de la jerarquía administrativa, una línea extra:
  > *Costa da Morte (región cultural)* · *Campus de Elviña (campus)*
- En el árbol jerárquico de filtros (`getLocationHierarchy`) **no** se inserta como nivel: sigue siendo 8 niveles administrativos. Los contextos culturales se muestran como **chips/tags** en la tarjeta.

### 4. Helper único

`src/shared/geography/cultural-context.ts`:
- `extractCulturalContext(wikidataEntity)` → devuelve `{ type_code, name, wikidata_id } | null`
- Llamado desde `enrich-location` justo después de obtener Wikidata.

### 5. Memoria

Nueva entrada `mem://geography/cultural-context-layer` documentando que la capa cultural vive en `enriched_data.cultural_context`, alimentada solo por Wikidata, fuera del árbol administrativo.

## Archivos afectados

- `supabase/functions/enrich-location/index.ts` — añadir extracción P31 → cultural_context.
- `src/shared/geography/cultural-context.ts` (nuevo) — mapa Wikidata-Q-id → type_code y helper.
- Tarjeta/popup de location (componente que ya muestra `enriched_data.tags`) — render del chip cultural.
- `mem://geography/cultural-context-layer` (nuevo).

## Fuera de alcance

- No se crean tablas nuevas.
- No se modifica el árbol administrativo ni los slots FK.
- No se hace backfill masivo: la capa cultural se rellena solo cuando un punto se enriquece (existente o nuevo). Los ~4747 puntos en re-geocodificación quedarán con árbol administrativo limpio; la capa cultural se irá poblando a medida que pasen por enriquecimiento.

## Validación

- Punto en Camariñas → árbol ISO: ES > Galicia > A Coruña > Terra de Soneira > Camariñas. Cultural: *Costa da Morte*.
- Punto en Mountain View → árbol ISO: US > California > Santa Clara > Mountain View. Cultural: *Silicon Valley*.
- Punto en una vivienda residencial sin Wikidata → solo árbol administrativo, sin chip cultural.
