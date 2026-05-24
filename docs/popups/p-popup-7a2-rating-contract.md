# P-POPUP-7A.2 — Contrato transversal de Ratings del Popup

> **Documental, no implementación.** Inventario, clasificación semántica,
> jerarquía canónica de slots y guardrails para todos los ratings del
> popup. La implementación visual vive en P-POPUP-7A.3.

---

## 1. Inventario de ratings en el popup enriched

Fuente única auditada: `src/components/map/map-popups.ts`.

### 1.1 Rating de enriquecimiento — curator (weighted)

- **Selector**: `.weighted-rating-container` (L1314-1327).
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
- **Posición actual**: misma cabecera que 1.1.
- **Helper**: inline. Sin helper único.
- **Visibilidad**: cuando `!isCuratorPoint && enriched.indice_interes`.

> 1.1 y 1.2 son el **mismo concepto semántico** con dos presentaciones
> visuales según ownership. Hoy viven duplicados como ramas inline.

### 1.3 Rating personal del usuario (Valorar)

- **Selector**: `[data-popup-personal-state]` con `[data-action="set-rating"]`
  y `[data-personal-rating-state="collapsed|expanded"]`.
- **Dato fuente**: `location.customData.user_rating`.
- **Render**: affordance textual "Valorar" colapsada → 5★ al expandir.
  Si `user_rating > 0`, expandido por defecto + clear.
- **Editable**: Sí (`set-rating`, `clear-rating`).
- **Posición actual**: dentro de `buildPersonalStateBlock`, anclado por
  el composer 7A.1 entre `descripcion` y `observacion`.
- **Helper**: `buildPersonalStateBlock(location, ctx)` — helper único.
- **Visibilidad**: oculto para `isCuratorPoint` y `nearby` popups;
  oculto si `userRating === 0 && !canRate`.

### 1.4 Resumen del inventario

```text
┌──────────────────────────┬──────────────────┬──────────┬───────┐
│ Bloque                   │ Concepto         │ Editable │ Slot  │
├──────────────────────────┼──────────────────┼──────────┼───────┤
│ weighted-rating-cont.    │ enrichmentRating │ no       │ HEAD  │
│ chip ámbar indice_interes│ enrichmentRating │ no       │ HEAD  │
│ buildPersonalStateBlock  │ userPersonalState│ sí       │ BODY  │
└──────────────────────────┴──────────────────┴──────────┴───────┘
```

**Hallazgo central**: hoy "rating" cubre dos conceptos disjuntos. 7A.1
ordenó el slot del concepto 2 pero el concepto 1 sigue renderizándose
fuera del composer, en la cabecera. Por eso la preview contradice el
cierre técnico de 7A.1.

---

## 2. Clasificación semántica canónica

### 2.1 `enrichmentRating`

- Metadata semántica del POI (IA + curator/community ponderado).
- Propiedad del POI, no del usuario.
- Read-only en el popup.
- Vive en el body, no en la cabecera.

### 2.2 `userPersonalState`

- Estado/acción del usuario sobre el POI.
- Componentes: visited toggle + verified badge + valoración 5★.
- Propiedad del usuario, no del POI.
- Editable.
- Bloque personal del usuario, separado del rating semántico del POI.

### 2.3 Regla de nomenclatura

Prohibido referirse a "rating" sin prefijo en código nuevo, comentarios,
tests y docs. Sólo se permiten:

- `enrichmentRating` (alias documental: `semanticRating`)
- `userPersonalState` / `personalRating`

`rating` a secas en código nuevo es violación de canon en review.

---

## 3. Jerarquía canónica de slots del body enriched

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

- `description → enrichmentRating → userPersonalState → observation` es
  **bloque atómico**. Ningún `field_order` puede colar nada entre los
  slots 1-4.
- `enrichmentRating` NUNCA aparece en la cabecera. Su única posición
  canónica es el slot 2.
- `userPersonalState` NUNCA aparece arriba de `description`.
- `secondaryFields` respeta `field_order` para todo lo que no sea slot
  canónico.
- Si falta un slot canónico, se compactan adyacentes preservando orden
  relativo:

```text
desc + enrich + personal + obs  → 1 2 3 4
desc + enrich + obs             → 1 2 _ 4
desc + personal + obs           → 1 _ 3 4
desc + obs                      → 1 _ _ 4
desc                            → 1
obs                             → _ _ _ 4
ninguno                         → (sin bloque canónico)
```

### 3.3 Cabecera del popup

La cabecera del body enriched queda restringida a:

- warning de validación de visita (cuando aplica)
- controles que no sean rating semántico ni estado personal

Si tras esta restricción queda vacía, se elimina por completo.

---

## 4. Composer transversal

- El switch (`renderFragment`) sólo produce **fragments por fieldKey**,
  sin side-effects ordinales.
- Un composer único materializa fragments y ordena por **slots
  semánticos**, no por `field_order` para los canónicos.
- `field_order` gobierna sólo `secondaryFields`.
- El composer NO acepta un `ratingFragment` genérico. Acepta dos slots
  disjuntos: `enrichmentRatingFragment` y `userPersonalStateFragment`.

### 4.1 Contrato del composer

```text
compose({
  description: string,
  enrichmentRating: string,
  userPersonalState: string,
  observation: string,
  secondaryFields: Array<{ key, html }>,  // en field_order
})
```

Salida (con reducciones de §3.2):

```text
[ description, enrichmentRating, userPersonalState, observation,
  ...secondaryFields ]
```

### 4.2 Helper único `buildEnrichmentRatingBlock`

Nuevo helper transversal `buildEnrichmentRatingBlock(location,
enriched, ownership)`:

- una sola función para curator (weighted) y no-curator (chip ámbar);
- devuelve `''` cuando no hay `indice_interes` y no es curator;
- **única fuente** de HTML de estrellas semánticas;
- prohibido cualquier render inline de `★/☆` ligado a `indice_interes`
  fuera de este helper.

`buildPersonalStateBlock` sigue siendo el helper único de
`userPersonalState`. Sin cambios funcionales en esta PR.

---

## 5. Guardrails (tests obligatorios)

Los tests buscan **HTML/clases reales**, no nombres de helpers.

### 5.1 Estructurales sobre `map-popups.ts`

- **G1 — enrichmentRating no vive en cabecera**:
  la cabecera no puede contener `weighted-rating-container`,
  `data-ai-rating`, ni el chip ámbar de `indice_interes`.
- **G2 — un único helper produce enrichmentRating**:
  `indice_interes` en contexto `★/☆` aparece exclusivamente dentro de
  `buildEnrichmentRatingBlock`.
- **G3 — el switch no compone**:
  `case 'descripcion'` retorna sólo `desc`; `case 'indice_interes'` no
  emite estrellas (delegado al slot del composer).
- **G4 — slots, no rating genérico**:
  el composer expone `enrichmentRating` y `userPersonalState`
  separados. No existe ningún `ratingFragment` ambiguo.

### 5.2 Funcionales

- **G5 — orden canónico**:
  con los cuatro slots presentes, el HTML los emite en
  `1→2→3→4` independientemente de `field_order`.
- **G6 — reducciones**: cubrir las 7 combinaciones de §3.2.
- **G7 — secondaryFields no se cuelan**:
  con `field_order = ['punto_destacado','descripcion','observacion']`,
  `punto_destacado` queda FUERA del bloque canónico.

### 5.3 Anti-confusión

- **G8 — Valorar ≠ enrichmentRating**:
  `buildPersonalStateBlock` no contiene `data-ai-rating`,
  `weighted-rating-container` ni `indice_interes`.
  `buildEnrichmentRatingBlock` no contiene `data-action="set-rating"`,
  `data-personal-rating-state` ni `user_rating`.
- **G9 — no stars arriba de descripción**:
  el HTML del popup enriquecido no contiene `★`/`☆` en ninguna
  posición anterior al label del slot 1.

### 5.4 Naming

- **G10 — sin `rating` ambiguo en código nuevo**:
  un grep de `\brating\b` en helpers nuevos sólo permite los prefijos
  `enrichmentRating` y `userPersonalState`/`personalRating`. Tests y
  comentarios legacy se exceptúan explícitamente.

---

## 6. Documentación afectada (en la PR de implementación)

- `docs/popups/p-popup-7a-validation.md` — sección "7A.2" referenciando
  este documento y corrección del cierre 7A.1.
- `docs/contracts/popup-contract.md` — sección "Slots semánticos del
  body" con la lista canónica como invariante del popup.
- `mem://style/popup/canonical-body-composer` — actualizada: el
  composer ordena **slots**, no fragments arbitrarios;
  `enrichmentRating` y `userPersonalState` son slots disjuntos.
- `mem://logic/popup/rating-taxonomy` — nueva.
- `mem://index.md` — Core rule corta sobre taxonomía.

---

## 7. Migration Impact Check

1. **Canon afectado**: popup body composition + popup rating semantics.
2. **Regla anterior**: composer 7A.1 ancla un `ratingFragment` único
   (personal) entre `descripcion` y `observacion`.
3. **Regla nueva**: composer ordena cuatro slots semánticos disjuntos.
4. **Motivo**: `indice_interes` sigue rendering en cabecera; 7A.1 no
   queda ratificado.
5. **Componentes**: sólo `map-popups.ts` (presentación). Sin cambios
   en handlers, schema, ownership, hero chrome, fuentes, colecciones,
   taxonomy, geo.
6. **Helpers**: nuevo `buildEnrichmentRatingBlock`; composer pasa a
   recibir slots.
7. **Tests**: G1–G10 nuevos; los actuales de 7A.1 se mantienen.
8. **Docs**: las de §6.
9. **Migración**: inmediata, single PR de implementación tras
   ratificar este contrato.
10. **Riesgo si no se migra**: preview sigue mostrando estrellas
    arriba del extracto; 7A.1 queda no ratificado.
11. **Rollout**: canon validado → default ON GLOBAL. Sin flags. Ver
    `docs/governance/rollout-policy.md`.
12. **Aceptación**:
    - QA preview: ningún bloque de estrellas arriba de descripción.
    - Tests G1–G10 en verde.
    - Docs y memorias actualizadas.
13. **Deuda fuera de scope**: rama legacy no enriched (sin
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

- Este documento.
- Sección "7A.2" en `docs/popups/p-popup-7a-validation.md` con
  corrección explícita del cierre 7A.1.
- `mem://logic/popup/rating-taxonomy` (nueva).
- Actualización de `mem://style/popup/canonical-body-composer`.
- Core rule en `mem://index.md`.
- Sin cambios en `.ts`/`.tsx` de render.
