
# PR-SOCIAL-1.1 — Fila de seguidos: contención horizontal

## Diagnóstico

Panel = `w-[340px]`. Row = `p-3 + gap-3` → contenido útil ≈ 316 px.
Costes fijos por fila:

```text
avatar 40 + gap 12 + [info FLEX] + gap 12 + mute 28 + filter 28 + follow 28
                                                = 148 px de cromo
```

Quedan ~168 px para el metadato. Frases del tipo
`329 compartidos · 336 totales · hace 18 minutos · +14 (7d)` (≈ 60 chars)
no caben con `truncate` sin perder información útil, y con tres botones a la
derecha la línea acaba empujando el redondeo derecho del panel — lo que ves en
la captura.

## Cambios

### 1. Metadato compacto + dos líneas

Sustituir la línea verbosa por iconos + números + segunda línea opcional. Sigue
siendo legible sin tooltip, pero el tooltip da el detalle largo.

```text
[Avatar]  Sandbox Agent                              [Mute] [Filter] [Follow]
          ⇗ 329 · 🔒 336 · ⏱ 18m · ↗ +14
          [Sigues] [Te sigue]
```

Iconos Lucide (no emojis):

| Métrica | Icono | Aria |
|---|---|---|
| `sharedPois` | `Share2` (12 px) | "POIs visibles para ti (curados)" |
| `totalPois` (si != null) | `Lock` (12 px) | "Total de su catálogo" |
| `lastContributionAt` | `Clock` (12 px) | "Último POI" — `formatDistanceToNowStrict` con `addSuffix: false` (devuelve `18 m`, `2 h`, `3 d`, no "hace 18 minutos") |
| `contributions7d` (>0) | `TrendingUp` (12 px) | "Contribuciones últimos 7 días" |

Cada chip métrica = `inline-flex items-center gap-1 shrink-0 tabular-nums`.
Línea con `flex flex-wrap gap-x-2 gap-y-0.5` para que si no caben las 4 saltan
a una segunda línea sin romper el panel.

Tooltip largo se mantiene en el contenedor:
`329 visibles para ti · 336 totales en su catálogo · hace 18 min · +14 (7d)`.

### 2. Reducir cromo del row

- `p-3` → `p-2.5` (ahorra 4 px laterales, más aire entre elementos densos).
- `gap-3` → `gap-2`.
- Botones de acción `p-1.5` → `p-1`, icono `w-4 h-4` → `w-3.5 h-3.5`. Sigue
  siendo área tactil suficiente (28→24 px) y dispara los chips de estado a la
  zona segura.
- Truncado del nombre `max-w-[160px]` → `max-w-full` con `truncate` heredado:
  el nombre es lo que más merece la línea completa.

### 3. Colapsar acciones cuando no aplican

Hoy se renderizan siempre los 3 huecos. Reglas finales:

| Caso | Mute | Filter | Follow |
|---|---|---|---|
| `isCurrentUser` | — | sí | — |
| `followStatus==='accepted'` | sí | sí | Unfollow |
| `pending` | — | — | Cancel |
| `none` | — | — | Follow |

Para no-followed (`none`/`pending`) no se reservan slots vacíos — la línea de
metadato gana ~60 px.

### 4. Tarjeta del usuario actual (header)

Misma operación: iconos compactos + tooltip largo, `p-3 → p-2.5`.

## Anti-regresión

- La fila NO debe poder ensanchar el panel: añadir `min-w-0` al `motion.div`
  raíz del row y `overflow-hidden` al `ScrollArea` viewport ya existente.
- `formatDistanceToNowStrict({ unit: undefined })` (auto picks largest) +
  reemplazo en cliente del label largo (`minute→m`, `hour→h`, `day→d`,
  `month→mo`, `year→y`) — sin `date-fns/locale/es` para "hace…", para
  evitar regresar a 14 caracteres.

## Archivos tocados

- `src/components/UsersSidebar.tsx` (solo este archivo; sin cambios de RPC,
  store o memoria).

## No se toca

- RPC `get_followed_user_stats`.
- Privacidad de `total_pois`.
- Helper `isShareablePoi`.
- Memoria `mem://ui/social/users-sidebar-spec` (solo se añadirá una nota:
  "metadato de fila se compacta con iconos Lucide + segunda línea wrap").
