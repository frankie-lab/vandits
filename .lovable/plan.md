# PR-EXPORT-6 — GuruMaps Target Renderer

Separar **content model** (PR-EXPORT-5, intacto) de **rendering target**. KML deja de asumir un único renderer universal: ahora elige renderer por `target`.

## Auditoría compatibilidad GuruMaps (documentada en doc canon)

GuruMaps (Android/iOS) sobre `<description>` KML:
- **Renderiza bien**: texto plano dentro de CDATA, saltos de línea `\n`, unicode (emoji incl.), URLs auto-linkificadas.
- **Soporte parcial / inconsistente**: `<br/>`, `<b>`, `<a href>` (en builds recientes), `<img>` (carga remota condicional, suele fallar offline).
- **Muestra literal o rompe**: `<p>`, `<i>`, entidades HTML mal escapadas, paredes de texto >~800 chars, hashtags densos.
- **Ignora**: `<script>`, `<style>`, atributos `on*`, clases CSS.

Conclusión: **plain-text first** con saltos de línea reales, sin tags. Emoji como separador visual. URLs cortas auto-linkificadas por la app.

## Arquitectura

### Nuevo contrato

```ts
// src/domains/content/lib/exporters/render-export-description.ts
export type ExportRenderTarget = 'generic' | 'gurumaps';
export function renderExportDescription(
  content: PoiExportContent,
  opts: { format: 'kml'; target: ExportRenderTarget; scope: PoiExportScope; generatedAt?: string }
): { body: string; wrapInCdata: boolean };
```

- `target='gurumaps'` → `buildGuruMapsDescription()` (plain text con `\n`, sin tags HTML, CDATA opcional para preservar saltos).
- `target='generic'` → delega en el actual `buildKmlDescriptionHtml()` (HTML con whitelist; sin cambios de comportamiento).
- Default cuando no se especifica target en `serializePoiKml` = `'gurumaps'` (es el caso real de uso hoy). Cambio de default documentado.

### Nuevo módulo `gurumaps-description.ts`

`buildGuruMapsDescription(content, { generatedAt })`:

Orden de bloques, separados por línea en blanco (`\n\n`):
1. **📍 ubicación corta**: `locality · province · country` (omitir vacíos, máx 3 niveles).
2. **Highlight** (prioridad): `summary.highlight` truncado a 180 chars con ellipsis.
3. **Resumen**: si no hay highlight, primeros ~280 chars de `longDescription` por frase completa (no corta palabra).
4. **🏷 Categoría/tags**: `category — #tag1 #tag2 #tag3` (máx 5 tags, dedupe ya hecho por modelo).
5. **📝 Nota**: `observation` si existe, truncada a 200 chars.
6. **🔗 Enlaces** (máx 3): label corto + URL compacta:
   - `Wikipedia: <url>` si host contiene `wikipedia`.
   - `Web oficial: <url>` para `provenance.webReference`.
   - `Más info: <url>` para el resto.
   - Hostname-only display si URL > 60 chars (`https://es.wikipedia.org/...` → `es.wikipedia.org`), URL completa en línea propia para que GuruMaps la auto-linkifique.
7. **Footer mínimo**: `— Vandits · YYYY-MM-DD` (sólo fecha, no ISO completo).

Reglas duras:
- **Sin tags HTML**. Sin `<p>`, `<br/>`, `<b>`, `<i>`, `<a>`, `<img>`.
- **Escape mínimo**: sólo `&` → `&amp;`, `<` → `&lt;`, `>` → `&gt;` (necesario incluso en CDATA si el contenido lleva `]]>`, sanitizar split).
- **Imagen**: GuruMaps no la renderiza fiable en description → **omitida** del cuerpo. Se mantiene en `ExtendedData` para apps que la lean.
- **Truncation helper** `truncateAtSentence(text, max)`: corta en último `.`/`!`/`?` antes de `max`, fallback espacio, añade `…`.
- **Tags**: máx 5, prefijo `#`, sin duplicados con `category`.
- **Total length** soft cap ~900 chars; si excede, recortar más agresivamente longDescription antes que otros bloques.

### Cambios en `poi-kml.ts`

- `SerializePoiKmlOptions.target` ya existe (`KmlExportTarget`). Reemplazar tipo por `ExportRenderTarget` reutilizable.
- En `renderPlacemark`, sustituir llamada directa a `buildKmlDescriptionHtml` por `renderExportDescription({ format: 'kml', target, scope })`.
- `wrapInCdata=true` para ambos targets (preserva `\n` y `<`).
- ExtendedData intacto (no es UI usuario, sirve a parsers).
- Default target cambia a `'gurumaps'`. Llamadas existentes pasan target explícito si quieren `'generic'`.

### Fuera de alcance (no tocar)

PR-EXPORT-1 elegibilidad, PR-EXPORT-2 DTO/thresholds, PR-EXPORT-3 ExportResolver UX, PR-EXPORT-4 scope semantics, PR-EXPORT-5 content model, CSV/JSON/GeoJSON serializers, GPX, jobs, RLS, ownership.

## Tests (`src/test/pr-export-6-gurumaps-renderer.test.ts`)

Fixtures: Torre de Hércules (`makeTorreHerculesFixture`, ya existe) + nuevo `makeMazingerZFixture` (POI simple urbano con web oficial + tags).

Casos:
1. GuruMaps output **no contiene** `<p>`, `<br`, `<b>`, `<i>`, `<a `, `<img`.
2. GuruMaps output **no contiene** URLs > 200 chars repetidas; cada URL aparece una sola vez.
3. GuruMaps output mantiene **estructura legible**: ≥3 bloques separados por `\n\n`, total ≤ 1200 chars.
4. **Truncation**: longDescription >2000 chars → output ≤ 1200 chars, termina en `…`.
5. **Highlight priorizado**: si existe `highlight`, aparece antes que `longDescription` y el longDesc se omite o reduce.
6. **Links compactados**: ≥4 fuentes input → output muestra máx 3.
7. **Tags compactados**: 20 tags input → máx 5 en output, prefijo `#`.
8. **Generic target** sigue produciendo HTML con tags whitelisted (regresión PR-EXPORT-5).
9. **Target switching**: misma `PoiExportContent`, `target='gurumaps'` vs `target='generic'` produce outputs distintos verificables.
10. **CDATA wrap** en ambos casos; `]]>` en contenido se sanitiza (split en `]]]]><![CDATA[>`).
11. **Footer Vandits** presente con fecha YYYY-MM-DD (no ISO completo).
12. **Sin emoji en HTML escape erróneo**: emoji literales `📍🏷📝🔗` presentes tal cual.
13. **Imagen omitida** del cuerpo GuruMaps pero `image_url` presente en `<ExtendedData>` del Placemark.

Suite PR-EXPORT-5 sigue verde (target generic intacto).

## Docs y memoria

- `docs/contracts/poi-export-content-model.md` → nueva sección "Rendering targets" + tabla compatibilidad GuruMaps + ejemplo before/after.
- `mem/logic/export/poi-export-content-model.md` → añadir regla: KML elige renderer por target, default `gurumaps`.
- `docs/releases/version-history.md` + `README.md` → entry PR-EXPORT-6.
- `package.json` + `src/lib/app-version.ts` → bump a **v1.5.8** (patch, sólo añade renderer + cambia default presentación, sin breaking en API ni en content model).

## Archivos

Crear:
- `src/domains/content/lib/exporters/render-export-description.ts`
- `src/domains/content/lib/exporters/gurumaps-description.ts`
- `src/test/fixtures/poi-mazinger-z-export.ts`
- `src/test/pr-export-6-gurumaps-renderer.test.ts`

Editar:
- `src/domains/content/lib/exporters/poi-kml.ts` (delegar a `renderExportDescription`, default target gurumaps)
- `docs/contracts/poi-export-content-model.md`
- `mem/logic/export/poi-export-content-model.md`
- `docs/releases/version-history.md`, `README.md`, `package.json`, `src/lib/app-version.ts`

QA manual posterior (out of code): capturas antes/después en GuruMaps Android con Torre de Hércules + Mazinger Z, adjuntar al PR.
