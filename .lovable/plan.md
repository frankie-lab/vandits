

# Plan: Encapsular bus de preferencias + tests con resultado visible

## 1. Extraer `preferencesBus.ts`

Crear `src/shared/preferences/preferencesBus.ts` como modulo independiente que encapsula el mecanismo de notificacion. Hoy usa `CustomEvent` internamente, pero la API publica es:

```typescript
// preferencesBus.ts
type PrefChangedDetail = { unitId: string; scope: PreferenceScope; overrides: ScopeOverrides };
type PrefListener = (detail: PrefChangedDetail) => void;

export function emitPrefChanged(detail: PrefChangedDetail): void;
export function onPrefChanged(listener: PrefListener): () => void;
```

Internamente usa `CustomEvent` hoy. Manana se puede sustituir por Zustand, `useSyncExternalStore`, o un `Set<Function>` sin tocar ningun consumidor.

**usePreferences.ts** pasa a importar `emitPrefChanged` y `onPrefChanged` de `preferencesBus.ts` en lugar de usar `window.addEventListener` directamente.

## 2. Reescribir tests con resultados visibles

### `preferences-sync.test.ts` — 4 tests:

1. **Bus emite y filtra por unitId**: emitir para `ux.appearance`, verificar que un listener de `ux.audio` NO recibe nada (se queda igual)
2. **Tema -> dark class en DOM**: escribir `theme: 'dark'` via bus, importar `applyDarkMode` de `use-map-theme`, verificar `document.documentElement.classList.contains('dark')` === true
3. **Sonido -> preferencia consumible cambia**: escribir `globalEnabled: false` en localStorage via el adapter, verificar que `areSoundsEnabled()` de `sounds.ts` devuelve `false`
4. **Visibilidad -> singleton actualizado y evento emitido**: llamar `applyVisibilityFromPanel({ catalog: false })`, verificar que `getSharedLayers().catalog.visible === false` y que `LAYER_VISIBILITY_EVENT` fue disparado

### `map-theme.test.ts` — 3 tests reescritos:

1. **applyDarkMode('dark') agrega clase**: importar la funcion real, ejecutar, verificar `classList.contains('dark')`
2. **applyDarkMode('light') remueve clase**: agregar `dark`, ejecutar con `light`, verificar que no esta
3. **Cambio de preferencia en localStorage se refleja en lectura**: escribir `{ theme: 'dark' }` en localStorage bajo el key del adapter, leer con `localStorageAdapter.load('ux.appearance', 'device')`, verificar que devuelve `{ theme: 'dark' }`

## Archivos afectados

| Accion | Archivo |
|---|---|
| Crear | `src/shared/preferences/preferencesBus.ts` |
| Editar | `src/shared/preferences/usePreferences.ts` (importar del bus) |
| Reescribir | `src/test/preferences-sync.test.ts` |
| Reescribir | `src/test/map-theme.test.ts` |

## Orden

1. Crear `preferencesBus.ts`
2. Refactorizar `usePreferences.ts` para consumirlo
3. Reescribir los dos archivos de test

