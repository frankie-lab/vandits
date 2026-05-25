# PR-SYNC-RECOVERY-1 — Sync Recovery Status

**Fecha**: 2026-05-25
**Operador**: Lovable agent (sandbox)
**Objetivo**: Establecer una única realidad verificable entre Lovable sandbox, GitHub `main`, CI, versión, docs y memoria.

---

## 1. Estado real del repo (sandbox Lovable)

| Campo | Valor |
|---|---|
| Branch actual de Lovable | `edit/edt-65101165-f618-4943-a104-348d6d8a1052` |
| HEAD del branch | `97e023a4` — *"Update site info for publish"* |
| `origin/main` HEAD | `a4e0294d26e9f1a2a189adbc96abf7653a2c2c94` |
| Commits **ahead** de `main` | **329** |
| Commits **behind** de `main` | **0** |
| Working tree | limpio |
| `APP_VERSION` (SoT) | `1.6.2` |

**Diagnóstico inmediato**: el branch de trabajo está **329 commits por delante de `main`**. Todo lo que se ha hecho en las últimas semanas (Import UX, Security, Boot perf, Export, version bumps, contracts, memoria) vive **solo en esta rama edit/*** y no en `main`. Esto explica por qué los cambios "no aparecen en GitHub main" y por qué los Actions de CI sobre `main` no reflejan nada nuevo.

> **NO PUEDO**, desde el sandbox: verificar el estado de GitHub Actions runs, ver PRs abiertos, mergear a `main`, ni crear tags. Esas son acciones manuales del usuario (sección 7).

---

## 2. Inventario por feature

| Feature | Commit(s) | Archivos clave | En `main` | Estado | Acción |
|---|---|---|---|---|---|
| **PR-IMPORT-UX-4** | `0e92ea7d` *"Añadido PR-IMPORT-UX-4 v1.6"*, `5a37ed04` *"Fixed import UX shell & audit"* | `src/shared/components/import/ImportSurfaceShell.tsx`, `import-primary-cta.ts`, `ImportedContentPanel.tsx`, `FileUploadZone.tsx`, `WebImportPanel.tsx`, `docs/audits/import-ux-operability.md`, `docs/contracts/import-canon.md`, `mem/logic/import/import-canon.md`, `src/test/import-hub-ux.test.tsx` | NO | Listo en branch, sin mergear | Promover (con caveats §4) |
| **PR-IMPORT-UX-5** (OneDrive history panel + row-2 test) | `8cdee3b6` *"Added OneDrive history panel"*, `95075529` *"Added row-2 below row-1 test"* | `src/components/OneDrivePhotoHistoryPanel.tsx`, `OneDrivePhotosPanel.tsx`, `e2e/import-row2-below-row1.spec.ts` | NO | Listo en branch, sin mergear | Promover (con caveats §4) |
| **Footer/subfila resolver** | `maintain-footer-*`, `EffectiveActionFooter`, `SelectionActions`, `DebtSelectionStatusBar`, `footer-label.ts` | `src/components/filters/*`, `src/test/maintain-footer-primary-resolve.test.ts` | NO | Listo en branch | Promover |
| **Security edge functions (zero-auth + weak-auth)** | `6f28691c` *"Fixed remaining security issues"*, `255fe5c5` *"Applied weak-auth security fixes"`, `aecd9898` *"Añadió AuthErrorBoundary"* | 11 edge functions (`batch-enrich`, `batch-geocode`, `browse-onedrive`, `calculate-route`, `check-route-services`, `correct-segment`, `enrich-location`, `quick-classify`, `search-candidates`, `search-nearby-osm`, `semantic-search`), migraciones `20260525152134`, `20260525152352`, `20260524194213` | NO | Listo en branch | **Separar de Import UX antes de mergear (§4)** |
| **PR-EXPORT (3/4/5/6)** | varios `Changes` | `src/domains/content/lib/exporters/*`, `poi-export-content-model.ts`, `ExportResolver.tsx`, `pr-export-*.test.ts`, `docs/contracts/poi-export-*.md`, `mem/logic/export/*` | NO | Listo en branch | Separar — es feature independiente |
| **PR-BOOT-PERF-1/2** | varios `Changes` | `src/shared/boot/boot-gate.ts`, `concurrency-pool.ts`, `src/shared/perf/boot-perf.ts`, `boot-gate-contract.test.ts`, `catalog-pagination-concurrent.test.ts`, `docs/audits/boot-performance-*.md`, `mem/logic/boot/boot-gate-contract.md` | NO | Listo en branch | Separar — es feature independiente |
| **CI workflows (unit.yml + e2e.yml PR trigger)** | `Changes` recientes | `.github/workflows/unit.yml` (NEW), `.github/workflows/e2e.yml` (M) | NO | Listo en branch | Promover primero (desbloquea verificación CI) |
| **Versionado/docs governance** | varios | `scripts/release/bump-version.ts`, `src/test/version-parity.test.ts`, `docs/governance/engineering-discipline.md`, `docs/versioning.md`, `src/lib/app-version.ts` (1.6.2) | NO | Listo en branch | Promover junto al resto |

**Total**: 98 archivos modificados/añadidos/movidos vs `origin/main`.

---

## 3. Separación de asuntos (NO mezclar)

El branch actual mezcla **6 grupos funcionales independientes** en una sola rama:

1. **Import UX** (UX-4 + UX-5 + footer resolver) — listo
2. **CI/E2E** (`unit.yml` + `e2e.yml` PR trigger) — listo
3. **Security edge functions** (11 funciones + 3 migraciones) — listo pero **toca backend en producción**
4. **Export** (PR-EXPORT-3/4/5/6 + content model + contracts) — listo
5. **Boot performance** (PR-BOOT-PERF-1/2 + boot-gate + pool) — listo
6. **Versionado/governance** (bump script + parity test + discipline doc + bump a 1.6.2) — listo

**Riesgo**: mergear los 329 commits de golpe a `main` desplegaría simultáneamente Import UX + Security + Boot + Export + bump 1.6.2. Si algo falla en producción, el rollback no es atómico.

---

## 4. Promoción controlada — recomendación

> **Ruta B aplica**: el branch mezcla Import UX + Security + Boot + Export. **NO publicar directo.**

**Opciones para el usuario (decisión manual fuera del sandbox)**:

**Opción 4.A — Big-bang merge** (rápido, riesgo concentrado):
- Abrir PR `edit/edt-65101165-… → main` con los 329 commits.
- Esperar `unit.yml` verde + `e2e.yml` verde-real (no skip).
- Mergear. Producción salta a `v1.6.2` con todo dentro.
- Rollback = revertir merge entero.

**Opción 4.B — Stacked merges** (recomendado, riesgo aislado):
Orden sugerido de PRs separados desde `main`:
1. **CI workflows** (`unit.yml` + `e2e.yml`) — desbloquea verificación del resto.
2. **Security edge functions + migraciones** — crítico, primero.
3. **Boot performance** — independiente, contract tests propios.
4. **Export** — independiente, contract tests propios.
5. **Import UX (UX-4 + UX-5 + footer)** — el original.
6. **Bump a `v1.6.2` + governance docs** — al final, refleja todo lo anterior.

Esta separación requiere acción manual en GitHub (cherry-pick a ramas nuevas) — **el sandbox de Lovable no puede hacerlo**: solo tiene un branch `edit/*` activo y no puede empujar a ramas arbitrarias del repo.

---

## 5. CI workflows

### `.github/workflows/unit.yml` (NEW en branch)
- Trigger: `push` a `main` + `pull_request` a `main`.
- Sin secrets, sin Playwright. Vitest puro.
- **Señal verde fiable** una vez el branch llegue a `main`.

### `.github/workflows/e2e.yml` (M en branch)
- Trigger: `push` a `main` + `pull_request` a `main` (ya añadido en este branch — antes era solo `push`).
- **Secrets gate**: si faltan `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `E2E_USER_EMAIL`, `E2E_USER_PASSWORD`, el workflow **termina en verde con `::warning::E2E skipped`** y NO ejecuta Playwright.
- **Política explícita**: un run con `should_run=false` **NO cuenta como E2E verde**. Hay que comprobar en los logs del run que Playwright corrió.

**Estado actual**: ninguno de los dos workflows ha corrido sobre `main` reflejando estos cambios, porque los cambios no están en `main` todavía.

---

## 6. Versionado / docs / memoria

| Surface | Estado actual en branch |
|---|---|
| `src/lib/app-version.ts` | `APP_VERSION = '1.6.2'` |
| `package.json` | `"version": "1.6.2"` (asumido, validado por `version-parity.test.ts`) |
| `docs/releases/version-history.md` | Actualizado en branch |
| `docs/contracts/import-canon.md` | Existe en branch (NEW) |
| `mem/logic/import/import-canon.md` | Existe en branch (NEW) |
| `src/test/version-parity.test.ts` | Existe en branch (NEW) |

**Acción 6**: NO se hace bump adicional en este PR-SYNC-RECOVERY-1. Este PR es **trazabilidad/sync**, no cambio funcional. El bump a `1.6.2` ya está hecho y refleja el contenido del branch.

Cuando el branch llegue a `main` y CI esté verde:
- `version-parity.test.ts` validará la coherencia automáticamente.
- Tag manual `git tag v1.6.2 && git push --tags` queda como acción del usuario.

---

## 7. Acciones manuales requeridas del usuario

El sandbox de Lovable **NO PUEDE** ejecutar estas acciones. Son tuyas:

1. **Abrir GitHub** y verificar que `origin/main` está en `a4e0294d`.
2. **Decidir Ruta A vs Ruta B** (§4).
3. **Si Ruta A**:
   - Abrir PR desde `edit/edt-65101165-f618-4943-a104-348d6d8a1052` → `main`.
   - Esperar runs de `unit.yml` y `e2e.yml`.
   - Confirmar en logs de `e2e.yml` que Playwright corrió (no skip).
   - Mergear.
   - Tag: `git tag v1.6.2 -m "v1.6.2" && git push origin v1.6.2`.
4. **Si Ruta B**:
   - Crear ramas temáticas en GitHub (cherry-pick por grupo §4).
   - Mergear en el orden 1→6.
   - Tag final tras el último merge.
5. **Verificar publish**: que `https://vandits.lovable.app` apunta al commit final post-merge.

---

## 8. Criterio de cierre — checklist

- [ ] SHA del merge a `main` visible en GitHub.
- [ ] Run de `unit.yml` visible y verde sobre ese SHA.
- [ ] Run de `e2e.yml` visible — **explicitar** si fue verde-real (Playwright corrió) o verde-skip (faltan secrets).
- [ ] Tag `v1.6.2` empujado.
- [ ] `version-parity.test.ts` verde en CI.
- [ ] Producción/preview apuntando al SHA correcto.

Hasta que esos 6 ítems estén marcados, **no se considera cerrado** PR-SYNC-RECOVERY-1.

---

## 9. Resumen ejecutivo

- Lovable branch tiene **329 commits no mergeados a `main`**.
- Mezcla **6 grupos funcionales independientes** (Import UX, CI, Security, Export, Boot perf, governance).
- **Recomendación**: Ruta B — separar y mergear por grupos. Si tiempo apremia, Ruta A (big-bang) es aceptable pero el rollback es todo-o-nada.
- **Lo que el sandbox NO puede hacer**: empujar a ramas arbitrarias, mergear PRs, crear tags, leer estado de GitHub Actions. Todo eso queda en manos del usuario.
- **Lo que ya está hecho en el branch**: Import UX completo, Security hardening completo, CI workflows ajustados, version bump a 1.6.2, docs/memoria sincronizadas.

Sin esta promoción manual, los próximos PRs seguirán acumulando deuda sobre un `main` desactualizado y los Actions seguirán sin reflejar el trabajo real.
