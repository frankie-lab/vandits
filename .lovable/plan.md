
## Problema observado

Cuando un usuario nuevo entra a Vandits sin puntos:
- `mapCenterConfig.mode` por defecto es `'auto'`.
- `applyMapCenter` en modo `auto` solo hace zoom si `locations.length > 0` → no hace nada.
- El mapa se queda en su vista mundial inicial (`[20, 0], 3`) y encima muestra el overlay "No hay ubicaciones para mostrar" (LocationMap.tsx:1454-1461).

Resultado: pantalla mundial vacía y un cartel poco acogedor.

## Comportamiento propuesto

1. **Modo `auto` con 0 puntos**: pedir geolocalización del navegador y centrar en ella con un zoom razonable (z=11). Si el usuario rechaza el permiso o falla → fallback al `setView([20, 0], 3)` actual.
2. **Overlay "No hay ubicaciones para mostrar"**: sustituir el cartel actual por un mensaje amistoso de bienvenida, no bloqueante, que invite a importar/añadir puntos. Mantener el marcador GPS azul ya existente (`userLocation` se obtiene en el `useEffect` de la línea 781) para que el usuario se vea en el mapa.

## Cambios técnicos

### 1. `src/components/LocationMap.tsx` — `applyMapCenter`
Ampliar el bloque `mode === 'auto'` (línea 717-722) para que cuando no haya puntos:
```ts
} else {
  // Auto mode
  if (locations.length > 0) {
    zoomToBounds(immediate, 1);
  } else if (navigator.geolocation) {
    // No points yet → center on user GPS so the new user sees themselves
    navigator.geolocation.getCurrentPosition(
      (pos) => mapRef.current?.setView([pos.coords.latitude, pos.coords.longitude], 11),
      () => { /* keep default world view, no error toast */ },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
    );
  }
}
```

Nota: se pone `enableHighAccuracy: false` y silencioso para que no moleste si el usuario aún no ha decidido sobre el permiso. Si ya hay un `userLocation` cacheado del watchPosition, podemos usarlo directamente sin pedirlo de nuevo.

### 2. `src/components/LocationMap.tsx` — overlay vacío (líneas 1454-1461)
Reemplazar el cartel intrusivo por una tarjeta de bienvenida ligera, no bloqueante (z-index bajo, esquina inferior central, sin fondo opaco encima del mapa):
```tsx
{showEmptyState && (
  <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-[500] pointer-events-none">
    <div className="bg-background/90 backdrop-blur-sm px-4 py-3 rounded-lg shadow-lg text-center max-w-sm">
      <p className="text-sm font-medium">Bienvenido a Vandits</p>
      <p className="text-xs text-muted-foreground mt-1">
        Aún no tienes ubicaciones. Importa un archivo o añade puntos para empezar.
      </p>
    </div>
  </div>
)}
```
Sigue informando, pero sin tapar el mapa centrado en la ubicación del usuario.

## Archivos a tocar

| Archivo | Cambio |
|---|---|
| `src/components/LocationMap.tsx` | `applyMapCenter` (auto + 0 puntos → GPS); overlay reemplazado por tarjeta de bienvenida |

## Limitación / fallback

- Si el navegador deniega permisos o no responde en 8s → se queda con la vista mundial por defecto, sin error visible.
- En modo `home`/`geolocation` ya configurados explícitamente → no cambia nada.

## Verificación

1. Crear cuenta nueva (sin puntos).
2. Aceptar el permiso de geolocalización → el mapa se centra automáticamente en la ubicación del usuario con zoom ~11.
3. La tarjeta de bienvenida aparece pero no bloquea el mapa.
4. Importar un punto → el mapa hace fitBounds normal y la tarjeta desaparece.
5. Cuenta nueva con permiso GPS denegado → vista mundial + tarjeta de bienvenida (comportamiento actual con mensaje mejorado).
