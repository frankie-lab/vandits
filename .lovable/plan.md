# Visibilidad de "Sin colección" en el mapa

## Decisiones fijadas

1. **Mapa global**: los puntos sin colección son **visibles por defecto** (comportamiento actual). Solo desaparecen si el usuario apaga el ojo de la fila "Sin colección".
2. **Click en la fila "Sin colección"**: abre la vista enfocada **y** fuerza el ojo ON si estaba apagado, igual que hace una colección al entrar en su focus view.

## Cambios

### 1. `src/components/CollectionsListPanel.tsx`
En el handler de click de la fila virtual "Sin colección":
- Antes de llamar a `onSelectOrphan()`, comprobar `isOrphanGroupVisible()`.
- Si está OFF, llamar a `setOrphanGroupVisible(true)` para encender el ojo (esto ya dispara los eventos que refrescan el mapa).
- Mantener el resto del flujo intacto (abrir `OrphanFocusView`).

### 2. Coherencia con colecciones reales (verificación, sin cambios si ya funciona)
Revisar que al abrir `CollectionFocusView` de una colección real también se encienda su ojo automáticamente. Si no lo hace, replicar el mismo patrón. *(Solo si la verificación lo confirma; no es el foco del ticket).*

### 3. Memoria
Actualizar `mem://logic/content/orphan-points-visibility` (crear si no existe) con la regla:
> Puntos sin colección = visibles por defecto en el mapa global. Click en fila "Sin colección" enciende su ojo (si estaba OFF) y abre la vista enfocada. Helper único: toggle vía `setOrphanGroupVisible` en `src/domains/content/lib/orphan-points.ts`.

## Detalles técnicos

- El estado de visibilidad ya vive en `orphan-points.ts` (sesión, no persistido), por lo que no hay migración ni cambios de schema.
- No se toca `isLocationVisibleInGlobalMap` — la lógica actual ya respeta el flag.
- No se introduce comportamiento de "aislar" otras capas; el resto del mapa permanece como esté.
