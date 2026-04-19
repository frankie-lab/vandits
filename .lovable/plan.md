

## Diagnóstico

Los paneles laterales viven en **dos sistemas de estado paralelos** que no se comunican:

1. **`usePanelToggles`** (Index.tsx) — 11 booleanos independientes: `importedContent`, `categories`, `preferences`, `profileEditor`, `soundSettings`, `trash`, `adminPanel`, `usersSidebar`, `exportPanel`, `criteriaConfig`, `batchEnrichment`.
2. **`DiscoveryOrchestrator`** — 8 `useState` locales: filtros, ubicaciones, galería, búsqueda semántica, duplicados, incompletos, no resueltos, capas.

Todos renderizan un `FloatingPanel` con `right-4` + `z-[1000]`, así que cuando abres dos a la vez **se solapan en la misma posición**. Y como cada uno cierra solo su propio flag, queda el más antiguo "atrás" cuando reabres uno.

Respuesta directa a tu pregunta: **sí, lo correcto es que solo haya uno abierto a la vez en la columna derecha.** Es el comportamiento natural de paneles modales laterales (Slack, Notion, Linear lo hacen así) y elimina toda esta clase de bug sin tocar UX.

## Solución propuesta

Implementar un **registro central de "panel activo derecho"** con regla de exclusión mutua:

### 1. Nuevo hook `useRightPanel` (`src/hooks/use-right-panel.ts`)

Singleton tipo Zustand que expone:
```ts
type RightPanelId = 
  | 'importedContent' | 'categories' | 'preferences' | 'profileEditor'
  | 'soundSettings'   | 'trash'      | 'adminPanel'  | 'usersSidebar'
  | 'criteriaConfig'  | 'batchEnrichment'
  | 'filters' | 'locations' | 'gallery' | 'semanticSearch'
  | 'duplicates' | 'incomplete' | 'unresolved' | 'layers';

useRightPanel() → {
  activeId: RightPanelId | null,
  open(id, payload?),     // cierra el anterior y abre este
  close(id?),             // cierra si coincide (o cualquiera si se omite)
  toggle(id, payload?),   // si ya está abierto → cierra, si no → open()
  isOpen(id),             // helper booleano
  payload,                // p.ej. tab del ImportedContentPanel
}
```

Reglas:
- **Solo un panel puede estar abierto a la vez.** `open(B)` cierra automáticamente `A`.
- `payload` opcional cubre los casos que hoy llevan estado extra (`importedContentTab`, `profileEditorTab`, `adminPanelTab`).
- Diálogos modales (`ExportPanel` con `<Dialog>`) quedan **fuera** del registro — son overlays, no paneles laterales.

### 2. Refactor `Index.tsx`
- Sustituir `usePanelToggles` por `useRightPanel`.
- Cada `<FloatingPanel isOpen={...}>` consulta `isOpen('id')` y `onClose={() => close('id')}`.
- El listener `vandits:open-upload` llama a `open('importedContent', { tab: 'upload' })`.
- Mantener `usePanelToggles` para `exportPanel` (que es Dialog) — o migrarlo aparte.

### 3. Refactor `DiscoveryOrchestrator`
- Eliminar los 8 `useState` locales.
- Los `toggleX` que expone vía `DiscoveryControls` pasan a llamar `toggle('filters')`, `toggle('locations')`, etc.
- `filtersOpen`/`locationsOpen` derivan de `isOpen('filters')`/`isOpen('locations')` (necesarios para el badge del FloatingToolbar).

### 4. Pequeño detalle visual
Eliminar el `isMinimized` interno de `FloatingPanel` (queda obsoleto: si solo hay uno abierto, "minimizar" no aporta nada y complica el modelo). Es un cambio menor que limpia la cabecera.

## Lo que NO cambia
- `FloatingPanel` sigue siendo la carcasa visual (mobile Drawer + desktop floating).
- `PanelShell` y el sistema de tokens permanecen iguales.
- Diálogos modales (`Dialog` de shadcn) no se ven afectados.
- Los eventos custom (`vandits:open-upload`, `vandits:open-profile`) siguen funcionando, solo cambia el handler interno.

## Archivos a tocar

| Archivo | Cambio |
|---|---|
| `src/hooks/use-right-panel.ts` | **NUEVO** — store Zustand con exclusión mutua |
| `src/hooks/use-panel-toggles.ts` | Eliminar (o reducir a `exportPanel` solo) |
| `src/pages/Index.tsx` | Migrar todos los `setPanel(...)` a `open/close/toggle` |
| `src/domains/discovery/components/DiscoveryOrchestrator.tsx` | Reemplazar 8 `useState` por hook |
| `src/components/FloatingPanel.tsx` | Quitar botón minimizar (opcional, recomendado) |

## Verificación

1. Abrir "Mapa" desde el menú → se ve el panel.
2. Abrir "Categorías" → "Mapa" se cierra automáticamente, "Categorías" toma su sitio.
3. Abrir "Filtros" desde el toolbar → "Categorías" se cierra.
4. Volver a clicar el botón del panel activo → se cierra (toggle).
5. Tras cerrar, abrir cualquier otro → aparece limpio, sin panel "fantasma" detrás.
6. Móvil: el Drawer sigue comportándose igual (uno a la vez de forma natural).

