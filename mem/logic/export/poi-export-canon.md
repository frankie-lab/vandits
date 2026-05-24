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
- Backlog: PR-EXPORT-3 UX, 4 unify, 5 opciones, 6 history, 7 GPX, 8 trocear, 9 job, 10 paquete Vandits, 11 colecciones `/c/{id}`.

Pipeline canónico intacto:
`GeoLocation[] → partitionForExport → evaluatePoiExportSize → mapToPoiExportRecords → POI_EXPORTERS[format] → Blob → download → recordExport`.
