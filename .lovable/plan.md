## P-POI-CURATION-1 fix — separar estado personal de salud objetiva

### Diagnóstico confirmado
En `getPoiCurationLevel()`, un POI enriquecido + `geoHealth='ok'` + `rings=[]` + `visited=false` cae al fallback `else if (enriched) → POI-5 / heal`. Causa = **A) falta `visited` tratada como deuda**. `visited`/`user_rating` son estado personal del viewer; no degradan la salud del POI.

### Regla canónica corregida

Salud objetiva del POI (independiente del estado personal):
- `enriched + geoHealth='ok' + rings=[]` → POI **sano**, shareability `yes`.
- `enriched + (rings≠[] o geoHealth='partial'/'stale_name'/'empty')` → POI-5 (deuda real), `heal`.
- `enriched + geoHealth='broken'` → POI-3, `resolve-conflict`.
- `!enriched + nombre válido` → POI-1, `validate-geo`.
- `!enriched + sin nombre` → POI-0, `name`.

Capa personal sólo decide entre POI-9 y POI-10 cuando el POI ya es sano:
- sano + `visited=true` + sin rating → POI-9, `rate-experience`.
- sano + `visited=true` + rating>0 → POI-10, `none`.
- **sano + `visited=false` → POI-9 también** (POI sano sin acción de salud; la acción primaria pasa a ser `rate-experience`, que internamente requiere visitar primero — coherente con que "pendiente de visita" no es salud).

> Decisión a confirmar: para sano + no visitado, ¿`primaryAction='rate-experience'` (consistente con POI-9 actual) o `primaryAction='none'` (no mostrar botón hasta que el usuario marque visitado)? Recomiendo **`none`**: el botón "Valorar experiencia" sin haber visitado es confuso, y la fila personal del rating block ya comunica "Pendiente". Así POI-9 queda reservado a visitado-sin-rating.

Propuesta final:
| Caso | Level | Health | Share | primaryAction |
|---|---|---|---|---|
| enriched sano, no visitado | **9** | green | yes | **none** |
| enriched sano, visitado, sin rating | 9 | green | yes | rate-experience |
| enriched sano, visitado, con rating | 10 | green | yes | none |

(POI-9 = "sano, sin valoración final"; el botón sólo aparece cuando hay algo accionable.)

### Cambios

**`src/domains/content/lib/poi-curation-level.ts`**
1. Reescribir el árbol de decisión por **prioridad de salud** primero, personal después:
   ```ts
   if (geo === 'broken') level = 3;
   else if (!enriched && !hasValidatedName(safe)) level = 0;
   else if (!enriched) level = 1;
   else if (rings.length > 0 || (geo !== 'ok')) level = 5;   // deuda objetiva real
   else if (visited && rated) level = 10;
   else level = 9;                                            // sano (visitado o no)
   ```
2. `LEVEL_ACTION[9]` deja de ser fijo. Extraer `resolvePrimaryAction(level, { visited, rated })`:
   - POI-9 + `!visited` → `'none'`
   - POI-9 + `visited && !rated` → `'rate-experience'`
   - resto: tabla actual.
3. Actualizar `PoiCurationVerdict.primaryAction` desde el resolver, no desde `LEVEL_ACTION` directo.

**`src/test/poi-curation-level.test.ts`**
- Eliminar/invertir el caso `'POI-5: enriquecido y geo ok pero NO visitado → incompletitud'` → debe ser POI-9 / green / yes / `none`.
- Añadir casos:
  - enriched + geo ok + rings=[] + no visitado → POI-9, healthState green, primaryAction `none`.
  - enriched + rings activos → POI-5, `heal` (deuda real).
  - enriched + geoHealth='partial' → POI-5, `heal`.
- Mantener POI-9 visitado-sin-rating → `rate-experience` y POI-10 → `none`.

**`src/test/popup-curation-primary-action.test.ts`**
- Añadir guard: enriched sano no visitado **no** emite `data-action="curation-primary"` (igual que POI-10).
- Mantener: POI-5 (rings/partial) sí emite `heal`.

**`docs/contracts/poi-curation-levels.md`**
- Reescribir fila POI-5: "deuda objetiva (rings activos o geoHealth ∈ {partial, stale_name, empty})". Quitar "aún no visitado".
- Reescribir fila POI-9: "enriquecido + sano; sin valoración final (visitado o no)".
- Añadir sección **"Salud objetiva ≠ estado personal"**: `visited`/`user_rating` nunca degradan health/shareability; sólo modulan `primaryAction` dentro de POI-9.
- Tabla de `primaryAction` para POI-9 según visitado.

**`mem://logic/poi/curation-levels`** — actualizar regla con la separación salud/personal.
**`mem://index.md`** — actualizar one-liner de Core para reflejar que visited no afecta salud.

### No se toca
Renderer, popup shell, ratings block (P-POPUP-14.2 sigue mostrando fila personal independiente), footer layout, marker grammar, schema, sharing pipeline, helpers `isPointEnriched` / `getPointHealthRings` / `isShareablePoi`.

### Verificación
- `vitest run poi-curation-level popup-curation-primary-action popup-golden-poi-contract`
- Inspección manual en preview del POI "Elevador del Monte de San Pedro": no debe aparecer botón "Sanar POI"; fila personal del rating block sigue diciendo "Pendiente".
