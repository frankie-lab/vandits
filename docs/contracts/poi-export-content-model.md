# POI Export Content Model (PR-EXPORT-5)

Canon de QUÉ datos exportables se extraen de un `GeoLocation` y cómo se
organizan por capas semánticas, scope-aware y format-aware. Extiende
PR-EXPORT-2 (DTO + pipeline + tamaño) y PR-EXPORT-1 (elegibilidad +
scope) sin romper sus contratos.

SoT código: `src/domains/content/lib/poi-export-content-model.ts`
(helper único `buildPoiExportContent`). Builder HTML KML:
`src/domains/content/lib/exporters/kml-description-html.ts`.

## Capas

| Capa | Nombre | Contenido | Scope |
|------|--------|-----------|-------|
| A | identity | id, slug?, name, primaryCategory | always |
| B | summary | highlight (`punto_destacado`), shortDescription, longDescription (`descripcion`), observation (`observacion`) | always |
| C | geography | country, region, province, locality, sublocality, address (`direccion_postal`) | always |
| D | media | imageUrl, imageAttribution (`imagen_fuente`), sourceUrl | always (public ⇒ URL pública validada) |
| E | classification | category, subcategory, tags (personales + IA + geo, dedupe), taxonomyLabel, curationLevel | always |
| F | userContext | createdAt, collection, personalNotes, ownState | **internal-only** |
| G | provenance | sources, webReference, vanditsCanonicalUrl | always (public ⇒ sólo URLs públicas) |
| H | forbidden | ownerUserId, RLS flags, debug, raw_geocode, secrets, caches, runtime internals | **NEVER** |

`FORBIDDEN_EXPORT_KEYS` lista las claves prohibidas; grep test
`pr-export-5-content-model.test.ts` bloquea regresiones.

## Matriz formato × capa

| layer | KML | CSV | JSON | GeoJSON |
|-------|-----|-----|------|---------|
| A identity | full | columns | full | properties |
| B summary | html | columns | full | properties |
| C geography | html+ExtendedData | columns | full | properties |
| D media | `<img>` en desc HTML + ExtendedData | url+attribution | full | properties |
| E classification | tags ExtendedData | columns | full | properties |
| F userContext | internal ExtendedData | internal columns | internal full | internal properties |
| G provenance | enlaces en desc HTML | `links` join `\|` | full | properties |
| H forbidden | NO | NO | NO | NO |

## KML rendering targets (PR-EXPORT-6)

KML deja de asumir un único renderer. El serializer delega en
`renderExportDescription(content, { format:'kml', target, scope })`
(`src/domains/content/lib/exporters/render-export-description.ts`).

Targets canónicos:

| target | renderer | rendererId | uso |
|--------|----------|-----------|-----|
| `gurumaps` *(default)* | `buildGuruMapsDescription` | `gurumaps-plain` | GuruMaps móvil — plain-text con `\n\n`, sin tags HTML, emoji separador, truncation por frase, links compactos. |
| `generic` (alias `general`, `mymaps`) | `buildKmlDescriptionHtml` | `generic-html` | Google Earth / My Maps / parsers tolerantes HTML — whitelist `<p>/<b>/<i>/<img>/<a>/<br/>`. |

Ambos targets envuelven en `<![CDATA[…]]>`. Sanitización de `]]>` en
`gurumaps` vía split `]]]]><![CDATA[>`. `ExtendedData` estructurada se
mantiene **siempre** (incluye `image_url` aunque `gurumaps` omita imagen
del cuerpo).

### Compatibilidad GuruMaps (auditada)

| Soporte | Elementos |
|---------|-----------|
| Renderiza bien | texto plano en CDATA, `\n`, unicode/emoji, URLs auto-linkificadas |
| Parcial / inconsistente | `<br/>`, `<b>`, `<a href>`, `<img>` (offline falla) |
| Muestra literal / rompe | `<p>`, `<i>`, paredes de texto >800 chars, hashtags densos |
| Ignora | `<script>`, `<style>`, atributos `on*`, clases CSS |

Conclusión: plain-text first, sin tags. Emoji como separador.

### Orden canónico `gurumaps`

1. `📍 ubicación` (`locality · province · country`, máx 3 niveles)
2. **highlight** (truncado a 180 chars, frase completa)
3. **longDescription** (truncado a 220–280 chars)
4. `🏷 categoría — #tag1…` (máx 5 tags, dedupe con categoría)
5. `📝 observación` (truncado a 200 chars)
6. `🔗 Enlaces` — máx 3, label corto (`Wikipedia`/`Web oficial`/`UNESCO`/`Más info`), hostname display + URL completa en línea propia
7. `— Vandits · YYYY-MM-DD`

Soft cap 900 chars, hard cap 1200 chars. Si excede: recortar `longDesc`
→ eliminar `classification` → eliminar `longDesc` → truncar global.

### Orden canónico `generic`

1. `<img>` principal (si `media.imageUrl`)
2. highlight en cursiva
3. longDescription (split por `\n\n` → `<p>`)
4. ubicación territorial `locality · province · region · country`
5. categoría + tags
6. observación
7. fuentes (web + sources http(s))
8. footer `Generado por Vandits · {ISO}`



## Scope rules (recordatorio)

- **internal** ("Mis datos"): máximo contexto útil propio. Imagen
  cualquier http(s). userContext incluido.
- **public** ("Compartible"): sólo contenido publicable. Imagen rechaza
  signed/token/X-Amz/Expires/sig/SAS. userContext omitido. Sources
  filtradas a http(s).

Elegibilidad la decide `evaluatePoiExport` (PR-EXPORT-1), no este modelo.

## Pipeline

```
GeoLocation
  → evaluatePoiExport             (PR-EXPORT-1)
  → mapToPoiExportRecord          (adjunta layeredContent vía buildPoiExportContent)
  → POI_EXPORTERS[format]         (KML/CSV/JSON/GeoJSON prefieren layeredContent)
  → Blob → download
```

## Tests

- `src/test/fixtures/poi-torre-hercules-export.ts` — fixture canon enriched completo.
- `src/test/pr-export-5-content-model.test.ts` — 12 tests:
  - capas A–G presentes/omitidas según scope; H jamás presente.
  - KML internal Torre Hércules: longDesc + highlight + ubicación + observación + imagen + CDATA + footer Vandits.
  - KML public excluye notas privadas (capa F).
  - KML HTML sólo tags whitelisted; sin `<script>`/`<style>`/`on*`/JSON crudo.
  - CSV expone nuevas columnas planas.
  - GeoJSON `[lng,lat]` + properties enriquecidas.
  - JSON expone `layeredContent` completo; nunca `ownerUserId`/`raw_geocode`.

## Fuera de alcance

- Sin cambios en RLS, `evaluatePoiExport`, thresholds, ExportResolver UX,
  jobs background, GPX, share canon, formato JSON envelope version.
