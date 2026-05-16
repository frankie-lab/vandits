# POI Popup — Canon Review

> Status: **REVIEW / PRE-IMPLEMENTATION**. Zero code, zero UI, zero
> refactor, zero camera, zero subset-fit, zero marker-grammar changes.
> This document is a critical review of the canon proposal whose goal
> is to turn it into an *implementable decision* or expose what is
> still missing.
>
> Companions:
> - [`./poi-popup-inventory.md`](./poi-popup-inventory.md) — current state
> - [`./poi-popup-canon-proposal.md`](./poi-popup-canon-proposal.md) — proposed canon
> - [`../contracts/popup-contract.md`](../contracts/popup-contract.md)
> - [`../contracts/canon-change-policy.md`](../contracts/canon-change-policy.md)
> - [`../governance/documentation-update-matrix.md`](../governance/documentation-update-matrix.md)
> - [`../governance/documentation-review-rules.md`](../governance/documentation-review-rules.md)
>
> **Governance**: this review is itself a `docs/popups/*` artifact and
> therefore falls under matrix row §2.1 (Popup canon). Any follow-up
> PR that implements it must carry a Migration Impact Check per
> `canon-change-policy.md`.

---

## 0. TL;DR

- **Ratifiable hoy (F0)**: §1.1, §1.2, §1.3 (ownership), §1.4
  (lifecycle), §1.5 (estructura), §1.6/§1.7 (secciones), §1.8
  (acciones), §1.9/§1.10 (estados), §3 (mapping a primitives),
  decisiones **D4, D5, D7**.
- **Bloqueado hasta cerrar D1/D2/D3/D6**: refactor en F5/F6/F7.
- **Primer pilot recomendado**: **F1 — tokenización visual** sobre
  *POI propio enriched* únicamente. Surface mínima, riesgo bajo,
  observable, reversible por flag.
- **No tocar todavía**: `createPhotoPopup`, popup de home/user
  location, popup de rutas/tracks, popup de admin/workspace,
  `map-v2-renderer` inline popup, `PointContextActions.tsx`.
- **Riesgo mayor identificado**: `popup-persist-on-rebuild` +
  `MutationObserver` de `popup-recovery-mount` son frágiles bajo
  cualquier cambio de DOM en `createPopupContent`. Cualquier edit
  ciega de hex/SVG puede romperlos silenciosamente.

---

## 1. Decisiones del canon LISTAS para ratificar

Tras revisar el proposal contra el inventory, las siguientes
secciones son internamente coherentes, no contradicen contratos
vigentes y pueden ratificarse con un ADR único (`docs/adr/NNNN-poi-popup-canon.md`):

| Sección proposal | Resumen | Justificación |
|---|---|---|
| §1.1 "Qué es un POI popup" | Surface contextual efímera anclada a marker | Compatible con `popup-contract.md` y `ContextualSurface`/`DismissibleSurface` |
| §1.2 "Qué NO debe ser" | No flyTo/fitBounds, no mutación de marker, no panel | Refuerza `subset-fit-contract` (no acoplar popup a cámara) |
| §1.3 Ownership (`own`/`followed`/`app·source`) | Resuelto antes de construir | Alineado con `getLocationOwnerUserId` + `resolvePoiSource` |
| §1.4 Lifecycle observable | `openPopup → resolve* → buildPopupModel → mount → emit close` | Alineado con `popup-persist-on-rebuild` y ADR 0001 |
| §1.5 Estructura visual canónica | shell + header + hero + body + actions | Compatible con `StatusSurface` + `ObservableAction` |
| §1.6/§1.7 Secciones obligatorias/opcionales | Mínimo: status-chip, title, ownership badge, ≥1 acción | Reduce variantes implícitas del inventory §1 |
| §1.8 Acciones permitidas | 8 acciones canónicas, todas `ObservableAction` | Cierra deriva detectada en inventory (mezcla dominio+visual+acción) |
| §1.9/§1.10 Estados permitidos/prohibidos | Prohibido doble popup, hex, lógica de permisos en popup | Codifica violaciones top-3 del inventory §1 |
| §3 Mapping a primitives | 1:1 con `interaction-primitives.md` | No introduce primitivas nuevas |
| **D4** Nearby context INLINE | Ya es Core rule (`contexto-cercano-inline`) | Sólo se confirma |
| **D5** Recovery block INLINE | Ya es comportamiento vigente | Sólo se confirma |
| **D7** Home/user-location FUERA | Surface técnica distinta (Leaflet sin model) | Confirma exclusión |

**Acción recomendada**: abrir ADR que ratifique §1.1–§1.10 + §3 +
D4/D5/D7. Las decisiones bloqueantes (D1/D2/D3/D6) se difieren al
ADR de F5+.

---

## 2. Decisiones que SIGUEN bloqueadas

Estas decisiones del proposal §4 no pueden ratificarse en F0 porque
faltan evidencias o productos que no existen aún:

| # | Decisión | Bloqueo concreto |
|---|---|---|
| **D1** | `isCuratorPoint` muerto | Falta auditoría de datos: hay registros con `ownership.curatorId/curatorIcon/curatorColor/curatorAvatar` vivos. Hay que confirmar que la rama no se sirve a ningún usuario antes de purgar branching del HTML |
| **D2** | `map-v2-renderer` sustituye `map-popups` | `map-v2-renderer` actualmente emite su propio inline `<div>` (inventory §1). Hay que decidir si V2 adopta `PopupShell` ANTES de matar V1, o si V2 se retira |
| **D3** | Photo popup unificado | `createPhotoPopup` consume datos OneDrive + EXIF que no están en `GeoLocation`. Hay que definir un `PhotoModel` separado o aceptar que `<PhotoBody>` reciba props heterogéneas |
| **D6** | Admin/workspace como flag sobre `own` | Falta inventario de acciones admin actuales y de su matriz de permisos (`canEditLocation`, workspace context). Sin eso, el flag es prematuro |

**Acción recomendada**: cada decisión bloqueada → mini-doc en
`docs/popups/decisions/` (D1.md, D2.md, D3.md, D6.md) con criterio
de cierre, owner y SLA.

---

## 3. Open questions que IMPIDEN refactor

No basta con cerrar D1–D6. Las siguientes preguntas son
prerrequisito de cualquier fase ≥F2:

1. **¿`buildPopupModel(loc, ctx)` puede ser puro?** El inventory
   muestra dependencias en `customData` (notes, rating, visited) que
   hoy viven en stores. Hay que decidir si el modelo recibe esos
   datos como input explícito o consulta stores internamente.
2. **¿Quién resuelve `ownershipClass`?** Hoy `createPopupContent`
   lo deriva inline. Debe vivir en un helper único (¿extender
   `getLocationOwnerUserId` o crear `resolvePopupOwnership`?).
3. **¿Eventos `lovable:popup-*` con qué payload?** El proposal §1.4
   lo enuncia pero no especifica esquema. Sin esquema, los consumidores
   (tests E2E, telemetría) no pueden depender de él.
4. **¿`popup-persist-on-rebuild` se mantiene a nivel Leaflet o se
   sube al `PopupShell` React?** Cambia radicalmente la
   implementación de F4/F5.
5. **¿`StatusSurface` lee `getPointHealthRings` también en popups?**
   Inventory §2.1 indica que hoy los rings viven sólo en el marker.
   Si pasan al header, hay que extender el contract de rings.
6. **¿`ObservableAction` requiere store global o se instancia por
   popup?** Afecta a F3 directamente.
7. **¿Qué pasa con `centerOpenedPopupInVisibleMap`?** Hoy el popup
   tiene un acoplamiento light con cámara. ¿Se mantiene como
   excepción documentada o se traslada al kernel de cámara?

**Sin respuesta a 1–4 no se puede empezar F4. Sin 5–6 no se puede
empezar F2/F3.**

---

## 4. Variantes que deben unificarse PRIMERO

Orden de unificación recomendado, optimizando riesgo↓ / beneficio↑:

1. **POI propio enriched** (inventory §2.1) — surface más usada,
   mayor volumen de hex hardcodeados, sin recovery block (no toca
   `MutationObserver`). **Mejor candidato para F1**.
2. **POI propio imported** (§2.2) — comparte estructura con (1),
   añade recovery; entra en F1 sólo si F1 deja el host
   `[data-recovery-root]` intacto.
3. **POI propio empty** (§2.3) — mismo cuerpo recovery; tras (2).
4. **POI seguido** (`followed`) — read-only, menos acciones, ideal
   para validar `ObservableAction` minimal en F3.

## 5. Variantes que NO deben tocarse todavía

| Variante | Motivo |
|---|---|
| `createPhotoPopup` (`map-photo-layer.ts`) | Bloqueado por **D3**. Modelo de datos heterogéneo (OneDrive + EXIF) |
| Home marker popup (`LocationMap.tsx` ~1206) | Excluido por **D7** y por no ser POI |
| User location popup (`LocationMap.tsx` ~1117) | Igual que home |
| `map-v2-renderer` inline popup | Bloqueado por **D2** |
| Popup admin/workspace branch | Bloqueado por **D6** |
| `PointContextActions.tsx` (1028 LOC) | Fuera de scope del canon de popup según proposal §5 "deuda explícita" |
| Popup de rutas/tracks | Canon propio, no cubierto por este proposal |

---

## 6. Contratos actuales afectados

Cualquier implementación derivada de este canon impactará:

- `docs/contracts/popup-contract.md` — añadir secciones lifecycle
  observable y prohibiciones del §1.10.
- `docs/contracts/marker-grammar-contract.md` — sólo si §1.5 hereda
  `getPointVisualState` en el header (lectura, no mutación).
- `docs/contracts/focus-selection-contract.md` — añadir eventos
  `lovable:popup-opened/closed` como FocusEmitter débil.
- `docs/contracts/heavy-operations-contract.md` — acciones `enrich`
  / `delete` del §1.8 son `BlockingOperation`.
- `docs/interaction-primitives.md` — confirmar que `ObservableAction`,
  `ContextualSurface`, `DismissibleSurface`, `StatusSurface`,
  `FocusEmitter`, `BlockingOperation` cubren los usos del §3.
- `docs/qa/e2e-camera-qa.md` — si F1 conserva
  `centerOpenedPopupInVisibleMap`, no cambia; si cambia, sí.
- `docs/adr/0001-popupclose-centralization.md` — referenciar como
  origen del handler único; no modificar.
- `mem://style/popup/matrix-rule` — refrescar tras ratificación.

Ninguno requiere cambios en F0/F1 si el pilot se limita a
tokenización visual.

---

## 7. Migration Impact Check (aplicado a F0 + F1)

Plantilla `canon-change-policy.md §3` rellenada para el alcance
recomendado de este review (ratificar canon + ejecutar F1 sobre
*POI propio enriched*).

1. **Canon/contrato afectado**: POI popup canon + `popup-contract`
   + `design-system-tokens-v1` (consumo en mapa).
2. **Regla anterior**: popups POI generados como HTML string con
   hex hardcodeados; sin lifecycle observable formalizado; 12+
   variantes implícitas.
3. **Regla nueva**: canon ratificado (§1.1–§1.10 + §3 + D4/D5/D7).
   F1 limita el cambio físico a sustitución de hex por tokens en la
   rama `enriched` de `createPopupContent`, sin alterar DOM ni
   lifecycle.
4. **Motivo del cambio**: deriva visual confirmada por inventory
   §1; bloqueo de avance de design-system tokens v1 en mapa; pre-
   requisito de cualquier fase ≥F2.
5. **Componentes afectados (F1)**: sólo `src/components/map/map-popups.ts`
   rama `if (isEnriched && enriched)`.
6. **Hooks/helpers afectados (F1)**: ninguno. F1 no modifica
   `bindRecoveryMount`, `createCustomIcon`, `getPointVisualState`,
   `requestSubsetFit`, ni listeners.
7. **Tests afectados (F1)**: visual snapshot del popup enriched
   (a crear); E2E "popup persiste tras rebuild" (existe, debe
   seguir verde).
8. **Docs afectadas**: este review + `poi-popup-canon-proposal.md`
   (marcar D4/D5/D7 como `resuelta-ratificada`) + ADR nuevo +
   `popup-contract.md` (anexo lifecycle) + `mem://style/popup/matrix-rule`
   refrescada.
9. **Migración requerida**: por fases. F0 = ADR. F1 = tokenización
   visual rama enriched. F2+ = bloqueado hasta cerrar §3 open
   questions.
10. **Riesgo si no se migra**: continúa la deriva de hex/SVG;
    `popup-persist-on-rebuild` se vuelve más frágil con cada edit
    puntual; imposibilidad de instrumentar telemetría.
11. **Plan de rollout**: F0 = ADR + merge docs. F1 = flag
    `popup_tokens_enriched_v1`, off por defecto, on en sandbox,
    promote tras 1 sprint sin regresiones.
12. **Criterio de aceptación (F1)**: 0 hex hardcodeados en la
    rama enriched; snapshot visual estable; E2E persistencia
    verde; ningún consumidor de cámara/subset-fit afectado.
13. **Deuda explícita fuera de scope**: D1, D2, D3, D6, todas las
    open questions §3 de este doc, popup de fotos, popups
    home/user, popup admin, rama imported/empty/followed (F1.x
    posteriores).

---

## 8. Primer pilot recomendado

**Pilot P-POPUP-1: Tokenización visual de POI propio enriched.**

- **Surface única**: rama `if (isEnriched && enriched)` en
  `createPopupContent` (`map-popups.ts` ~L635).
- **Cambio**: hex literales → tokens `design-system v1`. Sin tocar
  estructura, sin tocar SVG (queda para P-POPUP-2), sin tocar
  recovery, sin tocar lifecycle.
- **Flag**: `popup_tokens_enriched_v1` (default off).
- **Observabilidad**: snapshot visual antes/después + log de
  `popupopen`/`popupclose` para detectar regresión de lifecycle.
- **Reversible**: borrar tokens → restaurar hex.
- **Tamaño**: 1 archivo, 1 rama, <100 líneas modificadas.
- **No requiere**: cambios en helpers, en `LocationMap`, en QA
  harness, en cámara, en marker grammar.

Cualquier alternativa más ambiciosa (F3 action model, F5 React body)
está bloqueada por §3 open questions.

---

## 9. Riesgos específicos de tocar `createPopupContent()`

Identificados en inventory; relevantes para cualquier pilot:

1. **`MutationObserver` de `popup-recovery-mount`** observa el DOM
   del popup. Cualquier cambio en `[data-recovery-root]` o en
   atributos del host puede dispararlo en bucle o impedir el mount
   inicial. → F1 no toca esa rama; cualquier fase posterior debe
   mockear el observer en tests.
2. **`popup-persist-on-rebuild`**: si la firma del HTML cambia (p.ej.
   se reemplaza `<div class="...">` por estructura distinta), la
   reconciliación de markers puede perder el handle del popup y
   cerrarlo silenciosamente. → snapshot del HTML resultante es QA
   obligatoria.
3. **`centerOpenedPopupInVisibleMap`** depende de CSS vars de header
   y bottom bar. Cambiar paddings vía tokens puede mover el centro
   calculado y provocar panning inesperado. → medir bounding rect
   antes/después.
4. **Multiple call sites de `setPopupContent`**: 8+ en `LocationMap`
   + 2 en handlers. Cualquier cambio en el formato del string es un
   cambio en todos los call sites. → F1 limita a sustitución 1:1
   de literal a token; no reestructura el string.
5. **Re-enriquecer pipeline** muta `progressBarHtml` oculto dentro
   del popup. Si los tokens cambian display/visibility por defecto,
   la barra puede aparecer cuando no toca.
6. **Permisos admin** se evalúan dentro del HTML; un fallo silencioso
   esconde acciones legítimas del owner. → F1 NO toca esa rama.
7. **`isCuratorPoint` branch** sigue vivo (D1). Cualquier edit que
   "limpie de paso" curator data puede romper datos legacy. → no
   tocar hasta cerrar D1.

---

## 10. Tests E2E/QA mínimos antes de implementar

Pre-requisitos para mergear F1 (algunos ya existen; los marcados
con [NEW] hay que crearlos):

- [ ] **E2E** "click marker → popup abre" para POI propio enriched.
- [ ] **E2E** "popup persiste tras rebuild de capa" (existe en
      contrato `popup-persist-on-rebuild`; debe estar verde).
- [ ] **E2E** "click fuera → popup cierra; ESC → popup cierra;
      re-click marker → popup cierra".
- [ ] **E2E** "subset-fit NO se dispara al abrir/cerrar popup".
- [ ] [NEW] **Visual snapshot** del popup enriched en estados
      idle / pending-action / error.
- [ ] [NEW] **Visual snapshot** del header `StatusSurface` por
      estado (`enriched`, `imported`, `empty`) — incluso si F1 sólo
      toca enriched, las otras dos sirven de baseline negativo.
- [ ] [NEW] **Contract test** "popup HTML no contiene `#`-hex" en
      la rama enriched cuando el flag está ON.
- [ ] [NEW] **Contract test** "popup no llama `flyTo`/`fitBounds`/
      `requestSubsetFit`" (assertion sobre spy en `LocationMap`).
- [ ] **Unit** (cuando F4 llegue) `buildPopupModel(loc, ctx)` puro.
      No requerido en F1.

Antes de F2: añadir contract test de "no SVG inline fuera de
`icon-utils`". Antes de F4: añadir contract de schema de eventos
`lovable:popup-*`.

---

## 11. Restricciones honradas

- No se ha tocado código.
- No se ha cambiado UI.
- No se ha iniciado refactor.
- No se ha tocado cámara ni subset-fit.
- No se ha tocado marker grammar.
- No se ha modificado ningún spec ni assertion existente.
- Sólo se ha producido documentación/revisión arquitectónica.

---

## 12. Próximo paso

1. Revisar §1 y §2 de este doc; confirmar lista de ratificación.
2. Abrir ADR `docs/adr/NNNN-poi-popup-canon.md` con el alcance del
   §7 MIC.
3. Abrir mini-docs `docs/popups/decisions/D{1,2,3,6}.md` con owner
   y SLA.
4. Programar P-POPUP-1 (§8) tras merge del ADR.
