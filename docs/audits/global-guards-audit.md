# Audit — Global Guards

## Patrón vigilado
Guards o cooldowns globales que silencian eventos posiblemente legítimos.

## Hallazgos

### H1 — Cooldown manual de `subset-fit` (CORREGIDO)
- **Síntoma**: cualquier `subset-fit` (incluso `mode: 'always'`) era abortado durante 4s tras un gesto manual.
- **Resolución**: ADR-0005. El cooldown SOLO aplica a `mode: 'if-outside'`. `'always'` lo ignora.
- **Código**: `LocationMap.tsx` ~2353, condicional `if (mode !== 'always' && Date.now() - lastUserInteractionAt < COOLDOWN_MS) return`.

### H2 — `blockReentry` en `HeavyOperationStore` (CORRECTO)
- Bloquea solo si el `operationId` está vivo. Diseñado para evitar doble click.
- Riesgo: si el caller no llama a `finishOperation`, bloqueará reentries hasta que expire el watchdog.
- **Mitigación**: watchdog default 10s para `filter`/`subset-fit`.

### H3 — Watchdog del HeavyOps (CORRECTO)
- Garantiza que ninguna op queda colgada.
- Riesgo: en operaciones reales más largas (>10s), podría disparar `failOperation` falso.
- **Mitigación**: caller debe pasar `safetyTimeoutMs` adecuado o usar `setProgress` que reinicia el sentido de "viva".

### H4 — Bypass de zoom gates con `filterByUserId` (CORRECTO)
- Activa `bypassZoomGates: true` en `applyLayerVisibility`.
- Garantiza que el filtro por usuario nunca quede ciego.
- Justificado por contrato `subset-fit-contract` (caso `user-filter`).

### H5 — Gate `is_approved` (CORRECTO)
- Helper único `isLocationVisibleInGlobalMap`.
- No es "guard global" sino regla de negocio. No hay riesgo de que silencie acción legítima.

## Recomendaciones
- Cualquier nuevo cooldown global debe distinguir explícitamente `always` vs `if-outside` o equivalente.
- Documentar en este audit cualquier guard que introduzca un nuevo `return` temprano en un listener global.
