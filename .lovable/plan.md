## Renombrar títulos de las 3 columnas

En `src/components/admin/RecoverImagesPanel.tsx`, fila "Tipo de operación":

| Antes | Después |
|---|---|
| Universo | **Total puntos** |
| Refrescar imágenes | **Puntos enriquecidos** |
| Recuperar faltantes | **Puntos enriquecidos sin foto** |

### Cambios

1. **Columna 1 (informativa)** — línea ~485 del componente: cambiar literal `"Universo"` por `"Total puntos"`. Subtítulo se mantiene ("Total de alcance de puntos en la APP.").

2. **Columnas 2 y 3 (modos seleccionables)** — actualizar en `MODE_META`:
   - `refresh.title`: `"Refrescar imágenes"` → `"Puntos enriquecidos"`
   - `missing.title`: `"Recuperar faltantes"` → `"Puntos enriquecidos sin foto"`
   - Mantener `short` (badge superior), `desc`, iconos y resto de metadatos intactos.

Sin tocar lógica, store ni edge function. Solo etiquetas visibles.
