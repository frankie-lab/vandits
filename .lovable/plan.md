# Orden único de árboles geográficos (A→Z)

## Objetivo

Que TODO árbol geográfico (filtro lateral, admin "Alcance · mis puntos", vista de documento, popups, listas agrupadas, etc.) muestre los nodos siempre en el mismo orden:

- **Alfabético A→Z** (collator `es`, `sensitivity: 'base'`, `numeric: true`).
- **Placeholders `(sin continente)`, `(sin país)`, … siempre al final** de su sección.
- Mismo criterio en TODOS los niveles (continente, país, región, zona, comarca, localidad, sublocalidad, calle).

## Helper único

Crear/centralizar en `src/shared/geography/hierarchy.ts`:

```ts
export const geoCollator = new Intl.Collator('es', { sensitivity: 'base', numeric: true });

// Devuelve true si el valor es un placeholder canónico "(sin ...)"
export function isHierarchyPlaceholder(value: string): boolean { ... }

// Comparador único para nodos de árbol geo (cualquier estructura con `.value` o `.name`)
export function compareGeoTreeNodes<T extends { value?: string; name?: string }>(a: T, b: T): number {
  const av = a.value ?? a.name ?? '';
  const bv = b.value ?? b.name ?? '';
  const ap = isHierarchyPlaceholder(av);
  const bp = isHierarchyPlaceholder(bv);
  if (ap !== bp) return ap ? 1 : -1; // placeholders al final
  return geoCollator.compare(av, bv);
}
```

`sortTree()` interno (ya existente) pasa a delegar en `compareGeoTreeNodes` para no duplicar lógica.

## Puntos de aplicación

1. **`src/components/filters/GeographyTree.tsx`** (panel lateral "Buscar y Filtrar")
   - Sustituir el `sortNodes` que ordena por `count desc` por `compareGeoTreeNodes`.
   - El conteo sigue mostrándose, pero ya no decide el orden.

2. **`src/components/admin/GeographyScopeTree.tsx`** (admin "Alcance · mis puntos")
   - Sustituir `byValue` (collator puro) por `compareGeoTreeNodes` para que `(sin continente)` baje al final en lugar de subir al principio.

3. **`src/shared/geography/hierarchy.ts` → `sortTree`**
   - Usar el mismo `compareGeoTreeNodes`. Esto cubre cualquier consumidor de `groupLocationsByHierarchy` (vista doc, listados, popups agrupados, etc.).

4. **Auditoría rápida** (sólo lectura, para confirmar que no queda otro `sort` geo):
   - `rg "continent|country|region|zone" + "\.sort\("` en `src/`.
   - Cualquier sort local detectado se reemplaza por `compareGeoTreeNodes`.

## Resultado esperado

- Captura izquierda (filtro): `Africa, Americas, Asia, Europe, Oceania` (en lugar de orden por count).
- Captura derecha (admin): `Africa, Americas, Asia, Europe, …, (sin continente)` al final (en lugar de arriba).
- Mismo orden en cada nivel anidado del árbol y en cualquier otra vista que agrupe POIs por geografía.

## Memoria

Actualizar `mem://logic/content/geo-hierarchy-ordering` para fijar la regla:
"Orden canónico A→Z con placeholders al final vía `compareGeoTreeNodes`. Prohibido ordenar árboles geo por count u otros criterios."
