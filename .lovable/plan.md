

## Diagnóstico — qué pierde cada parser hoy

Mismo viaje en 3 formatos produce 3 resultados distintos. Auditoría por parser:

| Capacidad | KML | GPX | GeoJSON | CSV |
|---|---|---|---|---|
| Puntos (`Point`/`<wpt>`) | ✅ | ✅ | ✅ | ✅ |
| Rutas (`LineString`/`<trk>`/`<rte>`) | ❌ **se pierden o degradan a primer punto** | ✅ | ✅ | n/a |
| Color de ruta (`<color>`/`stroke`/`rgb`) | ❌ | ❌ | ✅ (solo `rgb`) | n/a |
| Altitud por punto | ✅ | ✅ | ✅ | ✅ |
| Descripción (`desc`/`cmt`) | ✅ | parcial (solo `desc`/`cmt`) | ✅ | ✅ |
| Timestamp del punto (`<time>`/`TimeStamp`/`when`) | ✅ | ❌ **ignora `<time>`** | ❌ **ignora `properties.time`** | ❌ |
| Continente/país/región/zona auto | ✅ (parcial: no calcula `getContinent` para todos) | ❌ | ❌ | ❌ |
| `customData` / `ExtendedData` / `properties` extra | ✅ | ❌ | ❌ (todo en properties se descarta salvo name/desc) | ❌ |
| Endpoints de ruta (regla: **no** crear marcadores) | n/a (no parsea rutas) | ✅ | ✅ | n/a |
| Fecha del documento (`metadata/time`) | ✅ | parcial | ❌ | ❌ |

**Lo más grave**: KML pierde rutas, GPX/GeoJSON pierden timestamps + ExtendedData, GPX/GeoJSON pierden cálculo geográfico inicial (continente).

## Contrato unificado

Un único contrato interno `ParsedGeoContent` que **todos los parsers deben rellenar al máximo de su capacidad**, sin pérdida:

```ts
// src/lib/parsers/parsed-content.ts (NUEVO)
interface ParsedPoint {
  id: string;
  name: string;
  description?: string;
  coordinates: { lat; lng; altitude? };
  timestamp?: Date;        // <time>, TimeStamp, properties.time, customData[date]
  continent?: string;      // siempre calculado por coords
  country?: string; region?: string; zone?: string; // si vienen en metadata
  customData?: Record<string,string>; // TODO lo no estándar va aquí
}
interface ParsedRoute {
  id: string;
  name: string;
  coordinates: [number,number][];
  color?: string;          // hex normalizado desde rgb/<color>/stroke
  date?: Date;             // primera <time> del track / metadata
  customData?: Record<string,string>;
}
interface ParsedGeoContent {
  documentName: string;
  fileName: string;
  documentDate?: Date;     // metadata/time del archivo
  points: ParsedPoint[];
  routes: ParsedRoute[];
  documentCustomData?: Record<string,string>;
}
```

## Cambios por archivo

### 1. `src/lib/parsers/shared.ts` (NUEVO)
Helpers comunes que hoy viven solo en KML:
- `getContinent(lat, lng)` (mover desde kml-parser)
- `cleanText(html)` (mover desde kml-parser)
- `parseFlexibleDate(str)` (mover desde kml-parser)
- `extractRouteEndpoints` regla común (no crear puntos para inicio/fin)
- `normalizeColor(input)` → hex (`rgb` numérico, `#aabbcc`, `aabbccff` KML ABGR)

### 2. `src/lib/kml-parser.ts`
**Añadir parseo de rutas** que hoy no existe:
- Parsear `LineString/coordinates` y `MultiGeometry/LineString` como `ParsedRoute` (no como punto degradado).
- Leer `<Style><LineStyle><color>` (KML usa `aabbggrr`) y normalizar a hex.
- Leer `<TimeStamp>/<when>` también para waypoints, ya implementado — mantener.
- Aplicar regla de endpoints: si un Placemark es solo LineString, NO crear punto extra.

### 3. `src/lib/gpx-parser.ts`
- Leer `<wpt><time>`, `<trkpt><time>` (primer punto = `route.date`).
- Leer `<metadata><time>` → `documentDate`.
- Leer `<extensions>` (Garmin/Strava) y volcar a `customData`.
- Leer color en `<extensions><gpxx:DisplayColor>` y `<extensions><line><color>` → normalizar.
- Calcular `continent` con helper común para cada wpt.

### 4. `src/lib/geojson-parser.ts`
- Leer `properties.time` / `properties.timestamp` / `properties.when` → `timestamp`.
- Volcar **todas** las `properties` no estándar a `customData` (hoy se descartan salvo name/desc).
- Leer `properties.stroke` / `properties.color` además del `rgb` actual → normalizar.
- Calcular `continent`/etc. con helper común.

### 5. `src/lib/csv-parser.ts`
- Volcar columnas no estándar (todas las no mapeadas) a `customData`.
- Detectar columna de fecha (`date`, `fecha`, `time`, `timestamp`) → `timestamp` con `parseFlexibleDate`.
- Calcular `continent` con helper común.

### 6. Adaptación al downstream (sin romper consumidores)

`KMLDocument`/`GeoLocation`/`ImportedRoute` ya tienen los campos necesarios (`customData`, `continent`, `country`, `routes[].color`, `routes[].date`). Solo **falta añadir** `timestamp` opcional a `GeoLocation` (mapear desde `ParsedPoint.timestamp` a `createdAt` cuando no hay otro y guardar también en `customData.timestamp` para conservación).

Cada parser mantiene su firma pública actual (`parseXxx(content, fileName) → KMLDocument`) y **internamente**:
1. Construye `ParsedGeoContent` (rico).
2. Lo mapea a `KMLDocument` con un único `toKMLDocument(parsed)` compartido en `shared.ts`.

Esto garantiza que añadir un campo nuevo en el futuro se hace una sola vez.

### 7. Test transversal nuevo (`src/test/parsers-parity.test.ts`)
Mismo viaje sintético (2 puntos + 1 ruta + 1 timestamp + 1 color) en KML/GPX/GeoJSON y se verifica que los tres producen:
- `points.length === 2`
- `routes.length === 1`
- `routes[0].color === '#ff0000'`
- `points[0].timestamp` definido
- `points[0].continent === 'Europa'`

Si un parser pierde algún campo, el test falla.

## Resumen del entregable

```text
NEW    src/lib/parsers/shared.ts          (helpers + toKMLDocument + ParsedGeoContent type)
EDIT   src/lib/kml-parser.ts              (+ rutas, + color, refactor a shared)
EDIT   src/lib/gpx-parser.ts              (+ timestamp, + color, + extensions, + continent)
EDIT   src/lib/geojson-parser.ts          (+ timestamp, + customData completo, + color, + continent)
EDIT   src/lib/csv-parser.ts              (+ customData completo, + timestamp, + continent)
EDIT   src/types/location.ts              (+ timestamp?: Date opcional en GeoLocation)
NEW    src/test/parsers-parity.test.ts    (paridad transversal entre los 3 formatos)
```

Sin cambios de BBDD, sin cambios en repositorios/servicios, sin cambios en UI: todo el "más rico" se canaliza a través de campos que ya consume el flujo (`customData`, `routes`, `color`, `continent/country`, `createdAt`).

