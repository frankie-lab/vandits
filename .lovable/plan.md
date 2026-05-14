## Problema

La barra inferior de "Recuperar imágenes" pinta un único segmento violeta = `scanned / totalTarget` (avance bruto). El título resalta solo `updated / scanned` (98.8%), y los POIs "no actualizados" (sin imagen + fallos técnicos = 1.3% en la captura, ese 2.2% acumulado del usuario) viven únicamente en el subtítulo en texto. Visualmente parece que todo el avance es éxito.

El usuario quiere lo que acordamos: **total a procesar · éxito · fallidos** representado en la barra y en los contadores principales.

## Cambio

Solo presentación, archivo único `src/shared/progress/ImageRecoveryLane.tsx`. El contrato de métricas (`getImageRecoveryMetrics`) ya expone todo lo necesario, no se toca.

**Barra segmentada (sobre la longitud `scanned / totalTarget`):**

```text
[ verde: updated/total ][ rojo: (noImage+failed)/total ][ resto vacío hasta total ]
```

- Verde esmeralda = `updated / totalTarget * 100` → POIs procesados con éxito.
- Rojo/destructive = `(noImage + failed) / totalTarget * 100` → POIs procesados sin éxito (fallidos en sentido del usuario: no se obtuvo imagen, sea por técnica o por ausencia en fuentes).
- El resto del ancho queda vacío y representa lo que falta por procesar.
- Si `totalTarget` es desconocido, se cae al modo actual (un solo segmento de avance).

**Título y subtítulo:**

- Título: `Recuperación · 240 / 577 procesados` (avance honesto, no la tasa de éxito).
- Subtítulo: `237 éxito · 3 fallidos · lote 4` (tres números acordados; "saltados" se mantiene oculto salvo que >0).

**Métricas overlay (chips a la derecha de la barra):**

- Verde · Éxito · `updated`
- Rojo · Fallidos · `noImage + failed`
- (se elimina el desglose en 3 puntitos verde/gris/ámbar para alinearlo al modelo "éxito vs fallidos" pedido)

## Fuera de alcance

- No se toca el panel admin `RecoverImagesPanel.tsx` (mantiene su desglose detallado de actualizados / sin imagen / fallos técnicos / saltados).
- No se cambia el contrato de medición ni el backend.

## Archivos

- `src/shared/progress/ImageRecoveryLane.tsx` — recalcular `segments`, `title`, `subtitle` y `metrics` según lo anterior.
