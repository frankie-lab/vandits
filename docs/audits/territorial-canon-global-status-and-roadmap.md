# Territorial Canon — Estado Global y Roadmap

**Versión de referencia:** v1.3.16
**Fecha de congelación:** 2026-05-21
**Owner:** Geography / Canon territorial
**Propósito:** Congelar el estado global del canon territorial para evitar parches aislados por país o región. Todo fix futuro debe declarar explícitamente si pertenece al **canon global** (wire transversal) o a **data-fix histórico** (limpieza puntual), y nunca mezclarlos.

---

## 1. Principios canónicos (invariantes)

1. **Single Source of Truth:** `TERRITORIAL_CANON` (`src/shared/geography/territorial-canon.ts` + espejo Deno en `supabase/functions/_shared/territorial-canon.ts`). Paridad obligatoria (`territorial-canon-parity.test.ts`).
2. **Data-driven:** ninguna decisión territorial puede vivir hardcodeada en componentes/UI. Loop anti-hardcode activo (`territorial-canon-no-hardcode.test.ts`) incluye `FORBIDDEN_REGION_ISO` y `FORBIDDEN_REGION_NAMES`.
3. **Jerarquía universal:** `country → region → zone (provincia/distrito) → admin3 (comarca) → locality → poi`. Niveles ausentes se colapsan, nunca se rellenan con placeholders.
4. **Excepciones data-driven:** vía `regionsWithoutProvincia` / `zonePolicyByRegion` por país, no por componente.
5. **Resolver único de FKs:** `resolveAllFks()` en `src/shared/geography/resolve-admin-fks.ts`. Toda escritura pasa por aquí.
6. **Vista resuelta única:** cliente lee `v_locations_resolved` (expone `region_iso_code` desde v1.3.16).

---

## 2. Qué está cerrado transversalmente

### 2.1 Wire / canon
- ✅ `CountryCanon` extendido con `regionsWithoutProvincia` y helper `regionHasNoProvincia(iso2, regionIsoCode)`.
- ✅ `getLocationHierarchy` respeta excepciones regionales y bloquea fallbacks legacy a `enriched_data.admin_nivel_2`.
- ✅ `GeographyTree` colapsa nivel zone vía `collapseZoneForRegionsWithoutProvincia` usando `regionIsoIndex`.
- ✅ `applyCanonToParsed` descarta `zone/zoneId` para regiones en excepción y emite warning `canon-region-zone-forbidden`.
- ✅ `db-transformers` mapea `region_iso_code`.
- ✅ Paridad TS/Deno verificada.
- ✅ Loop anti-hardcode protege contra reintroducir `PT-20`, `PT-30`, `Açores`, `Azores`, `Madeira` en componentes.

### 2.2 Vista SQL
- ✅ `v_locations_resolved` expone `region_iso_code` (derivado de `admin_areas.iso_code` del `region_id`). Migración aplicada en v1.3.16.

### 2.3 Tests transversales
- ✅ `territorial-canon-regional-exceptions`
- ✅ `territorial-canon-wire-hierarchy-pt-insular`
- ✅ `territorial-canon-wire-imports-pt-insular`
- ✅ `territorial-canon-wire-geography-tree-pt-insular`
- ✅ `territorial-canon-parity`
- ✅ `territorial-canon-no-hardcode`

### 2.4 Documentación canon
- ✅ `docs/contracts/territorial-equivalence-canon.md` §11b "Excepciones regionales".
- ✅ `docs/tech-debt.md` actualizado.
- ✅ `docs/releases/version-history.md` v1.3.16.

---

## 3. Data-fixes históricos aplicados

| Fix | Alcance | Estado | Notas |
|---|---|---|---|
| P2 Portugal — concelhos RA (Açores/Madeira) | 40 POIs con `zone_id=NULL`, region asignada PT-20/PT-30 | ✅ aplicado pre-v1.3.16 | Datos correctos; bug visual residual resuelto por T2A-wire |
| Norte Oporto re-attach | POIs Oporto bajo "(sin región)" → Norte | ✅ aplicado | Confirmado en validación visual v1.3.16 |

**Nota:** los data-fixes históricos NO modifican el canon; sólo limpian datos heredados. Cualquier nuevo data-fix debe documentarse en `docs/audits/` con prefijo `t-data-fix-*` y referenciar el canon que lo justifica.

---

## 4. Qué queda pendiente

### 4.1 Wire / código (canon global)
- ⏳ **Edge enforcement** de `regionsWithoutProvincia` en `resolveAllFks` (hoy: hook + TODO). Ticket: `docs/audits/t2a-wire-regional-exceptions-edge-ticket.md`.
- ⏳ **Server-side discard** en edge function `resolve-admin-area` para descartar `zone_id` cuando la región pertenece a `regionsWithoutProvincia`.

### 4.2 Data-fixes históricos pendientes
- ⏳ **Santa Cruz da Graciosa** — quedó fuera de P2, requiere remapeo si cumple regla PT-20. Ticket: `T2.3-P2-residual-data`.
- ⏳ **Bolhão** — deuda L1-PT-pre / coords. Ticket: `T2.3-L1-PT-coords`.
- ⏳ **Braga Parque** — deuda L1-PT-pre / coords. Ticket: `T2.3-L1-PT-coords`.
- ⏳ **2 POIs PT bajo "(sin región)"** — bbox-only, diferido a `T2.3-L1-PT-coords`.

### 4.3 Observabilidad
- ⏳ Métrica de warnings `canon-region-zone-forbidden` en pipeline de import (telemetría agregada).
- ⏳ Panel admin de cobertura territorial por país (Geo Maintenance).

Este bloque alimenta directamente el criterio §5.6: telemetría ≥7 días sin spikes.

### 4.4 Exploratorio / sujeto a auditoría
- ❔ **Ampliación de excepciones regionales** a ES Canarias/Baleares, FR DOM-TOM, IT Sicilia/Sardegna y análogos.

No son TODOs comprometidos. Sólo se promoverán a canon global si una auditoría territorial demuestra que requieren excepción regional. Prohibido hardcodear preventivamente.

---

## 5. Criterio de cierre global

El canon territorial se considera **globalmente cerrado** cuando se cumplen TODAS las condiciones:

1. ✅ Wire cliente respeta excepciones regionales (v1.3.16).
2. ⏳ Wire servidor (`resolveAllFks` + `resolve-admin-area` edge) respeta excepciones regionales — **sin TODOs**.
3. ⏳ Cualquier escritura nueva en `locations` con región en `regionsWithoutProvincia` y `zone_id != NULL` es rechazada o silenciosamente normalizada en el servidor.
4. ⏳ Data-fixes históricos residuales (Santa Cruz, Bolhão, Braga Parque, bbox-only) cerrados o explícitamente diferidos con ticket vigente.
5. ✅ Tests transversales (paridad TS/Deno + anti-hardcode + excepciones regionales) verdes en CI.
6. ⏳ Telemetría de warnings activa en producción durante ≥7 días sin spikes inexplicados.

**Estado actual:** 2/6 cerrado. Bloqueante principal: edge enforcement (punto 2).

---

## 6. Regla de oro para fixes futuros

> **Todo fix territorial futuro DEBE declarar en su ticket si es:**
>
> - **(A) Canon global / wire** — toca `TERRITORIAL_CANON`, hierarchy, tree, resolver, vista SQL, o tests transversales. Requiere paridad TS/Deno, tests anti-hardcode, y actualización de `territorial-equivalence-canon.md`.
>
> - **(B) Data-fix histórico** — toca filas concretas de `locations` / `admin_areas` / `enriched_data`. Requiere ticket con prefijo `t-data-fix-*`, justificación contra canon vigente, y NO puede introducir lógica nueva en componentes.

**Prohibido:**
- Mezclar (A) y (B) en el mismo PR.
- Hardcodear nombres de región/país/ISO en componentes para "arreglar" un caso visual.
- Introducir excepciones regionales sin actualizar `CountryCanon` Y su espejo Deno Y los tests de paridad/anti-hardcode.
- Cerrar un ticket de canon global si deja TODOs server-side sin ticket de seguimiento explícito.

---

## 7. Referencias

- `docs/contracts/territorial-equivalence-canon.md`
- `docs/audits/t-catalog-pt-ra-concelhos-p2-visual-regression-audit.md`
- `docs/audits/t2a-wire-regional-exceptions-ticket.md`
- `docs/audits/t2a-wire-regional-exceptions-edge-ticket.md`
- `docs/audits/t2a-wire-regional-exceptions-visual-validation.md`
- `docs/audits/t2-3-p2-residual-data-ticket.md`
- `docs/tech-debt.md`
- `docs/releases/version-history.md`

---

**No tocar datos. No tocar código. No bump.** Este documento es congelación de estado y contrato de gobernanza.
