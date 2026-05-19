## Objetivo

Reclasificar la deuda "Materializar rollback anchors con tags Git" como **pendiente operativo externo no bloqueante**, separándola de la deuda técnica activa resoluble desde Lovable. Cambios sólo documentales.

## Archivos a modificar

1. `docs/tech-debt.md`
2. `docs/releases/version-history.md`

No se toca: `package.json`, `README.md`, `src/**`, `supabase/**`, `tests/**`, `docs/versioning.md`, `docs/architecture/**`, ni configuración de build/lint. No hay bump de versión.

## Cambios

### 1. `docs/tech-debt.md`

**Tabla "Estado auditado", fila 1.1** — actualizar tres columnas:

- Estado: `Pendiente operativo externo`
- Tipo: `Release management externo`
- Comentario: `Rollback anchors documentados; tags Git reales pendientes fuera de Lovable. No bloquea deuda técnica resoluble desde Lovable.`

**Bloque detallado "1.1. Materializar rollback anchors con tags Git"**:

- Cambiar `Estado: pendiente operativo (2026-05-19)` → `Estado: pendiente operativo externo no bloqueante (2026-05-19)`.
- Añadir frase explícita: *"Esta deuda no se considera bloqueante para continuar con deuda técnica resoluble desde Lovable, porque Lovable no tiene capacidad de crear tags Git reales. El cierre documental está completo; el cierre operativo requiere GitHub o git local."*
- Mantener la lista de 10 tags pendientes (`v1.1.1` … `v1.2.8`) **intacta y sin marcar ninguno como creado**.

### 2. `docs/releases/version-history.md`

**Sección "Release / rollback anchors"**:

- Mantener la lista "Tags Git pendientes de crear" intacta (10 entradas `[ ]`, ninguna marcada).
- Añadir al final de esa sección la nota: *"Nota de ejecución: los tags Git reales son una acción operativa externa. Lovable no puede crearlos desde este entorno. Por tanto, esta lista queda auditada como pendiente externo y no bloquea el avance de deuda técnica resoluble en Lovable."*

## Version impact

`none` — sólo reclasificación documental.

## Validación

Tests/lint no se ejecutan (`docs-only operational classification`). Reporte final confirmará:

- archivos modificados (los 2 listados);
- `package.json`, `README.md` y código no tocados;
- ningún tag marcado como creado;
- deuda 1.1 queda como `Pendiente operativo externo no bloqueante`.
