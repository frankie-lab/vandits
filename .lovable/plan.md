## Objetivo

Refactorizar `RecoverImagesPanel` para que comparta la **misma estructura de 3 zonas** que `GeographyBackfillPanel` ("Mantenimiento geográfico"):

```text
┌─ Paso 1 · Modo (tarjetas horizontales con métrica del universo) ─┐
├─ Usuarios (admin) ┬─ Árbol/Selector de alcance ┬─ Lanzar / Job ──┤
└──────────────────────────────────────────────────────────────────┘
```

## Mapeo de conceptos

| Mantenimiento geográfico | Recuperar imágenes |
|---|---|
| Modos: `repair`, `fill`, `review` | Modos: `missing` (sin imagen), `low_quality` (placeholder/baja), `force` (reescribir todas) |
| Filtro por health (`broken`, `partial`, `ok`…) | Filtro por estado de imagen + `retryStaleDays` |
| `AdminBrokenUsersList` (usuarios con métricas) | Misma lista, mostrando nº POIs sin imagen por usuario |
| `GeographyScopeTree` (Continente → País → Región → Zona) | Mismo árbol — filtra el universo a recuperar |
| Columna 3 "Lanzar sobre universo (N)" | Columna 3 "Recuperar imágenes (N)" |

## Paso 1 · Tarjetas de modo

Tres tarjetas horizontales con icono + métrica grande + chips de desglose:

- **Sin imagen** (`ImageOff`, ámbar) → universo = POIs enriquecidos sin `cover_image_url`. Chips: `Nunca intentados N` · `Reintentables N` · `En cooldown N`.
- **Imagen de baja calidad** (`ImageMinus`, azul) → POIs con cover de placeholder/baja resolución conocida.
- **Forzar re-scan** (`RefreshCw`, destructive) → todo el universo seleccionado, ignora intentos previos. Equivale al toggle `force` actual.

Seleccionar una tarjeta dicta el filtro de POIs que se cuenta en el árbol y la lista de usuarios (igual que `modeToHealthFilter` en geo).

## Paso 2 · Selector de alcance (3 columnas)

1. **Usuarios** — reutilizar `AdminBrokenUsersList` parametrizado con la query de "POIs candidatos a recuperar imagen" en lugar de `broken geo`. Click selecciona target user (admin puede lanzar cross-user). `self` por defecto.
2. **Árbol geográfico** — reutilizar `GeographyScopeTree` tal cual. Sustituye los inputs libres actuales (`País`, `Región`, `Zona`) que pasan a derivarse de los nodos marcados. La selección produce `locationIds[]` exactos (igual que geo).
3. **Lanzar** — panel resumen idéntico al de geo:
   - Modo / Usuario / Universo / Selección
   - Aviso "Operación masiva" cuando `selección === universo`
   - Botón primario `Recuperar imágenes (N)` o `Detener` si `running`
   - Nota fija: "Solo toca `cover_image_url` y `image_attempts_log`. No modifica nombre, descripción, enriquecimiento ni notas."

## Configuración avanzada (colapsable)

Mover a un `Collapsible` "Opciones avanzadas" debajo del paso 1, fuera del flujo principal:
- `Tamaño de lote` (default 50)
- `Reintentar tras N días` (slider, default 30)
- `Dry-run` (toggle, **on por defecto** — el botón cambia a `Ejecutar dry-run (N)`)
- `Tope total` (input numérico, opcional)
- Rango `creado entre` (date pickers)

Las "Franjas geográficas" actuales (`country`/`region`/`zone` como texto) **se eliminan**: ahora vienen del árbol.

## Estado y store

- Mantener `useImageRecoveryJobStore` sin cambios funcionales.
- Añadir nuevo modo `low_quality` en el edge function (filtro adicional sobre `cover_image_url` LIKE placeholders conocidos) — opcional, se puede dejar como TODO si prefieres no tocar backend ahora.
- El árbol pasa `locationIds` al store vía el `scope='ids'` ya existente; ya no hace falta el modo `user` separado (lo cubre la columna de usuarios).

## Archivos afectados

- **Editar** `src/components/admin/RecoverImagesPanel.tsx` — reestructura completa siguiendo el layout de `GeographyBackfillPanel`.
- **Reutilizar** `src/components/admin/GeographyScopeTree.tsx` y `src/components/admin/AdminBrokenUsersList.tsx`. Si su query actual está acoplada a "broken geo", extraer un `dataSource` prop o crear variantes paralelas (`ImageRecoveryScopeTree`, `AdminMissingImagesUsersList`) consumiendo la misma forma de datos pero con otra RPC/query.
- **Sin cambios** en `src/stores/image-recovery-job-store.ts` ni en el edge function (salvo añadir `low_quality` si se aprueba).

## Decisión pendiente antes de implementar

¿Quieres que extraiga **componentes genéricos compartidos** (`AdminScopeTree`, `AdminUsersList` con un prop `dataSource`) para que ambos paneles los compartan limpiamente, o prefieres **duplicar** los componentes con sufijo (`ImageRecovery*`) y dejar la abstracción para más adelante?

Recomiendo la primera (genéricos con `dataSource`) porque cumple la regla transversal "cambios en helpers centrales" del proyecto.