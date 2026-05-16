# P-POPUP-4B — Collection dedup plan

Status: **DRAFT — pending product approval. NO CODE YET.**
Premise memo: [`mem://logic/popup/provenance-vs-collection-vs-tag`](mem://logic/popup/provenance-vs-collection-vs-tag).
Companion plan (predecessor): [`./p-popup-4a-source-provenance-cleanup-plan.md`](./p-popup-4a-source-provenance-cleanup-plan.md).
Validation companion: [`./p-popup-4a-validation.md`](./p-popup-4a-validation.md).

---

## 0. Goal

Eliminar duplicación visual entre **colección** y **personal tag**
dentro del popup/ficha del POI. Caso reportado:
`#AtlasObscura_España` aparece simultáneamente como chip de colección
(coloreado) y como chip de tag personal (ámbar), porque el slug del
tag persistido en `enriched_data.etiquetas_personales` coincide con el
nombre de la colección a la que el POI pertenece.

Regla canónica única:

> Si `slug(tag) == slug(collection.name)` para alguna colección del
> POI, el tag NO se renderiza. Solo se muestra el chip de colección.

## 1. Mapeo location → collection (auditado)

Confirmado por inspección de schema y del store
`src/domains/content/store/location-collections-store.ts:42-50`:

```sql
SELECT ci.item_id, c.id, c.name, c.color, c.icon
FROM collection_items ci
JOIN collections c ON c.id = ci.collection_id
WHERE ci.item_type = 'place'      -- enum collection_item_type
  AND ci.item_id  IN (:locationIds)
```

En el modelo actual `collection_items.item_id` se consulta
directamente con `location.id` (dual-write places↔locations mantiene
los UUIDs alineados). **No hace falta puente vía `user_places` ni
`places`** para el render del popup.

Fuente única de lectura: `getCollectionsForLocation(locationId)` —
cache síncrona alimentada por `primeCollectionsForLocations` +
suscripción a `collections-updated` / `collection-items-changed`.
Renderer React: `LocationCollectionChips` /
`useLocationCollections`. Renderer HTML popup: helper a auditar en
P-POPUP-4B (`buildCollectionChipsPlaceholder` o equivalente).

## 2. Detección de tags duplicadas

### 2.1 Fuentes de tags renderizables hoy

| Fuente | Storage | Render | En scope 4B |
|---|---|---|---|
| Personal tags | `enriched_data.etiquetas_personales` (array de strings) | `buildPersonalTagsBlock` + filtro `filterPersonalTags` | **SÍ** |
| `custom_data.tags` (scraper) | `locations.custom_data.tags` | **No se renderiza en UI** (confirmado `rg`) | NO — pertenece a P-POPUP-4C (backfill/scraper) |
| Source hashtags | `sourceKind`/`sourceId` (columnas vacías hoy) | `buildSourceHashtagsBlock` (inerte) | NO |
| Semantic tags | `enriched_data.semantic*` | Canon P-POPUP-2 | NO |

`custom_data.tags` no entra en 4B porque no afecta UI. La limpieza
de esos residuos vive en 4C.

### 2.2 Normalización canónica (slug)

Helper único existente: `toSlug` en
`src/domains/content/lib/personal-tags-filter.ts:20-27`. Hoy hace:

```ts
toSlug(s) =
  s.replace(/^#/, '')
   .toLowerCase()
   .normalize('NFKD')
   .replace(/[\u0300-\u036f]/g, '')   // strip combining marks
   .replace(/\s+/g, '');
```

**Gap detectado**: NO quita `_`, `-`, `.`, otros símbolos.
Resultado: el tag `"#Atlas Obscura_España"` slugifica a
`atlasobscura_españa` (con `_` y `ñ` ya normalizada como `n`?
**`ñ` no es combining mark, NFKD no la descompone**), mientras el
nombre de colección `"Atlas Obscura_España"` slugifica a
`atlasobscura_españa`. Match exacto OK en este caso, pero frágil
ante variantes (`Atlas-Obscura España` ≠ `Atlas Obscura_España`).

**Extensión propuesta (4B)**:

```ts
toSlug(s) =
  s.replace(/^#/, '')
   .toLowerCase()
   .normalize('NFKD')
   .replace(/[\u0300-\u036f]/g, '')   // combining
   .replace(/ñ/g, 'n').replace(/ç/g, 'c')   // chars no descompuestos por NFKD
   .replace(/[^a-z0-9]/g, '');        // quita TODO no alfanumérico
```

Cubre `_`, `-`, `.`, espacios, símbolos, acentos extendidos.

### 2.3 Snapshot de impacto (2026-05-16)

Con la normalización extendida sobre los datos actuales:

| Métrica | Valor |
|---|---|
| Total `locations` | 5447 |
| Locations con ≥1 personal-tag cuyo slug = slug de alguna colección del mismo POI | **1372 (25.2%)** |
| Filas duplicadas (tag↔colección) | **1372** |
| Locations con cruce en `custom_data.tags` | 0 (no se renderiza) |

→ El bug afecta a 1 de cada 4 POIs visibles. Justifica pilot
dedicado.

## 3. Regla canónica de render

```
canonicalPersonalTags(locationId) :=
  etiquetas_personales
    .filter(t => slug(t) ∉ { slug(c.name) | c ∈ getCollectionsForLocation(locationId) })
    .dedupe(by slug)
```

Sin excepciones, sin gating por flag (es bugfix de coherencia,
no canon visible nuevo). Mantiene orden de entrada.

## 4. Componentes afectados

| Componente | Función | Cambio 4B |
|---|---|---|
| `src/domains/content/lib/personal-tags-filter.ts` | `filterPersonalTags` | Extender `toSlug` (§2.2). Sin cambio de API. |
| `src/components/map/map-popups.ts` | `buildPersonalTagsBlock` | Ninguno (ya invoca el filtro). |
| `src/domains/content/components/LocationCollectionChips.tsx` | Chip de colección | Ninguno (es la fuente de verdad visual). |
| `useLocationCollections` | Hook React | Ninguno. |
| Fichas/cards React que pinten personal tags | Cualquier consumer | Verificar que TODOS pasen por `filterPersonalTags` (auditar `rg`). Si alguno lo bypassea, redirigir. |

## 5. Estilo visual (sin cambios)

- **Colección**: chip coloreado (`LocationCollectionChips`),
  background = `collection.color` con tokens
  `getCollectionChipColors`. Icono opcional.
- **Personal tag**: chip ámbar (`buildPersonalTagsBlock` →
  `inlineTagBadge('...', 'personal', ...)`). Sin cambio.
- **Semantic tag**: canon P-POPUP-2 intacto.

4B NO altera estilos; solo elimina duplicados.

## 6. Tests necesarios

`src/test/personal-tags-collection-dedup.test.ts` (nuevo):

1. Tag idéntica al nombre de colección → filtrada.
2. Tag con `#` prefix → filtrada.
3. Tag con espacios/`_`/`-` distintos pero mismo slug → filtrada
   (`"#Atlas Obscura_España"` vs colección `"Atlas Obscura_España"`).
4. Tag con tilde (`España` vs `Espana`) → filtrada.
5. Tag sin match en colección → conservada.
6. POI sin colecciones → todas las tags conservadas (modulo dedupe
   entre sí).
7. Stable order (preserva orden original tras filtrado).
8. Edge cases: tag vacío, tag con solo símbolos, array null,
   `enriched_data` null.

Tests existentes que deben seguir verdes:

- `src/test/popup-tags-canonical.test.ts`.
- `src/test/popup-ownership-strip.test.ts`.
- `src/test/popup-source-metadata.test.ts`.

## 7. Migration Impact Check

- **Schema**: ninguna migración. La regla es 100% render-side.
- **Backfill**: opcional, NO incluido en 4B. La limpieza de datos
  legacy (`etiquetas_personales` con nombre de colección) vive en
  P-POPUP-4C como tarea separada, porque tocar BD requiere dry-run
  + auditoría adicional.
- **Realtime**: ninguno. `collection_items` ya emite eventos
  (`collection-items-changed`) que invalidan la cache del store →
  `filterPersonalTags` lee fresh en cada render.
- **RLS**: sin cambios. El store ya respeta visibilidad
  (políticas `collection_items` por `auth.uid`).
- **Performance**: filtro O(n·m) con n=tags personales (típico ≤10),
  m=colecciones del POI (típico ≤5). Despreciable.

## 8. Rollback

- **Sin flag** (es bugfix). Rollback = revertir el cambio de
  `toSlug`. Una sola función.
- Tests guardan el contrato. Si producto decide revertir, basta con
  restaurar la versión anterior de `toSlug`.
- Sin riesgo para datos: nada se persiste.

## 9. Scope mínimo de implementación

Cuando se apruebe 4B, los pasos son:

1. Extender `toSlug` en `personal-tags-filter.ts`.
2. Auditar con `rg` que TODOS los renders de personal tags pasen por
   `filterPersonalTags` (popup HTML, cards React, miniaturas).
   Redirigir los que no.
3. Crear test suite `personal-tags-collection-dedup.test.ts`.
4. Crear `docs/popups/p-popup-4b-validation.md`.

Tamaño estimado: < 50 LOC modificadas + tests.

## 10. Restricciones (no tocar)

- Source/provenance (`sourceKind`/`sourceId`, `resolvePoiSource`,
  `buildSourceHashtagsBlock`, `buildSourceMetadataLineHtml`,
  `SourceFilterBridge`).
- `scrape-tick` y cualquier scraper (eso es 4C).
- Notas, stars/visited, geo hierarchy, lifecycle.
- Cámara/subset-fit.
- F2, React migration, PopupShell.
- Migraciones de BD.
- Estilo visual de chips (colección y personal mantienen su look).

## 11. Decisiones abiertas

- ¿Logging dev de tags filtradas? Propuesta: NO (silencioso es
  correcto; el test cubre la regla).
- ¿Aplicar 4B también a `custom_data.tags` por defensa futura?
  Propuesta: NO. Hoy no se renderiza. Si en el futuro se renderiza,
  reabrir scope.
- ¿Backfill destructivo de `etiquetas_personales`? Diferido a 4C.

## 12. Entregables al implementar (NO ahora)

- `src/domains/content/lib/personal-tags-filter.ts` con `toSlug`
  extendido.
- `src/test/personal-tags-collection-dedup.test.ts`.
- `docs/popups/p-popup-4b-validation.md`.
- Snapshot de impacto pre/post (preview QA con caso
  `#AtlasObscura_España`).
