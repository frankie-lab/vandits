## Objetivo

Que el contador "(N errores)" del `BatchEnrichmentPanel` deje de ser opaco:
1. **A)** Separar visualmente *errores reales* (red, 5xx, timeout, créditos) de *rechazos por coherencia* (nombre↔coordenadas, sin candidato Wikipedia, ABORT controlado).
2. **B)** Hacer clic en el contador abre una **bandeja de resolución** con cada punto fallido, su motivo, y CTA para resolverlo manualmente reutilizando la pauta ya existente de **puntos cercanos / coherencia nombre-coordenadas** (`mem://logic/enrichment/name-coordinate-coherence`).

No tocamos la lógica de procesamiento del job ni el `enrich-location`. Solo clasificación de errores + UI de resolución.

---

## Cambios

### 1. Clasificación de motivos en `batch-enrich`

En `supabase/functions/batch-enrich/index.ts`, cuando un punto cae al `catch (enrichError)` (línea ~412), además de `errorIds.push(locationId)` y `errorMessages[locationId] = msg`, persistir un **kind** estructurado en `error_messages[locationId]`:

```ts
errorMessages[locationId] = {
  kind: 'coherence' | 'no_match' | 'rate_limit' | 'no_credits' | 'timeout' | 'network' | 'unknown',
  message: string,
  candidates?: Array<{ name, lat, lng, distanceKm, wikiUrl }>,  // si vienen del enrich
  nameLocation?: { lat, lng, distanceKm },                       // del check de coherencia
  httpStatus?: number,
}
```

Reglas de derivación (server-side, en el catch):
- `enrichData.error === 'name_coordinate_mismatch'` o presencia de `candidates`/`nameLocation` → `kind: 'coherence'`.
- `enrichData.success === false && !candidates` → `kind: 'no_match'`.
- `Enrich failed: 429` → `rate_limit`. `402` → `no_credits`. `5xx` → `timeout`. `fetch` lanza → `network`.
- Resto → `unknown`.

`enrichment_jobs.error_messages` ya es `jsonb`; cambiar el shape de string→objeto es retro-compatible si el cliente lo lee tolerante.

**Migración**: ninguna. La columna ya existe.

### 2. Tres contadores en el header del job (A)

`src/domains/content/components/BatchEnrichmentPanel.tsx` (header):
- En vez de `(4 errores)`, derivar del `error_messages`:
  - **Errores** (rojo): `kind ∈ {rate_limit, no_credits, timeout, network, unknown}`.
  - **Sin coincidencia** (ámbar): `kind ∈ {coherence, no_match}`.
- Render: `23 de 71 · 2 errores · 2 sin coincidencia` con los dos chips clicables (cada uno abre la bandeja filtrada).
- Si `error_messages` es legacy (string), todos cuentan como "errores".

### 3. Bandeja de resolución (B)

Componente nuevo `BatchEnrichmentErrorsSheet.tsx` (variante `workflow` del Panel System, ADR 003):
- Se abre desde el chip de errores del header del `BatchEnrichmentPanel`.
- Lista una fila por `locationId` ∈ `error_ids` del job activo, ordenada por jerarquía geográfica (`getLocationHierarchy`).
- Cada fila muestra: nombre, badge de motivo (color según kind), distancia (si coherencia), 3 acciones:

| Acción | Disponible cuando | Comportamiento |
|---|---|---|
| **Reintentar** | siempre | Llama `triggerEnrichLocation(loc, { skipValidation: true })` (helper único, ya existe); en éxito → marca verde, lo saca de `error_ids`. |
| **Abrir contexto cercano** | `kind ∈ {coherence, no_match}` | Cierra la bandeja, abre el `ProximityContext` del punto (mismo flujo que el clic en waypoint vacío, `mem://ui/map/unenriched-waypoint-click-behavior`). El usuario puede mover el punto a un candidato cercano o renombrar; al guardar, el bus de eventos relanza el reintento. |
| **Renombrar** | `kind === 'coherence'` con candidates | Abre input inline con sugerencias de `error_messages.candidates[].name`; al confirmar, hace `update locations set name = …` y reintenta. |

La bandeja se actualiza en realtime suscribiéndose al `enrichment_jobs` del job activo (ya hay canal en `BatchEnrichmentPanel`); cuando `processed_count` aumenta, se quita la fila correspondiente.

### 4. Centralizar la lectura de motivos

Helper único nuevo `src/domains/content/lib/enrichment-error-kind.ts`:
```ts
export type EnrichmentErrorKind = 'coherence' | 'no_match' | 'rate_limit' | 'no_credits' | 'timeout' | 'network' | 'unknown';
export function parseEnrichmentError(raw: unknown): { kind: EnrichmentErrorKind; message: string; candidates?: …; nameLocation?: … }
```
Usado por header (chips) y por la bandeja. Tolera el shape legacy (string).

### 5. Memoria

Nueva memoria `mem://logic/enrichment/batch-error-resolution`:
- 3 contadores en header (procesado / errores reales / sin coincidencia).
- Helper único `parseEnrichmentError`.
- Bandeja reutiliza `ProximityContext` y `triggerEnrichLocation({ skipValidation: true })`.

Añadir Core en index si lo merece o referenciar desde `mem://logic/enrichment/name-coordinate-coherence`.

---

## Detalles técnicos

- `enrich-location` ya devuelve `candidates`/`nameLocation` en el body cuando aborta por coherencia; basta con propagarlos al `error_messages` desde `batch-enrich` (no requiere cambios en `enrich-location`).
- Realtime: `BatchEnrichmentPanel` ya tiene la suscripción al job; la bandeja consume el mismo `useState` derivado, no abre canal nuevo.
- Los reintentos individuales NO crean nuevo job: actualizan directamente `locations` (vía `enrich-location` con `skipValidation:true`) y, en éxito, mutan el array `error_ids` del job para que el contador baje. UPDATE permitido por RLS al dueño del documento.
- Ningún cambio de schema, ninguna migración SQL.

---

## Archivos tocados

- `supabase/functions/batch-enrich/index.ts` — clasificar `kind` en el catch.
- `src/domains/content/lib/enrichment-error-kind.ts` — **nuevo** helper.
- `src/domains/content/components/BatchEnrichmentPanel.tsx` — chips clicables.
- `src/domains/content/components/BatchEnrichmentErrorsSheet.tsx` — **nuevo** componente bandeja.
- `mem://logic/enrichment/batch-error-resolution.md` — **nuevo**.
- `mem://index.md` — referencia.
