## Diagnóstico

Existen **dos modos de fallo inversos** que hoy terminan igual: un punto pintado **verde** (enriquecido) con datos inconsistentes y sin pedir nada al usuario.

### Caso A — Nombre incoherente con las coordenadas ("Cave of the Moon")
1. El POI llega con un nombre que **Wikipedia no encuentra cerca** de las coords.
2. El gate `validateNameCoordinateCoherence` (en `supabase/functions/enrich-location/index.ts:633`) **solo aborta** si encuentra un candidato textual con coordenadas a >50 km. Si Wikipedia no devuelve coords para el candidato (ej. álbum musical), devuelve `ok: true` → sigue.
3. El LLM, al no encontrar nada verificable, genera un texto evasivo ("No se puede generar una descripción verificable…") y lo escribe en `enriched_data.descripcion`.
4. `isPointEnriched` solo comprueba que `descripcion` no esté vacía → el punto pasa a verde sin pedir nada.

**Conteo actual:** **16 puntos** con texto-confesión en `descripcion`/`observacion` ("no se puede generar", "información no disponible", "sin datos verificables", "se recomienda verificar la exactitud/ubicación/coordenadas", "no corresponde a ningún/a", "no figura en"…).

### Caso B — Coordenadas incoherentes con el nombre ("Glorieta de la Antártida")
1. El POI tiene nombre correcto (rotonda real en Guadalajara) pero coordenadas en otro sitio (mar/África).
2. El gate de coherencia **considera coords como verdad**, busca el artículo Wikipedia ("Glorieta de la Antártida" no tiene página → no falla → `ok: true`).
3. El reverse-geocode (Nominatim) sobre las coords reales falla o devuelve algo neutro. **No hay segundo gate que verifique que las coords caen dentro del país/región esperado**.
4. En el merge `mergedGeoData` (línea 2230): `admin_nivel_1: aiGeoData.admin_nivel_1 || geoData.region`. **La IA inventa "Castilla-La Mancha / Guadalajara" a partir del nombre** y se persiste tal cual, aunque las coords caigan en el Atlántico. La IA es la "fuente_refinamiento".

### Raíz común
- El gate `validateNameCoordinateCoherence` es **unidireccional** (nombre→coords) y se rinde en cuanto le falta una pieza.
- No hay **verificación inversa** coords→país/región (Nominatim/Wikidata) que invalide la geografía inventada por la IA.
- El pipeline **persiste el JSON del LLM sin validar coherencia interna** (datos_geograficos vs coords, descripcion vs "no verificable").
- `isPointEnriched` solo mira `descripcion no vacío`, así que un placeholder de auto-confesión vale como "enriquecido".

Ambos casos comparten el resultado: punto verde con un error silencioso, sin oportunidad para el usuario de corregir.

---

## Plan (transversal, sin hardcodeos)

### 1. Detector único de "respuesta no verificable" del LLM
Nuevo helper en `supabase/functions/enrich-location/index.ts` y reusado por `batch-enrich`:

```text
isUnverifiableLLMOutput(enrichedData) → boolean
```

Detecta patrones canónicos en `descripcion` u `observacion`:
- "no (se|es) (puede|posible) (generar|crear|verificar)"
- "no es verificable" · "no hay información" · "información no disponible"
- "sin datos verificables" · "no corresponde a ningún/a" · "no figura en"
- "se recomienda verificar (la exactitud|las coordenadas|la ubicación)"
- "no existe (un|una|ningún|ninguna) (estructura|lugar|punto|accidente)"

Si `isUnverifiableLLMOutput=true` ⇒ **NO se persiste**. Se devuelve la misma respuesta estructurada que el aborto de coherencia (`reason: 'llm_unverifiable'`, con `nearbyCandidates` ya calculados) para que la UI muestre el bloque ámbar de resolución.

### 2. Gate inverso coords⇄país (Capa D del coherence check)
Ampliar `validateNameCoordinateCoherence` con un paso final independiente:

- Reverse-geocode las coords (Nominatim → country + region) — ya se hace para `geoData`.
- Forward-geocode el nombre (Nominatim search) y/o consultar Wikidata por el `lugar_interes` esperado en `geoContext`.
- Si país/región **inferido por nombre** ≠ país/región **observado por coords** y la distancia supera un umbral (reutilizar `COHERENCE_HARD_REJECT_KM` = 50 km) ⇒ abortar con `reason: 'name_coordinate_mismatch'` y devolver `nearbyCandidates` (puntos Wikipedia cercanos a las coords reales) + `nameLocation` (mejor coincidencia textual del nombre).

Esto cubre el caso "Glorieta de la Antártida" porque las coords reales no caen en España y el nombre sí refiere a una rotonda en Guadalajara → mismatch.

### 3. Antiveneno en el merge de `datos_geograficos`
En `enrich-location/index.ts` ~línea 2225 (`mergedGeoData`):

- **Prioridad invertida**: `geoData.region/zone/country` (Nominatim, derivado de coords) **manda** sobre `aiGeoData.*`.
- La IA solo puede *complementar* (sublocalidad, lugar_interes, dirección_postal) si Nominatim no rellenó esos campos.
- Si Nominatim no devolvió país (coords en el mar/desierto), `pais` queda **vacío** en vez de aceptar lo que la IA invente. Eso fuerza la rama de "no verificable" del paso 1.

### 4. Endurecer `isPointEnriched`
Helper único `src/domains/content/lib/point-visual-state.ts`:

- Mantener "descripcion no vacía" como base.
- **Añadir**: si `isUnverifiableLLMOutput` aplica al `enriched_data` ⇒ devolver `false` (el punto no se considera enriquecido y vuelve a la paleta naranja/gris).
- Mismo helper que el del paso 1, exportado a cliente vía `src/domains/content/lib/llm-unverifiable.ts`.

Beneficios: si por alguna razón un texto evasivo escapa al gate del backend, el cliente lo vuelve a clasificar como vacío y aparece en la cola de errores.

### 5. Backfill de los 16 puntos ya afectados
Migración:

- Detectar registros donde `isUnverifiableLLMOutput(enriched_data)` aplique (mediante la misma regex en SQL).
- Vaciar `enriched_data.descripcion` y mover el placeholder a `enrichment_failure_log` con `kind: 'llm_unverifiable'` para que `hasEnrichmentFailure(loc)` les pinte el anillo rojo y entren al flujo de recuperación existente (`UnenrichedRecoveryBlock` ya reutilizable).
- Esto los devuelve a gris/naranja con CTA "Renombrar / mover punto / contexto cercano". Ningún borrado.

### 6. UX: tratar `llm_unverifiable` y `name_coordinate_mismatch` con el mismo bloque
Ya tenemos `UnenrichedRecoveryBlock` + `parseEnrichmentError` (ver `mem://logic/enrichment/per-poi-recovery-block` y `batch-error-resolution`). Sólo añadir el kind `llm_unverifiable` al mapeo (icono ámbar, texto "El nombre no resuelve a nada verificable en estas coordenadas", acciones: **Renombrar** / **Mover punto** / **Buscar contexto cercano**).

### Archivos afectados
- `supabase/functions/enrich-location/index.ts` (gate Capa D, helper `isUnverifiableLLMOutput`, merge invertido, guard pre-persist).
- `supabase/functions/batch-enrich/index.ts` (consumir el nuevo `reason: 'llm_unverifiable'`).
- `src/domains/content/lib/llm-unverifiable.ts` (nuevo, helper cliente — mismo regex).
- `src/domains/content/lib/point-visual-state.ts` (`isPointEnriched` consulta el helper).
- `src/domains/content/lib/enrichment-error-kind.ts` (añadir `llm_unverifiable` al union + label).
- `src/domains/content/components/UnenrichedRecoveryBlock.tsx` (rama del nuevo kind).
- Migración: backfill de los 16 registros + insert en `enrichment_failure_log`.

### No se introduce
- Cero hardcodeos por id ni por colección.
- Cero cambios al sistema de visibilidad / colecciones / RLS.
- Cero cambios al árbol de clasificación ni al esquema de fichas.

---

## Garantías
- El usuario **siempre** verá un punto que el sistema no puede verificar como anillo rojo + bloque de resolución; nunca como verde con texto evasivo.
- El nombre **nunca** podrá sobreescribir país/región derivados de las coords.
- Las coords incoherentes con el país que la IA infiere del nombre activan el mismo flujo de "elige identidad correcta" que ya existe para Caso A.
- Los 16 puntos actuales quedan correctamente clasificados sin perder datos (placeholder se mueve a log, no se borra).
