# Fix: "Aplicar N acciones" no aplica nada

## Diagnóstico

El diálogo bloquea el apply con el toast `Catálogo: aún calculando vista previa` (visto en session replay) y aborta antes de tocar el resto de modos. Causas reales en `src/domains/content/components/DocumentFocusView.tsx`:

1. **Auto-apertura sin precarga.** Cuando el diálogo se abre desde el panel de documentos vía `autoOpenAddDialog` (líneas 125-130), solo se hace `setShowCatalogDialog(true)`. No se llama a `computeCatalogPreview` ni se preselecciona ningún modo. En cambio, el helper `openCatalogDialog` (580-585) sí precarga `'catalog'` y dispara el preview.

2. **Effect ciego al toggle de modos.** El `useEffect` que recomputa el preview de catálogo (588-592) depende de `addMode` (derivado: primer elemento del Set, default `'catalog'`). Cuando el usuario marca/desmarca "Al catálogo general", `addModes` cambia pero `addMode` sigue siendo `'catalog'` → el effect no se vuelve a disparar y `catalogPreview` queda `null`.

3. **Mismo problema con itinerario** (effect 622-626): depende de `addMode`, no de `addModes.has('itinerary')`.

4. **Validación atómica con `catalogPreview` null.** En `handleApplyAll` (756-759) la condición `!catalogPreview || catalogPreview.loading` empuja el error y, por ser validación atómica, NINGÚN otro modo (collection, tag) llega a ejecutarse.

## Cambios (solo UI, mismo archivo)

### A. Efectos reactivos a `addModes`
- Reemplazar la dependencia `addMode` por un proxy estable de pertenencia:
  - Effect catálogo: depender de `addModes.has('catalog')` (vía variable derivada `hasCatalogMode`).
  - Effect itinerario: depender de `addModes.has('itinerary')`.
- Garantiza que al marcar el checkbox se dispare la computación del preview correspondiente.

### B. Auto-apertura coherente
- En el effect `autoOpenAddDialog` (125-130), además de abrir el diálogo:
  - Inicializar `addModes` a `new Set(['catalog'])` si está vacío.
  - Setear `itineraryName` a `docName` (paridad con `openCatalogDialog`).
  - Llamar a `computeCatalogPreview(catalogOptions.scope)`.

### C. Validación tolerante
- Si el usuario marcó `catalog` pero el preview aún está `loading`, esperar (poll corto) en vez de abortar todo el batch. Implementación mínima: si `catalogPreview === null` al pulsar Aplicar, llamar `computeCatalogPreview` y `await` un microbucle hasta que `loading=false` (timeout 3s); si tras el timeout sigue null, reportar error solo del paso `catalog` y continuar con el resto (consistente con la filosofía "continue-on-error" del bloque 3 del handler, líneas 780+).

## Fuera de alcance

- No tocar `document-add.service.ts` ni los `applyX` (funcionan).
- No cambiar la UI del diálogo (checkboxes, layout) — solo el cableado de estado.
- No modificar el checkbox "y publicarlos en mi catálogo" añadido recientemente.

## QA

1. Abrir documento desde panel → diálogo se abre con "Catálogo" marcado y preview listo.
2. Marcar adicionalmente "Colección" + nombre + "y publicarlos" + "Etiquetas" → "Aplicar 3 acciones" ejecuta los 3 pasos y muestra toast de éxito.
3. Marcar SOLO "Colección" + "Etiquetas" (sin catálogo) → no se exige preview de catálogo, ambos pasos corren.
4. Desmarcar y marcar "Catálogo" varias veces → preview se recomputa cada vez que se marca.
