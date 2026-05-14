## Contrato de medición — Image Recovery Job

### Unidad de trabajo

**1 POI evaluado = 1 escaneo.** Cada POI procesado por el job termina en **exactamente uno** de estos estados terminales:

| Estado     | Significado                                                      |
|------------|------------------------------------------------------------------|
| `updated`  | Imagen encontrada y guardada en `enriched_data.imagen`           |
| `no_image` | Procesado correctamente, ninguna fuente devolvió imagen válida   |
| `failed`   | Error técnico (timeout, 5xx, fuente caída, excepción)            |
| `skipped`  | No procesado por regla / cooldown / dry-run / ya intentado       |

Invariante duro:

```
scanned == updated + no_image + failed + skipped
```

`scanned` y `totalTarget` son los únicos contadores de proceso. Todo lo demás se deriva.

### Métricas derivadas (todas en un único helper)

```
Avance del job        = scanned / totalTarget
Tasa de actualización = updated / scanned
Tasa sin imagen       = no_image / scanned
Tasa de fallo técnico = failed / scanned
Éxito técnico         = (updated + no_image) / scanned
```

Reglas:

- Denominador 0 ⇒ métrica = `null` (no se renderiza %).
- `totalTarget` desconocido ⇒ `Avance = null`.
- `skipped` se cuenta y se reporta, pero **no entra** en éxito técnico ni en tasa de actualización; representa POIs no atendidos por el job, no resultados.

### Backend

`image_recovery_jobs` ya tiene `scanned`, `updated`, `failed`, `skipped`. Falta `no_image` como contador propio: hoy ese caso se cuenta como `scanned` sin incrementar `updated`, lo que mezcla "sin imagen" con "fallo".

Cambios mínimos:

1. Migración: añadir columna `no_image int not null default 0` a `image_recovery_jobs`.
2. RPC `increment_image_recovery_progress`: aceptar delta `no_image` y mantener el invariante.
3. Edge function `recover-missing-images`: cuando una iteración termine sin imagen y sin error técnico, emitir `no_image: 1` en vez de dejarlo implícito como "no updated".
4. Edge function `image-recovery-job-tick`: re-leer `no_image` igual que el resto.
5. Tipos cliente: `image-recovery-job-store` expone `noImage`.

### Helper único — `src/stores/image-recovery-job-metrics.ts`

```ts
export interface ImageRecoveryMetrics {
  // Conteos crudos
  scanned: number;
  updated: number;
  noImage: number;
  failed: number;
  skipped: number;
  totalTarget: number | null;

  // Métricas derivadas (null si denominador 0)
  progressPct: number | null;          // scanned / totalTarget
  updateRatePct: number | null;        // updated / scanned
  noImageRatePct: number | null;       // no_image / scanned
  technicalFailRatePct: number | null; // failed / scanned
  technicalSuccessRatePct: number | null; // (updated + no_image) / scanned

  // Etiquetas listas para UI (sin lógica de formato fuera del helper)
  progressLabel: string;        // "800/1031" o "800"
  updateLabel: string;          // "797 / 800"
}

export function getImageRecoveryMetrics(job): ImageRecoveryMetrics
```

Ambas vistas leen de aquí. Cero cálculos en componentes.

### UI — contrato de presentación

Las dos superficies muestran exactamente los mismos números, en el mismo orden, con las mismas etiquetas.

#### Barra inferior (`ImageRecoveryLane`)

- **Barra visual = Avance** (`progressPct`). Si `null`, avance simbólico.
- **Número destacado = Tasa de actualización** (`updateRatePct`) con su fracción `updated / scanned`.
- **Subtitle**: `actualizados · sin imagen · fallos técnicos · saltados · lote N` con los valores absolutos.

#### Panel admin (`RecoverImagesPanel`)

Bloque de stats (sustituye al actual):

- `Avance        800/1031 (77.6%)`
- `Actualizados  797 / 800 (99.6%)`
- `Sin imagen    2 / 800 (0.3%)`
- `Fallos téc.   1 / 800 (0.1%)`
- `Saltados      0`
- `Éxito técnico 99.9%`
- `Lote          16`

### QA

- Forzar 800 escaneados con 797 updated, 2 no_image, 1 failed:
  - Panel y barra muestran `Actualizados 99.6%`, `Avance 77.6%`, `Éxito técnico 99.9%`.
- Forzar 100% no_image (fuentes vacías): `Actualización 0%`, `Éxito técnico 100%`, `Fallos 0%`.
- Forzar 100% failed: `Éxito técnico 0%`, `Fallos 100%`.
- `totalTarget = null`: barra no engaña, no se muestra %, sólo `scanned` absoluto.
- Test unitario del helper para los 5 casos anteriores.

### Memoria a guardar tras implementar

- `mem://logic/image-recovery/measurement-contract`: define unidad de trabajo, estados terminales, invariante `scanned == updated + no_image + failed + skipped`, métricas derivadas y helper único `getImageRecoveryMetrics`. Regla — barra = avance, número destacado = tasa de actualización, "sin imagen" ≠ "fallo técnico".

### Fuera de alcance

- No se cambia el comportamiento del job ni la lógica de búsqueda multi-fuente.
- No se tocan otras lanes (geocoding, enrichment) — pero este contrato queda como referencia para alinearlas en otra PR.
