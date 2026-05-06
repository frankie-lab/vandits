## Problema
El badge `Catálogo` / `Privada` en cada fila de colección ocupa ~70px y trunca el nombre.

## Propuesta
Sustituir el badge de texto por un **micro-indicador visual** sin texto, manteniendo el significado vía `title` (tooltip) y aria-label:

- **Catálogo**: pequeño icono `Globe` (12px) en color `text-primary`.
- **Privada**: pequeño icono `Lock` (12px) en color `text-muted-foreground`.

Colocado entre el nombre y el contador, ocupa ~16px en lugar de ~70px. El nombre dispone de mucho más espacio antes de truncarse.

## Archivo a editar
- `src/components/CollectionsListPanel.tsx` (líneas 174-185): reemplazar el `<span>` con texto por un icono Lucide con tooltip.

## Snippet propuesto
```tsx
<span
  className={`shrink-0 flex items-center justify-center ${
    collection.inCatalog ? 'text-primary' : 'text-muted-foreground'
  }`}
  title={collection.inCatalog
    ? 'Catálogo: sus puntos aprobados aparecen en el mapa general'
    : 'Privada: solo visible si activas el ojo (sesión)'}
  aria-label={collection.inCatalog ? 'Catálogo' : 'Privada'}
>
  {collection.inCatalog
    ? <Globe className="w-3 h-3" />
    : <Lock className="w-3 h-3" />}
</span>
<CountsBadge counts={counts} />
```

Mismo cambio aplica a `CollectionFocusView.tsx` si reproduce el badge (lo verifico al implementar).
