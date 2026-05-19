# Technical Debt

Estado inicial: 2026-05-19

## Objetivo

Mantener una lista pequeña, accionable y priorizada de deuda técnica de Vandits.

La prioridad debe combinar impacto en producto, riesgo operativo y facilidad de resolución.

## Deuda priorizada

### 1. Versionado y documentación de estado

- Severidad: baja
- Facilidad: alta
- Riesgo de cambio: bajo
- Estado: en curso

`package.json`, README y documentación técnica deben contar la misma historia sobre la versión y el estado actual del proyecto.

### 2. Catálogo de eventos globales

- Severidad: media
- Facilidad: media
- Riesgo de cambio: bajo si se empieza documentando

Vandits usa varios eventos globales vía `window.dispatchEvent` / `window.addEventListener`.

Antes de refactorizarlos, documentar nombre, payload, emisor y consumidor.

### 3. Tests de gramática visual de puntos

- Severidad: media
- Facilidad: alta
- Riesgo de cambio: bajo

Blindar `src/domains/content/lib/point-visual-state.ts` con tests unitarios para los estados `enriched`, `imported` y `empty`.

### 4. Foto de arquitectura actual

- Severidad: media
- Facilidad: media
- Riesgo de cambio: bajo

Crear documentación breve de dominios, stores, mapa, popups, Supabase, rutas, colecciones, back office y eventos globales.

### 5. Reducir responsabilidad de `src/pages/Index.tsx`

- Severidad: media
- Facilidad: media
- Riesgo de cambio: medio

`Index.tsx` actúa como hub de muchos subsistemas. Extraer progresivamente orquestación a hooks o domain shells.

### 6. Reducir responsabilidad de `src/components/LocationMap.tsx`

- Severidad: alta
- Facilidad: baja
- Riesgo de cambio: alto

`LocationMap.tsx` concentra lifecycle de mapa, markers, clusters, popups, capas, rutas, realtime, geolocalización, cámara y eventos.

No abordar como reescritura. Extraer incrementalmente manteniendo contratos.
