## PR-BACKOFFICE-UX-USEFULNESS-ROADMAP-1 — plan listo para implementar

Crear **un único** archivo: `docs/audits/backoffice-ux-usefulness-roadmap.md`. Cero cambios fuera del documento (no `admin-tabs.tsx`, no menú, labels, capabilities, rutas, componentes, paneles, primitives, runtime, backend, schema, RLS). Cada PR listado es **candidato** con `implementation_allowed: no`.

### Estructura del documento (secciones 0–7)

**0. Contrato del propio roadmap** — restricciones, vocabulario cerrado (familias `IA | COPY | LAYOUT | RUNTIME` con RUNTIME fuera de alcance), `decision_status: open | blocked | ready_candidate`, `implementation_allowed: no` permanente.

**1. Decisiones humanas D-1..D-5** — listadas como decisiones reales con opciones y consecuencias; el documento NO elige:
- **D-1** Apariencia del mapa (icons+markers): aprobar / no.
- **D-2** Rename audit → "Diagnóstico de preferencias runtime".
- **D-3** Split design-system Inspector vs Editor/Publish. Opciones a/b/c/d con nota explícita: opciones (c) y (d) implicarían cambios futuros de capability; **este roadmap no autoriza ningún cambio de capability**.
- **D-4** Split DIAG en routes ("Verificar conexiones"): embebido con distinción visual / split físico / status quo.
- **D-5** Visibility policy `internal-tools` con **3 opciones**: (a) siempre visible para master, (b) tras toggle "Modo desarrollo", (c) sólo en entorno dev / flag de build / query param.

**2. Familias de layout** (conceptuales, sin nuevas primitives): `MANAGE`, `CONFIGURE`, `OPERATE + OBSERVE`, `INSPECT`. Mapeo surface→familia como input.

**3. Roadmap de PRs candidatos** — tabla maestra con columnas `familia | surfaces | decisiones requeridas | dependencias | decision_status | implementation_allowed`. Todos `no`.

- PR-A — cerrar D-1..D-5 (IA decisión).
- PR-B — **quick win candidate** transversal de microcopy en `PanelEffectHeader` para las 12 tabs. Redactado como *"Evaluar e implementar, en PR separado, microcopy de propósito/impacto por surface si se aprueba."* No es quick win aprobado.
- PR-C — rename `audit` (COPY, dep. D-2).
- PR-D — distinción visual sub-bloque DIAG en `routes` (COPY, dep. D-4=a).
- PR-E — visibility policy `internal-tools` (familia según D-5).
- PR-F — degradar `icons` a subgrupo "Avanzado" (IA, dep. D-1).
- PR-G — surface "Apariencia del mapa" (IA, dep. D-1).
  - **PR-F y PR-G son mutuamente dependientes/alternativos**: si D-1 aprueba, PR-F puede absorberse o quedar como paso intermedio; si D-1 rechaza, PR-G queda cancelado.
- PR-H — separar Inspector vs Editor/Publish en `design-system` (IA, dep. D-3). Nota: cambios de capability NO autorizados aquí.
- PR-I — LAYOUT `OPERATE + OBSERVE` a `geography` + `image-recovery`.
- PR-J — LAYOUT `CONFIGURE` a `sources` con bloque "Observabilidad" secundario read-only.
- **PR-K** — dividido en **K1/K2/K3** para NO mezclar autoridades:
  - K1: `INSPECT` puro a `audit` (read-only inspector). Dep. PR-C.
  - K2: `INSPECT` al **modo inspector** de `design-system`; el modo Editor/Publish requiere tratamiento de alta autoridad (dep. PR-H).
  - K3: `INSPECT` al **índice** de `internal-tools` conservando affordance de acción one-shot por fila.
- PR-L — LAYOUT `CONFIGURE` a `markers` (o "Apariencia").
- PR-M — LAYOUT `MANAGE` a `users` + `permissions`.

Cada PR lleva ficha: objetivo, familia, surfaces, riesgo, valor UX, criterio de aceptación, qué NO tocar, decision_status, implementation_allowed=no.

**4. Evaluación explícita de los 6 ejes pedidos** — tabla por eje (icons+markers, audit rename, design-system split, routes split, sources+observabilidad, geography+image-recovery) con: estado actual, propuesta candidata, PRs que la materializarían, decisiones requeridas, qué pasa si la decisión es "no".

**5. Reglas del roadmap** (R-1..R-7): monofamilia salvo PR-A y PR-B; LAYOUT necesita sección 2 cerrada; IA necesita D-n cerrada; cada PR es su propio dossier; cero eliminación; cero cambios de capability; `implementation_allowed:no` para todos; distinguir IA/COPY/LAYOUT/RUNTIME.

**6. Resumen ejecutivo** — bloqueo principal (D-1..D-5 en PR-A), quick win candidates, ganancia mayor IA (PR-G, PR-H), ganancia mayor layout (PR-I, PR-J), coste cero hasta decisiones.

**7. Criterios de aceptación del propio documento** — checklist marcando los 9 ajustes obligatorios cumplidos.

### Restricciones cumplidas

- Sólo crea `docs/audits/backoffice-ux-usefulness-roadmap.md`.
- No autoriza ningún PR; todos `implementation_allowed: no`.
- PR-B como candidato, no como aprobado.
- D-1..D-5 como decisiones humanas reales con opciones.
- D-5 con 3 opciones.
- D-3 marca explícitamente que cambios de capability son decisión humana fuera del alcance.
- PR-F/PR-G mutuamente dependientes/alternativos según D-1.
- PR-K dividido en K1/K2/K3 para no mezclar autoridades.
- Tabla con columnas `implementation_allowed` y `decision_status`.
- Distinción IA / COPY / LAYOUT / RUNTIME (fuera de alcance) explícita.
