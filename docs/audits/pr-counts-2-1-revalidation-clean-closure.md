# PR-COUNTS-2.1 — Revalidación limpia previa (cache clear) — Cierre

**Estado:** Cerrado · gap inexistente · NO abrir PR-COUNTS-2.1
**Alcance:** Solo lectura. Sin cambios de código, datos, schema, backend, bump.
**Relacionado:**
- `docs/audits/pr-counts-2-1-debt-runtime-delta-audit.md` (diagnóstico estructural)
- `docs/audits/poi-counts-visual-validation-post-pr-counts-1-2.md` (validación previa que reportó 22 vs 18)
- `docs/audits/poi-debt-subtab-unification-postflight.md` (PR-COUNTS-2)

---

## 1. Resultado

Tras hard reload del bundle actual y revalidación con estado canónico
(sin selección manual, sin filtros de árbol, modo Mantener → Con deuda,
árbol Geo en raíz), **todos los consumidores convergen al mismo valor**:

| Consumidor                                | Valor |
| ----------------------------------------- | :---: |
| Subtab pill `Con deuda`                   | **22** |
| Header `0 / 22 seleccionados (con deuda)` | **22** |
| CTA `ACCIÓN SOBRE CON DEUDA (22)`         | **22** |
| Árbol Geo (Africa 2 + Europe 20)          | **22** |
| Footer `Acciones sobre 22 POIs con deuda` | **22** |

Build verificado: **v1.3.19** (visible en la chrome del mapa).
Top bar: `4.739 / 5.095`. Sidebar usuarios: `0 / 7 Seguidos`. Sin filtros.

---

## 2. Diagnóstico final del delta reportado previamente

El gap **22 vs 18** documentado en
`docs/audits/poi-counts-visual-validation-post-pr-counts-1-2.md` **no
existe** en el bundle actual. Coincide con la conclusión estructural de
`pr-counts-2-1-debt-runtime-delta-audit.md` §2 (subtab y header derivan
de la misma expresión pura sobre la misma fuente memoizada).

Causas plausibles del reporte previo, en orden de probabilidad:

1. **Caché de bundle / preview no recargado** antes de que PR-COUNTS-2 se
   sirviera al iframe — la subtab seguía mostrando un valor anterior
   mientras header/CTA/árbol/footer ya leían el nuevo SoT.
2. **Confusión visual `X / T`**: si en la observación previa había algún
   filtro de árbol activo o un nodo Geo expandido, el header mostraba
   `effectiveActionSet.length` (recortado por el árbol) como `X` y la
   subtab `T` completo — diferencia legítima, no bug.

La instrumentación dev de §6 del audit (volcado de IDs por consola) **no
es necesaria**: no hay delta que diagnosticar.

---

## 3. Aclaración operativa para futuras validaciones

Cuando se compara `subtab` vs `header`, **siempre** verificar:

- `filters` vacío (sin geo / tipo / tag / search activos);
- `selectedLocations` vacío;
- árbol Geo en raíz (no en un nodo expandido seleccionado);
- el número del header a comparar es **`T`** (el de la derecha del slash),
  no **`X`** (el de la izquierda, que es `effectiveActionSet`).

Con filtro geográfico activo (p. ej. `Con deuda → Europe`) lo esperado es:

- `universeBase('debt')` = 22 (global, no recortado);
- `effectiveActionSet` = 20 (debt ∩ Europe);
- header = `X / T` = `20 / 22`;
- footer = `Acciones sobre 20 POIs`.

Esto **no es bug**: es el comportamiento canónico del recorte por tree
filter sobre el universo base, especificado en
`docs/contracts/poi-counts-canon.md`.

---

## 4. Decisión

**PR-COUNTS-2.1 NO se abre.** PR-COUNTS-1 y PR-COUNTS-2 quedan
visualmente validados sin incumplimientos pendientes.

Si en una sesión futura reaparece un delta entre subtab/header/CTA/árbol/
footer **con estado canónico limpio** (filtros vacíos, sin selección,
árbol en raíz, hard reload), entonces y solo entonces aplicar la
instrumentación dev del §6 de `pr-counts-2-1-debt-runtime-delta-audit.md`
y reabrir bug.

---

## 5. No-impacto

Esta revalidación es **docs-only**. No se han modificado:

- código (`FilterBar.tsx`, `resolve-universe-base.ts`,
  `visible-catalog-universe.ts`, etc.);
- tests;
- datos, schema, backend;
- PR-EXPORT-2 core, serializers;
- versión / bump.
