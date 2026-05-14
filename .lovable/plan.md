# Diagnóstico

El funnel post-fix muestra para uid=ec870c6b (Alpha):
- `dbDocs_of_uid: 1` (DB tiene el doc) pero `documents_of_uid: 0` (store no tiene el doc)
- `dbLocs_total: 5097` (DB visible al viewer ≈ 5100, faltan ~3)
- `dbLocs_owner_uid: 0`, `dbLocs_in_uid_docs: 0` → **ninguno de los 8 POIs de Alpha llegó al snapshot raw**
- Resultado en mapa: 0 markers para cualquier usuario filtrado

Conclusión: el `.order('id')` que añadí no resolvió el problema (y posiblemente lo empeoró: ahora se pierden filas de Alpha que antes a veces sí entraban). El bug real está antes del filtro: las 8 filas de Alpha no entran en `dbLocations` aunque RLS las permite (7 visibles para el viewer).

Hay además un segundo bug aguas abajo: el doc de Alpha existe en `dbDocs` pero no aparece en el `documents` store (`documents_of_uid: 0`).

# Plan

## Paso 1 — Revertir `.order('id')`
En `src/domains/content/lib/db-transformers.ts` quitar la línea `.order('id', { ascending: true })`. No fue suficiente y enmascara el diagnóstico.

## Paso 2 — Instrumentar `fetchAllLocationsPaginated`
Añadir logging por página: `[paginator] page=N from=A to=B returned=K`. Permite ver dónde se pierden las 3 filas y si alguna página devuelve menos de lo esperado por error transitorio.

## Paso 3 — Loguear si los 8 IDs de Alpha aparecen
Tras el fetch, comprobar `dbLocations.some(l => ALPHA_DOC_IDS.has(l.id))` y loguear página por página. Esto confirma en qué página deberían venir y si llegan o no.

## Paso 4 — Investigar el documents-store
Localizar dónde se filtra `dbDocs` antes de poblar el store de documentos y por qué se pierde el de Alpha (`documents_of_uid: 0` con `dbDocs_of_uid: 1`). Probable causa: filtro por `status='published'` o `import_status` que excluye seeds, o una transformación que requiere joins ausentes.

## Paso 5 — Validación
Recargar, aplicar filtro Alpha y confirmar:
- El log del paginator muestra todas las páginas completas y los 7 IDs de Alpha presentes.
- `documents_of_uid: 1` y `dbLocs_in_uid_docs: 7`.
- 7 markers visibles.

## Paso 6 — Limpieza
Quitar el logging temporal del paginator y el snapshot `__dbSyncSnapshot__` cuando todo cuadre.

# Fuera de alcance
- Errores `batch-enrich ERR_HTTP_PROTOCOL_ERROR`.
- `LocationMap.tsx:2065 getAllChildMarkers` undefined en clusters.
- Warnings `[V2 Flags]` de dependencias entre flags.
