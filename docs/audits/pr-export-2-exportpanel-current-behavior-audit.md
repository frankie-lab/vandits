# PR-EXPORT-2 — Auditoría comportamiento actual de "Exportar datos"

Estado: **Fase 1 (auditoría, sin código)**.
Alcance: comprender por qué el cuadro "Exportar datos" muestra `0 / 0`
cuando hay selección o filtros activos, y mapear todas las superficies
que pueden disparar export.

> No se modifica core PR-EXPORT-2 (`evaluatePoiExport`,
> `mapToPoiExportRecord`, `POI_EXPORTERS`, `runPoiExport`).
> Esta auditoría sólo documenta wiring y comportamiento.

---

## 1. Superficies que disparan export

| Superficie | Cómo abre/ejecuta | Payload que pasa | Estado |
|---|---|---|---|
| **Toolbar → botón Exportar** (`Index.tsx` L243, L287) | `setShowExport(true)` → `<Dialog><ExportPanel/></Dialog>` | **Ninguno**. `ExportPanel` se monta sin props y lee del store. | Conectado pero **sin contexto explícito** |
| **`SelectionActions`** (barra inferior de selección) | NO abre el panel. Ejecuta `runPoiExport(...)` inline desde un `DropdownMenu`. | `selectedDocument.locations` filtradas por `selectedLocations` set, `scope` propio (`exportScope`). | Conectado (pipeline PR-EXPORT-2 OK) |
| **ShareSheet bridge** | Bridge documentado en `share-vs-export-contract.md`: el botón "Exportar archivo" del ShareSheet cierra Share y abre `ExportPanel`. Hoy se traduce a `setShowExport(true)` sin payload. | Ninguno. | Conectado pero **sin payload de selección** |
| **Popup POI individual** | NO existe botón export en popup (gap documentado en QA E2E). | — | No conectado |

Consecuencia: el `ExportPanel` **siempre** asume que la única fuente de
verdad es `useLocationsStore`. No recibe selección, nodos del
GeographyTree, ni colección explícita.

---

## 2. Datos que `ExportPanel` consume hoy

`src/domains/content/components/ExportPanel.tsx`:

```ts
const { selectedDocument, selectedLocations, getFilteredLocations } = useLocationsStore();
...
const candidateLocations = useMemo(() => {
  if (!selectedDocument) return [];                              // (A)
  return selectedLocations.size > 0
    ? selectedDocument.locations.filter(l => selectedLocations.has(l.id))  // (B)
    : getFilteredLocations();                                    // (C)
}, [selectedDocument, selectedLocations, getFilteredLocations]);
```

Reglas implícitas:

- (A) **Sin `selectedDocument` → 0 candidatos.** Éste es el origen
  principal del `0 / 0`: en la vista global (sin documento activo) el
  panel no ve nada, aunque el mapa tenga miles de POIs filtrados.
- (B) Si hay selección, sólo entran POIs del documento activo que estén
  en `selectedLocations`. Selecciones que crucen documentos se **pierden**.
- (C) Si no hay selección, cae a `getFilteredLocations()` del store
  (universo filtrado global). Esto **sí** ve cross-document, pero sólo
  si (A) no rompió antes.

Después, `previewPoiExport({ locations: candidateLocations, scope, ctx })`
calcula `eligibleCount / totalCount`. El `totalCount` mostrado en el
chip "Elegibles X / Y" es `candidateLocations.length`, **no** el universo
real de POIs del usuario ni el filtrado del mapa.

---

## 3. Causa raíz del `0 / 0`

Cadena de fallos posibles, en orden de frecuencia esperada:

1. **No hay `selectedDocument`** (vista global / panel abierto desde la
   toolbar superior). → `candidateLocations = []` → `totalCount = 0` →
   `eligibleCount = 0`. Es el caso que el usuario está viendo ahora.
2. **Selección hecha en GeographyTree / Buscar y Filtrar no materializa
   POIs.** El árbol marca nodos en `filters`, pero `selectedLocations`
   permanece vacío. Como hay `selectedDocument` (si lo hay), entra
   por (C) y depende de que `getFilteredLocations()` realmente acepte
   esos filtros.
3. **`open-export-panel` (bridge ShareSheet → Export) no transporta
   payload.** El bridge sólo flipea `showExport`, perdiendo qué
   selección/filtro tenía Share. El panel re-deriva desde el store, que
   puede no coincidir con lo que el usuario tenía en Share.
4. **Scope `public` sobre POIs todos no-curados** → `eligibleCount = 0`
   con `totalCount > 0`. Distinguible visualmente; **no** es el `0 / 0`
   que reporta el usuario.
5. **Scope `internal` sin sesión** (`currentUserId == null`) → panel
   deshabilitado pero contador puede mostrar 0/0 si además se cumple (1).

El caso (1) es el responsable principal cuando el panel se abre desde
la toolbar en vista global.

---

## 4. Semántica actual de scopes

### `public` ("Público (curado)")
- `evaluatePoiExport(loc, 'public', ctx)` exige: coords válidas +
  `isPointEnriched` + `isShareablePoi` + nivel POI ∈ {9, 10}.
- POI-1b-editorial excluido aunque parezca editorial.
- Estado personal (visited/rating) **no** afecta.
- Resultado: para usuarios con POIs mayormente POI-0/1/3/5, `public`
  legítimamente dará `0 / N`. Eso **no es bug**, pero la UI no lo
  comunica bien (no aparece el desglose de razones cuando `total=0`).

### `internal` ("Interno (sólo míos)")
- `evaluatePoiExport(loc, 'internal', ctx)` exige: coords válidas +
  `ownerUserId === currentUserId`.
- Cualquier nivel POI (0..10) entra si la ownership coincide.
- POIs ajenos caen como `not-owner`.
- Sin sesión → todos `not-owner` → panel deshabilitado.
- **No** discrimina A/B/C/D (root status) ni POI-N: exporta todo lo
  propio que tenga coords.

---

## 5. Flujo actual (diagrama)

```text
Toolbar Exportar ─┐
                  │
ShareSheet bridge ┼──► setShowExport(true) ──► <Dialog>
                  │                              └─► <ExportPanel/>
                  │                                     │
                  │                                     ▼
                  │      useLocationsStore: selectedDocument,
                  │                         selectedLocations,
                  │                         getFilteredLocations()
                  │                                     │
                  │     candidateLocations =            │
                  │       selectedDocument ? (sel? filter : filtered) : []
                  │                                     │
                  │                                     ▼
                  │              previewPoiExport({locations, scope, ctx})
                  │                                     │
                  │                                     ▼
                  │                       "Elegibles X / Y" + razones
                  │                                     │
                  │   handleExport(format)  ──► runPoiExport(...)
                  │                                     │
                  │                                     ▼
                  │                          download Blob + recordExport
                  │
SelectionActions ─┴──► runPoiExport(...)  [NO abre ExportPanel]

Popup POI ─────────► (no implementado)
```

---

## 6. Props / eventos que se pierden

| Origen | Dato que tiene el caller | Lo que recibe ExportPanel |
|---|---|---|
| Toolbar global | nada explícito | nada explícito |
| ShareSheet bridge | selección + scope sugerido por Share | nada |
| GeographyTree | nodos marcados (región/provincia/comarca/municipio) | sólo a través de `filters` del store, sin saber si el usuario quería exportar "ese subset" o "todo" |
| Colección activa | id de colección | no se respeta como ámbito |
| Multi-doc selection | set de ids cross-doc | recorta a `selectedDocument.locations` |

El panel **no** acepta una `source: ExportSource` explícita. Toda la
intención del caller se pierde y se reconstruye desde el store global.

---

## 7. Superficies rotas vs conectadas

- Conectado y funcional: `SelectionActions` (no usa el panel).
- Conectado pero defectuoso: Toolbar → ExportPanel (gap (1)),
  ShareSheet bridge → ExportPanel (sin payload).
- No conectado: popup POI individual.
- Conectado indirectamente: GeographyTree (sólo vía `filters` del store).

---

## 8. Propuesta de fix mínimo de wiring (sólo wiring, sin redesign)

Para eliminar el `0 / 0` espurio sin tocar el contrato PR-EXPORT-2:

1. **`ExportPanel` debe aceptar `source` opcional**:
   ```ts
   type ExportSource =
     | { kind: 'selection'; locations: GeoLocation[] }
     | { kind: 'filtered' }     // usa getFilteredLocations()
     | { kind: 'document'; documentId: string }
     | { kind: 'collection'; collectionId: string }
     | { kind: 'all-mine' };
   ```
   Default actual = derivar como hoy (compat).

2. **Resolver de candidatos sin exigir `selectedDocument`**:
   - Si `selectedLocations.size > 0`, intersectar contra `getFilteredLocations()` (universo global) en vez de `selectedDocument.locations`. Soporta selección cross-doc.
   - Si no hay selección, caer a `getFilteredLocations()` directamente,
     incluso sin `selectedDocument`.

3. **Toolbar global** pasa `source={kind:'filtered'}` explícito.

4. **ShareSheet bridge** propaga `source` con las locations que Share
   tenía ya resueltas (ya pasa por share-eligibility; sólo reusarlo).

5. **Indicador de fuente** visible en el header del panel
   ("Fuente: selección actual · 37 POIs origen") para que el usuario
   entienda de dónde viene el `Y` del contador.

Estos cambios son **wiring**, no tocan serializers, ni `evaluatePoiExport`,
ni el contrato `PoiExportRecord`. Quedan fuera de esta fase y se
detallarán en el plan de rediseño UX (documento hermano).

---

## 9. Riesgos detectados

- **Pérdida silenciosa de selección cross-document.** Hoy se descartan
  sin warning.
- **`0 / 0` interpretable como bug** cuando en realidad es "no hay
  documento activo". UX engañosa.
- **ShareSheet → Export pierde scope sugerido** (Share decide "público"
  y Export reabre en `public` por default pero no por propagación).
- **GeographyTree subset no es explícito** en el panel: el usuario no
  sabe si está exportando "lo que marqué" o "todo lo filtrado".
- **No hay test E2E del bridge ShareSheet→Export con payload.**

---

## 10. Fuera de alcance de esta auditoría

- Cambios en serializers (`POI_EXPORTERS`).
- Cambios en `evaluatePoiExport` o matriz nivel × scope.
- Nuevos formatos.
- Cambios en ShareSheet más allá del bridge.
- Datos, schema, backend.

Siguiente paso: `docs/audits/pr-export-2-exportpanel-ux-redesign-plan.md`
(Fase 2, sólo diseño).
