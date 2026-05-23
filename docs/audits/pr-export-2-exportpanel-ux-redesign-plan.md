# PR-EXPORT-2 — Plan de rediseño UX de "Exportar datos"

Estado: **Fase 2 (propuesta UX, sin código)**.
Documento hermano: `pr-export-2-exportpanel-current-behavior-audit.md`.

> No se implementa nada todavía. No se toca core PR-EXPORT-2
> (`evaluatePoiExport`, `mapToPoiExportRecord`, `POI_EXPORTERS`,
> `runPoiExport`, `PoiExportRecord`). No se añaden formatos. Sin datos,
> schema, backend, ni bump.

---

## 1. Resumen ejecutivo

El cuadro "Exportar datos" debe convertirse en una **superficie
declarativa**: el caller declara *de qué subconjunto exportar*, el
usuario decide *cómo recortarlo* (scope, root-status, madurez) y *en
qué formato/preset*, y el panel siempre muestra cifras coherentes.

Objetivo principal: que **nunca aparezca `0 / 0`** cuando el usuario
acaba de seleccionar POIs, marcar nodos en "Buscar y Filtrar" o abrir el
panel sobre un universo no-vacío.

---

## 2. Comportamiento actual (recap)

Ver auditoría hermana. Resumen:

- Panel sin props, lee del store; depende de `selectedDocument`.
- `selectedLocations` cross-doc se descartan.
- Bridges (Toolbar, ShareSheet, popup) no propagan payload.
- Scopes sólo `public` / `internal`. No hay filtro de root-status ni
  madurez en la UI. No hay presets por aplicación; los KML "Google" y
  "Guru" son sólo `target` del mismo serializer, pero la UI no lo separa
  del resto de formatos.
- `0 / 0` cuando no hay documento activo o cuando `public` sobre POIs
  no-curados (segundo caso es legítimo pero mal comunicado).

---

## 3. Comportamiento deseado

### 3.1 Modelo de entrada (caller → panel)

```ts
type ExportSource =
  | { kind: 'selection'; locations: GeoLocation[]; originLabel?: string }
  | { kind: 'filtered' }                       // universo filtrado global
  | { kind: 'document'; documentId: string }
  | { kind: 'collection'; collectionId: string }
  | { kind: 'geo-nodes'; nodeIds: string[] }   // del GeographyTree
  | { kind: 'single-poi'; locationId: string }
  | { kind: 'all-mine' };

interface ExportPanelProps {
  source?: ExportSource;     // default: { kind: 'filtered' } si store global
  initialScope?: PoiExportScope;
  initialFormat?: PoiExportFormat | PoiExportPreset;
}
```

El panel **resuelve** la `source` a `GeoLocation[]` (paso 1) y **luego**
aplica filtros del usuario (paso 2) antes de pasar al pipeline.

### 3.2 Pipeline UX (sin tocar core)

```text
ExportSource
  → resolveSource() → originLocations[]            // total origen
  → applyOwnershipScope()                          // sólo míos / mis + seguidos / todos
  → applyRootStatusFilter()                        // A/B/C/D
  → applyMaturityFilter()                          // POI-N range
  → evaluatePoiExport(scope public|internal)       // [SIN TOCAR]
  → partition { eligible, excluded }               // [SIN TOCAR]
  → runPoiExport(format + preset)                  // [SIN TOCAR]
```

Las cuatro etapas previas a `evaluatePoiExport` son **client-side UX
filters**: recortan el universo antes de evaluar elegibilidad
canónica. Nunca relajan `public` (sigue exigiendo POI-9/10 + shareable).

### 3.3 Cifras siempre coherentes

Header del panel (siempre presente, incluso con 0):

```
Fuente: <originLabel>
Origen: 124 POIs
Tras filtros: 87
Elegibles: 37    Excluidos: 50
  · 32 no curados
  · 15 ajenos
  · 3 sin coordenadas
```

Reglas:

- Si `Origen = 0` → mensaje explícito ("no hay POIs en la fuente
  seleccionada") en vez de `0 / 0` mudo.
- Si `Elegibles = 0` con `Origen > 0` → mostrar **siempre** desglose de
  exclusión con la razón dominante destacada.
- Distinguir visualmente "no hay nada que exportar" de "hay cosas pero
  no son elegibles bajo este scope".

---

## 4. Filtros UX propuestos

### 4.1 Alcance / ownership

Selector único de 4 opciones:

| Opción | Significado | Implementación |
|---|---|---|
| **Sólo míos** | `ownerUserId === currentUserId` | filtra antes de `evaluatePoiExport` |
| **Míos + seguidos** | propios + POIs de followed accepted | reusa `getOwnerIdentityOklch`/`followStatus` |
| **Todos los visibles** | todos los visibles autorizados (incluye `app`/`source`) | sin filtro adicional |
| **Público curado** | atajo: setea scope=`public` y sin restricción ownership | colapsa a `evaluatePoiExport('public')` |

`public` y `internal` siguen siendo los únicos scopes que se pasan al
core. La opción de UX se traduce internamente:

- "Sólo míos" + "Público curado" → scope=`public`, ownership prefilter.
- "Sólo míos" sin "Público curado" → scope=`internal`.
- "Míos + seguidos" / "Todos visibles" → scope=`public` (porque `internal`
  exige ownership). El prefilter UX puede ampliar el origen pero
  `evaluatePoiExport('public')` decide lo que sale.

### 4.2 Estado raíz A/B/C/D (root-status)

Chips multi-select (no excluyentes):

| Chip | Significado | Default público | Default interno |
|---|---|---|---|
| A · incompleto real (rojo) | falta input usuario | OFF | OFF |
| B · falta canon/backfill (amarillo) | sistema pendiente | OFF | ON (diagnóstico) |
| C · incoherente nombre/coords (naranja) | revisión | OFF | OFF |
| D · coherente (verde) | apto | ON | ON |

Reglas duras:

- `public` **nunca** exporta A/B/C aunque el chip esté ON
  (`evaluatePoiExport('public')` ya lo bloquea).
- En `internal` el usuario puede activar B para dump diagnóstico.
- A/B/C/D **no se confunden con POI-N**: A/B/C/D mide salud objetiva
  del root; POI-N mide madurez/curación.

### 4.3 Madurez POI-N

Slider o chips de rango:

- POI-0..3 · "incompletos"
- POI-4..6 · "base/geografía"
- POI-7..10 · "enriquecidos/curados"
- Custom: rango libre.

`public` queda forzado a POI-9..10 (contrato). El control se muestra
deshabilitado con tooltip "Público sólo exporta POI-9/10".

### 4.4 Coherencia entre filtros

Tabla de coherencia mínima (renderizar como `disabled` si conflicto):

| Si scope = `public` | Forzar / deshabilitar |
|---|---|
| Root-status | sólo D, resto disabled |
| Madurez | sólo POI-9..10, resto disabled |
| Ownership prefilter | permitido (estrecha origen) |

---

## 5. Formatos y presets

### 5.1 Formatos genéricos (serializers existentes)

Sin cambios al registry. Se mantienen:

- **CSV** (`POI_CSV_META`)
- **KML** (`POI_KML_META`)
- **JSON v2** (`POI_JSON_META`)
- **GeoJSON** (`POI_GEOJSON_META`)

### 5.2 Presets por aplicación

Los presets **no** son serializers nuevos. Son combinaciones
predefinidas de `(format, target, scope-suggestion, advanced opts)`
que viajan a `runPoiExport`:

| Preset visible | Formato real | `target` | Notas |
|---|---|---|---|
| **Google My Maps** | `kml` | `'mymaps'` | name + description + coords; suprime campos internos vía `target` |
| **Guru Maps** | `kml` | `'gurumaps'` | KML compatible Guru |
| **CSV** | `csv` | — | genérico |
| **KML (genérico)** | `kml` | `'general'` | |
| **JSON v2** | `json` | — | envelope `poi-export-json-v2` |
| **GeoJSON** | `geojson` | — | RFC 7946 |

La UI agrupa visualmente: **"Para aplicaciones"** (Google, Guru) y
**"Avanzado"** (CSV, KML genérico, JSON, GeoJSON). Sin nuevos meta en
`POI_EXPORTERS`.

### 5.3 Sugerencias automáticas

Cuando el usuario elige preset Google/Guru, sugerir (no forzar) scope
`public` y root-status `D`, con un toggle "ajustar a recomendaciones del
preset".

---

## 6. Wireframe textual

```text
┌─────────────────────────────────────────────────────────────┐
│ Exportar datos                                          [×] │
├─────────────────────────────────────────────────────────────┤
│ Fuente: selección actual (3 documentos)                     │
│ Origen 124 · Tras filtros 87 · Elegibles 37                 │
│                                                             │
│ ─ Alcance ────────────────────────────────────────────────  │
│  ( ) Sólo míos      (•) Míos + seguidos                     │
│  ( ) Todos visibles ( ) Público curado                      │
│                                                             │
│ ─ Estado raíz ────────────────────────────────────────────  │
│  [ ] A rojo   [ ] B amarillo   [ ] C naranja   [x] D verde  │
│                                                             │
│ ─ Madurez POI-N ──────────────────────────────────────────  │
│  ( ) Todos  ( ) 0-3  ( ) 4-6  (•) 7-10  ( ) Custom          │
│                                                             │
│ ─ Excluidos (50) ▾ ──────────────────────────────────────── │
│   · 32 no curados                                           │
│   · 15 ajenos                                               │
│   · 3 sin coordenadas                                       │
│                                                             │
│ ─ Para aplicaciones ─────────────────────────────────────── │
│  [ Google My Maps ]   [ Guru Maps ]                         │
│                                                             │
│ ─ Avanzado ─────────────────────────────────────────────── │
│  [ CSV ] [ KML ] [ JSON v2 ] [ GeoJSON ]                    │
│                                                             │
│ Última exportación: hace 2 h · 37 puntos                    │
└─────────────────────────────────────────────────────────────┘
```

---

## 7. Cambios de componente (no implementar todavía)

| Componente | Cambio |
|---|---|
| `ExportPanel` | aceptar prop `source`; resolver origen; añadir filtros UX (ownership, root, madurez); reagrupar formatos en "Aplicaciones" + "Avanzado"; header con cifras coherentes |
| `Index.tsx` (toolbar) | pasar `source={kind:'filtered'}` al abrir desde toolbar global |
| ShareSheet → Export bridge | propagar `source={kind:'selection', locations}` y `initialScope` |
| `SelectionActions` | (opcional) reemplazar dropdown inline por apertura del `ExportPanel` con `source={kind:'selection', locations}`, para unificar UX |
| Popup POI | (opcional, gap conocido) añadir botón "Exportar este POI" → `source={kind:'single-poi'}` |
| `poi-export-pipeline.ts` | extender `runPoiExport` opciones para aceptar prefilter ownership/root/madurez **antes** de `evaluatePoiExport`. **No** cambia contrato del pipeline canónico ni serializers |

Resolver de fuente (nuevo helper UX, no core):

```ts
// src/domains/content/lib/export-source-resolver.ts (PROPUESTO)
export function resolveExportSource(
  source: ExportSource,
  storeSnapshot: { ... },
): { locations: GeoLocation[]; originLabel: string };
```

---

## 8. Seguridad (sin cambios)

Se mantiene **íntegro** lo siguiente:

- `evaluatePoiExport` y matriz nivel × scope.
- `customData` allowlist (`source`, `external_id`, `user_label`).
- Public no expone `ownerUserId`, `raw_geocode`, `enriched_data`, signed
  URLs, debug.
- `internal` requiere ownership.
- Defensa en profundidad en `kml-parser`.
- Límites 5k warn / 10k block.
- ShareSheet separado de Export (boundary intacto; sólo se añade
  propagación de payload por el bridge).

Los filtros UX (ownership prefilter, root-status, madurez) **estrechan**
el universo antes del core; nunca lo amplían ni saltan validaciones.

---

## 9. Tests necesarios (cuando se implemente)

- Resolver `ExportSource` → `GeoLocation[]` para los 7 `kind`.
- Header cifras: origen / tras filtros / elegibles / excluidos en cada
  combinación de filtros.
- `public` ignora chips A/B/C/D ON (defensa: nunca exporta no-curado).
- `internal` con root-status B exporta diagnósticamente.
- Preset Google/Guru → format `kml` + target correcto.
- Bridge ShareSheet → Export propaga `source` y `initialScope`.
- Toolbar global pasa `source={kind:'filtered'}` y nunca renderiza
  `0 / 0` cuando `getFilteredLocations().length > 0`.
- Contract regression: `customData` allowlist intacta, `ownerUserId`
  ausente en `public`, límites 5k/10k siguen disparando.

---

## 10. Riesgos

- **Sobre-carga del panel**: añadir 3 ejes de filtros (ownership, root,
  madurez) más formatos puede saturar. Mitigación: secciones colapsables
  y defaults sensatos por preset.
- **Confusión root-status vs POI-N**: requiere copy claro y tooltips.
- **Coherencia con `evaluatePoiExport`**: si los filtros UX no se
  alinean con el core, el usuario verá `Tras filtros = 30` pero
  `Elegibles = 5` sin entender la diferencia. Mitigación: mostrar
  desglose de exclusión siempre que haya gap > 0.
- **SelectionActions inline vs ExportPanel**: dos UX para lo mismo.
  Decisión pendiente: unificar (rompe muscle memory) o mantener
  (duplica mantenimiento).
- **Bridge ShareSheet → Export**: hay que verificar que pasar `source`
  no rompe el boundary share/export documentado.

---

## 11. Fuera de alcance

- Cambios en serializers o `POI_EXPORTERS`.
- Nuevos formatos (GPX, XLSX, PDF, ZIP).
- Cambios en `evaluatePoiExport`, matriz nivel × scope, allowlist.
- Cambios en ShareSheet más allá del payload del bridge.
- Backend, schema, datos, async jobs.
- Bump de versión.
- Export server-side / RLS.

---

## 12. Siguiente paso

Aprobar este plan → abrir Fase 3 de wiring + UX (implementación) con
sub-PRs:

1. `ExportPanel` acepta `source` + resolver (compat con default actual).
2. Header cifras coherentes + desglose siempre.
3. Filtros UX ownership / root-status / madurez.
4. Reagrupación formatos + presets Google/Guru.
5. Bridges (toolbar, ShareSheet, opcional popup, opcional SelectionActions).
6. Tests.

No iniciar sin aprobación explícita.
