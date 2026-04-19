

## Cambio respecto al plan anterior

Sustituyo el auto-cierre temporal (6s + movimiento del mapa) por **cierre al click fuera** de la tarjeta. El resto del comportamiento (modo summary, 3 cifras, 2 CTAs, persistencia por sesión, reapertura vía evento) se mantiene.

## Comportamiento final de la tarjeta-resumen

Contenido:
- "Hola, {nombre}" + "No te vemos desde X" (si aplica).
- Tres cifras coherentes con el top-bar:
  - 🟢 Catálogo propio (`myCatalogCount`)
  - 🔵 Total accesible (`totalCatalogCount`)
  - ⚪ Documentos importados (`documents.length`)
- Acciones: "Ir a mi catálogo" / "Importar más".

Cierre:
- **Click fuera** de la card (listener `mousedown` en `document` con `ref.current.contains(target)` para ignorar clicks internos).
- Sin temporizador de 6s.
- Sin listeners de `movestart`/`zoomstart` del mapa.
- Marca en `sessionStorage` (`vandits:welcome-summary-shown`) para no reaparecer en la misma sesión.
- Reabrible vía `window` event `vandits:show-welcome`.

## Bugs a arreglar a la vez (del diagnóstico ya aprobado)

En `src/components/LocationMap.tsx`:

1. `hasImports` debe leer del store sin filtrar:
   ```ts
   const allLocationsCount = useLocationsStore(s => s.getAllLocations().length);
   const hasImports = documents.length > 0 || allLocationsCount > 0;
   ```
   (no usar `useFilteredLocations()` para esta decisión).

2. Renombrar la marca de sesión a `vandits:welcome-summary-shown` y limpiar la antigua `vandits:welcome-shown` una vez.

3. No fijar el modo en frío: si aún no hay datos hidratados, mantener la card oculta hasta que `documents` o `allLocationsCount` reporten algo.

## Cambios concretos

Único archivo: `src/components/LocationMap.tsx`.

- Eliminar el `setTimeout(6000)`, los `map.on('movestart'...)` / `'zoomstart'` y los handlers `onMouseEnter`/`onMouseLeave` de pausa de timer.
- Añadir `useRef` sobre el contenedor de la card y un `useEffect` que registre `mousedown` en `document` mientras el modo sea `summary`; al detectar click fuera → `dismiss()`.
- `dismiss()` sigue escribiendo `sessionStorage.setItem('vandits:welcome-summary-shown', '1')` y oculta la card.
- Mantener listener `vandits:show-welcome` para reabrir (limpia la marca + vuelve a mostrar).
- Aplicar los 3 fixes del diagnóstico ya aprobados.

## Validación

1. Recargar con catálogo poblado → aparece la summary con las 3 cifras correctas.
2. Click sobre el mapa o fuera de la card → se cierra al instante.
3. Click dentro de la card (botones, texto) → no se cierra.
4. Recargar → no reaparece (sessionStorage).
5. `window.dispatchEvent(new Event('vandits:show-welcome'))` desde consola → reaparece.

