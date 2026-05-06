## Diagnóstico

El `truncate` en el span ya está, pero no surte efecto porque uno de los contenedores intermedios crece con el contenido (no tiene `min-w-0` o `overflow-hidden`). Cadena actual desde el panel hasta el span del nombre:

```
panel (PanelBody)
└─ <div className="flex flex-col h-full min-h-0">                    [FilterBar root]
   └─ <Tabs className="w-full">
      └─ <TabsContent>                                                [sin min-w-0]
         └─ <div className="flex flex-col h-full min-h-0 space-y-2"> [GeographyTree root, sin overflow-hidden]
            └─ <ScrollArea>
               └─ <div className="pr-2 space-y-0.5">                  [sin min-w-0]
                  └─ row <div className="flex ... w-full min-w-0">
                     └─ button.flex-1.min-w-0
                        └─ span.truncate.min-w-0.flex-1
```

El `<TabsContent>` de Radix por defecto es `display:block` con ancho del contenido (no del contenedor) y permite que el hijo crezca. Y el wrapper de `GeographyTree` (`flex flex-col`) tampoco fuerza `min-w-0`. Con eso, la fila se ensancha hasta el largo del nombre y el badge sigue empujado fuera.

## Cambios (mínimos, transversales a los 3 árboles)

### 1. `src/components/FilterBar.tsx`

Añadir `min-w-0 overflow-hidden` a los 4 `<TabsContent>` (geography, classification, tags, types):

```tsx
<TabsContent value="geography" className="mt-2 min-w-0 overflow-hidden">
```

### 2. `src/components/filters/GeographyTree.tsx`

Añadir `min-w-0 overflow-hidden` al wrapper raíz del componente (línea 579):

```tsx
<div className="flex flex-col h-full min-h-0 min-w-0 overflow-hidden space-y-2">
```

Y al wrapper interno del `ScrollArea` (línea 628), añadir `min-w-0`:

```tsx
<div className="pr-2 space-y-0.5 min-w-0">
```

### 3. Verificación

Aplicar el mismo patrón a `ClassificationTree.tsx` y `TagsTree.tsx` (root wrapper + wrapper de items dentro del ScrollArea) para garantizar truncamiento consistente en cualquier nivel y nombre largo.

## Resultado esperado

- "Autonomous Community of the Basque Country" se corta con `…` a la derecha antes del badge.
- El badge permanece visible siempre, pegado al borde derecho del panel.
- No hay scroll horizontal en ninguna pestaña.
