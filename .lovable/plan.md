## Diagnóstico — qué falla hoy

Tras revisar el código actual hay **tres fugas** que dejan pasar puntos a "verde" cuando nombre y coordenadas no coinciden:

### Fuga 1 — `skipValidation: true` por defecto en enriquecimiento manual
En `src/domains/content/lib/enrich-location.ts` línea ~73:
```ts
supabase.functions.invoke('enrich-location', { body: { location, skipValidation: true } })
```
Cualquier clic en "Enriquecer" desde popup, lista de doc o lista general bypassa **todos** los gates del servidor. Por eso "Cave of the Moon" y "Glorieta de la Antártida" entraron verdes: el LLM nunca pasó por la puerta.

### Fuga 2 — el gate `llm_unverifiable` también vive bajo `skipValidation`
En `enrich-location/index.ts` línea ~2269:
```ts
if (!skipValidation && isUnverifiableLLMOutput({ descripcion: enrichedData?.descripcion })) { ... }
```
Cuando el LLM se rinde ("Información no disponible…", "No se puede generar…"), el placeholder se persiste como `descripcion`. El helper `hasRealEnrichment` filtra algunos por regex, pero textos como **"Información no disponible"** NO están en `UNVERIFIABLE_DESC_REGEX`, así que pasan como enriquecimiento real → verde.

### Fuga 3 — el gate inverso (coords → país) sólo es post-LLM y solo país
La verificación `compareCountries(nominatim, aiGeoData.pais)` en línea ~2235:
- Se salta con `skipValidation`.
- Sólo compara **país**, no región/zona.
- Corre **después** de gastar tokens del LLM.

No hay un gate **pre-LLM** que diga: "el reverseGeocode de las coords dice Marruecos y el artículo Wikipedia del nombre dice España → aborta antes de pedir nada al LLM".

### Fuga 4 — manual single-click no deja rastro de error
Cuando un abort sí ocurre (en batch), `enrichment_jobs.error_messages` enciende el anillo rojo. Pero los abort del flujo manual `triggerEnrichLocation` **no escriben en ningún sitio**, así que el punto se queda gris/naranja "limpio", sin anillo rojo. El usuario no ve que algo falló.

---

## Plan — un único gate bidireccional, sin opt-out silencioso

### 1. Eliminar `skipValidation: true` como default del trigger manual
`src/domains/content/lib/enrich-location.ts`: invocar `enrich-location` SIN `skipValidation`. Sólo se envía `skipValidation: true` cuando hay `confirmedCandidate` (el usuario ya escogió identidad desde el bloque de recuperación / Contexto cercano). Ese ya es el único bypass legítimo.

### 2. Gate bidireccional pre-LLM (nuevo) en `enrich-location/index.ts`
Antes de llamar al LLM, ejecutar **siempre** (independiente de `skipValidation`, salvo `confirmedCandidate`):

```text
A. reverseGeocode(coords) → ISO α2 + región
B. resolveNameLocation(name) → busca artículo Wikipedia/Wikidata con coords
C. Si B tiene coords:
     - distancia(B, coords) > 50 km  → ABORT coherence
     - país(B) ≠ país(A) vía ISO     → ABORT coherence
D. Si A tiene país y el LLM tras correr devuelve país ≠ A → ABORT (ya existe, ampliarlo a región)
```

`confirmedCandidate` sigue siendo el único bypass (el usuario ya eligió identidad).

### 3. Endurecer el detector de placeholders evasivos
Ampliar `UNVERIFIABLE_DESC_REGEX` en `supabase/functions/_shared/llm-unverifiable.ts` y `src/domains/content/lib/llm-unverifiable.ts` (mirror) para cubrir:
- "Información no disponible"
- "No hay información (disponible|verificable)"
- "No se dispone de (información|datos)"
- "Sin información (suficiente|verificable)"
- Descripciones < 40 caracteres tras strip de markdown (heurística de seguridad).

Y mover el chequeo fuera de la condición `!skipValidation`: el placeholder evasivo nunca debe persistirse, ni siquiera en flujos forzados. Si llega un placeholder, abort y guardar el motivo.

### 4. Persistir el fallo del flujo manual (anillo rojo coherente)
En `triggerEnrichLocation`, cuando el servidor responda `success: false` con `reason ∈ { name_coordinate_mismatch, llm_unverifiable, coords_country_mismatch }`:
- `UPDATE locations SET enrichment_status = 'unresolved', updated_at = now() WHERE id = …`
- Insertar/actualizar una fila en `enrichment_jobs` "single-click" (o tabla equivalente que ya consume `enrichmentFailureStore`) con `error_messages[id] = { kind, message, candidates, nameLocation }` para que `hasEnrichmentFailure` encienda el anillo rojo de 5px también en manual.

Así Caso 1 y Caso 2, tras el clic, quedan con:
- Marker base gris/naranja (no verde, porque no hay `descripcion` real).
- Anillo rojo 5px (señal visual del fallo).
- Bloque de recuperación `<UnenrichedRecoveryBlock>` ya muestra el motivo + "Renombrar" / "Mover punto" / "Elegir desde Contexto cercano".

### 5. Acciones disponibles en el bloque de recuperación
Asegurar las tres ramas para que el usuario pueda resolver:
- **Renombrar el punto** (caso 2: coords son canon → corrige el nombre).
- **Mover coordenadas al artículo Wikipedia** (caso opuesto: nombre es canon).
- **Elegir candidato cercano** (lo que ya hace Contexto cercano).
- **Marcar como manual/sin Wikipedia** (último recurso, no enriquece pero quita el anillo rojo y deja `description` libre).

### 6. Reintento batch: nunca con `skipValidation`
En `batch-enrich/index.ts` el "legacy fallback" de la línea ~373 hace un retry con `skipValidation: true`. Eliminar ese retry. Si el primer intento aborta por coherencia/unverifiable, el punto va a `errorMessages` con su `kind` correspondiente y queda esperando intervención del usuario. Nada de "forzar a verde".

---

## Sección técnica

**Archivos a tocar (sólo lógica, sin tocar UI más allá del bloque de recuperación ya existente):**
- `src/domains/content/lib/enrich-location.ts` — quitar `skipValidation`, persistir failure local en abort.
- `supabase/functions/enrich-location/index.ts` — gate bidireccional pre-LLM; quitar `!skipValidation` del check de placeholder; añadir gate región además de país en post-LLM.
- `supabase/functions/_shared/llm-unverifiable.ts` + mirror cliente — ampliar regex y añadir heurística de longitud mínima.
- `supabase/functions/batch-enrich/index.ts` — eliminar retry con `skipValidation: true`; mantener el path de `error_messages` con `kind: coherence | llm_unverifiable`.
- `src/domains/content/components/UnenrichedRecoveryBlock.tsx` — confirmar que ya tiene "Renombrar" y "Mover coords"; añadir lo que falte.
- (opcional, depende de existencia) `enrichment_failures` o estructura equivalente para persistir fallos del manual single-click — si no existe, usar la misma tabla `enrichment_jobs` con un job sintético "manual" por usuario.

**Norma transversal (memoria):** actualizar `mem://logic/enrichment/name-coordinate-coherence` para reflejar:
- Gate **bidireccional** obligatorio.
- `skipValidation` sólo permitido cuando hay `confirmedCandidate`.
- Placeholder evasivo nunca se persiste.
- Todo abort manual escribe failure → anillo rojo.

---

## Resultado esperado

- "Cave of the Moon" → abort `llm_unverifiable` o `coherence`, gris con anillo rojo, bloque de recuperación con candidatos cercanos.
- "Glorieta de la Antártida" en mar → abort `coherence` pre-LLM (Wikipedia dice Guadalajara, coords dicen océano), gris con anillo rojo, opción "mover coords al artículo" / "renombrar".
- Cero verdes silenciosos cuando nombre y coordenadas no concuerdan.
