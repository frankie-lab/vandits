# PR-BACKOFFICE-UX-USEFULNESS-ROADMAP-1

> **Estatus**: roadmap diagnóstico-prescriptivo. **No autoriza ningún cambio**. Cada PR listado es **candidato** y requerirá su propia aprobación independiente.
> **Fecha**: 2026-05-19.
> **Fuentes base**: `docs/audits/backoffice-discovery-dossier.md`, `docs/audits/backoffice-technical-surfaces-ia-plan.md`, `src/components/admin/admin-tabs.tsx`.
> **Alcance**: ordenar y secuenciar trabajos UX para hacer el BackOffice más útil al master. **No implementa nada.**

---

## 0 — Contrato del propio roadmap

Restricciones que este documento se aplica a sí mismo y a cualquier PR que de él se derive:

- No edita `admin-tabs.tsx` ni el menú.
- No cambia labels, rutas, capabilities, domains, `routeMode`, componentes, paneles ni primitives.
- No toca runtime, backend, edge functions, schema ni RLS.
- No autoriza la implementación de ningún PR aquí descrito; **`implementation_allowed: no` para todos**.
- Cada PR candidato necesitará su propio dossier de aprobación.

### 0.1 Vocabulario cerrado

**Familias de cambio** (cada PR candidato pertenece a UNA sola):

- `IA` — Information Architecture (qué surfaces existen, dónde viven, cómo se agrupan).
- `COPY` — labels visibles, tooltips, microcopy, headers, badges.
- `LAYOUT` — wireframe interno del panel sin tocar lógica.
- `RUNTIME` — código de producto (capabilities, hooks, edge, schema). **Fuera del alcance documental**; sólo se anota como dependencia.

**`decision_status`** (por PR):

- `open` — independiente, no bloqueado.
- `blocked` — depende de una decisión humana D-n no resuelta.
- `ready_candidate` — todas sus dependencias están cerradas; aun así sigue siendo candidato y requiere aprobación.

**`implementation_allowed`**: siempre `no` en este documento.

---

## 1 — Decisiones humanas pendientes (D-1..D-5)

Estas son **decisiones humanas reales**, no decisiones implícitas del roadmap. El documento lista opciones y consecuencias; **no elige**. Hasta que el dueño del producto cierre cada decisión, los PRs que dependen de ella permanecen `blocked`.

### D-1 — Surface "Apariencia del mapa" (fusión `icons` + `markers`)
- Opciones:
  - **a)** Aprobar surface "Apariencia del mapa" → habilita PR-G; PR-F puede absorberse o convertirse en paso intermedio.
  - **b)** No aprobar → ambos paneles se mantienen separados; PR-G queda cancelado, PR-F sigue siendo candidato independiente.
- Consecuencia roadmap: bloquea PR-F, PR-G y PR-L.

### D-2 — Rename `audit` → "Diagnóstico de preferencias runtime"
- Opciones:
  - **a)** Aprobar rename → desbloquea PR-C.
  - **b)** Rechazar → label actual permanece, PR-C cancelado.
- Consecuencia roadmap: bloquea PR-C.

### D-3 — Split `design-system` Inspector vs Editor/Publish
- Opciones:
  - **a)** Status quo: una sola capability `inspect_design_system` cubre ambos modos (riesgo asumido a nivel de confirmaciones internas).
  - **b)** Separar conceptualmente Inspector (DevTools read-only) de Editor/Publish (acción global de alto impacto) **dentro del mismo gate**.
  - **c)** Separar también la authority/capability: nueva capability con fricción equivalente a destructiva (typed-token, last-master guard equivalente).
  - **d)** Sacar Publish fuera del BackOffice como flujo de release deliberado.
- **Nota explícita**: las opciones (c) y (d) implican cambios futuros de capability/authority; **este roadmap no autoriza ningún cambio de capability**. Sólo los enumera como consecuencia.
- Consecuencia roadmap: bloquea PR-H.

### D-4 — Split DIAG en `routes` ("Verificar conexiones")
- Opciones:
  - **a)** Mantener embebido en `routes` con distinción visual (heading/badge "Diagnóstico").
  - **b)** Extraer físicamente "Verificar conexiones" a `diagnostics` como surface mínima propia.
  - **c)** Status quo sin distinción visual.
- Consecuencia roadmap: bloquea PR-D (variante COPY) y un eventual PR-IA futuro de split físico.

### D-5 — Visibility policy de `internal-tools`
- Opciones (tres, sin elegir aquí):
  - **a)** Visible siempre para master (status quo).
  - **b)** Visible para master detrás de toggle "Modo desarrollo" (preferencia de usuario).
  - **c)** Visible sólo en entorno dev / flag de build / query param (no presente en producción para nadie por defecto).
- Consecuencia roadmap: bloquea PR-E.

---

## 2 — Familias de layout (input para futuros PRs LAYOUT)

Definición **conceptual**, sin proponer primitives nuevas ni componentes. Sirve como vocabulario para los PRs de la familia `LAYOUT`.

| familia | propósito | ejemplos de surfaces |
|---|---|---|
| `MANAGE` | listas/matrices con acciones por fila; densidad media-alta | users, permissions |
| `CONFIGURE` | formularios con efecto immediate o global; preview cuando aplica | markers, routes-config, icons, sources, enrichment |
| `OPERATE + OBSERVE` | acción heavy/deferred + historial + lane de progreso | geography, image-recovery, routes-verify (si se separa) |
| `INSPECT` | read-only con búsqueda/filtros; cero side effects en el cuerpo principal | audit, design-system inspector, internal-tools (índice) |

Mapeo surface → familia es **input** de los PRs LAYOUT, no se materializa aquí.

---

## 3 — Roadmap de PRs candidatos

Tabla maestra. Todos con `implementation_allowed: no`.

| PR | título | familia | surfaces afectadas | decisiones humanas requeridas | dependencias | decision_status | implementation_allowed |
|---|---|---|---|---|---|---|---|
| PR-A | Cerrar D-1..D-5 (decisiones humanas) | IA (decisión) | n/a (anexo dossier) | D-1, D-2, D-3, D-4, D-5 | — | open | no |
| PR-B | Quick win candidate: microcopy propósito/impacto por surface | COPY | 12 tabs | ninguna dura; recomendable D-2 antes | propio plan separado | open (ready_candidate como roadmap, blocked como ejecución) | no |
| PR-C | Rename `audit` → "Diagnóstico de preferencias runtime" | COPY | audit | D-2 | PR-A (D-2) | blocked | no |
| PR-D | Distinción visual COPY del sub-bloque DIAG en `routes` | COPY | routes | D-4 = (a) | PR-A (D-4) | blocked | no |
| PR-E | DevTools visibility policy para `internal-tools` | IA o COPY (según D-5) | internal-tools | D-5 | PR-A (D-5) | blocked | no |
| PR-F | IA: degradar `icons` a subgrupo "Avanzado" dentro de `config` | IA | icons | parcial D-1 | PR-A (D-1) | blocked / posiblemente absorbido por PR-G | no |
| PR-G | IA: surface "Apariencia del mapa" (fusión icons + markers) | IA | icons, markers | D-1 = (a) | PR-A (D-1); alternativo a PR-F | blocked | no |
| PR-H | IA: separar `design-system` Inspector vs Editor/Publish | IA | design-system | D-3 | PR-A (D-3) | blocked | no |
| PR-I | LAYOUT: aplicar familia `OPERATE + OBSERVE` a geography + image-recovery | LAYOUT | geography, image-recovery | sección 2 cerrada | PR-B (deseable) | open | no |
| PR-J | LAYOUT: aplicar familia `CONFIGURE` a `sources` con bloque "Observabilidad" secundario | LAYOUT | sources | sección 2 cerrada | — | open | no |
| PR-K | LAYOUT: aplicar familia `INSPECT` por separado (3 PRs) | LAYOUT | ver §3.K | D-2 (audit), D-3 (design-system) | PR-C, PR-H | blocked (parcial) | no |
| PR-L | LAYOUT: aplicar familia `CONFIGURE` a `markers` (o "Apariencia") | LAYOUT | markers (o Apariencia) | D-1 | PR-G si aplica | blocked | no |
| PR-M | LAYOUT: aplicar familia `MANAGE` a `users` + `permissions` | LAYOUT | users, permissions | sección 2 cerrada | — | open | no |

### 3.A — PR-A — Cerrar decisiones humanas
- objetivo: producir un anexo en el dossier resolviendo D-1..D-5 con opción elegida + razón.
- familia: IA (decisión), cero código.
- riesgo: ninguno técnico; alto si se omite (todo el roadmap queda bloqueado).
- valor UX esperado: desbloquear el resto del roadmap.
- criterio de aceptación: 5 decisiones cerradas con opción y razón documentada.
- qué NO tocar: nada de código; sólo documento.

### 3.B — PR-B — Quick win candidate: microcopy por surface
- objetivo: **evaluar e implementar, en PR separado, microcopy de propósito/impacto por surface si se aprueba**. Este roadmap sólo lo secuencia.
- familia: COPY.
- surfaces: las 12 tabs (transversal → requiere su propio plan).
- riesgo: bajo técnico, medio editorial (consistencia entre 12 surfaces).
- valor UX esperado: el master entiende qué hace cada panel sin abrirlo y reconoce su impacto antes de actuar.
- criterio de aceptación (para el futuro PR de ejecución): plantilla única, microcopy aprobado caso a caso, sin nuevas primitives.
- qué NO tocar: capabilities, layout, runtime, taxonomía de `EffectBadgeRow`.
- **Nota**: aparece como `quick win candidate`, no como quick win aprobado. Afecta a las 12 tabs y debe tener su propio plan.

### 3.C — PR-C — Rename `audit`
- objetivo candidato: rename del label visible a "Diagnóstico de preferencias runtime". Sólo si D-2 = aprobado.
- familia: COPY.
- riesgo: bajo.
- valor UX: evitar confusión con auditoría administrativa.
- criterio de aceptación: label cambiado en una sola fuente; ruta `/admin/audit` intacta; capability `view_audit_log` intacta; tests de label actualizados si existieran.
- qué NO tocar: capability, ruta, body del panel.

### 3.D — PR-D — Distinción visual DIAG en `routes`
- objetivo candidato: añadir heading/badge "Diagnóstico" sobre el bloque "Verificar conexiones" dentro de `routes`. Sólo si D-4 = (a).
- familia: COPY (microcopy + posicionamiento de badge ya existente).
- riesgo: bajo.
- valor UX: el master distingue config de diagnóstico sin extraer la surface.
- criterio de aceptación: el bloque verify queda claramente marcado como diagnóstico; cero cambios funcionales.
- qué NO tocar: capability, lógica de verify, posición de tab, otros bloques de routes.

### 3.E — PR-E — DevTools visibility policy
- objetivo candidato: implementar la opción elegida en D-5 (a/b/c). Cada opción tiene PR distinto.
- familia: IA (a/c) o COPY (b si es sólo toggle de preferencia).
- riesgo: bajo a medio.
- valor UX: alinear visibilidad con la naturaleza DEBUG_ONLY del panel.
- criterio de aceptación: comportamiento documentado; capability `run_internal_tooling` intacta.
- qué NO tocar: capability, body del panel, otras DevTools.

### 3.F — PR-F — Degradar `icons` a subgrupo "Avanzado"
- objetivo candidato: cambio mínimo de orden visual en `config` para empujar `icons` a un subgrupo "Avanzado" sin merge físico.
- familia: IA.
- riesgo: bajo (un solo cambio de orden/agrupación).
- valor UX: -1 ruido top-level.
- criterio de aceptación: surface sigue funcional; capability `manage_icon_library` intacta.
- qué NO tocar: capability, ruta, body, otros tabs.
- **Relación con PR-G (mutuamente dependientes/alternativos según D-1)**:
  - Si D-1 = aprobar "Apariencia del mapa": PR-F puede ser **innecesario** (lo absorbe PR-G) o quedar como **paso intermedio** previo al merge.
  - Si D-1 = no aprobar: PR-F sigue como candidato independiente; PR-G queda **cancelado**.

### 3.G — PR-G — Surface "Apariencia del mapa"
- objetivo candidato: fusionar `icons` + `markers` en una surface única "Apariencia del mapa". Sólo si D-1 = (a).
- familia: IA.
- surfaces: icons, markers.
- riesgo: medio (toca `admin-tabs.tsx`, dos capabilities coexistiendo en una surface).
- valor UX: surface conceptualmente coherente; -1 ruido top-level.
- criterio de aceptación: capabilities ambas preservadas; rutas históricas con redirect; tests de IA actualizados.
- qué NO tocar: capabilities, lógica de marker sizes/states, lógica de icon library.
- **Relación con PR-F**: alternativo. Si PR-G se ejecuta, PR-F deja de aplicar como degradación independiente.

### 3.H — PR-H — Separar Inspector vs Editor/Publish en `design-system`
- objetivo candidato: implementar la opción elegida en D-3 (a/b/c/d). Variantes muy distintas.
- familia: IA (y posiblemente RUNTIME fuera del alcance documental si D-3 = c o d).
- riesgo: medio a alto (publish global).
- valor UX: claridad de authority y riesgo proporcional al impacto.
- criterio de aceptación: depende de la variante.
- qué NO tocar: este roadmap **no autoriza ningún cambio de capability**; cualquier nueva capability necesitaría su propio PR-RUNTIME aprobado.

### 3.I — PR-I — LAYOUT `OPERATE + OBSERVE` a geography + image-recovery
- objetivo candidato: aplicar la familia `OPERATE + OBSERVE` (sección 2) a ambas surfaces.
- familia: LAYOUT.
- riesgo: medio (heavy operations).
- valor UX: consistencia operacional y observabilidad uniforme.
- criterio de aceptación: ambas surfaces siguen la misma estructura visual; `useOperationHistory` ya cableado se reutiliza tal cual; cero cambios runtime.
- qué NO tocar: capabilities, edges, schema, lógica de jobs.

### 3.J — PR-J — LAYOUT `CONFIGURE` a `sources` con observabilidad secundaria
- objetivo candidato: aplicar familia `CONFIGURE` con un bloque "Observabilidad" secundario (health/latency de providers).
- familia: LAYOUT.
- riesgo: bajo.
- valor UX: el master ve salud de providers sin salir del panel.
- criterio de aceptación: providers configurables siguen siendo SoT; observabilidad es **read-only**, sin nuevas acciones.
- qué NO tocar: capability `manage_data_sources`, configuración persistida, lógica de prioridades.

### 3.K — PR-K — LAYOUT familia `INSPECT` (NO mezclar)
- **No mezclar `audit`, `design-system` e `internal-tools` como si fueran equivalentes.** Todas son diagnóstico/devtools pero con autoridades distintas:
  - **audit** — read-only inspector puro. Aplicar `INSPECT` directo.
  - **design-system** — inspector + posible publish global. `INSPECT` aplica **sólo al modo inspector**; el modo Editor/Publish debe llevar tratamiento visual de alta autoridad (depende de PR-H).
  - **internal-tools** — ejecuta acciones one-shot. `INSPECT` aplica al **índice** (lista de tools con ownership); cada acción mantiene su propio `EffectBadge` y confirmación. NO es read-only puro.
- En consecuencia, PR-K se divide en 3 sub-PRs candidatos:
  - PR-K1 — `INSPECT` puro a `audit`. Depende de PR-C (D-2).
  - PR-K2 — `INSPECT` al modo inspector de `design-system`. Depende de PR-H (D-3).
  - PR-K3 — `INSPECT` al índice de `internal-tools`, conservando affordance de acción por fila. Independiente.
- familia: LAYOUT.
- riesgo: bajo (K1, K3), medio (K2 por entrelazado con publish).
- valor UX: patrón único para diagnóstico **con autoridad explícita en cada caso**.
- criterio de aceptación común: ningún sub-PR oculta affordances de acción donde existan; cero cambios runtime; cero merge entre surfaces.
- qué NO tocar: capabilities, rutas, ejecución de tools, publish de DS.

### 3.L — PR-L — LAYOUT `CONFIGURE` a `markers` (o "Apariencia")
- objetivo candidato: aplicar `CONFIGURE` a la surface markers — o a "Apariencia del mapa" si PR-G ya está hecho.
- familia: LAYOUT.
- riesgo: medio (preview live, paleta canónica).
- valor UX: alineación visual con el resto de `CONFIGURE`.
- criterio de aceptación: preview live preservado; helper único `getPointVisualState` intacto; paleta canónica respetada.
- qué NO tocar: paleta, helpers de marker, capability.

### 3.M — PR-M — LAYOUT `MANAGE` a `users` + `permissions`
- objetivo candidato: aplicar familia `MANAGE` para mejorar densidad y lectura de matriz.
- familia: LAYOUT.
- riesgo: medio (matriz densa, columna master read-only canónica).
- valor UX: lectura más rápida y consistente con otras listas.
- criterio de aceptación: matriz RBAC canónica intacta (4 roles, columna master read-only); last-master guard intacto; cero cambios de capability.
- qué NO tocar: lógica de toggle de permisos, capabilities, RLS, schema.

---

## 4 — Evaluación explícita de los 6 ejes pedidos

| eje | estado actual | propuesta candidata | PRs que la materializarían | decisiones requeridas | si la decisión es "no" |
|---|---|---|---|---|---|
| `icons` + `markers` como "Apariencia del mapa" | dos tabs en `config` | fusión en surface única | PR-F (intermedio o cancelado) + PR-G + PR-L | D-1 | ambos paneles permanecen separados; PR-F sigue como candidato independiente |
| `audit` como "Diagnóstico de preferencias runtime" | tab en `diagnostics` con label ambiguo | rename + layout `INSPECT` | PR-C + PR-K1 | D-2 | label actual permanece; PR-C/PR-K1 cancelados |
| `design-system` como DevTools (inspector vs publish) | una sola capability mezcla ambos modos | separación conceptual y/o de authority | PR-H + PR-K2 | D-3 | status quo; `inspect_design_system` sigue cubriendo ambos modos |
| `routes` como configuración avanzada + diagnóstico separado | HYBRID en `config` | distinción visual (D-4=a) o split físico (D-4=b) | PR-D (variante a) o futuro PR-IA (variante b) | D-4 | sin distinción adicional |
| `sources` como configuración de providers con observabilidad secundaria | tab en `config` (providers) | `CONFIGURE` + bloque observabilidad read-only | PR-J | ninguna dura | sigue como sólo-config |
| `geography` + `image-recovery` como familia `OPERATE + OBSERVE` | tabs en `ops` con `useOperationHistory` cableado | layout unificado de operación + observabilidad | PR-I | ninguna dura | tabs siguen heterogéneas |

---

## 5 — Reglas del roadmap

- **R-1** — Ningún PR mezcla familias salvo PR-A (IA puro de decisión) y PR-B (quick win candidate transversal de COPY). Cualquier otra mezcla requiere justificación explícita en su propio dossier.
- **R-2** — Ningún PR LAYOUT empieza sin la familia destino confirmada (sección 2 cerrada en su propio PR).
- **R-3** — Ningún PR IA toca código sin la decisión humana D-n correspondiente cerrada (PR-A).
- **R-4** — Cada PR del roadmap es su propio PR de Lovable, con su propio dossier de aprobación. Este documento sólo los **secuencia**.
- **R-5** — Cero eliminación de surfaces. Cero cambios de capabilities autorizados por este roadmap.
- **R-6** — `implementation_allowed: no` para todos los PRs aquí listados. La aprobación de implementación es un acto separado.
- **R-7** — Distinguir siempre: decisión IA / cambio de copy / cambio de layout / cambio runtime (fuera de alcance documental).

---

## 6 — Resumen ejecutivo

- **Bloqueo principal**: D-1..D-5 deben cerrarse en PR-A antes de avanzar.
- **Quick win candidates**: PR-B (microcopy transversal, propio plan), PR-C (rename audit, dep. D-2), PR-D (distinción DIAG en routes, dep. D-4).
- **Ganancia mayor de IA**: PR-G (Apariencia del mapa, dep. D-1) y PR-H (split design-system, dep. D-3).
- **Ganancia mayor de layout**: PR-I (OPERATE+OBSERVE) y PR-J (sources con observabilidad). Ambos `open`.
- **Coste cero hoy**: hasta que el dueño decida D-1..D-5, no se ejecuta nada.

---

## 7 — Criterios de aceptación del propio documento

- [x] Roadmap con PRs pequeños y secuenciados (PR-A..PR-M, con PR-K dividido en K1/K2/K3).
- [x] Separación explícita entre decisiones IA, cambios de copy, cambios de layout y cambios runtime (fuera de alcance).
- [x] Ningún PR mezcla familias salvo PR-A (IA decisión) y PR-B (COPY transversal quick win candidate).
- [x] Decisiones humanas D-1..D-5 listadas como decisiones humanas reales, con opciones y consecuencias; el documento **no elige**.
- [x] D-5 incluye 3 opciones (siempre visible / toggle "Modo desarrollo" / sólo dev flag o query param).
- [x] D-3 deja explícito que la opción de separar capability es decisión humana fuera del alcance de este roadmap.
- [x] PR-F y PR-G marcados como mutuamente dependientes/alternativos según D-1.
- [x] PR-K dividido en K1/K2/K3 para no mezclar autoridades distintas (audit inspector / design-system con publish / internal-tools acción).
- [x] Tabla maestra con columnas `implementation_allowed: no` y `decision_status: open | blocked | ready_candidate`.
- [x] PR-B aparece como **quick win candidate**, no como quick win aprobado, y se formula como "evaluar e implementar en PR separado si se aprueba".
- [x] Cero cambios fuera del documento.
