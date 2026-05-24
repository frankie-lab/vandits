# T-CATALOG-PT-DISTRICTS — Phase 1 postflight

**Estado:** ejecutado. **Fecha:** 2026-05-21. **Alcance:** sólo P1.

## Resultado

| métrica | valor |
|---|---:|
| Filas afectadas por UPDATE | **34** |
| `d=2` bajo PT antes (`is_placeholder=false`) | 41 |
| `d=2` bajo PT después (`is_placeholder=false`) | **7** (las 7 CCDR §1.A) |
| `d=2` bajo PT después (`is_placeholder=true`) | 35 (34 nuevos + 1 pre-existente `(sin región)`) |
| Filas en snapshot | 42 (baseline completo d=2 PT) |

## Verificación

```
iso_code |  name
---------+---------
 PT-01   | Norte
 PT-02   | Centro
 PT-03   | Lisboa
 PT-04   | Alentejo
 PT-05   | Algarve
 PT-20   | Açores
 PT-30   | Madeira
```

Las 7 CCDR §1.A son las **únicas** filas `d=2` bajo Portugal con `is_placeholder=false`. Las 34 filas espejo muerto (17 distritos huérfanos + 9 concelhos isla + 8 dups textuales) quedan marcadas como placeholder.

## Garantías cumplidas

- Sin DELETE.
- Sin reparent (`parent_id` intacto).
- Sin recálculo de `path`.
- Sin tocar `locations` (POIs invariantes).
- Sin Nominatim, sin IA, sin re-enrich, sin código, sin bump.
- 7 CCDR §1.A excluidas por lista explícita de UUIDs.
- Cualquier `admin_area` con POIs directos o transitivos (vía `path`) excluido por doble guard `NOT IN`.
- Snapshot completo en tabla dedicada `public._catalog_pt_districts_snapshot_2026_05_21` (RLS: solo master lee).

## Rollback

```sql
UPDATE public.admin_areas a
SET is_placeholder = s.is_placeholder,
    updated_at = s.updated_at
FROM public._catalog_pt_districts_snapshot_2026_05_21 s
WHERE a.id = s.id;
```

Restaura los 34 nodos a `is_placeholder=false` y deja el resto del subárbol PT d=2 idéntico al pre-flight.

## Pendiente (NO ejecutado)

- **P2** Açores/Madeira → `T-CATALOG-PT-RA-CONCELHOS`.
- **P3** drenado placeholder `(sin región)` d=2/d=3 → requiere `T2.3-L1-PT-coords` (Nominatim).
- **P4** fuga FR (`Loir y Cher`, `Indre`, …) → `T-CATALOG-PT-FOREIGN-LEAK`.
- `T2.3-L1-PT-coords`: bloqueado hasta que se ratifique la tabla de alias del dry-run.
- `T2.3-IE`: prerequisito separado, sigue bloqueado.

## Riesgo residual

Consumidores UI que NO filtren `is_placeholder=true` seguirán mostrando los 34 nodos. Out of scope de este postflight; queda anotado como follow-up de auditoría de consumidores de `admin_areas`.
