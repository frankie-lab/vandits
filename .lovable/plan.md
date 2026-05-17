# P-POPUP-7A.2 — Contrato transversal de Ratings del Popup

> **Plan documental, no implementación.** Entrega un inventario, una
> clasificación semántica, una jerarquía canónica de slots y un set de
> guardrails. No se toca código de render en esta PR.

---

## 1. Inventario de ratings en el popup enriched

Fuente única auditada: `src/components/map/map-popups.ts`.

### 1.1 Rating de enriquecimiento — curator (weighted)

- **Clase / selector**: `.weighted-rating-container` (L1314-1327).
- **Dato fuente**: `enriched.indice_interes` + `data-ai-rating`.
- **Render**: 5 estrellas verdes + valor numérico + breakdown oculto.
- **Editable**: No. Sólo informativo.
- **Posición actual**: cabecera superior del body, dentro del bloque
  `Índice IA + Botones de interacción` (L1295-1340), ANTES del
  composer 7A.1.
- **Helper**: inline en `createPopupContent`, sin helper único.
- **Visibilidad**: sólo cuando `isCuratorPoint === true`.

### 1.2 Rating de enriquecimiento — no-curator (chip ámbar)

- **Selector**: `div` ámbar inline (L1329-1333).
- **Dato fuente**: `enriched.indice_interes` + `enriched.indice_interes_notas`.
- **Render**: 5 estrellas ámbar, sin valor numérico.
- **Editable**: No. Sólo informativo.
- **Posición actual**: idéntica al 1.1, mismo bloque superior.
- **Helper**: inline. Tampoco hay helper único.
- **Visibilidad**: sólo cuando `!isCuratorPoint && enriched.indice_interes`.

> 1.1 y 1.2 son el **mismo concepto semántico** con dos presentaciones
> visuales según ownership. Hoy viven duplicados como ramas inline.

### 1.3 Rating personal del usuario (Valorar)

- **Selector**: `[data-popup-personal-state]` con `[data-action="set-rating"]`
  y `[data-personal-rating-state="collapsed|expanded"]`.
- **Dato fuente**: `location.customData.user_rating`.
- **Render**: affordance textual "Valorar" colapsada → control 5★ al
  expandir. Si `user_rating > 0`, expandido por defecto + clear.
- **Editable**: Sí (handlers `set-rating`, `clear-rating`).
- **Posición actual**: dentro de `buildPersonalStateBlock`, anclado por
  el composer 7A.1 entre `descripcion` y `observacion`.
- **Helper**: `buildPersonalStateBlock(location, ctx)` — helper único.
- **Visibilidad**: oculto para `isCuratorPoint` y para `nearby` popups;
  oculto si `userRating === 0 && !canRate`.

### 1.4 Resumen visual del inventario

```text
┌───────────────────────────────────────────────────────────────┐
│ Bloque                  │ Concepto         │ Editable │ Slot  │
├─────────────────────────┼──────────────────┼──────────┼───────┤
│ weighted-rating-cont.   │ enrichmentRating │ no       │ HEAD  │
│ chip ámbar indice_interes│ enrichmentRating │ no       │ HEAD  │
│ buildPersonalStateBlock │ userPersonalState│ sí       │ BODY  │
└───────────────────────────────────────────────────────────────┘
```

**Hallazgo central**: hoy "rating" es un término ambiguo que cubre dos
conceptos disjuntos. 7A.1 ordenó el slot del concepto 2 pero el concepto
1 sigue renderizándose fuera del composer, en la cabecera. Por eso la
preview contradice el cierre técnico.

---

## 2. Clasificación semántica canónica

Dos conceptos disjuntos, nombres explícitos, sin overload de "rating":

### 2.1 `enrichmentRating`

- **Naturaleza**: metadata semántica del POI generada por el sistema
  (IA + curator/community ponderado). Hoy: 1.1 y 1.2.
- **Propiedad**: del POI, no del usuario.
- **Mutabilidad**: read-only en el popup.
- **Pertenencia jerárquica**: parte de la lectura semántica del
  contenido. Vive en el body, no en la cabecera.

### 2.2 `userPersonalState`

- **Naturaleza**: estado/acción del usuario sobre el POI. Hoy: 1.3.
- **Componentes**: visited toggle + verified badge + valoración
  personal 5★.
- **Propiedad**: del usuario, no del POI.
- **Mutabilidad**: editable.
- **Pertenencia jerárquica**: bloque personal del usuario, separado
  del rating semántico del POI.

### 2.3 Regla de nomenclatura

Prohibido referirse a "rating" sin prefijo en código nuevo, comentarios,
tests y docs. Sólo se permiten:

- `enrichmentRating` (o `semanticRating` como alias documental)
- `userPersonalState` / `personalRating`

Cualquier referencia a `rating` a secas en código nuevo se considera
violación de canon en review.

---

## 3. Jerarquía canónica de slots del body enriched

El composer del body enriched deja de ordenar campos del switch
directamente y pasa a ordenar **slots semánticos explícitos**.

### 3.1 Slots canónicos

```text
1. description        — enriched.descripcion
2. enrichmentRating   — indice_interes (curator | chip ámbar)
3. userPersonalState  — buildPersonalStateBlock(...)
4. observation        — enriched.observacion
5. secondaryFields    — punto_destacado, clasificacion, etiquetas,
                        datos_geograficos, datos_clave, fuentes, …
                        (orden gobernado por field_order)
```

### 3.2 Reglas duras

- `description → enrichmentRating → userPersonalState → observation`
  es **bloque atómico**. Ningún `field_order` puede colar nada entre
  estos cuatro slots.
- `enrichmentRating` NUNCA aparece en la cabecera del popup. Su única
  posición canónica es el slot 2.
- `userPersonalState` NUNCA aparece arriba de `description`.
- `secondaryFields` respeta `field_order` para todo lo que no sea un
  slot canónico.
- Si falta un slot canónico, se compactan adyacentes preservando el
  orden relativo. Reducciones explícitas:

```text
desc + enrich + personal + obs   → 1 2 3 4
desc + enrich + obs              → 1 2 _ 4
desc + personal + obs            → 1 _ 3 4
desc + obs                       → 1 _ _ 4
desc                             → 1
obs                              → _ _ _ 4
ninguno                          → (sin bloque canónico)
```

### 3.3 Cabecera del popup

La cabecera del body enriched (zona actual `Índice IA + Botones de
interacción`) queda restringida a:

- warning de validación de visita (cuando aplica)
- cualquier control que **no** sea ni rating semántico ni estado
  personal

Si tras esta restricción la cabecera queda vacía, se elimina
completamente.

---

## 4. Composer transversal

Contrato del composer:

- El switch (`renderFragment`) sólo produce **fragments por fieldKey**,
  sin orquestación, sin side-effects ordinales.
- Un composer único materializa fragments en un mapa y luego ordena
  por **slots semánticos** (no por `field_order` para los canónicos).
- `field_order` gobierna sólo `secondaryFields`.
- El composer NO acepta un argumento genérico `ratingFragment`.
  Acepta dos slots explícitos: `enrichmentRatingFragment` y
  `userPersonalStateFragment`.

### 4.1 Contrato de entradas del composer

```text
compose({
  description: string,
  enrichmentRating: string,
  userPersonalState: string,
  observation: string,
  secondaryFields: Array<{ key, html }>,  // en field_order
})
```

### 4.2 Contrato de salida

HTML concatenado emitiendo, en orden y con las reducciones de §3.2:

```text
[ description, enrichmentRating, userPersonalState, observation,
  ...secondaryFields ]
```

### 4.3 Helper único para `enrichmentRating`

Se crea un helper transversal `buildEnrichmentRatingBlock(location,
enriched, ownership)`:

- una sola función para curator (weighted) y no-curator (chip ámbar);
- devuelve `''` cuando no hay `indice_interes` y no es curator;
- es la **única fuente** de HTML de estrellas semánticas;
- se prohíbe cualquier render inline de `★/☆` ligado a
  `indice_interes` fuera de este helper.

`buildPersonalStateBlock` sigue siendo el helper único de
`userPersonalState`. Sin cambios funcionales en esta PR.

---

## 5. Guardrails (tests obligatorios)

Estos tests deben existir antes de que P-POPUP-7A.2 se considere
ratificado. Buscan **HTML/clases reales**, no nombres de helpers.

### 5.1 Static structural guardrails sobre `map-popups.ts`

- **G1 — enrichmentRating no vive en cabecera**:
  El bloque entre `Índice IA + Botones de interacción` y el inicio del
  composer no puede contener `weighted-rating-container`, `data-ai-rating`,
  ni el chip ámbar de `indice_interes`.
- **G2 — un único helper produce enrichmentRating**:
  El string `indice_interes` en contexto de `★/☆` aparece exclusivamente
  dentro de `buildEnrichmentRatingBlock`.
- **G3 — el switch no compone**:
  `case 'descripcion'` retorna sólo `desc`; `case 'indice_interes'` no
  emite estrellas (delegado al composer vía `enrichmentRating` slot).
- **G4 — composer declara slots, no "rating" genérico**:
  El composer expone identificadores `enrichmentRating` y
  `userPersonalState` separados. No existe ningún `ratingFragment`
  ambiguo.

### 5.2 Functional composer guardrails

- **G5 — orden canónico**:
  con `description + enrichmentRating + userPersonalState + observation`,
  el HTML emitido contiene los cuatro fragments en ese orden exacto,
  independientemente de `field_order`.
- **G6 — reducciones**:
  cubrir las 7 combinaciones de §3.2 (ausencias de cada slot).
- **G7 — secondaryFields no se cuelan**:
  con `field_order = ['punto_destacado','descripcion','observacion']`,
  `punto_destacado` queda FUERA del bloque canónico (antes o después,
  nunca entre los slots 1-4).

### 5.3 Anti-confusión

- **G8 — Valorar ≠ enrichmentRating**:
  `buildPersonalStateBlock` no contiene `data-ai-rating`,
  `weighted-rating-container`, ni `indice_interes`.
  `buildEnrichmentRatingBlock` no contiene `data-action="set-rating"`,
  `data-personal-rating-state`, ni `user_rating`.
- **G9 — no stars arriba de descripción**:
  el HTML del popup enriquecido no contiene `★` ni `☆` en ninguna
  posición anterior a la primera ocurrencia del bloque
  `Descripción` (label del slot 1).

### 5.4 Convención de naming

- **G10 — sin `rating` ambiguo en código nuevo**:
  un grep de `\brating\b` en helpers nuevos sólo permite los prefijos
  `enrichmentRating` y `userPersonalState`/`personalRating`. Tests
  existentes y comentarios histórico-legacy se exceptúan
  explícitamente.

---

## 6. Documentación a actualizar (en la PR de implementación)

- `docs/popups/p-popup-7a-validation.md` — añadir sección "7A.2 — Slots
  canónicos de rating" con el cuadro de §1.4, la jerarquía de §3 y el
  contrato del composer de §4.
- `docs/contracts/popup-contract.md` — añadir sección "Slots semánticos
  del body" con la lista canónica `description / enrichmentRating /
  userPersonalState / observation / secondaryFields` como invariante
  del popup.
- `mem://style/popup/canonical-body-composer` — actualizar para
  reflejar que el composer ordena **slots**, no fragments arbitrarios,
  y que `enrichmentRating` y `userPersonalState` son slots disjuntos.
- Nueva memory `mem://logic/popup/rating-taxonomy` con la clasificación
  de §2 y la regla de nomenclatura.
- `mem://index.md` — Core rule corta:
  > **Popup rating taxonomy**: `enrichmentRating` (POI, read-only,
  > slot 2) ≠ `userPersonalState` (usuario, editable, slot 3).
  > Prohibido `rating` sin prefijo en código nuevo. Ver
  > `mem://logic/popup/rating-taxonomy`.

---

## 7. Migration Impact Check (resumen)

1. **Canon afectado**: Popup body composition + popup rating semantics.
2. **Regla anterior**: composer 7A.1 ancla un único `ratingFragment`
   (personal) entre `descripcion` y `observacion`.
3. **Regla nueva**: composer ordena cuatro slots semánticos disjuntos
   (`description`, `enrichmentRating`, `userPersonalState`,
   `observation`) + `secondaryFields`.
4. **Motivo**: el rating semántico (`indice_interes`) sigue
   renderizándose en la cabecera, contradiciendo la jerarquía esperada.
5. **Componentes afectados**: sólo `map-popups.ts` (presentación).
   Ningún cambio en handlers, schema, ownership, hero chrome, fuentes,
   colecciones, taxonomy, geo.
6. **Hooks/helpers**: nuevo `buildEnrichmentRatingBlock`; el composer
   pasa a recibir slots semánticos.
7. **Tests**: G1–G10 nuevos en suite popup; los actuales de 7A.1 se
   mantienen.
8. **Docs**: las del §6.
9. **Migración**: inmediata, single PR de implementación tras
   ratificar este contrato.
10. **Riesgo si no se migra**: la preview seguirá mostrando estrellas
    arriba del extracto y 7A.1 queda formalmente no ratificado.
11. **Rollout**: canon validado → default ON GLOBAL. Sin flags ni
    cohorts. Conforme `docs/governance/rollout-policy.md`.
12. **Aceptación**:
    - QA preview: ningún bloque de estrellas arriba de descripción.
    - Tests G1–G10 en verde.
    - Documentación y memorias actualizadas.
13. **Deuda fuera de scope**: rama legacy no enriched (no tiene
    `enrichmentRating` hoy); cuando se introduzca, aplica el mismo
    contrato.

---

## 8. Fuera de scope

- Implementación visual del nuevo composer (PR siguiente).
- Handlers `toggle-visited`, `set-rating`, `clear-rating`.
- Schema `customData.user_rating`, `enriched.indice_interes`.
- Hero chrome, overlays, visited overlay.
- Tokens visuales (`P-POPUP-8*`).
- Taxonomy / collections / provenance.
- React migration / PopupShell.

---

## 9. Entregables de esta PR (documental)

- Este documento, copiado a `docs/popups/p-popup-7a2-rating-contract.md`.
- Actualización de `docs/popups/p-popup-7a-validation.md` (apartado
  7A.2 + corrección del cierre 7A.1).
- Nueva memory `mem://logic/popup/rating-taxonomy`.
- Actualización de `mem://style/popup/canonical-body-composer` y de
  Core rule en `mem://index.md`.
- Sin cambios en `.ts`/`.tsx` de render. La implementación visual
  vive en P-POPUP-7A.3.