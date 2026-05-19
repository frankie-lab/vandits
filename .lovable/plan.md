# Inspección de eventos globales pendientes (v1.2.9 candidato)

Sin modificar archivos. Foco: payload real, emisores, consumidores, riesgo.

## Tabla

| Evento | Payload real | Emisores | Consumidores | Riesgo | Recomendación |
|---|---|---|---|---|---|
| `layer-visibility-changed` | `{ layerId, visible, ... }` (ver `use-layer-visibility.ts:108`) | `use-layer-visibility.ts` | `LocationMap.tsx` + `src/test/layer-visibility.test.ts` | Alto: consumidor único es `LocationMap.tsx` (excluido por norma) | **Aplazar** |
| `measurement-units-changed` | `{ units: 'metric' \| 'imperial' }` (`UserProfileEditor.tsx:724`) | `UserProfileEditor.tsx` (1) | `LocationMap.tsx` (1, líneas 357/531) | Alto: único consumidor es `LocationMap.tsx` | **Aplazar** |
| `trash-updated` | `void` (sin detail) | 8 emisores: `FloatingToolbar`, `FilterBar`, `LocationList`, `TrashPanel`, `use-realtime-locations`, `SelectionActions`, `use-popup-actions`, `DocumentFocusView` (refresca tras emit propio) | `UserMenu.tsx`, `DocumentFocusView.tsx` | **Bajo**: payload `void`, ya declarado en `src/domains/events.ts` como `'content:trash-updated': void`, sin consumidor en `LocationMap.tsx` | **Migrar ahora** |
| `store-updated` | `void` | 9 emisores (Index, FloatingToolbar, FilterBar, LocationPhotoUpload, duplicate-store, LocationList, SelectionActions, DocumentContentManager) | `use-coalesced-realtime-tick.ts`; referencias documentales en `LocationMap.tsx` (comentarios + lógica de invalidación) | Medio-alto: `LocationMap.tsx` documenta semántica en comentarios; aunque no añade listener directo a `store-updated`, alto fan-out de emisores. Migrar requiere tocar muchos archivos | **Aplazar** (fan-out 9; mejor tanda dedicada) |
| `reload-locations` | `void` (todos usan `CustomEvent('reload-locations')` o `Event(...)` sin detail) | 10+ emisores (renormalize, geocoding-job-store ×2, use-realtime-locations ×2, AdminPanel, GeographyBackfillPanel, DocumentsPanel ×2, use-database-sync, document-approval) | `use-database-sync.ts` (handler único) | Medio: payload `void` y consumidor único limpio, pero alto fan-out de emisores (10+) y dependencia operativa crítica (recarga global) | **Aplazar** a tanda propia |

## Recomendación

**Siguiente evento a migrar: `trash-updated`** (único candidato seguro).

Motivos:
- Payload `void` — sin riesgo de tipado divergente.
- Ya declarado en `src/domains/events.ts` (`'content:trash-updated': void`), confirma intención previa.
- Cero consumidores en `LocationMap.tsx` (cumple restricción dura).
- Consumidores acotados (2): `UserMenu.tsx`, `DocumentFocusView.tsx`.
- Fan-out de emisores (8) manejable en una sola tanda.

## Eventos a aplazar y por qué

- `layer-visibility-changed`, `measurement-units-changed`: consumidor único es `LocationMap.tsx`. Imposible migrar consumidor sin tocar el archivo excluido. **Aplazar indefinidamente** mientras la restricción siga vigente.
- `store-updated`: fan-out 9 + semántica documentada en `LocationMap.tsx` (aunque no escucha directo). Requiere tanda dedicada con auditoría de invalidaciones.
- `reload-locations`: fan-out 10+ emisores en stores, hooks realtime y paneles admin. Bajo riesgo técnico pero gran superficie; merece su propia tanda.

## Si se aprueba migración de `trash-updated`

- Versión propuesta: **v1.2.9**.
- Archivos a tocar (10): `src/lib/global-events.ts` (añadir clave), 8 emisores listados, 2 consumidores (`UserMenu.tsx`, `DocumentFocusView.tsx`), test `src/test/global-events.test.ts` (+1 caso), `package.json`, `src/lib/app-version.ts`, `README.md`, `docs/architecture/global-events.md` (12 → 13), `docs/tech-debt.md`, `docs/releases/version-history.md`.
- `LocationMap.tsx` NO se toca.
- `src/domains/events.ts` ya tiene la entrada; verificar alineación de nombres sin renombrar.

## Confirmaciones

- No se modificó ningún archivo en esta inspección.
- No se ejecutaron tests ni bump.
- No se renombran eventos ni cambian payloads.
