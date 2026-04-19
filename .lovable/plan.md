

## Diagnóstico

Tras la migración al sistema centralizado de paneles, has detectado dos clases de problemas reales en la captura. Vamos uno a uno:

### Problema 1 — Toast falso "Error al guardar modos de transporte"

En la captura estás en la pestaña **Mapa** del `UserProfileEditor` definiendo "Mi casa", pulsas **Guardar cambios** y aparecen **3 toasts** simultáneos:
- ✓ "Perfil actualizado"
- ✗ "Error al guardar modos de transporte"
- ✓ "Preferencias guardadas"

Causa: `handleSave` (UserProfileEditor.tsx:671-696) **siempre** ejecuta `DELETE … FROM user_transport_modes WHERE user_id = X` cada vez que guardas, sin importar la pestaña activa ni si has tocado los modos de transporte. Si el `DELETE` devuelve cualquier error de RLS/red/timing, dispara el toast de error aunque el guardado del perfil haya ido bien.

Es un guardado "shotgun": el botón "Guardar cambios" persiste TODO (perfil + privacidad + mapa + viaje + transporte + route engine) en una sola pasada — herencia del editor monolítico anterior. Ahora que las pestañas se abren independientemente desde el menú principal, el usuario espera que "Guardar" en la pestaña Mapa solo guarde lo del mapa.

### Problema 2 — Paneles que "han heredado funciones anteriores"

`UserProfileEditor` tiene 4 sub-pestañas internas (`profile`, `travel`, `privacy`, `map`) controladas por el payload `tab` del registry. Cuando el menú abre `profileEditor` con tab `map`, la cabecera del FloatingPanel dice "Mapa" pero **el componente sigue siendo el editor completo con todos los useEffects, todos los listeners y la función guardar conjunta**. Resultado:
- `PreferencesPage` (panel "Preferencias") y `UserProfileEditor#map` cubren temas solapados (unidades de medida, comportamiento del mapa).
- `SoundSettingsPanel` queda ya cubierto por la pestaña *Apariencia* de `PreferencesPage` (vía `ux.audio`).
- Hay tres entradas en el menú (`Mapa`, `Viaje`, `Privacidad`) que en realidad abren la misma instancia del editor cambiando una variable interna — un patrón confuso que hereda lógica del editor monolítico.

## Plan propuesto (mínimo invasivo, dos pasos)

### Paso 1 — Corregir el guardado por pestaña (urgente)

Refactorizar `handleSave` en `UserProfileEditor.tsx` para que **solo persista lo que corresponde a la pestaña activa**:

| Pestaña activa | Qué se guarda |
|---|---|
| `profile`  | `display_name`, `username`, `bio`, `avatar_url` |
| `privacy`  | `is_private`, `duplicate_threshold_meters`, `default_*_visibility`, `hide_home_location` |
| `map`      | `map_center_mode`, `home_*`, `measurement_units` + cache localStorage |
| `travel`   | `travel_profile`, `priority_ranking`, `route_engine_defaults`, `user_transport_modes` |

Implementación:
- Añadir un `switch (activeTab)` al inicio de `handleSave` que construya solo el `updates` necesario.
- Mover el bloque `user_transport_modes` (líneas 671-696) dentro de la rama `travel` únicamente.
- El toast final dice "Guardado" en lugar de tres toasts encadenados.
- Bonus: añadir `if (delErr.code !== 'PGRST116')` al `DELETE` para no toastear cuando simplemente no hay filas.

### Paso 2 — Limpiar entradas duplicadas del menú

Una vez que cada pestaña guarda solo lo suyo, queda más claro qué entradas tienen sentido como panel separado. Propuesta:

| Antes (entradas del menú) | Después |
|---|---|
| Perfil | **Perfil** (abre editor en `profile`) |
| Viaje  | **Viaje** (sigue abriendo editor en `travel`) |
| Privacidad | **Privacidad** (sigue abriendo editor en `privacy`) |
| Mapa (perfil)  | **Mapa** (sigue abriendo editor en `map`) |
| Notificaciones (`SoundSettingsPanel`) | **Eliminada del menú** — ya está en Preferencias › Apariencia |
| Preferencias  | **Preferencias** (apariencia, layout, mapa-chrome, accesibilidad) |

Eliminar la entrada autónoma "Notificaciones" del menú y del registry (`'soundSettings'`) — sus opciones viven ya en `PreferencesPage` vía la unit `ux.audio`. Esto elimina el solape "han desaparecido funciones anteriores" porque deja de haber dos sitios para lo mismo.

## Lo que NO cambia
- `useRightPanel` y la regla de exclusión mutua (funciona bien).
- Estructura interna del editor (4 pestañas siguen existiendo, solo cambia qué guarda cada una).
- `PreferencesPage` y sus units actuales.
- Modal dialogs (Export, Batch, Criteria) ni ninguna otra ruta.

## Archivos a tocar

| Archivo | Cambio |
|---|---|
| `src/components/UserProfileEditor.tsx` | `handleSave` por pestaña + filtrado de error inocuo en delete |
| `src/components/FloatingToolbar.tsx` | Eliminar entrada "Notificaciones" del menú |
| `src/pages/Index.tsx` | Eliminar `<SoundSettingsPanel/>` y la prop `onOpenSoundSettings` |
| `src/hooks/use-right-panel.ts` | Quitar `'soundSettings'` del union type |

## Verificación

1. Abrir Perfil › Mapa → cambiar coords de "Mi casa" → Guardar → un solo toast "Guardado", sin error de transporte.
2. Abrir Perfil › Viaje → modificar transportes → Guardar → guarda transporte y ranking, no toca privacidad.
3. Abrir Preferencias → ver que sigue habiendo control de sonido en la pestaña Apariencia.
4. Confirmar que la entrada "Notificaciones" ya no aparece en el menú flotante.
5. Cambiar entre Perfil → Privacidad → Mapa → ver que la cabecera del panel cambia de título e icono pero no recarga.

