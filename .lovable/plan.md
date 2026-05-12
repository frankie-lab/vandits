# PR-3C · Reposicionar Back Office "Geografía universal" como consola admin

PR-3B movió el centro operativo al mapa. El panel sigue siendo útil para operaciones masivas/admin pero su framing actual (wizard "elige modo → universo → lanza") compite visualmente con el flujo Salud del mapa y duplica taxonomía. Este PR re-encuadra el panel sin tocar la maquinaria del job.

## Alcance (PR-3C)

A. Rename + subheader (claridad de rol).
B. Renombrar/recolocar las 3 cards superiores para eliminar la colisión semántica con Salud.
C. Banner contextual de riesgo en "Lanzar".
D. Aviso explícito de derivación al mapa para reparaciones puntuales.

**Fuera de PR-3C** (futuros):
- Job console real (recientes / running / errores / replay) → **PR-3D**.
- hardError masivo → aplazado.
- Cambios en RPC, edge functions, o lógica del job → ninguno.

## Cambios concretos

### 1. Header del panel (`AdminPanel.tsx:372` + `UserMenu.tsx:513`)

- Tab/menu label: `Geografía universal` → **`Mantenimiento geográfico (Admin)`**.
- Título visual del panel: igual.
- Subheader nuevo bajo el título (en `GeographyBackfillPanel`):
  > Operaciones globales y masivas sobre jerarquías administrativas.
  > Para reparaciones puntuales usa **Salud** en el mapa.

### 2. Cards superiores (`GeographyBackfillPanel.tsx:79-98` `MODE_META`)

Renombrar para reflejar que aquí son **operaciones globales sobre el universo**, no acciones puntuales (las puntuales viven en el mapa).

| Mode interno | Antes | Después | Tono visual |
|---|---|---|---|
| `repair` | Reparar cadenas rotas | **Reconciliar jerarquía (global)** | secundario |
| `fill` | Rellenar huecos | **Rellenar huecos admin (global)** | secundario |
| `review` | Revisar normalizados | **Re-normalizar admin contra OSM** | primario |

Descripciones nuevas (cortas, dejan claro el ámbito masivo):

- `repair`: "Repara FKs y cadenas inconsistentes en el universo seleccionado. Operación masiva."
- `fill`: "Rellena niveles administrativos faltantes en el universo seleccionado. Operación masiva."
- `review`: "Re-normaliza todos los puntos no vacíos contra OSM. Útil tras renombrar/fusionar áreas. Operación masiva."

**No degradamos visualmente** `repair`/`fill` — los 3 cards comparten estilo. La diferenciación se hace por nombre y por aviso textual ("masiva / global"). Más simple que un sub-tier visual y suficiente para alinear el modelo mental.

Sin cambios en `BackendMode`, `modeToHealthFilter`, ni en `geocoding-job-store`. Solo strings + descripciones.

### 3. Banner contextual en "Lanzar" (`GeographyBackfillPanel.tsx:516-657`)

Añadir, justo encima del botón `Lanzar sobre universo (N)`, un bloque ámbar destacado cuando `selectedIds.size === 0` (= "todo el universo"):

```
[icon AlertTriangle ámbar]  Operación masiva
Vas a procesar los N puntos del universo. Esto puede tardar y consume cuota.
Para reparar un subconjunto pequeño, usa el filtro Salud en el mapa.
```

Cuando `selectedIds.size > 0`, bloque informativo neutro:
> Procesarás los {N} puntos seleccionados.

Esto marca claramente la diferencia operativa con el CTA del mapa (que ya filtra y previsualiza).

### 4. Cross-link al mapa

En el subheader del header (paso 1) o como footer del panel, link textual:
> ¿Solo quieres reparar unos pocos puntos? Cierra este panel y usa los chips de **Salud** en el mapa.

Sin acción imperativa (no abre nada), solo educa al usuario.

### 5. Consistencia de label en `GeographyScopeTree` y `AdminBrokenUsersList`

Pasan `MODE_META[mode].title` como prop (ya). Al renombrar, los chips/badges en esas columnas heredan el nuevo nombre automáticamente. **Verificar** que ningún string hardcoded (`"Reparar cadenas rotas"`) sobreviva en `AdminBrokenUsersList.tsx` ni en logs/toasts.

## Archivos tocados

- `src/components/admin/GeographyBackfillPanel.tsx` — strings `MODE_META`, subheader, banner masivo, footer cross-link.
- `src/components/AdminPanel.tsx` — label del tab/dictionary (línea 372).
- `src/components/UserMenu.tsx` — label del item de menú (línea 513).
- `src/components/admin/AdminBrokenUsersList.tsx` — verificar uso de `modeTitle` prop, sin hardcodes.

## Memoria

- Actualizar `mem://logic/health/workflow-split` con la separación clara: **Mapa = puntual, Back Office = global/admin**.
- Nueva entrada `mem://admin/geo-maintenance-panel` corta: rename, framing, regla de banner masivo, no duplicar taxonomía con Salud.

## QA manual

1. Abrir Back Office → tab muestra "Mantenimiento geográfico (Admin)".
2. Header del panel muestra subheader + cross-link al mapa.
3. Las 3 cards muestran nombres nuevos y descripción "masiva/global".
4. `selectedIds=0` → banner ámbar "Operación masiva" arriba del botón.
5. Marcar 5 nodos en árbol → banner pasa a neutro "Procesarás 5 puntos seleccionados".
6. Lanzar un job pequeño → comportamiento del job idéntico al actual (sin regresión).
7. Cross-user (admin sobre otro usuario) → labels actualizados en lista de usuarios y resumen.

## NO se toca

- RPC `enqueue_health_repair`, `enqueue_admin_repair_for_user`, `geocoding_jobs`.
- Edge functions, store del job, ETA, realtime.
- Filtro de salud en el mapa, modal preview, audit.
- hardError masivo (aplazado).
- Job console / histórico (PR-3D).

¿Aplico?
