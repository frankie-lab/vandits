# ADR 003 — Panel System (Norma UX VANDITS v1)

**Status**: Accepted (2026-04-17)
**Scope**: Toda carcasa de panel lateral, sheet, drawer o cuadro flotante.

## Context

Cada dominio (Identity, Content, Discovery, Routes…) había inventado su propia
carcasa visual. Resultado: padding inconsistente, headers heterogéneos, tabs
con tres estilos distintos, footers que aparecían y desaparecían, densidad
variable. El usuario percibía la app como un mosaico de productos distintos.

## Decision

Existe **un único sistema de paneles** en `src/shared/components/ui/panel/`.
Ningún feature puede inventar su propia carcasa. Tres variantes únicas:

| Variante | Uso | Patrón |
|---|---|---|
| `form` | Edición/configuración (Perfil, Categorías, Ajustes) | Aire vertical, footer con CTA estable |
| `library` | Listas/exploración (Documentos, OneDrive, Auditoría) | Densidad alta, filtros arriba, scroll en body |
| `workflow` | Procesos/asistentes (Importar, Validar, Enriquecer) | Pasos claros, empty state fuerte, validaciones visibles |

## Componentes

- `PanelShell` — carcasa única (envuelve `FloatingPanel`/`Drawer` actuales)
- `PanelHeader` — sub-header opcional interno
- `PanelBody` — único scroll, padding y gap canónicos
- `PanelFooter` — sticky con CTA primaria
- `PanelSection` — bloque semántico con título sistemático
- `PanelTabs` (+ `.Group`, `.Header`, `.Trigger`, `.Content`) — tabs uniformes con agrupación visual
- `PanelEmptyState` — estado vacío canónico (icon + title obligatorios)

## Tokens

Fuente única en `panel/tokens.css` (CSS vars). El espejo JS (`tokens.ts`)
existe solo para tests y cálculos puntuales. Tokens base:

```
--panel-radius: 16px
--panel-header-h: 56px
--panel-footer-min-h: 72px
--panel-padding-x / -y: 16px
--panel-section-gap: 24px
--panel-block-gap: 16px
--panel-tabs-h: 40px
--panel-tabs-radius: 12px
--panel-list-row-min-h: 56px
--panel-input-h: 44px
--panel-cta-h: 44px
--panel-empty-padding: 24px
```

## Reglas de composición

1. Un solo contenedor principal — no anidar tarjetas dentro de tarjetas.
2. Un solo nivel de énfasis por bloque.
3. Un único scroll dominante por panel.
4. Una sola CTA primaria por footer/bloque.
5. Tabs uniformes: 40px altura, radio 12, mismo activo en todos los grupos.
6. Estado vacío SIEMPRE vía `PanelEmptyState`.

## Checklist PR (obligatoria)

- [ ] ¿Usa `PanelShell`?
- [ ] ¿Declara variante (`form`/`library`/`workflow`)?
- [ ] ¿Respeta tokens (no números mágicos)?
- [ ] ¿Tabs vía `PanelTabs`?
- [ ] ¿Único scroll principal?
- [ ] ¿Estado vacío vía `PanelEmptyState`?
- [ ] ¿CTA primaria en lugar correcto?
- [ ] ¿Evita niveles innecesarios de contenedor?
- [ ] ¿Parece de la misma familia que los demás?

## Migración

Por fases. `FloatingPanel` queda vivo durante la migración y solo se marcará
`@deprecated` cuando los 4 paneles principales (Contenido, Perfil, OneDrive,
Categorías) estén migrados.

| Fase | Pantalla | Estado |
|---|---|---|
| 0 | Sistema base (componentes + tokens) | ✅ Done |
| 1 | `ImportedContentPanel` (piloto) | ✅ Done |
| 2a | Perfil | Pending |
| 2b | OneDrive standalone | Pending |
| 2c | Categorías personales | Pending |
| 3 | Marcar `FloatingPanel` deprecated | Pending |

## Consequences

**Positivas:**
- Coherencia visual cross-dominio.
- Menor mantenimiento (un solo sitio para cambiar header/footer/tabs).
- Onboarding nuevos devs trivial: una API, tres variantes.

**Negativas:**
- Migración incremental → coexisten dos sistemas durante semanas.
- Riesgo bajo de que la API de `PanelTabs.Group` no cubra casos exóticos
  futuros; mitigado por el piloto que valida el caso más complejo (jerarquía
  Fuentes/Biblioteca).
