# Fase 4 — Prompt + validator: IA fuera de geografía estructurada

Contrato: `docs/contracts/enrichment-coord-coherence-contract.md` (R4 + R5).
Objetivo: la IA NO puede emitir ni sobrescribir geografía estructurada. El sistema solo acepta `lugar_interes` (y `direccion_postal`) como contribución editorial de la IA en `datos_geograficos`. Todo lo demás viene exclusivamente de `resolve-coordinates` (Fase 2).

## Alcance

- `supabase/functions/enrich-location/index.ts` (prompt + post-parse sanitización + merge)
- `supabase/functions/_shared/card-schema.ts` (recortar `datos_geograficos.jsonShape` + `promptHint` para no pedir campos prohibidos)
- Nuevo helper isomórfico `ai-payload-sanitizer`
- `supabase/functions/batch-enrich/index.ts` — sin cambios funcionales (delega a `enrich-location`); revisar mensajes propagados
- Tests nuevos
- Versión + docs

## Cambios técnicos

### 1. Helper sanitizador (isomórfico)

Crear:
- `src/shared/enrichment/ai-payload-sanitizer.ts`
- `supabase/functions/_shared/ai-payload-sanitizer.ts` (mirror byte-equivalente)

API:
```ts
export const PROHIBITED_AI_GEO_FIELDS = [
  'coordenadas','pais','admin_nivel_1','admin_nivel_2','admin_nivel_3',
  'continente','localidad','sublocalidad',
] as const;

export const PROHIBITED_PLACEHOLDER_RE =
  /^\s*\(\s*sin\s+[^)]+\)\s*$/i;  // (sin región), (sin provincia), (sin comarca), (sin localidad)…

export interface SanitizeReport {
  removedGeoFields: string[];
  removedPlaceholders: Array<{ path: string; value: string }>;
}

export function sanitizeAiEnrichmentPayload(
  payload: unknown
): { sanitized: any; report: SanitizeReport };
```

Reglas:
- Si `payload.datos_geograficos` existe, eliminar las claves de `PROHIBITED_AI_GEO_FIELDS`, registrando en `removedGeoFields`. Mantener `lugar_interes`, `direccion_postal` y cualquier clave no enumerada como prohibida.
- Recorrer recursivamente el `payload` (objeto + arrays); si un valor string casa `PROHIBITED_PLACEHOLDER_RE`, eliminar la clave (objeto) o filtrar el elemento (array) y registrar la ruta + valor.
- No tocar `_geocoded` (se rellena post-LLM desde canonical).
- No mutar el input; devolver copia profunda saneada.

### 2. `enrich-location/index.ts`

a) **Prompt** — añadir directiva explícita justo después de "PRINCIPIO DE VALIDACIÓN":
```
GEOGRAFÍA ESTRUCTURADA (PROHIBIDO):
- NO emitas `datos_geograficos.coordenadas`, `pais`, `continente`,
  `admin_nivel_1`, `admin_nivel_2`, `admin_nivel_3`, `localidad` ni `sublocalidad`.
- Esa información la aporta el sistema desde reverse-geocode; cualquier
  campo de esos será DESCARTADO.
- Solo puedes emitir `datos_geograficos.lugar_interes` (y `direccion_postal`
  si es verificable). El contenido editorial va en `descripcion`, `datos_clave`
  y `etiquetas`.
- NUNCA uses placeholders del tipo "(sin región)", "(sin provincia)",
  "(sin comarca)" o "(sin localidad)".
```

b) **Recortar `datos_geograficos` en `card-schema.ts`** (compartido entre prompt builder y UI):
```ts
datos_geograficos: {
  ...,
  jsonShape: {
    lugar_interes: 'Nombre del POI',
    direccion_postal: 'Si verificable',
  },
  promptHint: () =>
    'Datos geográficos: SOLO lugar_interes (y direccion_postal si es verificable). El resto (país, continente, niveles administrativos, localidad) lo aporta el sistema.',
}
```
La UI sigue leyendo del DB row, que se sigue rellenando con la cadena canónica completa desde `geoData`/canonical.

c) **Post-parse**, justo después de `enrichedData = JSON.parse(...)`:
```ts
const { sanitized, report } = sanitizeAiEnrichmentPayload(enrichedData);
if (report.removedGeoFields.length || report.removedPlaceholders.length) {
  console.warn('[R4] AI payload sanitized', {
    name: location.name,
    removedGeoFields: report.removedGeoFields,
    removedPlaceholders: report.removedPlaceholders,
  });
}
enrichedData = sanitized;
```

d) **Merge geográfico** (líneas ~2477-2615): eliminar fallbacks `aiGeoData.pais|admin_nivel_1|admin_nivel_2|admin_nivel_3|localidad|sublocalidad|continente`. Cadena estructurada viene SOLO de `geoData` (canonical de Fase 2). Quedan permitidos `aiGeoData.lugar_interes` y `aiGeoData.direccion_postal`.
   - `finalPais = geoData.country` (sin `|| aiGeoData.pais`).
   - `finalContinente = geoData.continent` (idem).
   - `coordenadas` se sigue calculando server-side desde `location.coordinates` (no IA).
   - El bloque `compareCountries(nominatim, aiGeoData.pais)` ya no aplica (aiGeoData.pais es siempre `undefined` tras sanitizar) — dejarlo guard para no romper, pero documentar con comentario que sólo dispararía en caso de bug del sanitizer.
   - El fallback "parse from `localizacion`" (líneas 2618-2640): mantenerlo intacto (no es campo prohibido), pero añadir comentario de que es legacy.

e) `_geocoded` (líneas 2673-2683): ya viene SOLO de `canonicalGeo`. Sin cambios; añadir comentario `// R4: _geocoded NUNCA toma datos de la IA`.

### 3. `batch-enrich/index.ts`

Sin cambios de lógica — invoca `enrich-location` y los nuevos rechazos viajan en errorMessages. Verificar que ninguna ruta de error de Fase 4 introduce kinds nuevos (no los hay: la sanitización es silenciosa y deja al POI continuar).

### 4. Tests

`src/test/ai-payload-sanitizer.test.ts` (Vitest):
- AI con todos los campos prohibidos → se eliminan, `lugar_interes` y `direccion_postal` sobreviven.
- Placeholders `(sin región)`, `(sin provincia)`, `(sin comarca)`, `(sin localidad)` en `descripcion`, `datos_clave.tipo`, `etiquetas[]` → eliminados (clave/elemento).
- Payload editorial válido sin geo prohibida → idéntico (deep-equal).
- `_geocoded` presente accidentalmente en input IA → eliminado (no es campo IA; fuente única canónica).
- Input `null`/`undefined`/no-object → no lanza; devuelve `{ sanitized: input, report: { vacío } }`.

Contract test: `_geocoded` solo se setea desde `canonicalGeo` (lectura estática del código vía pequeña regex test sobre `enrich-location/index.ts`) — opcional pero útil; lo añadimos como `src/test/enrich-location-geocoded-source.test.ts`.

### 5. Versión

- `package.json`: `1.2.12 → 1.2.13`
- `src/lib/app-version.ts`: bump idem
- `README.md`: entrada changelog v1.2.13 con resumen R4+R5
- `docs/releases/version-history.md`: entrada v1.2.13
- `docs/tech-debt.md` ítem 7: "En progreso — Fase 4 aplicada"

## Restricciones (confirmadas en el contrato)

- No tocar datos históricos.
- No migraciones SQL.
- No re-enrich.
- No tocar `LocationMap.tsx`.
- No tocar `places_trunk`, RLS, RBAC, UI panels.
- Fases 5–7 fuera de alcance.

## Validación

- `vitest run` sobre el nuevo suite + suites de Fase 1/3 existentes.
- Lectura cruzada del bloque merge en `enrich-location` para confirmar 0 fallbacks `aiGeoData.<prohibido>`.

## Reporte final esperado

- Archivos modificados (~8 archivos + 2 nuevos).
- Tests ejecutados (Fase 1 + Fase 3 + Fase 4 sanitizer).
- Versión: 1.2.13.
- Confirmación sin datos / sin migraciones / sin re-enrich / sin LocationMap.
