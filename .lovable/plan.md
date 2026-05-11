# Plan: render del color en su contexto (claro/oscuro)

Cambio acotado a `ColorSwatchColumn` en `src/components/admin/design-system/TokenRow.tsx`. Ni store ni tokens cambian.

## Problema

Hoy cada columna se pinta entera con el color del token. Resultado: dos rectángulos de color y ningún contexto. No se aprecia cómo se lee el color sobre fondo claro vs fondo oscuro, que es justamente la razón de tener par light/dark.

## Resultado visual nuevo

Cada columna pasa a ser un **lienzo de surface** (su `surface.background` del modo) con la muestra del color **dentro**, como aparecería en la app real.

```text
┌───── CLARO ─────────────┐  ┌───── OSCURO ────────────┐
│ surface light (#FBFAF9) │  │ surface dark (#101318)  │
│                         │  │                         │
│   ┌──────────────────┐  │  │   ┌──────────────────┐  │
│   │   color sample   │  │  │   │   color sample   │  │
│   │   "Texto sobre"  │  │  │   │   "Texto sobre"  │  │
│   │   #DF6C20  4.5:1 │  │  │   │   #E87A30  6.2:1 │  │
│   └──────────────────┘  │  │   └──────────────────┘  │
│ CLARO                   │  │ OSCURO                  │
└─────────────────────────┘  └─────────────────────────┘
```

- **Fondo de la columna** = `surface.background` del modo (o el surface mapeado por `ROLE_SURFACE_MAP` para roles especiales: `poi.* → map.background`, `state.* → surface.card`, etc.). Click en la columna NO edita el surface, sigue editando el token.
- **Muestra central** (chip) = el color del token. Forma según rol:
  - Texto (`text.*`, `*.foreground`): una palabra/frase pintada en el color del token sobre el surface. Sin chip de fondo. Esto demuestra legibilidad real.
  - Resto (brand, surface, state.bg, poi, map): un chip rectangular ~70% × 60% relleno del color, con HEX y badge WCAG superpuestos.
- **Label del modo** ("Claro" / "Oscuro") en una esquina, con color contrastado contra el surface (no contra el color del token).
- **WCAG badge** se mantiene, calculado contra el surface destino (igual que ahora).
- **Click en cualquier punto de la columna** abre el editor del color (mantiene `EditableTokenSurface`).

## Detección rol-tipo (texto vs fondo)

Helper local muy simple basado en el path:

```ts
function isForegroundRole(role: string): boolean {
  if (role.startsWith('text.')) return true;
  if (role.endsWith('Foreground') || role.endsWith('-foreground')) return true;
  if (role === 'brand.accentForeground') return true;
  return false;
}
```

Si es foreground → render como texto sobre surface. Si no → chip relleno.

## Casos especiales

- **Token surface (p. ej. `surface.background`, `surface.card`)**: el "fondo" y el "color del token" coinciden. En ese caso la columna se pinta entera con el propio color (como ahora) y la muestra se omite — no hay contexto que enseñar.
- **Sin `surface` mapeado**: fallback a `surface.background` del modo.

## Archivos a tocar

Solo `src/components/admin/design-system/TokenRow.tsx` (función `ColorSwatchColumn` + helper `isForegroundRole`). El resto (info column, auto-link, store) queda intacto.

## Fuera de alcance

- Reglas de mapeo (`ROLE_SURFACE_MAP`) — no se tocan.
- Editor de color (popover) — no cambia.
- Otros tipos de token — no cambian.
