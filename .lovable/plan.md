# Checkbox "y aprobarlos" dentro de "Añadir a colección"

## Contexto

El diálogo "Añadir" de `DocumentFocusView` ya soporta combinar modos (catalog, itinerary, collection, route, tag) marcando varios checkboxes. El caso 99% es "añadir a colección Y aprobarlos", pero hoy requiere dos clics en sitios distintos del diálogo. La propuesta es un atajo visible junto a la colección elegida.

## Cambio propuesto

Dentro de la tarjeta "A una colección" (`DocumentFocusView.tsx` ~líneas 1624-1647), debajo del `CollectionPicker`, añadir un checkbox secundario:

```
[x] y publicarlos en mi catálogo (visibles en el mapa)
```

Comportamiento:

- **Marcado por defecto** (caso 99%).
- Al marcarlo/desmarcarlo, llama a `toggleAddMode('catalog')` (o `setAddModes` añadiendo/quitando `'catalog'`) — reusa el modo existente sin lógica nueva.
- Si el usuario abre la tarjeta `catalog` arriba a mano, el estado se mantiene sincronizado (es el mismo `Set`).
- Si el atajo activa `catalog`, la tarjeta superior se ilumina automáticamente (ya está bindeada al mismo `addModes.has('catalog')`).

Texto sutil debajo: "Si lo desmarcas, la colección se guardará pero los puntos quedarán en mesa de trabajo (solo visibles al abrir el documento)." — refleja literalmente la matriz que discutimos.

## Default del modo inicial

Hoy `setAddModes(new Set(['catalog']))` al abrir el diálogo. Mantener ese default para que, al activar "collection", el checkbox de aprobar aparezca ya marcado y refleje la realidad.

## Alcance estricto

- Solo `src/domains/content/components/DocumentFocusView.tsx`, dentro del bloque `{/* 2.c — A una colección */}`.
- Sin tocar `document-add.service.ts`, `applyCollection`, ni el resto de modos.
- Sin migración ni cambios de memoria (el comportamiento subyacente no cambia, solo la UX del atajo).

## Detalles técnicos

- Reusar `Checkbox` de `@/components/ui/checkbox` y `Label` ya importados.
- `id="mode-collection-also-approve"`.
- `checked={addModes.has('catalog')}` / `onCheckedChange={() => toggleAddMode('catalog')}`.
- Render condicional: solo cuando `addModes.has('collection')` (dentro del mismo bloque que ya muestra `CollectionPicker`).
