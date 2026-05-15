## Promover `NearbyPointCard` a primitive compartido

### Objetivo
Extraer la fila visual de "contexto cercano" a un componente reutilizable en `src/shared/components/` para que cualquier feature (búsqueda, sugerencias POI, resultados de proximidad, etc.) pueda renderizar la misma fila sin duplicar JSX.

### Cambios

1. **Crear `src/shared/components/ui/nearby-result-card.tsx`**
   - Componente `<NearbyResultCard>` con props desacopladas del dominio:
     - `name: string`
     - `distanceLabel?: string` (ej: "110 m")
     - `metaLabel?: string` (ej: coords formateadas)
     - `action?: ReactNode` (botón opcional, se muestra en hover)
     - `onClick?: () => void`
     - `className?: string`
   - Layout flex idéntico al actual (card border, hover transitions, truncate, opacity-0/100 del action).
   - Tokens semánticos (`border-border/60`, `bg-card/40`, `text-muted-foreground`).
   - Sin lógica de negocio (nada de enrich, nada de POI types).

2. **Refactorizar `NearbyPointCard` en `PointContextActions.tsx`**
   - Pasa a ser un wrapper fino que:
     - Calcula `distanceLabel`, `metaLabel` (coords), nombre.
     - Construye el botón Enrich (`Loader2`/`Sparkles`) como `action`.
     - Renderiza `<NearbyResultCard>`.
   - Cero cambios visuales: misma apariencia exacta que ahora.

3. **No tocar** otros consumidores. Sólo se extrae el primitive; las features existentes que quieran adoptarlo lo harán bajo demanda.

### Verificación
- Vista de "contexto cercano" en popup debe verse idéntica (mismo padding, hover, botón aparece en hover, truncate).
- Build limpio.

### Archivos
- Nuevo: `src/shared/components/ui/nearby-result-card.tsx`
- Editado: `src/domains/content/components/PointContextActions.tsx` (sólo `NearbyPointCard`)
