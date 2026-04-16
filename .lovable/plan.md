

# Plan: Conectar el sistema de preferencias a la app real

## Problema central

`usePreferences()` existe pero **ningun componente lo consume**. Los hooks reales (`use-map-theme`, `use-layer-visibility`, `use-sound-preferences`) siguen con localStorage directo + CustomEvent. El panel de PreferencesPage escribe a DB pero los cambios no llegan a ningun sitio.

## Solucion: 3 fases

### Fase 1 — Bus reactivo para preferencias (infraestructura)

Agregar un mecanismo de notificacion a `usePreferences` para que multiples instancias del mismo `unitId` se sincronicen:

- Emitir `CustomEvent` con `unitId` despues de cada `update`/`updateBatch`/`resetScope`
- En el `useEffect` de `usePreferences`, escuchar ese evento y re-cargar layers si el `unitId` coincide
- Cambiar de persist-first a **optimistic**: `setLayers` primero, `adapter.save` en background

**Archivos**: `src/shared/preferences/usePreferences.ts`

### Fase 2 — Migrar hooks existentes a consumir usePreferences

**use-map-theme.ts**: 
- Eliminar localStorage directo y CustomEvents propios
- Leer `ux.appearance.theme` via `usePreferences`
- Mantener `applyDarkMode()` como efecto imperativo disparado por cambio en `preferences.theme`

**use-sound-preferences.ts**:
- Eliminar `sounds.ts` localStorage directo
- Leer `ux.audio.*` via `usePreferences`

**use-layer-visibility.ts**:
- Este es el mas complejo. El singleton + CustomEvent actual funciona bien para el mapa
- En lugar de reemplazarlo, hacer que el panel `ux.map.visibility` escriba al singleton y emita `LAYER_VISIBILITY_EVENT`, no que use el adapter de DB
- Asi se mantiene la reactividad imperativa del mapa sin romperla

**Archivos**: `src/hooks/use-map-theme.ts`, `src/hooks/use-sound-preferences.ts`, `src/hooks/use-layer-visibility.ts`

### Fase 3 — Tests del flujo completo

Crear tests unitarios para:

1. `usePreferences` — cambiar valor, verificar que el evento se emite y otra instancia se actualiza
2. `use-map-theme` — cambiar theme, verificar `document.documentElement.classList`
3. `use-layer-visibility` — toggle layer, verificar emision de evento

**Archivos**: `src/test/preferences-sync.test.ts`, `src/test/map-theme.test.ts`

## Archivos afectados

| Accion | Archivo |
|---|---|
| Editar | `src/shared/preferences/usePreferences.ts` (bus + optimistic) |
| Reescribir | `src/hooks/use-map-theme.ts` (consumir usePreferences) |
| Reescribir | `src/hooks/use-sound-preferences.ts` (consumir usePreferences) |
| Editar | `src/hooks/use-layer-visibility.ts` (bridge con panel) |
| Crear | `src/test/preferences-sync.test.ts` |
| Crear | `src/test/map-theme.test.ts` |

## Orden de ejecucion

1. Bus reactivo en usePreferences
2. Migrar use-map-theme
3. Migrar use-sound-preferences
4. Bridge layer-visibility con panel
5. Tests

