---
name: Selected-row action canon (P-POI-CURATION-2.12)
description: Canon de interacción para la fila seleccionada en Contexto cercano — acción primaria contextual + secundaria opcional, sin checkboxes equivalentes.
type: design
---

# Fila seleccionada en Contexto cercano — Canon UX

Al seleccionar un candidato en el bloque inline de Contexto cercano del
popup POI, la decisión se modela como **una acción primaria contextual**
(no dos checkboxes paralelos).

## Decisión

| Estado del POI abierto | Primaria | Secundaria |
|---|---|---|
| Reparable | "Usar como este punto" (replace) | "+ Guardar también como punto personal" (opcional) |
| No reparable | "Guardar como punto personal" | — (la categoría es obligatoria) |

Reparable ≡ `canReplaceCurrentPoi(loc, { mismatch })` en
`src/domains/content/lib/can-replace-current-poi.ts`:
- `mismatch != null` ⇒ true.
- `!isPointEnriched(loc)` ⇒ true.
- En cualquier otro caso ⇒ false.

## Layout

Stack vertical dentro del slot interactivo (gutter 8px, canon 2.11):

```
[ ⌖ Seleccionado en mapa ]
[ Botón sólido primario full-width        ]
[ + Guardar también como punto personal   ]   ← solo si replace
[ Categoría: chips ... ]                       ← solo si needsCategory
```

Expandido (secundaria activa):
```
[ Reemplazar y guardar personal           ]   ← CTA combinado
[ Categoría: ...   × cancelar             ]
```

## Marcadores estables
- `data-selected-row-actions="v1"`
- `data-selected-row-primary="replace|personal"`
- `data-selected-row-secondary="expand-personal|cancel-personal"`
- `data-replaceable="true|false"`

## Prohibido
- Dos `<input type="checkbox">` paralelos.
- Labels `Reemplazar importado` / `Punto personal` como checkboxes.
- CTA "Guardar ambas acciones".
- Duplicar la lógica de reparabilidad fuera del helper único.
- Permitir personal sin replace mediante toggle independiente cuando el POI es reparable.

## Referencias
- `docs/contracts/popup-contract.md` § "Fila seleccionada — primaria + secundaria"
- Test: `src/test/popup-poi-2-12-selected-row-action-canon.test.ts`
- Componente: `src/domains/content/components/PointContextActions.tsx` (bloque `selectedPointId === p.id`)
