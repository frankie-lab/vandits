---
name: POI export canon (DISCOVERY-1)
description: Diagnóstico + propuesta UX Export Resolver. No redefine helpers. Backlog PR-EXPORT-3..11.
type: reference
---

# POI export canon (PR-EXPORT-DISCOVERY-1)

Documento canon vivo: `docs/contracts/poi-export-canon.md`.

Consume sin duplicar:
- PR-EXPORT-1 (`poi-export-contract.md`) — eligibility + scope.
- PR-EXPORT-2 (`pr-export-2-poi-export-canon.md`) — DTO + pipeline + tamaño.
- PR-SHARE-1 (`share-vs-export-contract.md`) — share ≠ export.

Reglas duras añadidas:
- Export NUNCA usa typed-token (`DestructiveConfirmDialog`). CTA = "Generar archivo".
- Copy siempre incluye propiedad: "son tuyas, esto es una copia".
- `ExportPanel` y `SelectionActions` se unifican en `<ExportResolver source=…>` (PR-EXPORT-4).
- **PR-EXPORT-4 — internal ≠ public en UX/contadores**: el ExportResolver lee `scope` y aplica `SCOPE_COPY` distinto. En `internal` ("Mis datos") las únicas exclusiones legítimas son `not-owner` y `invalid-coordinates`; se muestran en filas separadas ("N pertenecen a otras personas" + "No exportables por error técnico"). Prohibido renderizar "No incluidos" plano ni el desglose público (`not-enriched`, `not-shareable`, etc.) cuando scope=internal. En `public` ("Compartible") se mantiene el desglose completo por razón con `REASON_HUMAN_PUBLIC`. Contadores derivados: `foreignCount` + `technicalCount` (internal) vs `excludedCount` agrupado por razón (public). Helpers de elegibilidad (`evaluatePoiExport`/`partitionForExport`) sin cambios. Contract test: `src/test/pr-export-4-internal-semantics.test.ts`.
- Backlog: PR-EXPORT-3 UX, 4 unify+semántica, 5 opciones, 6 history, 7 GPX, 8 trocear, 9 job, 10 paquete Vandits, 11 colecciones `/c/{id}`.

Pipeline canónico intacto:
`GeoLocation[] → partitionForExport → evaluatePoiExportSize → mapToPoiExportRecords → POI_EXPORTERS[format] → Blob → download → recordExport`.
