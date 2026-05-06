# Restaurar visibilidad y diseño de colecciones a lo acordado

## Problemas detectados (regresión del último cambio)

1. **Icono ojo al revés** — `CollectionsListPanel` muestra `EyeOff` cuando la colección está visible y `Eye` cuando está oculta. La intención era que el icono indicara la acción ("haz clic para ocultar"), pero visualmente confunde porque las filas con borde de color (visibles) llevan el icono tachado.
2. **Anillo del marker desplazado** — en el último cambio movimos `.collection-tint-ring` a `inset: -4px` (halo externo). El acuerdo original (msg 5324) era: anillo = borde del marker, centro = paleta de estado. No halo flotando fuera.
3. **Persistencia equivocada** — guardamos los IDs visibles en `localStorage`, así que al volver a entrar (incluso tras logout/login en otra pestaña) se restauran las del último estado guardado. Tú esperas: sesión = login → cada vez que entras, todas las colecciones empiezan visibles; un simple refresh dentro de la misma sesión sí mantiene el estado.

## Cambios

### 1. Invertir icono del ojo (estado, no acción)
`src/components/CollectionsListPanel.tsx` línea 183:
- Antes: `{isVisible ? <EyeOff/> : <Eye/>}`
- Después: `{isVisible ? <Eye/> : <EyeOff/>}`
El tooltip ya describe la acción, así que el icono pasa a reflejar el estado.

### 2. Restaurar anillo pegado al marker
`src/index.css` `.collection-tint-ring`:
- `inset: -4px` → `inset: 0`
- Mantenemos `border: 2px solid var(--collection-tint)` y `border-radius: 9999px`.
Esto deja el color de colección como un borde sobre el propio marker, sin tapar el centro de estado (que ya es opaco).

### 3. Cambiar persistencia a sessionStorage
`src/domains/content/lib/collection-visibility.ts`:
- Reemplazar `localStorage.setItem/getItem` por `sessionStorage.setItem/getItem` en `persistVisibleIds` y `loadVisibleIdsFromStorage`.
- Mantener la clave `vandits.collection-visibility.v1.<userId>` y la limpieza en logout (`resetSessionCollectionVisibility`).
- Resultado: refresh = mismo estado; cerrar pestaña / logout / nueva sesión = todas visibles por defecto.

## Verificación

1. Abrir el panel Colecciones: las filas con borde de color muestran ojo abierto; las grises sin borde, ojo tachado. Coherente con la captura.
2. Toggle del ojo: cambia el icono al estado nuevo y aparece/desaparece el borde del marker en el mapa.
3. Refresh (F5) en la misma pestaña: el estado de los ojos se mantiene.
4. Cerrar pestaña y volver a entrar: todas las colecciones aparecen visibles de nuevo.
5. Logout y vuelta a entrar: todas visibles de nuevo.

## Archivos editados
- `src/components/CollectionsListPanel.tsx` (línea 183: invertir Eye/EyeOff)
- `src/index.css` (`.collection-tint-ring` → `inset: 0`)
- `src/domains/content/lib/collection-visibility.ts` (localStorage → sessionStorage en `persistVisibleIds` y `loadVisibleIdsFromStorage`; constante `STORAGE_PREFIX` puede mantenerse)

## Memoria
Actualizar `mem://logic/collections/visibility-and-styling`:
- Anillo de colección = borde del marker (inset 0), nunca halo externo.
- Icono del ojo refleja ESTADO (Eye=visible, EyeOff=oculta), no acción.
- Persistencia = sessionStorage por userId. Sobrevive a refresh; muere al cerrar pestaña o logout. Cada login fresco arranca con todas visibles.
