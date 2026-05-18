
# P-POPUP-17 — Estado operacional del popup durante enriquecimiento

## Problema

Hoy el overlay P-POPUP-16 solo se activa cuando el enriquecimiento se dispara **desde el propio popup** (`use-popup-actions.ts` → acciones `enrich/regenerate/quick-classify`) o desde el orquestador de adopción nearby (P-POI-CURATION-2.13).

El resto de entry points mutan el POI sin avisar al popup:

- `BatchEnrichmentPanel` (lote de documento)
- `DocumentWaypointsTabs` (enriquecer desde lista de waypoints)
- `LocationList` (enriquecer desde lista general)
- `UnenrichedRecoveryBlock` (bloque inline “contexto cercano”)
- `use-enrichment-failure` (reintentos automáticos)
- realtime `location:enriched` desde otra pestaña / otro usuario

Resultado: el popup se queda como **editable** mientras el servidor está reescribiendo `enriched_data`, `enrichment_status` y FKs. El usuario puede pulsar valoraciones, abrir nearby, regenerar, o adoptar candidatos sobre datos a punto de ser sobrescritos. Solo aparece un `toast.loading` global que no está visualmente vinculado al popup abierto.

## Regla canónica (UX)

> **Cualquier mutación de enriquecimiento sobre el POI actualmente abierto en popup
> activa estado operacional local (`data-popup-operational-state="loading"`),
> sin importar quién la dispare ni desde dónde.**

Esto NO sustituye al toast global — el toast sigue siendo la traza
multi-superficie (lista, documento, lote). El overlay local cubre la
expectativa específica del popup abierto: *“mientras el sistema esté
mutando este POI, este popup no es editable y no miente”*.

### Tabla de decisión

| Origen de la mutación                              | Overlay popup local | Toast global |
|----------------------------------------------------|---------------------|--------------|
| Acción dentro del popup (`enrich`/`regenerate`)    | sí                  | sí (ya hoy)  |
| Adopción nearby (P-POI-CURATION-2.13)              | sí                  | sí (ya hoy)  |
| Lote (`BatchEnrichmentPanel`) — POI abierto incluido | **sí**            | sí           |
| Lote — POI abierto NO incluido                     | no                  | sí           |
| Lista general / waypoints tab — POI abierto        | **sí**              | sí           |
| Lista general / waypoints tab — otro POI           | no                  | sí           |
| Reintento automático (failure store)               | **sí** si popup abierto sobre ese id | sí |
| Realtime externo (otra pestaña / otro usuario)     | **sí** si popup abierto sobre ese id | opcional |
| Adopción manual de identidad (`UnenrichedRecoveryBlock`) | **sí**        | sí           |

Criterio único: **¿el popup abierto en este cliente apunta al `locationId`
que está siendo mutado?** Si sí → overlay. Si no → solo toast.

### Qué bloquea el overlay (igual que P-POPUP-16 ya define)

- Atenuación + spinner + copy de progreso (label contextual)
- `pointer-events: auto` en el overlay → captura clicks y los engulle
- `aria-busy="true"` en el scroll-body
- Footer/CTA principal deshabilitado vía CSS
  (`[data-popup-operational-state="loading"] [data-popup-footer="v1"] button { ... }`)
- Identidad estable del root y del scroll-body (G2) → no remount, no flicker

### Copy de progreso por fase

El label del overlay refleja la fase actual cuando se conoce:

- `'Enriqueciendo POI…'` — IA en curso, sin trunk hit
- `'Re-enriqueciendo POI…'` — regenerate
- `'Validando geografía…'` — validate-geo (ya usado por orquestador)
- `'Adoptando identidad…'` — adopción nearby (P-POI-CURATION-2.13)
- `'Actualizando ficha…'` — reintento / realtime externo (fase desconocida)

## Sincronización técnica (sin implementar)

Para que **todos** los entry points respeten la regla sin acoplarse
mutuamente, la fuente de verdad es un único listener montado en
`use-popup-actions` (o equivalente global del popup activo):

```
window.addEventListener('location:enrichment-phase', (e) => {
  const { id, phase, label } = e.detail;
  const popupId = getPopupIdForLocation(id);
  if (!document.getElementById(popupId)) return; // popup no abierto
  if (phase === 'start')  setPopupOperationalState(popupId, 'loading', { label });
  if (phase === 'update') setPopupOperationalState(popupId, 'loading', { label });
  if (phase === 'end')    clearPopupOperationalState(popupId);
});
```

Y `triggerEnrichLocation` emite `location:enrichment-phase` al inicio y
al final (start/end), reusando el evento `location:enriched` existente
para el `end` con éxito. Los entry points ya no llaman manualmente a
`setPopupOperationalState` — el helper lo hace por ellos.

Ventaja: realtime externo y reintentos automáticos también pueden emitir
el evento (`phase: 'start' | 'end'`) y el popup reacciona sin tocar cada
panel.

## Invariantes

- I1 — El overlay **nunca** se monta si el popup del `locationId` no existe en el DOM.
- I2 — La identidad del root y del scroll-body es estable (G1/G2 de P-POPUP-16). No remount durante el ciclo.
- I3 — Toast global y overlay local son ortogonales: pueden coexistir, ninguno sustituye al otro.
- I4 — `source='own'` en adopción nearby cierra el popup (merge), por tanto no entra en este contrato.
- I5 — Failure final (`unresolved`, `name_coordinate_mismatch`, `llm_unverifiable`) → `clearPopupOperationalState` (state `idle`) + recovery block visible. El estado `'error'` queda reservado para futuro; hoy se libera a `idle` para que el recovery sea interactivo.

## Out of scope

- Cambios en shell, two-rail, gutter, hero, ratings, footer, marker grammar.
- Refactor del orquestador `advance-poi-curation` (ya cumple).
- Persistencia de progreso en BD o cross-tab broadcast vía Supabase Realtime
  (el evento es local; realtime externo se cubrirá en una iteración aparte si hace falta).
- Estado `'error'` visual diferenciado (queda como evolución futura).

## Próximo PR (cuando se apruebe este canon)

1. Evento canónico `location:enrichment-phase` emitido por `triggerEnrichLocation` (start/end) y por el orquestador de validate-geo.
2. Listener único en `use-popup-actions` que mapea evento → `setPopupOperationalState` del popup activo.
3. Remoción de llamadas dispersas a `setPopupOperationalState` en `PointContextActions` (delegadas al listener).
4. Test contrato `popup-poi-17-operational-state-broadcast.test.ts`:
   - Lote sobre POI abierto → overlay aparece.
   - Lote sobre otro POI → overlay NO aparece.
   - Reintento automático sobre POI abierto → overlay aparece y se libera.
   - Failure final → state vuelve a `idle`, recovery interactivo.
5. Documentación: sección “P-POPUP-17 — Operational broadcast” en `docs/contracts/popup-contract.md` y `mem://style/popup/operational-loading-state` (extender el memo existente).

## Entregables del próximo PR

- `src/domains/content/lib/enrich-location.ts` (emitir evento phase)
- `src/domains/content/lib/advance-poi-curation.ts` (emitir evento phase)
- `src/domains/content/hooks/use-popup-actions.ts` (listener global)
- `src/domains/content/components/PointContextActions.tsx` (cleanup)
- `src/test/popup-poi-17-operational-state-broadcast.test.ts` (nuevo)
- `docs/contracts/popup-contract.md` (sección nueva)
- `mem/style/popup/operational-loading-state.md` (extender)

Pendiente de aprobación para implementar.
