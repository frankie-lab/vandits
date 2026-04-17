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

## Regla de hijos del PanelBody (obligatoria)

Cualquier componente renderizado **dentro** de un `PanelBody` (o de un
`PanelTabs.Content` dentro de un `PanelBody`) es contenido, no carcasa:

1. **Padding cero** en el contenedor raíz del hijo (lo pone `PanelBody`).
   Excepción: `<PanelBody noPadding>` y el hijo gestiona TODO con los
   mismos tokens. Nunca mezclar ambos sistemas.
2. **Sin `rounded-*` ni `border`** en el contenedor raíz del hijo.
3. **Sub-tabs internos vía `PanelTabs`** (prohibido `@/components/ui/tabs`
   directo dentro de un panel).
4. **CTAs primarias vía `PanelFooter`** sticky o respetando `h-11` (44px).
   Sin gradientes ni colores fuera de los semantic tokens.
5. **Títulos de sección vía `PanelSection`** (uppercase pequeña + token
   `--panel-section-title-mb`).
6. **Filas de lista** altura mínima `--panel-list-row-min-h: 56px` y
   separación `--panel-block-gap`.
7. **Inputs/selects** altura `--panel-input-h: 44px`.

**Test rápido:** si quitas `PanelBody` y el hijo sigue pintando su propio
contenedor con padding, border o radio, está mal escrito.

**Aplicación en Fase 2:** auditar y normalizar los hijos ANTES de migrar
la carcasa. Si no, la carcasa nueva parece coherente pero el contenido
sigue divergiendo (caso detectado con `OneDrivePhotosPanel` en el piloto).

## Checklist PR (obligatoria)

Carcasa:
- [ ] ¿Usa `PanelShell`?
- [ ] ¿Declara variante (`form`/`library`/`workflow`)?
- [ ] ¿Respeta tokens (no números mágicos)?
- [ ] ¿Tabs vía `PanelTabs`?
- [ ] ¿Único scroll principal?
- [ ] ¿Estado vacío vía `PanelEmptyState`?
- [ ] ¿CTA primaria en lugar correcto?

Hijos del PanelBody:
- [ ] Hijos sin padding propio en su raíz
- [ ] Hijos sin border ni rounded propios en su raíz
- [ ] Sub-tabs internos vía `PanelTabs` (no Radix Tabs directo)
- [ ] Labels de agrupación vía `PanelSection`
- [ ] Filas de lista usan `--panel-list-row-min-h`
- [ ] Inputs usan `--panel-input-h`
- [ ] CTAs internas usan `h-11` y semantic tokens (sin gradientes adhoc)

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
