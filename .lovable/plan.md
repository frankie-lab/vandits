# Refactor de `handleApplyAll` — norma transversal, no parche

## Problema observado

Tras pulsar **"Aplicar 3 acciones"** (catálogo + colección + tag), no aparecen ni los puntos publicados, ni la nueva colección, ni el tag. Causa raíz:

1. El bucle ejecuta acciones secuencialmente y **lanza excepción al final** si `tagList` está vacío (el usuario escribió la etiqueta pero no pulsó Enter ni la añadió al chip-list).
2. Esa excepción **aborta el `try` antes** de los `dispatchEvent('locations-updated')` y `routes:changed`, dejando la UI desincronizada aunque catálogo y colección **sí** se persistieron en BD.
3. El usuario reintenta y se generan **colecciones duplicadas**, porque la primera ya existía pero no era visible.

## Norma a aplicar (no hardcode del caso)

Tres invariantes válidas para cualquier cadena de acciones futuras (catálogo, itinerario, colección, ruta, tag, y los que vengan):

### 1. Validación previa atómica

Antes de cualquier `await`, validar **todas** las acciones seleccionadas con un `validateChain(addModes, state)` que devuelve la lista de errores. Si hay errores → `toast.error` con mensaje claro y `return`. Nunca se entra en el bucle con datos incompletos.

Reglas mínimas:
- `catalog`: requiere `catalogPreview` cargado.
- `itinerary`: requiere `itineraryName` o fallback `docName`.
- `collection`: si `collectionId === '__new__'` requiere `newCollectionName` o fallback `docName`.
- `route`: requiere `targetRouteId`.
- `tag`: requiere `tagList.length > 0` **o** `tagInput.trim()` no vacío (autoflush).

### 2. Autoflush de inputs de texto

Los inputs tipo "escribe + Enter para añadir chip" (tags hoy, otros mañana) deben **promover automáticamente** el texto pendiente a su lista al ejecutar la acción. Implementación: helper `flushPendingInputs()` que se llama al inicio de `handleApplyAll` antes de `validateChain`. Para tags: si `tagInput.trim()` no está vacío y no está en `tagList` → añádelo.

Esto elimina la clase entera de bugs "el usuario olvidó pulsar Enter".

### 3. Refresh y feedback por paso (continue-on-error opcional)

Mover `dispatchEvent` y `toast.success` **dentro** del bucle, justo después de cada acción exitosa. Cada paso emite el evento que le toca:

```text
catalog    → 'locations-updated'
itinerary  → 'routes:changed'
collection → 'collections:changed' + 'locations-updated'
route      → 'routes:changed'
tag        → 'locations-updated'
```

Si un paso falla, registrar el error y **continuar con los demás** (las acciones son independientes en su mayoría). Al final, si hubo fallos parciales: `toast.error` listando los pasos fallidos; si todo OK: `toast.success` global y cierre del diálogo.

## Cambios concretos

**Archivo único**: `src/domains/content/components/DocumentFocusView.tsx`

1. Añadir helpers locales `flushPendingInputs()` y `validateChain()` justo encima de `handleApplyAll` (líneas ~706).
2. Reescribir `handleApplyAll` (líneas 712–820) siguiendo el patrón:
   ```text
   flushPendingInputs()
   const errors = validateChain(...)
   if (errors.length) { toast.error; return }
   const results = []
   for (const m of selected) {
     try { await applyMode(m); dispatchEvent(eventFor(m)); results.push({m, ok:true}) }
     catch (e) { results.push({m, ok:false, error:e}) }
   }
   reportResults(results)
   ```
3. Mantener el orden actual `catalog → itinerary → collection → route → tag` (es semánticamente correcto: estructural antes que auxiliar).
4. **No** tocar `handleApprove`, `handleAddToCollection`, `handleApplyTags` individuales (siguen funcionando para el modo single-action).

## Limpieza de datos

La sesión anterior creó al menos una **colección duplicada** en BD (el primer click sí persistió la colección antes del fallo en tag). Acción adicional:

- Consultar las colecciones del usuario creadas hoy con `name = docName` (o el nombre que escribió) y eliminar las huérfanas/duplicadas tras confirmar con el usuario en el toast post-deploy.

## Fuera de alcance

- No se cambia la UI del diálogo (checkboxes, layout).
- No se introduce transacción real con rollback (las acciones son en tablas distintas; el patrón resiliente con report final cubre el caso de uso).
- No se toca `point-visual-state.ts` ni la paleta de marcadores.
