# T2A-wire-regional-exceptions — Edge Plan

**Estado:** Plan. No ejecutado.
**Cierra:** §5.2 (edge enforcement) del roadmap territorial → desbloquea criterio global 3/6.
**Tipo:** Wire edge (Deno) + espejo cliente (`resolveAllFks`) + tests.
**Bump al ejecutar:** patch (1.3.17).
**Referencias:**
- `docs/audits/t2a-wire-regional-exceptions-edge-ticket.md`
- `docs/audits/territorial-canon-global-status-and-roadmap.md`
- `docs/contracts/territorial-equivalence-canon.md` §1.b
- `supabase/functions/_shared/territorial-canon.ts` (`regionsWithoutProvincia`)
- `src/shared/geography/territorial-canon.ts` (espejo cliente)

---

## 1. Objetivo

Hacer que `resolve-admin-area` (edge) y `resolveAllFks` (cliente) descarten
`zone_id` / `zone` cuando la región resuelta pertenece a
`canon.regionsWithoutProvincia` (PT-20 Açores, PT-30 Madeira hoy), sin
hardcoding de ISOs fuera del canon y manteniendo Portugal continental con
Distrito intacto.

---

## 2. Diseño

### 2.1 Cómo `resolve-admin-area` obtiene `region_iso_code`

Hoy el bucle de niveles ya hace `SELECT id, parent_id, type_id, iso_code` en
varios `admin_areas`. Cambios mínimos:

1. **Al resolver el nivel `region`**, capturar `iso_code` de la fila ganadora
   en una variable local `regionIsoCode: string | null`. Fuentes (en orden):
   - rama `2a` (match directo por `iso_code`) — ya disponible.
   - rama `2b/2c/3a/3b` (match por nombre/alias/cross-level) — extender
     `SELECT` a incluir `iso_code` y leerlo de `hit.iso_code`.
   - rama `4` (insert nuevo) — `iso_code` no se conoce ⇒ `null`.
2. No se añade ninguna consulta extra: se aprovecha el SELECT existente del
   bucle. Coste: 0 round-trips.

### 2.2 Respuesta del resolver

Extender el payload:

```jsonc
{
  "ids": { "...": "..." },
  "meta": {
    "region_iso_code": "PT-20" | null,
    "canon": {
      "iso2": "PT",
      "regionForbidsProvincia": true
    }
  }
}
```

Compatibilidad: callers que ignoren `meta` siguen funcionando. `ids` se
sanitiza igualmente server-side (defensa primaria), `meta` es informativo
para cliente, tests y telemetría.

### 2.3 Veto server-side dentro de `resolve-admin-area`

Tras el bloque `shouldDropZone(body.zone, body.region)` (línea ~283):

```ts
// T2A-wire §1.b — Excepción regional (regionsWithoutProvincia).
const iso2 = canonicalIso2FromIds(ids);            // helper: lee country.iso_code resuelto
const canon = getCountryCanon(iso2);
const forbids = !!regionIsoCode &&
                regionHasNoProvincia(iso2, regionIsoCode);
if (forbids) {
  ids['zone_id'] = null;
  // El texto `zone` no se persiste aquí (solo IDs); el cliente lo descarta vía applyCanonToParsed.
  console.warn('[resolve-admin-area] canon-region-zone-forbidden', {
    iso2, regionIsoCode, droppedZoneId: true,
  });
}
```

- `getCountryCanon` y `regionHasNoProvincia` ya existen en
  `supabase/functions/_shared/territorial-canon.ts` — no se duplica lógica.
- Sin hardcode de PT-20/PT-30: viene del canon Deno, paritario con TS.

### 2.4 Espejo cliente `resolveAllFks`

En `applyCanonToResolvedFks` (hook TODO actual), reemplazar el TODO por:

```ts
// El cliente recibe `meta.region_iso_code` del edge.
if (meta?.region_iso_code && regionHasNoProvincia(canon.iso2, meta.region_iso_code) && out.zone_id) {
  out.zone_id = null;
  emitCanonWarning('canon-region-zone-forbidden', { iso2: canon.iso2, regionIsoCode: meta.region_iso_code });
}
```

Cambio en `resolveAdminFks`: pasar `data?.meta` a `applyCanonToResolvedFks`.
Sin lookup adicional a `admin_areas` desde cliente — la verdad llega del edge.

### 2.5 Warning / review log

- **Edge:** `console.warn('[resolve-admin-area] canon-region-zone-forbidden', …)` —
  recogido por `edge_function_logs` y consultable vía telemetría §4.3.
- **Cliente:** mismo código de evento `canon-region-zone-forbidden`, emitido vía
  el bus de warnings ya usado por `applyCanonToParsed` (helper existente).
- Mismo string ⇒ una sola métrica agregable para §5.6.

### 2.6 Portugal continental

Garantizado por construcción: `regionHasNoProvincia('PT', 'PT-11' /* Norte */)` ⇒ `false`.
El veto sólo dispara con `PT-20` / `PT-30`. No se toca Distrito.

### 2.7 Evitar hardcode de PT-20/PT-30 fuera del canon

- Veto edge consume `regionHasNoProvincia` (helper canon).
- Veto cliente idem.
- Lint `territorial-canon-no-hardcode` cubre `FORBIDDEN_REGION_ISO`
  (`PT-20|PT-30`) y `FORBIDDEN_REGION_NAMES` (`Açores|Madeira`).
- Tests nuevos NO importan literales — usan fixtures con iso_code resuelto.

---

## 3. Tests

### 3.1 Deno (`supabase/functions/resolve-admin-area/index.test.ts`)

1. `pt-20-acores-drops-zone-server-side`
   Body: `{ country: 'Portugal', region: 'Açores', zone: 'Ilha Terceira' }`
   Fixture admin_areas: PT region con `iso_code='PT-20'`.
   Espera: `ids.zone_id === null`, `meta.region_iso_code === 'PT-20'`,
   `meta.canon.regionForbidsProvincia === true`, warn emitido.
2. `pt-30-madeira-drops-zone-server-side` — idem PT-30.
3. `pt-continental-preserves-distrito`
   Body: `{ country: 'Portugal', region: 'Norte', zone: 'Porto' }`
   Fixture: region iso `PT-11`.
   Espera: `ids.zone_id !== null`, `meta.canon.regionForbidsProvincia === false`.
4. `unknown-iso-no-break`
   Region resuelta sin `iso_code` (insert nuevo).
   Espera: passthrough; `ids` no se modifica; sin warn.

### 3.2 Vitest cliente (`src/test/resolve-admin-fks-canon-edge.test.ts`)

1. `applyCanonToResolvedFks-drops-zone-when-meta-region-iso-is-forbidden`
   Mock `supabase.functions.invoke` ⇒ `{ ids: {zone_id:'x', region_id:'r'}, meta:{ region_iso_code:'PT-20' } }`.
   Espera: `zone_id === null`.
2. `applyCanonToResolvedFks-preserves-zone-for-pt-continental` — meta `PT-11`.
3. `passthrough-when-meta-absent` — back-compat.

### 3.3 Paridad y anti-hardcode (ya existentes — deben seguir verdes)

- `src/test/territorial-canon-parity.test.ts`
- `src/test/territorial-canon-no-hardcode.test.ts`
  (PT-20/PT-30 sólo en canon TS+Deno y en docs `audits/` / `contracts/`).

---

## 4. Plan de ejecución (cuando se autorice)

1. Edge: extender SELECTs para capturar `region.iso_code`; añadir bloque veto + `meta` en respuesta.
2. Cliente: pasar `meta` a `applyCanonToResolvedFks`; reemplazar TODO por veto real.
3. Añadir 4 tests Deno + 3 tests vitest.
4. Verificar paridad + anti-hardcode + parity-test.
5. Bump patch 1.3.16 → 1.3.17 en `package.json`, `src/lib/app-version.ts`, `docs/releases/version-history.md`, README si aplica.
6. Actualizar `docs/audits/territorial-canon-global-status-and-roadmap.md`:
   - §5.2 ✅ (edge enforcement).
   - §5.3 ✅ (rechazos server-side).
   - Cierre global 2/6 → 4/6.
7. Cerrar `t2a-wire-regional-exceptions-edge-ticket.md` con referencia al PR.

---

## 5. Restricciones (recordatorio)

- No tocar datos históricos.
- No Nominatim.
- No re-enrich.
- No migraciones SQL (el lookup ya existe en el bucle).
- No tickets residuales (Santa Cruz, Bolhão, Braga Parque, exploratorios §4.4).
- Patch bump sólo al ejecutar.

---

## 6. Riesgos

- `resolve-admin-area` es ruta crítica de import: exigir Deno tests + vitest verdes antes de deploy.
- Cambio de payload (`meta`) es aditivo, pero validar que callers existentes (`backfill-admin-fks`, `batch-enrich`) no asuman shape estricta.
- Si una región PT-20/PT-30 fue insertada sin `iso_code` canónico (rama 4),
  el veto NO dispara para esa fila huérfana ⇒ acción documentada como
  data-fix histórico aparte (`t-data-fix-admin-areas-pt-iso`), fuera de alcance.

---

## 7. Criterio de éxito

- Un POI PT-20/PT-30 creado vía edge nunca persiste `zone_id` no-NULL,
  aunque el caller pase `zone` poblado.
- Cliente y edge consistentes: misma fuente (`regionsWithoutProvincia`),
  mismo código de warning (`canon-region-zone-forbidden`).
- Tests TS/Deno verdes. Paridad y anti-hardcode verdes.
- Roadmap: criterios §5.2 y §5.3 cerrados, global 4/6.

---

## 8. Rollback

- Revertir el PR de runtime (edge `resolve-admin-area/index.ts` + cliente
  `resolve-admin-fks.ts`) — un solo commit, dos archivos de runtime.
- Volver de 1.3.17 a 1.3.16 (`package.json`, `src/lib/app-version.ts`,
  `docs/releases/version-history.md`) si fuera necesario.
- Confirmar que el cambio es **aditivo en payload** (`meta` opcional) y que
  callers existentes no se rompen al revertir.
- **No hay rollback de datos** porque este PR no toca datos históricos
  (`locations`, `admin_areas`, `enriched_data` intactos). El veto sólo afecta
  el output de FK resolver para POIs nuevos en curso de import.
- Mecanismo recomendado: revert vía History de Lovable; tests Deno+Vitest
  revertidos a su estado v1.3.16.
