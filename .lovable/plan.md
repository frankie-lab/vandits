

## Resumen de la idea

Ahora mismo la welcome card empuja "Importar archivos" mientras no haya puntos importados. Cuando el usuario **ya tiene puntos en su catálogo**, ese CTA pierde sentido: lo útil es ver el estado real de su catálogo y poder volver al flujo en cualquier momento.

## Comportamiento nuevo (respuesta confirmada por ti)

### Cuándo aparece la tarjeta

| Caso | Qué se muestra |
|---|---|
| Sin Casa **y** sin importaciones | Onboarding actual (CTAs Casa + Importar) — sin cambios |
| Sin Casa pero con puntos | CTA Casa destacada arriba + bloque resumen abajo (sin CTA importar) |
| Con Casa y con puntos en catálogo | **Tarjeta-resumen** (no onboarding) |
| Con Casa y con puntos pero ninguno publicado | Tarjeta-resumen indicando "0 en catálogo" + sugerencia suave |

### Tarjeta-resumen (caso principal de tu pregunta)

Contenido:
- Saludo `Hola, {nombre}` + "No te vemos desde X" (si aplica).
- Tres cifras alineadas en una fila, con la misma paleta del top-bar para coherencia:
  - 🟢 **Catálogo propio** (`published` propios)
  - 🔵 **Catálogo total accesible** (propios + seguidos)
  - ⚪ **Documentos importados**
- Dos acciones secundarias en línea:
  - "Ir a mi catálogo" → abre panel de ubicaciones filtrado a publicados propios
  - "Importar más" → dispara `vandits:open-upload` (preserva el flujo)

### Auto-ocultado

- La tarjeta se cierra automáticamente a los **6 s** desde que se monta.
- También se cierra al **primer movimiento del mapa** (`movestart` o `zoomstart`) o al hacer click en cualquier marker.
- Mientras el ratón está sobre la tarjeta, el temporizador se pausa (UX cortés).
- Se puede **reabrir** desde el avatar/menú (ya existe `vandits:open-profile`; añadiremos un disparador análogo `vandits:show-welcome`).
- El estado "ya mostrada" se guarda en `sessionStorage` para no reaparecer espontáneamente en la misma sesión.

## Cambios técnicos

Único archivo afectado: `src/components/LocationMap.tsx`.

1. **Derivar nuevas señales** junto a `importedCount`/`hasHome`:
   - `publishedOwnCount` — cuento de `documents` con `status==='published'` propios → puntos asociados.
   - `accessibleCatalogCount` — reusar `catalogStats.totalCatalogCount` (mismo helper que `FloatingToolbar`) para garantizar coherencia.
   - `documentsCount` — `documents.length`.

2. **Nueva variable de modo**:
   ```ts
   const mode: 'onboarding' | 'summary' =
     hasImports ? 'summary' : 'onboarding';
   ```
   Se mantiene la card actual cuando `mode==='onboarding'`.

3. **Render condicional**: si `mode==='summary'`, renderizar el nuevo bloque (mismo contenedor visual, mismo gradient/halo) con las 3 cifras y las 2 CTAs. Si falta Casa, prepender el bloque Casa actual destacado.

4. **Auto-cierre**:
   - `useEffect` con `setTimeout(6000)` cuando `mode==='summary'`.
   - Listener `map.on('movestart', dismiss)` y `map.on('zoomstart', dismiss)`.
   - `onMouseEnter`/`onMouseLeave` en la card para pausar/reanudar el timer.
   - `sessionStorage.setItem('vandits:welcome-shown', '1')` al cerrarse; al montar, si la marca existe, no mostrar.

5. **Reapertura manual**:
   - Escuchar `window` event `vandits:show-welcome` para limpiar la marca y volver a montar.
   - (No incluyo en este plan el botón en el menú de avatar — solo dejo el hook listo para cuando lo añadas.)

## Lo que NO se toca

- La tarjeta de onboarding pura (sin puntos) sigue idéntica.
- El top-bar (`FloatingToolbar`) sigue siendo la fuente "siempre visible" de las cifras.
- Ninguna lógica de paleta, visibilidad de capas, ni paneles cambia.

## Validación al final

- Verificar en escritorio (1390 px) que las 3 cifras caben en una línea sin desbordar.
- Verificar en móvil (~375 px) que pasa a 2 columnas + 1 abajo o se apila.
- Comprobar el auto-cierre a los 6 s, la pausa al hover y el cierre por interacción con el mapa.
- Recargar y comprobar que **no** vuelve a aparecer en la misma sesión.

