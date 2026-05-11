## Rediseño del bloque de recuperación con pestañas

Aplica **solo** al popup de puntos no enriquecidos con conflicto (i.e. cuando `UnenrichedRecoveryBlock` tiene `parsed` con candidatos). Los puntos verdes / sin conflicto no se ven afectados.

### Layout nuevo

```text
┌──────────────────────────────────────────────┐
│ [!] El nombre no encaja con la zona          │  ← cabecera (igual)
│     Estos lugares están cerca…               │
├──────────────────────────────────────────────┤
│ [ Lugares cercanos ] [ Renombrar ]           │  ← tabs full-width
├──────────────────────────────────────────────┤
│  (contenido de la pestaña activa)            │
│                                              │
├──────────────────────────────────────────────┤
│ [ Editar campos y reenriquecer ]             │  ← footer CTA
└──────────────────────────────────────────────┘
```

### Pestaña 1 — "Lugares cercanos"
- Lista vertical de todos los candidatos (`parsed.candidates` + `nameLocation` si existe), sin colapsar.
- Cada fila: nombre, distancia, jerarquía geo, botón coherente con el modo:
  - modo `move` (coordinate_mismatch) → "Mover aquí"
  - modo `rename` (name_mismatch / llm_unverifiable) → "Usar nombre"
- Si no hay candidatos: mensaje "Sin coincidencias cercanas".

### Pestaña 2 — "Renombrar"
- Input de texto con el nombre actual precargado.
- Botón "Guardar y reenriquecer" → mismo flujo que `handleRename` (update name + `triggerEnrichLocation`).
- Atajo "Ignorar conflicto y enriquecer igual" (= `handleIgnoreConflict`, `skipValidation: true`).

### Footer — "Editar campos y reenriquecer"
- Botón único full-width al pie del bloque.
- Abre un mini-formulario inline (dentro del mismo bloque, reemplazando las tabs) con:
  - Nombre
  - Latitud
  - Longitud
- Acciones: "Guardar y reenriquecer" / "Cancelar".
- Al guardar: update `{ name, latitude, longitude }` en `locations` + `triggerEnrichLocation(id, { focusAfter: false })`.

### Cambios técnicos

Archivo único: `src/domains/content/components/UnenrichedRecoveryBlock.tsx`.

1. Sustituir el render de la variante `card` cuando `parsed` existe por la estructura tabs + footer.
2. Estado local: `tab: 'nearby' | 'rename'`, `editingAll: boolean`, `form: { name, lat, lng }`.
3. Reutilizar handlers existentes (`handleMovePoint`, `handleUseName`, `handleRename`, `handleIgnoreConflict`, `triggerEnrichLocation`). Añadir `handleSaveAll` que hace un único `update` con los 3 campos antes de relanzar enriquecimiento.
4. Tab por defecto:
   - `coordinate_mismatch` → `nearby` (es lo más probable que arregle).
   - resto → `nearby` también (la lista es lo accionable); si `candidates.length === 0`, abrir `rename`.
5. Mantener `variant="row"` intacto (solo afecta a la card del popup / ficha).
6. Conservar el `MutationObserver` de `popup-recovery-mount.ts` — no hay cambios ahí.

### Fuera de alcance
- Puntos enriquecidos (verdes): el bloque sigue sin renderizar.
- Puntos sin error (`parsed == null`): mantienen el CTA simple "Enriquecer / Contexto cercano" actual, sin tabs.
- Marcadores, anillo rojo, batch-enrich, server: sin cambios.

### Verificación
- Stone House (caso del screenshot): aparecen 2 tabs, "Lugares cercanos" lista 5 candidatos con "Usar nombre", pestaña "Renombrar" trae input precargado, footer abre form con name/lat/lng.
- Punto coordinate_mismatch: misma UI, pero los botones de fila dicen "Mover aquí".
- Punto sin candidates: tab "Lugares cercanos" muestra mensaje vacío, tab "Renombrar" activa por defecto.
