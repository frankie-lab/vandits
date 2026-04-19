
El usuario quiere que `.kmz` sea importable. KMZ es un ZIP que contiene un `doc.kml` (más recursos: iconos, imágenes). El plan es descomprimirlo en cliente y delegar el contenido KML al parser existente.

## Plan

### 1. Dependencia
Añadir `jszip` (~100KB, sin deps) — ya hay precedente de libs cliente en el proyecto.

### 2. Nuevo `src/lib/kmz-parser.ts`
- Función `async parseKMZ(file: File | ArrayBuffer, fileName: string): Promise<KMLDocument>`.
- Abre el ZIP con JSZip.
- Localiza el primer `*.kml` dentro (normalmente `doc.kml`, pero algunos exports usan otros nombres).
- Lee como texto y delega a `parseKML(content, fileName)`.
- Si no encuentra KML interno → throw con mensaje claro.

### 3. `src/lib/geo-file-parser.ts` — ampliar API
Hoy `parseGeoFile(content: string, fileName: string)` recibe siempre string. KMZ es binario, así que hay dos opciones:

- **Opción elegida**: cambiar la firma a `parseGeoFile(input: string | ArrayBuffer, fileName: string): Promise<ParseResult>` (async). Detecta KMZ por:
  1. Extensión `.kmz`, o
  2. Magic bytes `PK\x03\x04` al inicio si recibimos ArrayBuffer.
- Para KMZ → llama a `parseKMZ`, luego sigue el flujo normal de validación/warnings.
- Resto de formatos: si llega ArrayBuffer, decodificar a UTF-8.

### 4. Registrar formato
En `SUPPORTED_FORMATS`:
```ts
{
  id: 'kmz',
  name: 'KMZ',
  extensions: ['.kmz'],
  description: 'KML comprimido (Google Earth)',
  platforms: ['Google Earth'],
  mimeTypes: ['application/vnd.google-earth.kmz', 'application/zip'],
}
```
`getAcceptedExtensions()` se actualiza solo.

### 5. Adaptar lectores de archivo
`FileUploadZone.tsx` y cualquier sitio que hoy haga `file.text()` debe, para `.kmz`, usar `file.arrayBuffer()`. Lo más limpio: helper `readFileForParsing(file)` que devuelve `ArrayBuffer` si la extensión es `.kmz` o `string` en otro caso. Luego pasa a `parseGeoFile`.

### 6. Preservación del original
`original-file-preservation` ya guarda el raw en el bucket `document-originals` — soporta binario sin cambios; solo verificar que el `Content-Type` se setea correctamente (`application/vnd.google-earth.kmz`).

### 7. Tests
- `parsers.test.ts`: añadir test de KMZ usando un buffer ZIP mínimo construido con JSZip in-memory que contiene un `doc.kml` de 1 placemark.

### 8. Memoria
Actualizar `mem://features/import/unified-two-step-flow` añadiendo KMZ a los formatos soportados.

## Archivos a tocar

| Archivo | Cambio |
|---|---|
| `package.json` | + `jszip` |
| `src/lib/kmz-parser.ts` (nuevo) | Descompresión y delegación a parseKML |
| `src/lib/geo-file-parser.ts` | Firma async + detección KMZ + nuevo formato |
| `src/domains/content/lib/parsers.ts` | Re-export `parseKMZ` |
| `src/domains/content/components/FileUploadZone.tsx` | Lectura como ArrayBuffer para `.kmz` |
| `src/services/import.service.ts` (si llama a parseGeoFile) | Adaptar al nuevo flujo async/binary |
| `src/test/parsers.test.ts` | Test KMZ |
| `mem://features/import/unified-two-step-flow` | Añadir KMZ |

## Limitaciones conocidas

- Los **iconos y overlays** dentro del KMZ (carpeta `images/`, `files/`) se ignoran — solo extraemos geometría/metadatos del KML interno (mismo trato que para KML hoy).
- Si el KMZ contiene **varios `.kml`**, se procesa solo el primero (típicamente `doc.kml`). Documentar.

## Verificación

1. Subir `FullTrips.kmz` desde la zona de carga.
2. Aparece en el diálogo de revisión con todos los Placemarks (igual que un KML).
3. Tras confirmar, los puntos llegan al mapa con la misma simbología que un KML importado.
4. El archivo raw `.kmz` queda guardado en `document-originals/{user_id}/{doc_id}/`.
5. Recargar la página: documento y puntos persisten.
