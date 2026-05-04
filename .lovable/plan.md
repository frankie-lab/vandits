# Export para Guru Maps — descripción limpia

## Problema

Guru Maps **no renderiza HTML** en el popup de un placemark. Muestra el texto tal cual. Por eso, en la captura aparecen literalmente `<b>`, `<br/>`, `<i>`, `<small>`, `<img src=...>` y la cadena de hashtags pegados sin separación (`#PlayaSantaGiulia#Córcega#...`).

Hoy `src/lib/kml-parser.ts → exportToKML()` usa **una única función** `formatEnrichedDescription()` para todos los destinos (Guru, My Maps, general). Esa función está pensada para HTML.

## Objetivo

Mantener **toda la información útil** que ya recogemos (descripción IA, datos clave, etiquetas, fuentes), pero presentarla en **texto plano bien maquetado** cuando el destino es Guru Maps. My Maps y la exportación general siguen usando HTML como ahora.

## Cambios

### 1. Nuevo formateador en `src/lib/kml-parser.ts`

Añadir `formatEnrichedDescriptionPlain(loc)` que produce texto plano UTF‑8 con:

- Saltos de línea reales (`\n`), nunca `<br/>`.
- Sin `<b>`, `<i>`, `<small>`, `<a>`, `<img>`.
- Párrafos partidos con el helper único `splitDescriptionParagraphs` de `src/shared/enrichment/format-description.ts` (memoria *Description paragraphs*).
- Separadores visuales con líneas de guiones (`────────────`).
- Etiquetas con espacios (`#Playa #Córcega #Mediterráneo`), no concatenadas.
- Fuentes como URLs limpias, una por línea, prefijadas con `• `.
- La imagen NO se incrusta como `<img>`; se emite como una línea `Imagen: <url>` (Guru no embebe pero al menos queda accesible). Opcionalmente la añadimos al campo `<Snippet>` o como `IconStyle` futura.

Estructura final del bloque (texto plano):

```text
Plage de Santa Giulia
Golfe de Santa Giulia, Porto-Vecchio, Corse-du-Sud, Corse, France

La Plage de Santa Giulia, ubicada en el idílico Golfo de Santa Giulia…

[párrafo 2]

[párrafo 3]

Destacado: Un edén mediterráneo donde las aguas turquesas…

Nota: La playa es popular, especialmente durante los meses de verano…

#Playa #SantaGiulia #Córcega #Francia #Mediterráneo #Familiar

────────────────────
Tipo: Playa de arena
Dimensión: Litoral arenoso de varios cientos de metros
Acceso: Acceso libre, con aparcamientos cercanos
Protección: No aplica protección específica
Coordenadas: 41.5311579, 9.2737819
Web: https://www.corsica.fr/...
────────────────────

Fuentes:
• https://www.corsica.fr/descobrir-corsica/...
• https://www.tripadvisor.es/Attraction_Review-...
• https://www.google.es/maps/place/...
```

### 2. `exportToKML()` recibe un parámetro `target`

Firma actual:
```ts
exportToKML(locations, documentName)
```
Nueva firma:
```ts
exportToKML(locations, documentName, target?: 'general' | 'mymaps' | 'gurumaps')
```

- `gurumaps` → `formatEnrichedDescriptionPlain` + `<![CDATA[...]]>` con texto plano.
- `mymaps` y `general` → mantienen `formatEnrichedDescription` (HTML actual).

Para Guru, además, añadimos `<Snippet maxLines="2">` con `nombre_lugar — localizacion` (Guru lo usa como subtítulo en la lista) y mantenemos `<ExtendedData>` igual.

### 3. Punto de llamada

`src/domains/content/components/ExportPanel.tsx` ya pasa el `target`. Solo hay que reenviarlo a `exportToKML(locations, name, target)`.

`src/components/filters/SelectionActions.tsx` (export sobre selección) hace lo mismo.

## Detalles técnicos

- Helper de párrafos: reutilizar `splitDescriptionParagraphs` (ya existe, ver memoria *Description paragraphs*). No duplicar lógica.
- Separadores: usar `'─'.repeat(20)` (carácter U+2500) — Guru lo renderiza como línea fina.
- Sanitización: stripear cualquier `<...>` residual con `.replace(/<[^>]+>/g, '')` antes de emitir, por si el texto IA llegara con tags.
- No tocamos KML schema (`<Placemark>`, `<Point>`, `<ExtendedData>`). Solo cambia el contenido de `<description>` y se añade `<Snippet>` para Guru.
- No afecta a CSV/JSON ni a My Maps.

## Tests

- `src/test/parsers.test.ts` ya cubre roundtrip KML. Añadir un caso que verifique que el output con `target='gurumaps'` no contiene `<b>`, `<br>`, `<img`, `<small>`.

## Lo que NO se toca

- Marker grammar V2 (frozen).
- `formatEnrichedDescription` original (la usan My Maps y general).
- Esquema de `enriched_data` ni la edge function `enrich-location`.
- Lógica de tracking de `useExportTracking`.
