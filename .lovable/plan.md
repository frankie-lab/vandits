## Problema verificado en preview

Pinchando un POI ("Cascada Oculta A Coruña") y luego en mapa vacío:
- El popup **NO se cierra** (esperado: cerrar + deseleccionar).
- Aparece toast colateral "Ubicación no encontrada".

## Causa raíz

`src/components/LocationMap.tsx:1745` crea el popup con `closeOnClick: false`. Esto anula el cierre nativo de Leaflet en cualquier click del mapa, incluyendo el área vacía. El motivo original (comentario en código) era impedir que clicks en botones React dentro del popup propagasen al mapa y dispararan auto-close. Es la solución equivocada: bloquea ambos casos en lugar de solo el bubbling interno.

Como `popupclose` no se dispara, el contrato canónico de `map.on('popupclose')` (limpiar foco si `currentFocusedId === closedId`) nunca se ejecuta → el POI queda focado y el popup visible.

El toast "Ubicación no encontrada" es un síntoma adicional: algún listener de `popup-action` recibe un evento con locationId que ya no está en `documents`. Hay que confirmar si lo dispara el welcome-dismiss handler u otro punto al hacer click en mapa vacío.

## Fix propuesto

### 1. Restaurar cierre nativo + bloquear bubbling solo desde el popup

En `src/components/LocationMap.tsx`:

- **Quitar** `closeOnClick: false` de las opciones del popup (~L.1745). Dejar que Leaflet use el default (`true`), de modo que click en mapa vacío cierre el popup y dispare el `popupclose` canónico.
- En el handler `map.on('popupopen', ...)` ya existente (~L.1400-1427), añadir tras obtener `popupEl`:
  ```ts
  L.DomEvent.disableClickPropagation(popupEl);
  L.DomEvent.disableScrollPropagation(popupEl);
  ```
  Esto neutraliza el bubbling de clicks de botones React dentro del popup hacia el mapa, sin afectar al click en zona vacía.

Resultado:
- Click en mapa vacío → Leaflet cierra el popup → `popupclose` → contrato canónico limpia foco.
- Click en otro marker → flujo A→B intacto (el guard `currentFocusedId === closedId` ya estaba bien).
- Click dentro del popup (botones, links, scroll) → no propaga al mapa, no cierra.

### 2. Investigar y silenciar el toast espurio

Antes de tocar nada, localizar quién dispara `popup-action` cuando se hace click en mapa vacío:
- `rg -n "dispatchEvent.*popup-action" src/`
- Inspeccionar si el welcome-dismiss handler (`mapRef.current.on('click', () => setWelcomeDismissed(true))` en L.1339) tiene un side-effect que reenvíe a popup-action con stale id, o si es otro listener.

Si el origen es legítimo pero la búsqueda en `documents` falla por carrera, cambiar el `toast.error('Ubicación no encontrada')` de `use-popup-actions.ts:109` por un `console.warn` silencioso (no es un error accionable para el usuario). Si es un bug de doble-dispatch, eliminar la fuente.

### 3. Verificación en preview

Repetir el flujo manual con browser tools:
1. Abrir popup A → click mapa vacío → confirmar que popup desaparece y no hay toast.
2. Abrir popup A → click marker B → confirmar B abierto, foco en B.
3. Abrir popup con "Contexto cercano" desplegado → click mapa vacío → confirmar cierre completo (panel inline incluido).
4. Click en cualquier botón del popup (re-enriquecer, notas, estrella) → confirmar que el popup NO se cierra.

## Archivos a tocar

- `src/components/LocationMap.tsx` — quitar `closeOnClick: false`, añadir `disableClickPropagation` en `popupopen`.
- Posiblemente `src/domains/content/hooks/use-popup-actions.ts` — bajar severidad del log "Ubicación no encontrada" si se confirma que no es accionable.

Ningún cambio en `PointContextActions`, `nearby-popup-context`, ni en el contrato `map.on('popupclose')` ya implementado.
