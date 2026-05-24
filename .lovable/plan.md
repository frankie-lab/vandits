## Objetivo
Corregir la UX de exportación para que exportar POIs propios sea una acción legítima, clara y amable, y para que el flujo real cumpla el canon ya documentado.

## Diagnóstico real del repo
El problema que reportas es correcto: la UX nueva no es la única surface activa.

### Estado actual encontrado
- `src/domains/content/components/ExportResolver.tsx`
  - Sí implementa una UX amistosa base.
  - No usa `typed-token` ni `window.confirm`.
  - Respeta formatos reales desde `POI_EXPORTERS`.
  - Muestra copy de propiedad: "Vandits creará una copia portable...".
- `src/domains/content/components/ExportPanel.tsx`
  - Ya delega en `ExportResolverBody`.
- `src/components/filters/SelectionActions.tsx`
  - Ya delega en `ExportResolverDialog`.
- `src/components/filters/EffectiveActionFooter.tsx`
  - Sigue teniendo el flujo legacy prohibido.
  - Mantiene `DestructiveConfirmDialog` con token `EXPORTAR`.
  - Mantiene threshold propio `EXPORT_CONFIRM_THRESHOLD = 250`.
  - Abre export sólo después de una confirmación agresiva.
  - Este es el incumplimiento principal del PR.
- `src/pages/Index.tsx`
  - El evento `lovable:open-export-panel` sigue abriendo el diálogo con `ExportPanel`, así que el footer legacy termina entrando tarde al resolver, pero pasando antes por la confirmación punitiva.

### Conclusión
Hoy conviven dos capas:
1. una UX nueva correcta en `ExportResolver`
2. un gate legacy agresivo en `EffectiveActionFooter`

Por eso el usuario sigue viendo una experiencia de exportación sospechosa aunque parte del refactor sí existe.

## Plan de corrección

### 1. Eliminar por completo la confirmación destructiva del path de export
Quitar en `EffectiveActionFooter` todo lo específico de export que contradice el canon:
- `EXPORT_CONFIRM_THRESHOLD = 250`
- estado `confirmExport`
- `DestructiveConfirmDialog` con token `EXPORTAR`
- cualquier copy de "confirmar exportación grande"

Resultado esperado:
- pulsar “Exportar” abre directamente el flujo de exportación,
- sin typed-token,
- sin confirmación punitiva,
- sin semántica de peligro.

### 2. Hacer que ExportResolver sea la SoT visual real en todos los entry points
Mantener el patrón ya empezado y cerrarlo del todo:
- `ExportPanel` sigue como wrapper inline de `ExportResolverBody`
- `SelectionActions` sigue usando `ExportResolverDialog`
- `EffectiveActionFooter` deja de tener una UX propia de confirmación y se limita a abrir el resolver mediante el evento existente

Resultado esperado:
- un único lenguaje,
- un único comportamiento,
- un único sistema de thresholds percibidos por el usuario.

### 3. Alinear la UX visible con los thresholds canónicos reales
Respetar estrictamente lo ya documentado:
- `<5000`: sin warning de tamaño
- `5000–10000`: aviso amable, no destructivo
- `>10000`: bloqueo amable con alternativas

Corrección específica del caso reportado:
- 1309 POIs no debe mostrar warning,
- no debe pedir confirmación,
- debe entrar directo al resolver con resumen y opciones.

### 4. Completar el resolver para que el primer estado visible sea útil, no defensivo
Ajustar `ExportResolver` para que el estado inicial priorice claridad operativa:
- resumen del contexto de exportación
- origen explícito (`selección`, `filtros`, `colección`, etc.)
- total candidatos / elegibles / no incluidos
- alcance (`Mis datos` vs `Compartible`)
- formatos disponibles reales
- copy de propiedad visible y estable
- explicación de exclusiones en lenguaje humano

Si falta algo del contrato UX, lo cerraré dentro del mismo componente, no fuera.

### 5. Endurecer los tests para cubrir el surface que hoy se escapó
Actualizar y ampliar contract tests para que no vuelva a pasar:
- `EffectiveActionFooter` no puede contener `EXPORTAR` typed-token en export
- `EffectiveActionFooter` no puede usar `DestructiveConfirmDialog` para export
- `EffectiveActionFooter` no puede usar threshold 250 para export
- el path completo de export debe delegar al resolver
- casos `<5000` no muestran warning de tamaño

También revisaré los tests actuales porque ahora cubren `SelectionActions` y `ExportPanel`, pero no blindan suficientemente `EffectiveActionFooter`.

### 6. Sin tocar lo que el PR excluye
Se mantiene fuera de alcance:
- elegibilidad
- pipeline de export
- helpers de tamaño
- serializers
- RLS
- GPX
- jobs background
- export history persistente
- cambios de contrato share/export

## Archivos objetivo
- `src/components/filters/EffectiveActionFooter.tsx`
- `src/domains/content/components/ExportResolver.tsx`
- `src/test/pr-export-3-resolver-ux.test.ts`
- `src/test/poi-export-pr2-ux.test.ts`
- cualquier test adicional de footer/export si hace falta blindaje específico

## Resultado esperado
Al pulsar “Exportar”, cualquier surface de la app debe llevar a un flujo único y amable donde el usuario entienda:
- qué va a exportar
- en qué formato
- qué queda fuera
- por qué queda fuera
- que sus ubicaciones seguirán en Vandits

## Detalles técnicos
```text
EffectiveActionFooter
  Exportar
    -> lovable:open-export-panel
      -> Index Dialog
        -> ExportPanel
          -> ExportResolverBody

SelectionActions
  Exportar
    -> ExportResolverDialog
      -> ExportResolverBody
```

La corrección consiste en eliminar el gate legacy previo al resolver, no en cambiar el pipeline canónico.