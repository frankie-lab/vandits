
## Problema

El bloque actual de "candidatos cercanos" en el popup es ilegible:

- Mezcla diagnóstico, lista de 5 candidatos truncados a "St…", "Pa…", "M…", botones repetidos ("Usar nombre" / "Mover aquí" x5), atajo "Ignorar conflicto" y 3 acciones inferiores (Reintentar / Contexto cercano / Renombrar).
- El usuario no puede decidir nada: los nombres están cortados, las distancias se mezclan con la jerarquía y todas las opciones tienen el mismo peso visual.
- No diferencia los dos casos reales del verificador:
  - **A. Mismo nombre, coordenadas distintas** → la decisión es "¿muevo el punto o mantengo aquí?"
  - **B. Mismas coordenadas, nombre que no encaja** → la decisión es "¿renombro o ignoro?"

## Diseño nuevo: "2 caminos claros + preselección"

El bloque se reduce a **una pregunta, una recomendación destacada, una alternativa**. Solo si el usuario pide ver más se despliega la lista completa.

### Layout (3 zonas verticales)

```text
┌────────────────────────────────────────────────────┐
│ [icono]  TITULO DEL CASO            [Reintentar →] │  ← cabecera (1 línea)
│         frase corta de 1 línea                     │
├────────────────────────────────────────────────────┤
│  RECOMENDACIÓN                                     │
│  ┌──────────────────────────────────────────────┐ │
│  │ • Stone House — Braga · Portugal              │ │
│  │   a 0.1 km de tus coordenadas                 │ │
│  │   [  Mover el punto aquí  ]   ← CTA primario  │ │
│  └──────────────────────────────────────────────┘ │
├────────────────────────────────────────────────────┤
│  ¿No es esto? [Ver 4 alternativas ▾]  [Ignorar]    │  ← acciones secundarias
└────────────────────────────────────────────────────┘
```

### Reglas por caso (las "2 vías")

| Caso (verdict) | Título | CTA primario | Secundaria | Alternativas |
|---|---|---|---|---|
| **coordinate_mismatch** (mismo nombre, lejos) | "Mismo nombre, coordenadas distintas" | **Mover el punto aquí** → `handleMovePoint(rec.lat,rec.lng)` | "Mantener mis coordenadas" → `handleIgnoreConflict` | Lista de candidatos colapsada |
| **name_mismatch / llm_unverifiable** (coords ok, nombre raro) | "El nombre no encaja con la zona" | **Renombrar a "{rec.name}"** → `handleUseName(rec.name)` | "Mantener nombre" → `handleIgnoreConflict` | Lista colapsada |
| **sin parsed** (todavía no enriquecido, sin fallo) | "Aún sin enriquecer" | **Enriquecer** → `handleRetry` | "Contexto cercano" → `handleOpenContext` | — |

La **recomendación** se elige así (preselección, no auto-aplicación):
- Si hay `nameLocation` con título → es la recomendación.
- Si no, el primer candidato más cercano.
- Se muestra **nombre completo** (sin truncar a 2 letras), distancia, y jerarquía geo en una segunda línea pequeña.

### Lista de alternativas

- Oculta por defecto.
- Se despliega con `[Ver N alternativas ▾]` (N = candidates.length - 1, oculto si <1).
- Cada fila: nombre completo, distancia, jerarquía, y **una sola acción** coherente con el caso (Mover aquí en caso A, Usar nombre en caso B). Nunca las dos a la vez en la misma fila.
- "Renombrar manualmente" sigue disponible como link `[Renombrar…]` debajo de la lista, abriendo el input ya existente.

### Acciones secundarias finales

Una sola fila pequeña al pie del bloque, con texto-link (sin botones gordos):
`Reintentar` · `Contexto cercano` · `Renombrar…`

Esto sustituye a la pila vertical actual de 3 botones que ocupa media pantalla.

## Componente

Todo el cambio se hace en `src/domains/content/components/UnenrichedRecoveryBlock.tsx` (helper único, ya usado en popup, ficha completa y filas del documento → cambio transversal automático).

- Refactor del JSX a las 3 zonas descritas.
- Añadir un derivador `getRecommendation(parsed)` que devuelve `{ kind: 'move' | 'rename' | 'enrich', candidate, title, primary, secondary }`.
- Estado local nuevo: `expanded: boolean` para la lista de alternativas.
- Reutiliza los handlers existentes (`handleMovePoint`, `handleUseName`, `handleIgnoreConflict`, `handleRetry`, `handleOpenContext`, `handleRename`). Sin cambios en `enrich-location.ts`, `popup-recovery-mount.ts`, ni en el servidor.
- Variante `row` (filas del documento): solo cabecera + CTA primario en una línea, el resto detrás del popover (ya existe ese contenedor).

## Verificación

1. Abrir "Stone House" → ver título "Mismo nombre, coordenadas distintas", CTA "Mover el punto aquí", recomendación con nombre completo y jerarquía.
2. Pulsar la CTA → coords actualizadas, fallo invalidado, popup en estado verde.
3. Caso opuesto (coords ok, nombre raro) → CTA "Renombrar a …".
4. `Ver alternativas` despliega la lista compacta con acción única coherente.
5. Variante `row` (DocumentWaypointsTabs) renderiza la versión compacta sin romper la altura de la fila.
6. Memoria `mem://logic/enrichment/per-poi-recovery-block` actualizada con la nueva jerarquía de zonas.

## Fuera de alcance

- No se toca la validación del servidor.
- No se cambia el `MutationObserver` del montaje.
- No se modifican los marcadores ni el anillo rojo.
