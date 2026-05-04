# Acciones sobre selección en el panel Filtros

## Objetivo

Cuando el usuario selecciona puntos vía Geo / Tipo / Tags / Legacy, debe poder ejecutar acciones masivas sobre esa selección sin salir del panel. Hoy el footer solo tiene "Seleccionar todo / Limpiar / Seleccionar N filtrados / Papelera".

## Dónde encaja

Sobre el footer sticky actual de `src/components/FilterBar.tsx` (líneas 414‑489), añadir un nuevo bloque **"Acciones (N)"** que aparece cuando `selectedCount > 0`. Reutiliza:
- `batch-enrich` edge function (ya usada por `FloatingToolbar`, `BatchEnrichmentPanel`, `BottomProgressBar`).
- Helpers de exportación `exportToKML / exportToCSV / exportToJSON` de `ExportPanel`.
- `supabase.from('locations').update(...)` con `.in('id', selectedIds)` para acciones tipo bulk.

## Acciones propuestas (con prioridad)

### Esenciales (las que pediste)
1. **Enriquecer con IA** — invoca `batch-enrich` con los IDs seleccionados. Reutiliza la barra de progreso `BottomProgressBar` ya existente.
2. **Exportar selección** — submenú KML / CSV / JSON, y atajos a "Google My Maps" y "Guru Maps" (como en `ExportPanel`).

### Muy útiles (recomendadas)
3. **Añadir / quitar etiqueta (tag)** — popover con buscador de tags + crear nueva. Aplica el tag a todos los puntos seleccionados.
4. **Reclasificar (place_type)** — selector de `place_types` para corregir tipo masivamente (típico tras importar KMLs sucios).
5. **Marcar como visitado / pendiente** — toggle masivo del estado de exploración.
6. **Cambiar visibilidad** — `published` / `draft` masivo (Catálogo vs Workspace), respetando reglas de doc-status.
7. **Mover a documento / colección** — selector de documento destino para reorganizar puntos importados.
8. **Eliminar (papelera)** — ya existe para *filtrados*, añadir variante para *seleccionados*.

### Avanzadas (opcionales, segundo paso)
9. **Detectar duplicados en la selección** — lanza el motor de duplicados solo sobre los IDs marcados.
10. **Rellenar jerarquía geográfica** — ejecutar `resolve-admin-area` sobre los seleccionados que tengan FKs vacíos.
11. **Generar ruta desde selección** — pasa los puntos al `RouteBuilder` como waypoints en orden geográfico.
12. **Copiar coordenadas / IDs al portapapeles** — utilidad rápida para debugging y soporte.

## Diseño UI

Nuevo bloque en el footer, justo encima del bloque actual "Selección controls":

```text
┌─ Acciones (12 seleccionados) ──────────────┐
│ [Sparkles] Enriquecer IA                   │
│ [Download] Exportar       ▾                │
│ [Tag]      Etiquetar      ▾                │
│ [Layers]   Reclasificar   ▾                │
│ [Más ▾]  → Visitado, Visibilidad, Mover,   │
│            Detectar duplicados, Geocodificar│
│ [Trash]    Eliminar (rojo)                 │
└────────────────────────────────────────────┘
```

- Visible solo cuando `selectedCount > 0`.
- Botones primarios visibles: Enriquecer, Exportar, Etiquetar, Reclasificar, Eliminar.
- Resto bajo un menú "Más" (`DropdownMenu`) para no saturar.
- Cada acción muestra el contador: `Enriquecer IA (12)`.
- Toasts y, donde aplique, conexión con `BottomProgressBar`.

## Detalles técnicos

- Crear `src/components/filters/SelectionActions.tsx` que recibe `selectedIds: string[]` y los `locations` resueltos del store.
- Helpers internos:
  - `runBatchEnrich(ids)` → `supabase.functions.invoke('batch-enrich', { body: { locationIds: ids } })` y dispara `enrichment-started` para que `BottomProgressBar` se enganche.
  - `exportSelection(format, target)` → reutiliza `exportToKML/CSV/JSON` filtrando por IDs (no por documento).
  - `bulkUpdate(ids, patch)` → `update(...).in('id', ids)` + `dispatchEvent('store-updated')`.
- Hook `useSelectedLocationsResolved()` que devuelve los `GeoLocation` completos a partir de `selectedLocations` y `documents` del store.
- Mantener la papelera de "filtrados" tal cual; añadir su variante "seleccionados" en este bloque.

## Lo que NO se toca

- Lógica de filtros (tabs, árboles).
- Reglas de visibilidad doc‑status / Catalog vs Workspace (memoria).
- Marker grammar V2 (frozen).
- `LocationMap` (solo se aprovechan eventos `store-updated` ya existentes).

## Pregunta antes de implementar

¿Quieres que en esta primera entrega incluya **solo las 8 esenciales+útiles** (1‑8) y dejemos las avanzadas (9‑12) para una segunda iteración? Por defecto haré las 8 primeras.
