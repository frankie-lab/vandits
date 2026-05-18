---
name: RBAC canon (PR-ADMIN-AUDIT-3)
description: Canon de autorización (has_permission), catálogo de roles activos, estado de purga del enum DB y reglas duras anti-regresión.
type: feature
---

# RBAC Canon — PR-ADMIN-AUDIT-3

## Source of Truth
- **Autorización runtime**: `public.has_permission(uid, app_permission)`.
- **Espejos**: `useCapability` (cliente) + `requireCapability` (edge).
- **Único role-check legítimo**: `has_role(uid, 'master')` (bypass master en RLS / `has_permission`).
- **PROHIBIDO**: introducir nuevos gates por rol (`has_role(uid, 'admin'|'editor'|...)`) en código nuevo. Toda decisión nueva debe consultar capability.

## Catálogo de roles
- **Activos (canon UI/lógica)**: `master`, `admin`, `moderator`, `editor`.
- **En revisión (Fase C, separada)**: `supervisor`.
- **Purgados del catálogo activo en Fase A**: `curator`, `user` (UI types, hooks, edge functions, función DB `is_curator`).

## Estado del enum `public.app_role` (DB)
Valores físicos actuales en `pg_enum`: `master, admin, moderator, editor, supervisor, curator, user` (7).

**Fase B (purga destructiva del enum) — CERRADA como deuda aceptada (BL-021)**:
- Intento 2026-05-18: `DROP FUNCTION has_role(uuid, app_role)` falla por dependencia estructural de 44 policies + view `v_geo_coverage`.
- `curator`/`user` permanecen como valores **inertes**: 0 usuarios asignados, 0 capabilities, 0 uso activo en policies/funciones.
- Frontend + edge ya purgados (Fase A) ⇒ no se pueden asignar ni invocar.
- Purga real sólo en ventana de mantenimiento dedicada, con tooling automático de dump/recreate de las 44 policies — nunca a mano.

## Reglas duras
- `manage_permissions` es capability **master-only** (bloquea auto-promoción admin→master).
- Master bypass en RLS y en `has_permission` se mantiene intacto.
- Branches `isCurator` en `src/components/map/map-popups.ts` (BL-022) son deuda no bloqueante, no dependen del enum; decisión vive en canon P-POPUP / P-POI-CURATION, no en RBAC.
- Migraciones históricas que mencionan `'curator'`/`'user'` son inmutables por política.

## Referencias
- Backlog: `docs/audits/backlog.md` (BL-021 accepted-debt, BL-022 open).
- Memoria índice: entry "RBAC canon (PR-ADMIN-AUDIT-3)" en `mem://index.md`.
