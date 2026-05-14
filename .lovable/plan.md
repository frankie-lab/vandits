## Cambio

Reemplazar la fila actual del bloque "Tipo de operación" por **tres columnas iguales** que representen la pirámide del universo:

```
┌──────────────────┬────────────────────┬──────────────────┐
│   UNIVERSO       │   ENRIQUECIDOS     │   SIN FOTO       │
│   5.443 POIs     │   3.812 POIs       │   3.459 POIs     │
│   Total alcance  │   Enriquecidos IA  │   Sin foto tras  │
│   en la APP      │                    │   enriquecer     │
└──────────────────┴────────────────────┴──────────────────┘
        (info)         (seleccionable)     (seleccionable)
```

### Detalles

- **Columna 1 — UNIVERSO**: `breakdown.total_active`. Solo informativa (no seleccionable, sin estado activo). Subtítulo: "Total de alcance de puntos en la APP".
- **Columna 2 — ENRIQUECIDOS**: `breakdown.refresh_candidates` (mode `refresh`). Botón seleccionable. Subtítulo: "Todos los que se ha hecho un enriquecimiento por IA".
- **Columna 3 — SIN FOTO**: `breakdown.missing_candidates` (o `pending+cooldown` si `force`), mode `missing`. Botón seleccionable. Subtítulo: "Los que no tienen foto después de un enriquecimiento por IA".

### Implementación

En `src/components/admin/RecoverImagesPanel.tsx`:

1. Quitar el contador "Universo: X POIs activos · Y sin enriquecer" de la cabecera del bloque (líneas 468-473) — ahora vive como primera columna.
2. Cambiar el grid de `sm:grid-cols-2` a `sm:grid-cols-3` (línea 475).
3. Renderizar como primer hijo una "card" UNIVERSO no clickable (mismo layout visual que las otras dos pero sin `onClick`, sin estado activo, con `Globe` o `Layers` como icono).
4. Mantener las dos cards existentes (`refresh`, `missing`) tal cual, como columnas 2 y 3.
5. Simplificar la cabecera del bloque a solo el título "Tipo de operación · elige el universo base".

Sin tocar lógica de negocio, store ni edge function.
