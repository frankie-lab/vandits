## Diagnóstico

Reviso `src/domains/content/lib/collection-visibility.ts` y `src/pages/Index.tsx`. La visibilidad por sesión vive en un módulo global y se persiste en `sessionStorage`, así que **debería** sobrevivir a cambiar de sub-pestaña Itinerarios ↔ Colecciones. Hay tres bugs reales que explican que "al volver no se guarden" las preferencias:

### Bug 1 — Reset agresivo en cleanup del `useEffect` de Index

```tsx
// src/pages/Index.tsx (115-123)
useEffect(() => {
  if (!user?.id) { resetSessionCollectionVisibility(); return; }
  initSessionCollectionVisibility(user.id);
  return () => resetSessionCollectionVisibility();   // ← se dispara también en re-render/StrictMode
}, [user?.id]);
```

`resetSessionCollectionVisibility()` vacía el state in‑memory **y** marca `initialized = false`. Cualquier re-mount de `Index` (StrictMode dev, Suspense boundary que se vuelve a resolver, navegación interna) deja el módulo vacío hasta que `init` rehidrata desde storage — en el intervalo, `getVisibleCollectionIds()` devuelve `Set` vacío y el mapa pierde anillos/tints.

### Bug 2 — Mismatch sessionStorage vs localStorage

```ts
// collection-visibility.ts
sessionStorage.setItem(storageKey(uid), …)        // persistVisibleIds
localStorage.removeItem(storageKey(uid))          // resetSessionCollectionVisibility ← clave equivocada
```

El reset borra de `localStorage` (donde nunca hubo nada) y no toca `sessionStorage`. No es la causa raíz de la pérdida de UI, pero deja el contrato roto y bloquea cualquier clear correcto.

### Bug 3 — `init` idempotente no rebroadcastea

```ts
if (initialized && currentUserId === userId) return;   // sale sin emitir event
```

Cuando Index se re‑monta con el mismo user, `init` no hace nada **y no emite `COLLECTION_VISIBILITY_EVENT`**, así que el `setVisibleCollectionIds` del componente queda con el `Set` vacío del estado inicial. La UI muestra todos los ojos abiertos por defecto aunque el módulo internamente tenga el conjunto correcto persistido.

## Cambios propuestos (todo en archivos ya existentes)

### 1) `src/pages/Index.tsx` — quitar el reset en cleanup
- Reemplazar el `useEffect` por una versión que **solo** llama a `resetSessionCollectionVisibility` cuando `user.id` pasa de un valor a `null` (logout real), no en cleanup genérico.
- Añadir un `setVisibleCollectionIds(getVisibleCollectionIds())` inmediato tras `init` para hidratar el estado local del componente sin esperar al evento.

### 2) `src/domains/content/lib/collection-visibility.ts`

- **Init**: cuando ya está inicializado para el mismo user, hacer `broadcast()` igualmente (no return silencioso). Esto sincroniza cualquier consumidor recién montado.
- **Reset**: cambiar `localStorage.removeItem` → `sessionStorage.removeItem` (alinear con `persistVisibleIds`).
- **Hidratación robusta**: si al re-init el state in-memory está vacío pero hay datos en `sessionStorage`, repoblar `state.visible` desde lo persistido sin requerir nueva carga (rápido) y luego refrescar entries en background. (Cubre el caso de remount accidental.)

### 3) Re-aplicar tint del mapa al rehidratar

`LocationMap` ya escucha `COLLECTION_VISIBILITY_EVENT`. Con el broadcast del punto 2 funcionará automáticamente — no requiere cambio adicional.

## Archivos editados

- `src/pages/Index.tsx` (efecto de init/reset por usuario)
- `src/domains/content/lib/collection-visibility.ts` (init no-silente, storage consistente, hidratación defensiva)

## Verificación

1. Toggle 2 colecciones OFF en panel Colecciones.
2. Cambiar a sub-pestaña Itinerarios.
3. Volver a Colecciones → los dos ojos siguen cerrados; los puntos del mapa conservan/quitan anillos correctamente.
4. Cerrar el FloatingPanel completo y reabrirlo → idem.
5. Refrescar la página → idem (sessionStorage).
6. Logout → todo se limpia.
