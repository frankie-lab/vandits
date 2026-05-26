# MIGRATION-SANDBOX-TO-PROD-1 — Fase 1: Inventario

Estado: **borrador para aprobación** (Fase 1, solo lectura). No se ha tocado
producto, no se ha hecho bump, no se ha publicado, no se ha abierto PR.

## Fuentes

- **Base prod**: `origin/main` @ `a4e0294d` — `APP_VERSION = 1.4.4`.
- **Sandbox contaminado**: `origin/codex/fix-my-catalog-popover-contract` —
  `APP_VERSION = 1.6.2`, **335 commits ahead / 0 behind** main.
- **Diff total**: 101 archivos cambiados (48 A · 52 M · 1 R).
- **PR-CI-INFRA-1**: ya cerrado y mergeado en main
  (`.github/workflows/ci.yml` con Typecheck bloqueante, Lint/Vitest
  diagnóstico) — fuera del scope de esta migración.

## Tabla maestra — clasificación archivo a archivo

Convenciones de columnas:

- **bloque** = destino de migración. Valores: `ci-infra`, `security-edge-auth`,
  `boot-perf`, `export`, `import-ux`, `e2e-domain-tests`,
  `governance-versioning`, `mixed` (requiere split manual), `descartar`.
- **estado** = `A` añadido, `M` modificado, `R` renombrado.
- **prioridad** = orden de bloque dentro del plan global (2..7; 1 ya cerrado).
- **riesgo** = `bajo` / `medio` / `alto` (impacto si rompe).
- **notas** = razón de clasificación, dependencia o split.

### 1. CI infra (bloque 1 — CERRADO en main, NO migrar)

| archivo | estado | decisión | notas |
|---|---|---|---|
| `.github/workflows/ci.yml` | (ya en main) | — | PR-CI-INFRA-1 cerrado. |
| `.github/workflows/unit.yml` | A | **descartar** | Workflow duplicado para vitest; `ci.yml` ya cubre vitest como diagnóstico. Reabrir solo si PR-VITEST-DEBT-1 decide separar runners. |
| `.github/workflows/e2e.yml` | M | **e2e-domain-tests** (P6) | Ajustes al runner Playwright; viaja con el bloque de tests E2E. |

### 2. Security edge auth (bloque 2 — prioridad 2, riesgo ALTO)

Objetivo: endurecer auth en edge functions y RLS en tablas administrativas.

| archivo | estado | bloque | riesgo | notas |
|---|---|---|---|---|
| `supabase/functions/batch-enrich/index.ts` | M | security-edge-auth | alto | Reemplaza auth inline por `requireAuth` de `_shared/auth.ts`. |
| `supabase/functions/batch-geocode/index.ts` | M | security-edge-auth | alto | idem. |
| `supabase/functions/browse-onedrive/index.ts` | M | security-edge-auth | alto | idem. |
| `supabase/functions/calculate-route/index.ts` | M | security-edge-auth | alto | idem. |
| `supabase/functions/check-route-services/index.ts` | M | security-edge-auth | alto | idem. |
| `supabase/functions/correct-segment/index.ts` | M | security-edge-auth | alto | idem. |
| `supabase/functions/enrich-location/index.ts` | M | security-edge-auth | alto | idem. |
| `supabase/functions/quick-classify/index.ts` | M | security-edge-auth | alto | idem. |
| `supabase/functions/search-candidates/index.ts` | M | security-edge-auth | alto | idem. |
| `supabase/functions/search-nearby-osm/index.ts` | M | security-edge-auth | alto | idem. |
| `supabase/functions/semantic-search/index.ts` | M | security-edge-auth | alto | idem. |
| `supabase/migrations/20260525152134_*.sql` | A | security-edge-auth | alto | Restringe SELECT en `data_sources` y `user_achievements` a owner/admin/master. |
| `supabase/migrations/20260525152352_*.sql` | A | security-edge-auth | alto | `search_path` fix en helpers + `security_invoker` en `v_locations_resolved` + revoke EXECUTE anon en SECURITY DEFINER. |

Nota: el helper `supabase/functions/_shared/auth.ts` ya existe en main
(idéntico en sandbox), por lo que no entra en el diff. La migración consiste
en cablearlo en los 11 consumidores y aplicar las 2 migraciones SQL.

Dependencias: ninguna (puede ir tras CI). **Bloque atómico**: todos juntos o
ninguno, para no dejar funciones a medio asegurar.

### 3. Boot performance (bloque 3 — prioridad 3, riesgo MEDIO)

Objetivo: cerrar PR-BOOT-PERF-1/2 según canon ya documentado en
`mem://logic/boot/boot-performance-canon`.

| archivo | estado | bloque | riesgo | notas |
|---|---|---|---|---|
| `src/shared/boot/boot-gate.ts` | A | boot-perf | medio | Helper canon (`mem://`). |
| `src/shared/boot/concurrency-pool.ts` | A | boot-perf | medio | Pool max 4, canon. |
| `src/shared/perf/boot-perf.ts` | A | boot-perf | bajo | Instrumentación de fases. |
| `src/domains/content/lib/db-transformers.ts` | M | boot-perf | medio | Paginación catálogo ventana 3 (`CATALOG_PAGE_CONCURRENCY=3`). |
| `src/domains/identity/hooks/use-auth.ts` | M | boot-perf | medio | Singleton snapshot — elimina suscripciones duplicadas en boot. |
| `src/shared/debug/AuthedErrorBoundary.tsx` | A | boot-perf | bajo | ErrorBoundary scoping para fase boot. |
| `src/App.tsx` | M | **mixed → boot-perf (preferente)** | medio | Probablemente monta `AuthedErrorBoundary` + `boot-gate`. Verificar al abrir bloque que no arrastra UI no-boot. |
| `src/pages/Index.tsx` | M | **mixed** | medio | Posible mezcla boot + filtros/discovery. Split manual al migrar; aceptar solo lo necesario para boot. |
| `src/test/boot-gate-contract.test.ts` | A | boot-perf | bajo | Contract test canon. |
| `src/test/catalog-pagination-concurrent.test.ts` | A | boot-perf | bajo | Contract test canon. |

Dependencias: ninguna funcional; recomendable tras security para no mezclar
áreas de revisión.

### 4. Export GuruMaps / ownership (bloque 4 — prioridad 4, riesgo MEDIO)

Objetivo: cerrar PR-EXPORT-3..6 (resolver UX, semantics internal, content
model, renderer GuruMaps) y consolidar canon export.

| archivo | estado | bloque | riesgo | notas |
|---|---|---|---|---|
| `src/domains/content/components/ExportResolver.tsx` | A | export | medio | Nuevo wrapper resolver UX (669 líneas). |
| `src/domains/content/components/ExportPanel.tsx` | M | export | medio | Cablea ExportResolver + scope. |
| `src/domains/content/lib/exporters/gurumaps-description.ts` | A | export | bajo | Renderer GuruMaps. |
| `src/domains/content/lib/exporters/kml-description-html.ts` | A | export | bajo | Renderer KML HTML. |
| `src/domains/content/lib/exporters/render-export-description.ts` | A | export | bajo | Dispatcher canon. |
| `src/domains/content/lib/exporters/poi-csv.ts` | M | export | bajo | Alineado al content model. |
| `src/domains/content/lib/exporters/poi-kml.ts` | M | export | bajo | idem. |
| `src/domains/content/lib/poi-export-content-model.ts` | A | export | medio | Content model canon (353 líneas). |
| `src/domains/content/lib/poi-export-mapper.ts` | M | export | bajo | Adaptado al content model. |
| `src/domains/content/lib/poi-export-record.ts` | M | export | bajo | idem. |
| `src/components/filters/SelectionActions.tsx` | M | export | medio | Pasa `scope`+`scopeProvided` (canon PR-EXPORT-1 C2). |
| `src/components/filters/DebtSelectionStatusBar.tsx` | M | **mixed** | bajo | Toca selection bar; revisar si entra en export o discovery. |
| `src/components/filters/EffectiveActionFooter.tsx` | M | **mixed** | bajo | idem; probablemente export-resolver UX. |
| `src/components/filters/footer-label.ts` | M | **mixed** | bajo | idem. |
| `docs/contracts/poi-export-canon.md` | A | governance-versioning | bajo | Doc canon — viaja con bloque 7 o con export (preferente: con export). |
| `docs/contracts/poi-export-content-model.md` | A | governance-versioning | bajo | idem. |
| `mem/logic/export/poi-export-canon.md` | A | governance-versioning | bajo | idem. |
| `mem/logic/export/poi-export-content-model.md` | A | governance-versioning | bajo | idem. |
| `docs/audits/pr-export-4-semantics-audit.md` | A | governance-versioning | bajo | Audit doc. |

Tests del bloque export → ver sección 6.

### 5. Import UX (bloque 5 — prioridad 5, riesgo MEDIO)

Objetivo: cerrar PR-IMPORT-CANON-1 / import-hub UX (canon ya en
`mem://logic/import/import-canon`).

| archivo | estado | bloque | riesgo | notas |
|---|---|---|---|---|
| `src/components/ImportedContentPanel.tsx` | M | import-ux | medio | 438 líneas — refactor Hub. |
| `src/shared/components/import/ImportSurfaceShell.tsx` | A | import-ux | bajo | Shell canon. |
| `src/shared/components/import/import-primary-cta.ts` | A | import-ux | bajo | CTA primario canon. |
| `src/domains/content/components/FileUploadZone.tsx` | M | import-ux | medio | 409 líneas. |
| `src/domains/content/components/WebImportPanel.tsx` | M | import-ux | bajo | 220 líneas. |
| `src/domains/content/components/DocumentsPanel.tsx` | M | **mixed** | bajo | Revisar si parte va con docs/lifecycle. |
| `src/domains/content/components/BackgroundScrapeJobs.tsx` | M | import-ux | bajo | Lane import. |
| `src/domains/content/components/EnrichmentProgressIndicator.tsx` | M | **mixed** | bajo | Probable lane import; verificar. |
| `src/components/OneDrivePhotosPanel.tsx` | M | import-ux | bajo | OneDrive panel. |
| `src/components/OneDrivePhotoHistoryPanel.tsx` | A | import-ux | bajo | History panel (184 líneas). |
| `src/domains/content/hooks/use-database-sync.ts` | M | **mixed → import-ux** | medio | Probable sync tras import; revisar que no incluya boot. |
| `src/shared/progress/EnrichmentLane.tsx` | M | import-ux | bajo | Lane render. |
| `docs/contracts/import-canon.md` | A | governance-versioning | bajo | Doc canon — viaja con bloque 7 o con import. |
| `mem/logic/import/import-canon.md` | A | governance-versioning | bajo | idem. |
| `docs/audits/import-discovery.md` | A | governance-versioning | bajo | Audit. |
| `docs/audits/import-ux-operability.md` | A | governance-versioning | bajo | Audit. |

### 6. E2E / domain tests (bloque 6 — prioridad 6, riesgo BAJO)

Tests + ajustes al runner. Llegan tras los bloques que validan.

| archivo | estado | bloque | riesgo | notas |
|---|---|---|---|---|
| `.github/workflows/e2e.yml` | M | e2e-domain-tests | bajo | Runner Playwright. |
| `e2e/import-row2-below-row1.spec.ts` | A | e2e-domain-tests | bajo | Validación visual import hub. |
| `src/test/import-hub-ux.test.tsx` | A | e2e-domain-tests | bajo | Asociado a bloque 5 (import); puede moverse a bloque 5 si se prefiere atomicidad por dominio. |
| `src/test/maintain-footer-primary-resolve.test.ts` | A | e2e-domain-tests | bajo | Asociado a discovery maintain footer. |
| `src/test/pr-export-3-resolver-ux.test.ts` | A | e2e-domain-tests | bajo | **Recomendado ir con bloque 4 (export)** para mantener PR atómico. |
| `src/test/pr-export-4-internal-semantics.test.ts` | A | e2e-domain-tests | bajo | idem. |
| `src/test/pr-export-5-content-model.test.ts` | A | e2e-domain-tests | bajo | idem. |
| `src/test/pr-export-6-gurumaps-renderer.test.ts` | A | e2e-domain-tests | bajo | idem. |
| `src/test/poi-export-contract.test.ts` | M | e2e-domain-tests | bajo | idem (export). |
| `src/test/poi-export-pr2-ux.test.ts` | M | e2e-domain-tests | bajo | idem (export). |
| `src/test/fixtures/poi-mazinger-z-export.ts` | A | e2e-domain-tests | bajo | Fixture export. |
| `src/test/fixtures/poi-torre-hercules-export.ts` | A | e2e-domain-tests | bajo | Fixture export. |
| `src/test/version-parity.test.ts` | A | governance-versioning | bajo | Parity test del bump — **debe ir con bloque 7**. |

Política recomendada: **los tests viajan con el bloque funcional que los
hace verdes** (export tests → bloque 4; import-hub-ux → bloque 5;
maintain-footer → bloque correspondiente cuando se aborde). El bloque 6
queda como residual para tests/E2E que no pertenecen a ningún bloque
funcional anterior (hoy: `import-row2-below-row1.spec.ts` y el ajuste
`e2e.yml`).

### 7. Governance / versioning (bloque 7 — prioridad 7, riesgo BAJO)

Va al final, recoge docs y bump.

| archivo | estado | bloque | riesgo | notas |
|---|---|---|---|---|
| `docs/governance/engineering-discipline.md` | A | governance-versioning | bajo | NASA-grade canon. |
| `docs/versioning.md` | M | governance-versioning | bajo | Política versionado. |
| `docs/releases/version-history.md` | M | governance-versioning | bajo | Histórico releases. |
| `scripts/release/bump-version.ts` | A | governance-versioning | bajo | Script bump atómico canon. |
| `src/lib/app-version.ts` | M | governance-versioning | bajo | **NO traer el valor `1.6.2`** — bump se hace por bloque (`1.4.5`, `1.4.6`, …). |
| `src/lib/version.ts` | M | governance-versioning | bajo | Metadata legacy; re-export del SoT. |
| `package.json` | M | governance-versioning | bajo | Bump por bloque, no 1.6.2. |
| `src/test/version-parity.test.ts` | A | governance-versioning | bajo | Parity gate. |
| `src/integrations/supabase/types.ts` | M | governance-versioning | bajo | Auto-regenerado tras migrations security; viajará con bloque 2 en la práctica (Lovable lo regenera). |
| `docs/audits/boot-performance-discovery.md` | A | governance-versioning | bajo | Audit boot. |
| `docs/audits/boot-performance-measure-1.md` | A | governance-versioning | bajo | idem. |
| `docs/audits/boot-performance-after-pr1.md` | A | governance-versioning | bajo | idem. |
| `docs/audits/boot-performance-after-pr2.md` | A | governance-versioning | bajo | idem. |
| `docs/audits/lovable-github-process-discovery.md` | A | governance-versioning | bajo | Meta. |
| `docs/audits/sync-recovery-status.md` | A | governance-versioning | bajo | Audit. |
| `docs/audits/pr-sync-split-1-plan.md` | A | governance-versioning | bajo | Plan. |
| `docs/contracts/poi-identity-root-status-contract.md` | M | governance-versioning | bajo | Doc canon — pareja de migration identity (ver "mixed/descartar"). |
| `mem/logic/boot/boot-gate-contract.md` | A | governance-versioning | bajo | Memoria canon boot. |
| `README.md` | M | governance-versioning | bajo | Refleja versión + features. |
| `docs/_archive/README.md` | A | governance-versioning | bajo | Marker de archivo. |
| `docs/_archive/VANDITS-v2.0-DOCUMENTATION.md` | R100 | governance-versioning | bajo | Solo rename a `_archive/`. |

### 8. Mixed / requiere split manual (consolidado)

| archivo | bloques en disputa | split propuesto |
|---|---|---|
| `src/App.tsx` | boot-perf / cualquier UI top-level | Aceptar SOLO los hunks de `boot-gate` + `AuthedErrorBoundary`; resto descartar o reabrir en su bloque. |
| `src/pages/Index.tsx` | boot-perf / discovery / filters | Split manual al abrir bloque 3; aceptar solo hunks boot. Lo demás → descartar o futuro bloque discovery. |
| `src/domains/content/components/DocumentsPanel.tsx` | import-ux / lifecycle docs | Por defecto → import-ux (bloque 5). Si el diff tiene hunks lifecycle no relacionados, descartarlos. |
| `src/domains/content/components/EnrichmentProgressIndicator.tsx` | import-ux / enrichment lanes | Por defecto → import-ux. |
| `src/domains/content/hooks/use-database-sync.ts` | import-ux / boot-perf | Inspeccionar; preferente import-ux, descartar cualquier hunk boot que ya esté cubierto por bloque 3. |
| `src/components/filters/DebtSelectionStatusBar.tsx` | export / discovery | Por defecto → export (bloque 4) si los hunks tocan scope/selection del resolver; en otro caso descartar. |
| `src/components/filters/EffectiveActionFooter.tsx` | export / discovery | idem. |
| `src/components/filters/footer-label.ts` | export / discovery | idem. |

### 9. Descartar (no migrar)

| archivo | razón |
|---|---|
| `.github/workflows/unit.yml` | Workflow duplicado; `ci.yml` ya corre vitest como diagnóstico. |
| `.lovable/plan.md` | Plan local sandbox; no aporta a producto. |
| `index.html` | Solo si el diff es exclusivamente del título/metadata sandbox (verificar al abrir el bloque governance: si trae cambios SEO útiles, mover a bloque 7; si no, descartar). |
| `src/components/FilterBar.tsx` (242 líneas) | **No clasificable hoy** — toca discovery; sin bloque de destino en este plan. **Descartar de la migración actual**; reabrir en un futuro `pr/discovery-N` fuera del alcance MIGRATION-SANDBOX-TO-PROD-1. |
| `src/components/FloatingToolbar.tsx` | Mismo motivo; **descartar** del scope actual. |
| `src/components/LocationMap.tsx` | Discovery/map; **descartar** del scope actual. |
| `src/components/discovery/RootStatusChipRow.tsx` | Discovery; **descartar** del scope actual. |
| `src/domains/content/lib/collection-visibility.ts` | Sin bloque de destino; **descartar** salvo que un bloque posterior lo requiera. |
| `src/domains/content/lib/resolve-universe-base.ts` | idem; **descartar**. |
| `supabase/migrations/20260524194213_*.sql` (identity-root-persist) | **Decidir en revisión**: si se quiere aceptar canon identity → abrir bloque adicional `pr/identity-root-1` FUERA del scope actual. Por defecto: **descartar** del scope MIGRATION-SANDBOX-TO-PROD-1. |
| `docs/contracts/poi-identity-root-status-contract.md` | Idem; viaja con su migration cuando se decida. |

## Resumen por bloque (orden de ejecución)

| # | bloque | nº archivos | riesgo agregado | dependencias |
|---|---|---|---|---|
| 1 | ci-infra | (cerrado) | — | — |
| 2 | security-edge-auth | 13 (11 fn + 2 SQL) | alto | ninguna |
| 3 | boot-perf | 10 | medio | tras 2 (revisión limpia) |
| 4 | export | 14 + 7 tests + 2 fixtures + 5 docs | medio | tras 3 |
| 5 | import-ux | 13 + 1 test + 4 docs | medio | tras 4 |
| 6 | e2e-domain-tests (residual) | 2 (`e2e.yml` + `import-row2-below-row1.spec.ts`) | bajo | tras 5 |
| 7 | governance-versioning + bump consolidado | 14 docs + parity test + bump script + APP_VERSION + package.json + README | bajo | tras 6 |

## Reglas de cierre Fase 1

1. Este documento queda como **artefacto de Fase 1**.
2. Aprobación necesaria antes de arrancar bloque 2 (security-edge-auth).
3. Cualquier reclasificación posterior se anota en este mismo archivo con
   fecha y razón.
4. Los archivos marcados `descartar` NO entran sin reabrir el plan
   explícitamente.
5. Bump version se hará por bloque (`1.4.5`, `1.4.6`, …), nunca como salto a
   `1.6.2`.

## Próximo paso (pendiente de tu OK)

Abrir `pr/security-edge-auth-1` desde `main`, partiendo SOLO de los 13
archivos del bloque 2, con contract test mínimo (auth 401 sin JWT) y CI
verde antes de mergear.
