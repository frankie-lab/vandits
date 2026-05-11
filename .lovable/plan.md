## Lista unificada de opciones + buscador manual

Sustituye los dos modos actuales (`move` / `rename`) por una **única lista de "opciones posibles"** en el bloque de recuperación del popup y en la ficha. Al hacer click en una fila el punto se resuelve y se enriquece automáticamente. Al pie, un buscador permite escribir un nombre cuando ninguna opción encaja.

### Comportamiento unificado al pulsar una fila

Cada candidato representa una identidad geográfica (nombre + coordenadas + jerarquía). Al pulsarlo:

1. `UPDATE locations` con **nombre y coordenadas** del candidato (un único update atómico).
2. Sync inmediato en `useLocationsStore` (`name` + `coordinates`) para que el siguiente paso lea valores frescos.
3. `triggerEnrichLocation(id, { focusAfter: false, skipValidation: true })`.
4. Al terminar: `enrichmentFailureStore.invalidate(id)` y el popup se regenera con la ficha verde.

Durante la operación: spinner en la fila, resto deshabilitado. Si falla: toast y se mantiene el bloque ámbar.

Esto elimina la ambigüedad actual (mover vs renombrar). El usuario solo decide "este es el lugar correcto" — el sistema aplica nombre y coordenadas a la vez.

### Layout de la lista

```text
┌──────────────────────────────────────────────┐
│ [!] No encaja con la zona                    │
│     Elige el lugar correcto o busca otro.    │
├──────────────────────────────────────────────┤
│ Plaza de España (Madrid)                     │
│ a 97.2 km · Madrid, Comunidad de Madrid      │
├──────────────────────────────────────────────┤
│ Sepúlveda                                    │
│ a 0.1 km · Segovia, Castilla y León          │
├──────────────────────────────────────────────┤
│ ...                                          │
├──────────────────────────────────────────────┤
│ [icon] [ Buscar otro nombre…       ] [→]     │  ← buscador
├──────────────────────────────────────────────┤
│  ⟳ Ignorar conflicto y enriquecer igual      │
└──────────────────────────────────────────────┘
```

- Filas idénticas (sin icono distinto por modo). Sin etiquetas "Mover" / "Usar nombre".
- Hover/click resaltan toda la fila.
- Distancia y jerarquía geo siguen visibles como texto secundario.

### Buscador inferior

- Input de texto (placeholder "Buscar otro nombre…") + botón submit (icono Search).
- Al enviar (Enter o click):
  1. Llama al mismo backend que ya alimenta los candidatos del coherence check para buscar artículos por nombre cerca de las coordenadas actuales del punto.
  2. Si hay resultados: se añaden/reemplazan en la lista superior (mismas filas, mismo comportamiento al pulsar).
  3. Si no hay resultados: muestra inline "Sin resultados para «…»", el usuario puede:
     - Probar otro término, o
     - Pulsar "Usar este nombre tal cual" → renombra el punto al texto literal escrito (sin mover coordenadas) + enriquece con `skipValidation: true`.

### Estados especiales

- **Sin candidatos iniciales**: la lista muestra mensaje "Sin coincidencias cercanas" + buscador habilitado.
- **Punto ya enriquecido**: bloque no se renderiza (igual que ahora).
- **Punto sin error** (`parsed == null`): mantiene el CTA simple actual (Enriquecer / Contexto cercano), sin lista ni buscador.

### Fuera de alcance

- Variante `row` (compacta para listas): solo se simplifica el label del CTA primario a "Enriquecer aquí" (sin distinguir mover/renombrar). Sin buscador.
- Marcadores, anillo rojo, batch-enrich server, edge function `enrich-location`: sin cambios. `skipValidation: true` ya garantiza que el segundo intento no se vuelva a rechazar por coherencia.
- Botón pie "Editar" (formulario manual con notas/coords): se mantiene tal cual, separado del buscador.

### Cambios técnicos

Archivo único: `src/domains/content/components/UnenrichedRecoveryBlock.tsx`.

1. Eliminar `resolveMode` y la variable `mode`. La lista deja de bifurcar por `coordinate` vs `name`.
2. Nuevo handler unificado `handleAdoptCandidate(c)`:
   - `UPDATE locations SET name = c.name, latitude = c.lat, longitude = c.lng, updated_at = now()`.
   - `useLocationsStore.getState().updateLocation(id, { name, coordinates: { lat, lng }, updatedAt })`.
   - `triggerEnrichLocation(id, { focusAfter: false, skipValidation: true })`.
3. Render de fila: un único botón full-width sin icono modal; mantiene `Loader2` mientras está activo.
4. Buscador:
   - Estado local `searchTerm: string`, `searching: boolean`, `searchResults: CoherenceCandidate[] | null`.
   - Función `runSearch(term)`: reutiliza el lookup Wikipedia por nombre que ya existe en `name-coordinate-coherence` (exponer helper si hace falta) acotado por las coordenadas del punto.
   - Si `searchResults` existe, sustituye la lista de candidatos visibles.
   - Botón "Usar este nombre tal cual" cuando `searchResults?.length === 0`: hace solo `UPDATE name` + enrich con `skipValidation`.
5. `variant="row"`: simplificar `primaryLabel` a "Enriquecer aquí" y `primary = () => handleAdoptCandidate(first)` si hay candidato, si no `handleOpenContext`.
6. Memoria: actualizar `mem://logic/enrichment/per-poi-recovery-block` con el nuevo comportamiento (lista unificada + buscador, adopción atómica nombre+coords).

### Verificación

- Caso "Plaza d España" (rename actual): pulsar "Sepúlveda" → el punto pasa a llamarse "Sepúlveda" y se mueve a las coords de Sepúlveda; queda verde con ficha de Sepúlveda.
- Caso coordinate_mismatch: pulsar el candidato lejano → nombre y coords se actualizan al candidato; queda verde.
- Buscador con resultados: escribir "Catedral de Segovia" → lista se sustituye por candidatos de esa búsqueda; pulsar uno enriquece.
- Buscador sin resultados: aparece "Sin resultados" + botón para forzar renombrado literal + enrich.
- Sin candidatos: lista vacía con buscador activo desde el inicio.