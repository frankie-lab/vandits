## Objetivo

Exponer el cuadro multi-modo (Catálogo / Itinerario / Colección / Ruta / Etiquetas) directamente desde cada tarjeta del panel **Contenido → Documentos importados**, sin obligar al usuario a entrar primero a la vista de documento.

## Contexto

Hoy el diálogo vive embebido en `DocumentFocusView.tsx` (líneas 1373+, controlado por `showCatalogDialog` + `addModes`). El `DocumentsPanel.tsx` solo expone Abrir / Aprobar todos / Geocodificar / Eliminar. El usuario echa en falta ese cuadro completo desde la tarjeta.

## Enfoque (transversal, helper único)

Para cumplir la regla "App multiusuario — cambios transversales", **extraer el diálogo** a un componente reutilizable en lugar de duplicarlo.

### 1. Extraer `DocumentAddDialog`

Nuevo archivo `src/domains/content/components/DocumentAddDialog.tsx`:
- Recibe props: `open`, `onOpenChange`, `docId`, `docName`, `locations`, `routes`, `selectedIds`, `selectedRouteIds`.
- Encapsula todo el estado y lógica que hoy vive inline en `DocumentFocusView`: `addModes`, `catalogOptions`, `collectionId`, `tagList`, `computeCatalogPreview`, `computeItineraryPreview`, `handleConfirm`, etc.
- Renderiza el `Dialog` con las 5 secciones (catalog / itinerary / collection / route / tag) tal cual están hoy.

### 2. Refactor `DocumentFocusView`

Reemplazar el bloque inline (≈ líneas 1373-1850) por:
```tsx
<DocumentAddDialog
  open={showCatalogDialog}
  onOpenChange={setShowCatalogDialog}
  docId={docId}
  docName={docName}
  locations={locations}
  routes={routes}
  selectedIds={selectedIds}
  selectedRouteIds={selectedRouteIds}
/>
```

### 3. Integrar en `DocumentsPanel`

En cada tarjeta (línea 464+), añadir un botón **"Añadir…"** entre "Abrir" y "Aprobar todos":

```tsx
<Button onClick={() => setAddingDoc({ id: doc.id, name: doc.name })}>
  <Plus className="w-3 h-3" /> Añadir…
</Button>
```

Cuando `addingDoc` esté seteado, el panel:
1. Carga `locations` y `routes` del documento (mismo fetch que hace `DocumentFocusView` al abrir).
2. Renderiza `<DocumentAddDialog>` con `selectedIds`/`selectedRouteIds` vacíos (scope por defecto = "todos").
3. Al cerrar el diálogo, refresca `fetchDocs()` para actualizar contadores y badge de aprobación.

### 4. Sin regresión

- El botón "Añadir" dentro de `DocumentFocusView` sigue funcionando exactamente igual (mismo componente extraído).
- Los 5 modos siguen siendo combinables.
- Toda la lógica de duplicados 250m, auto-enrich, visibilidad y selección de rutas se conserva.

## Archivos afectados

- **Nuevo**: `src/domains/content/components/DocumentAddDialog.tsx` (extracción).
- **Editado**: `src/domains/content/components/DocumentFocusView.tsx` (consume el nuevo componente).
- **Editado**: `src/domains/content/components/DocumentsPanel.tsx` (botón "Añadir…" + estado `addingDoc` + render del diálogo).

## Resultado

Desde la tarjeta del documento (sin abrirlo), un clic en "Añadir…" despliega el cuadro completo con los 5 destinos seleccionables y las opciones avanzadas que ya existían.
