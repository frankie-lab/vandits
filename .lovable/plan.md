
## Problema

Hoy hay 4 modos de normalización en el panel:

- **Reparar** → solo puntos con cadena admin rota (`broken`).
- **Rellenar** → solo puntos con FKs incompletos (`empty` + `partial`).
- **Reconciliar** → recorre TODO el universo válido, pero solo escribe si Nominatim devuelve algo distinto.
- **Reescribir todo** → recorre TODO el universo válido y escribe siempre, aunque ya coincida.

Tienes razón: **Reconciliar y Reescribir procesan exactamente los mismos puntos** (mismo SELECT, mismo recorrido, mismo coste de Nominatim). La única diferencia está en el `UPDATE` final:

- Reconciliar: salta el update si los 7 FKs ya coinciden.
- Reescribir: hace el update siempre (refresca `raw_geocode`, `geo_resolved_at`, `geo_confidence`).

Para el usuario son indistinguibles en intención ("revisar todo lo ya normalizado"). Tener dos tarjetas separadas:

- Confunde (¿cuál elijo?).
- Duplica contadores idénticos.
- El 99% de los casos se resuelve con Reconciliar; Reescribir solo aporta valor tras renombrar/fusionar `admin_areas`.

## Propuesta

Reducir a **3 modos** + un **toggle secundario**:

```text
Paso 1 — Modo de normalización
┌──────────────────┬──────────────────┬──────────────────┐
│  Reparar         │  Rellenar        │  Revisar         │
│  N puntos        │  N puntos        │  N puntos        │
│  cadena rota     │  FKs incompletos │  todo el universo│
└──────────────────┴──────────────────┴──────────────────┘

Solo cuando "Revisar" está activo:
  ☐ Forzar reescritura (refresca aunque ya coincida)
     Útil tras renombrar o fusionar áreas administrativas.
```

### Mapeo interno

| Modo UI | `mode` enviado al backend | `force` |
|---|---|---|
| Reparar | `repair` | — |
| Rellenar | `fill` | — |
| Revisar (toggle off) | `reconcile` | false |
| Revisar (toggle on) | `overwrite` | true |

El backend sigue soportando los 4 valores; no hay migración de datos ni cambio de contrato. Solo cambia la UI y cómo el panel construye el payload.

## Cambios

### 1. `src/components/admin/GeographyBackfillPanel.tsx`

- Reducir `MODES` de 4 a 3: `repair`, `fill`, `review`.
- `review` mapea a `reconcile` por defecto y a `overwrite` cuando el toggle "Forzar reescritura" está activo.
- Añadir un `Switch` (shadcn) que solo aparece cuando `selectedMode === 'review'`, con label "Forzar reescritura" y subtítulo explicativo.
- En `modeToHealthFilter`: `review` → mismo filtro que hoy tiene `reconcile`/`overwrite` (los 5 estados de salud).
- Al lanzar el job: `mode: forceOverwrite ? 'overwrite' : 'reconcile'`.

### 2. Sin cambios en backend

`backfill-admin-fks` y `geocoding-job-tick` ya aceptan los 4 valores. No tocamos edge functions ni migraciones.

### 3. Sin cambios en memoria/ADR

La regla "lifecycle por canal" no se ve afectada.

## Resultado esperado

- 3 tarjetas claras en lugar de 4, con contadores que ya no se duplican.
- El caso raro (forzar refresco tras cambiar el catálogo de áreas) sigue accesible vía toggle, sin ocupar el espacio principal.
- Cero riesgo: el backend no cambia.
