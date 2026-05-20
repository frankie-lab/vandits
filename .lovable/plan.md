# Pulido UX del overlay POI-N

Toque mínimo, sólo presentación. No se altera la lógica de madurez, los markers, los tokens, ni `computePoiMaturity`.

## Problemas confirmados en código

`src/components/map/MaturityDiagnosticsControl.tsx`:
- Se ancla en `absolute bottom-4 left-4`, justo donde Leaflet pinta la barra de escala → solape.
- `flex-col items-start` con toggle primero y leyenda después → la leyenda crece **hacia abajo** y, con 11 niveles + cabecera, recorta POI-10 contra el borde inferior.
- `legendOpen` arranca en `true` → la leyenda siempre está desplegada al activar el overlay.
- No hay `max-height` ni scroll interno.

Barra inferior derecha (`FloatingToolbar` "Final / Importado / Vacío"): no se toca su contenido, pero cuando el overlay POI-N está ON conviene una pista visual de que esa barra sigue reflejando el **estado base del marker**, no la madurez.

## Cambios propuestos (sólo `MaturityDiagnosticsControl.tsx` + 1 pista en `FloatingToolbar`)

### 1. Reposicionar y reordenar el control

- Subir el bloque para liberar la escala Leaflet: `bottom-4` → `bottom-12` (queda por encima de la scalebar, sigue en esquina inferior izquierda y no invade el resto del chrome).
- Usar `flex-col-reverse` para que el **toggle quede anclado abajo** y la leyenda **crezca hacia arriba**, garantizando que POI-10 (que es el último de la lista) se renderice contra el borde inferior de la leyenda, nunca recortado.

### 2. Leyenda colapsada por defecto + altura máxima con scroll

- `legendOpen` arranca en `false`. El usuario despliega cuando quiere.
- Contenedor de la lista con `max-h-[60vh] overflow-y-auto pr-1` para que en pantallas pequeñas siempre se pueda hacer scroll hasta POI-10.
- Corregir el icono del chevron (hoy `ChevronDown` cuando está abierto y `ChevronUp` cuando está cerrado; está invertido).

### 3. Pista de contexto en la barra inferior derecha

Cuando `enabled === true` (overlay POI-N ON), añadir un micro-badge informativo dentro de `FloatingToolbar`, justo antes del grupo "Final / Importado / Vacío":

```
[ Estado base del marker ]  Final · Importado · Vacío
```

- Texto único, neutro, sin emoji, icono Lucide `Info` opcional.
- Lee el mismo flag global que ya alimenta `usePoiMaturityDiagnostics` (`useSyncExternalStore` sobre `lovable:poi-maturity-diagnostics-changed`).
- No cambia conteos, ni colores, ni estructura de la barra. Sólo añade prefijo aclaratorio.

### 4. Lo que NO se toca

- `createCustomIcon`, `resolvePoiVisualGrammar`, `computePoiMaturity`, tokens `poi.maturity.*`, paleta de markers, colecciones, datos, edge functions, migraciones.
- `MaturityBadgeLayer` (sigue renderizando chips numéricos por POI exactamente igual).
- Lógica de buckets de la toolbar (Final/Importado/Vacío).

## Validación

- Overlay OFF: el bloque sigue siendo sólo el toggle, no tapa la escala (queda 8 px más arriba).
- Overlay ON: leyenda colapsada por defecto; al expandir, crece hacia arriba; POI-10 visible siempre, con scroll si el viewport es bajo.
- Markers, popups y clicks intactos.
- Barra inferior derecha: mismo contenido + prefijo "Estado base del marker" cuando overlay ON; sin solape con scalebar (sigue en lados opuestos).
- Tests existentes `poi-maturity` y `poi-maturity-overlay` no se ven afectados (no cambia la lógica).

## Version impact

`patch` → bump `1.2.20` → `1.2.21` (sólo si los cambios de código se aplican; este plan no toca código aún).
