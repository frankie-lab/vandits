# Lógica de colecciones — alineación con la spec

## Contraste con lo actual

Tu spec y la implementación coinciden en casi todo (helper único `collection-visibility.ts`, persistencia por sesión = login, ojo solo invierte en sesión, color personalizable solo afecta al **anillo** del marcador, centro fijo según paleta de estado, regla de visibilidad combinada con `is_approved`).

**La única discrepancia real** está en los **defaults de primer login**:

| Tipo de colección | Spec | Hoy |
|---|---|---|
| `inCatalog = true` (catálogo) | Visible por defecto | Visible |
| `inCatalog = false` (privada) | **Oculta por defecto** | **Visible** |

Hoy, en primer login (sin `sessionStorage`), `initSessionCollectionVisibility` marca **todas** las colecciones como visibles. La spec exige que las privadas arranquen ocultas y solo se muestren si el usuario activa el ojo (manteniéndose así durante la sesión y volviendo a oculto en la siguiente).

Punto neutro: la regla de visibilidad por punto ya respeta esto correctamente — un punto NO aprobado solo aparece si pertenece a una colección **privada visible**. El bug es solo de defaults iniciales.

## Cambio a aplicar

Único archivo: `src/domains/content/lib/collection-visibility.ts`, función `initSessionCollectionVisibility`.

Sustituir esta línea de la rama "primer login" (sin valor en sessionStorage):

```ts
// HOY: todas visibles
if (!persisted || persisted.has(c.id)) {
  state.visible[c.id] = entries[i];
}
```

por:

```ts
// SPEC: con persistencia → respetar el set guardado.
//       sin persistencia (primer login de la sesión) → solo catálogo visible.
const shouldBeVisible = persisted
  ? persisted.has(c.id)
  : c.inCatalog === true;
if (shouldBeVisible) {
  state.visible[c.id] = entries[i];
}
```

Resto del flujo intacto:

- `toggleCollectionVisibility` sigue invirtiendo y persistiendo en `sessionStorage`.
- `resetSessionCollectionVisibility` sigue limpiando en logout (Index.tsx ya lo llama cuando `user?.id` desaparece).
- `catalogMembership` se sigue construyendo con TODAS las colecciones catálogo (visibles o no), no se toca.
- Nueva pestaña / nuevo login → `sessionStorage` vacío → vuelve al default (catálogo visible, privadas ocultas).
- Refresh dentro de la sesión → `sessionStorage` presente → se respeta lo que el usuario tenía.

## Verificación

1. **Primer login**: solo aparecen en el mapa puntos de colecciones catálogo (más los puntos aprobados que no pertenecen a ninguna colección catálogo). Las privadas están con el ojo cerrado.
2. **Activar ojo** en una colección privada → sus puntos aparecen, persiste tras refresh.
3. **Desactivar ojo** en una catálogo → sus puntos desaparecen del global, persiste tras refresh.
4. **Logout + login** → vuelve al default (catálogo on / privadas off), descartando cualquier cambio anterior.

## Memoria a actualizar

`mem://logic/collections/visibility-and-styling` — corregir la línea "todas las colecciones (catálogo y privadas) inician VISIBLES" a:

> En primer login de la sesión: colecciones **catálogo** inician visibles; colecciones **privadas** inician ocultas. El ojo invierte en sesión y persiste hasta logout/cierre de pestaña.
