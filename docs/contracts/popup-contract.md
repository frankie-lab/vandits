# Contract — Popup

## Propósito
Garantizar que **a lo sumo un popup** está abierto, que su marker no se desmonte mientras esté abierto y que el cierre desencadene el deselect canónico.

## Variables canónicas
| Variable | Tipo | Ámbito |
|---|---|---|
| `openPopupLocationId` | `string \| null` | Local a `LocationMap` (useState) |
| `keepIds` | `Set<string>` | Derivado: `focusedLocationId ∪ openPopupLocationId` |
| `preservedId` | `string \| null` | `openPopupLocationId` durante reconciliación de markers |

## Ownership
- `LocationMap` es el ÚNICO escritor de `openPopupLocationId`.
- Ningún otro componente puede `setOpenPopupLocationId`.
- Listener `map.on('popupclose')` registrado UNA sola vez en el `useEffect` de inicialización del mapa.

## Source of truth
`LocationMap.openPopupLocationId` (local). No vive en el store porque:
1. Su ciclo de vida es 1:1 con la instancia Leaflet.
2. Su consumo cross-component (vía `keepIds`) se resuelve por re-render del componente padre.

## Eventos canónicos
| Evento | Origen | Efecto |
|---|---|---|
| `marker.openPopup()` | click usuario / acción programática | `setOpenPopupLocationId(id)` |
| `map.on('popupclose')` | Leaflet | `setOpenPopupLocationId(prev => prev===closedId ? null : prev)` + posible deselect del focus |

## Forbidden writes
- Llamar a `marker.closePopup()` desde un side-effect que también borre el marker en el mismo tick (race con `popupclose`).
- Registrar `marker.on('popupclose')` por marker — depende de `focusedLocationId` y crea stale closures.
- Mantener `openPopupLocationId` en el store global.

## Invariantes
1. Si un marker pertenece a `keepIds`, su instancia NO puede ser eliminada por la reconciliación.
2. El handler `popupclose` es **único, a nivel de mapa**.
3. Reabrir el popup tras un re-render preserva el id mediante `preservedId`.

## Ejemplos válidos
- Click en marker enriquecido → `setOpenPopupLocationId(id)` → popup abre → cambio de filtros → marker se preserva → usuario cierra popup → `popupclose` limpia state.

## Anti-patrones detectados
- (Histórico) Cada marker registraba `marker.on('popupclose')` con stale closure sobre `focusedLocationId`. Resuelto en ADR-0001 centralizando en `map.on('popupclose')`.
- Comentario residual en `LocationMap.tsx:1801` recuerda no volver a añadir handlers per-marker.

## Validation Notes (revisión manual contra código real)

| Inv. | Estado | Archivo | Símbolo | Evidencia | Backlog |
|---|---|---|---|---|---|
| 1 (preserva marker en `keepIds`) | **validated** | `src/components/LocationMap.tsx` | reconciliación de markers L.1660-1714 | `preservedId = openPopupLocationId` (L.1662); `nextMarkers.set(preservedId!, preservedMarker)` (L.1689); skip de eliminación L.1684, L.1712 | — |
| 2 (handler `popupclose` único a nivel mapa) | **validated** | `src/components/LocationMap.tsx` | `mapRef.current.on('popupclose', …)` en init effect | Único registro L.1436; comentario guardarraíl L.1801-1803 prohíbe per-marker | BL-002 (vigilancia) |
| 3 (reabrir tras re-render preserva id vía `preservedId`) | **validated** | `src/components/LocationMap.tsx` | bloque reconciliación L.1660-1714 | `preservedId` reusa marker existente; sincroniza `keepIds` L.1885 | — |
| `selectedLocations` no gobierna popup | **validated** | `src/components/LocationMap.tsx` + `src/domains/content/store/locations-store.ts` | `keepIds` L.1616-1618 | Solo une `focusedLocationId ∪ openPopupLocationId`; `selectedLocations` no entra en `keepIds` | — |
| `openPopupLocationId` permanece local (no en store) | **validated** | `src/components/LocationMap.tsx` | `useState<string\|null>` L.684 | No referenciado en `locations-store.ts` (rg confirmado) | — |
| Stale closure per-marker | **validated** (resuelto histórico) | `src/components/LocationMap.tsx` L.1801-1803 | Comentario normativo presente | — | BL-001 |

## Referencias
- ADR-0001 (popupclose centralization)
- mem://logic/map/popup-persist-on-rebuild
- Código: `src/components/LocationMap.tsx` líneas ~684, ~1436-1446, ~1616-1618, ~1660-1714, ~1801-1803, ~1885
