
## Unificar números, locale, iconos a la derecha y mover Itinerarios

### Cambios en `src/components/FloatingToolbar.tsx`

**1. Helper de formateo numérico (nuevo, local al archivo)**
Crear pequeña utilidad `formatCount(n)` que use `Intl.NumberFormat(navigator.language)`:
- ES/IT/DE/FR → `1.234` / `1.234.567`
- EN/US → `1,234` / `1,234,567`
- Para `n ≥ 1.000.000` usa formato compacto: `1,2M` / `1.2M` según locale.
- Para `n ≥ 100.000` mantiene separador de miles (ej. `123.456`).
- Para `n < 1.000` sin separador.

Norma:
- `< 1 000` → tal cual (`842`)
- `1 000 – 99 999` → con separador de miles del locale (`1.234`, `12.345`)
- `100 000 – 999 999` → con separador de miles (`123.456`)
- `≥ 1 000 000` → compacto con 1 decimal (`1,2M`)

Aplicar a TODOS los counters de la barra (catálogo verde/azul, seguidos, seguidores, badge pendientes).

**2. Unificar el "cuerpo" tipográfico de los números**
Hoy conviven tamaños distintos:
- Catálogo verde/azul: `text-xl font-bold`
- Social (seguidos/seguidores): `text-sm font-semibold`

Unificar todos a la misma jerarquía visual: `text-base font-semibold tabular-nums leading-none`. Mantener el color (verde/azul/foreground) pero igualar peso, tamaño y altura de línea para que la fila sea homogénea. Conservar el `/` separador del par catálogo en `text-base text-muted-foreground`.

**3. Iconos a la derecha del numeral**
Hoy:
- Catálogo: `[●verde 2452] / [●azul 2452]` — el dot va a la izquierda.
- Social: `[icon] [4]` — icono a la izquierda.

Cambiar a "número primero, icono después" en todos los bloques de la barra:
- Catálogo verde: `2.452 ●` (dot a la derecha, mismo color verde)
- Catálogo azul: `2.452 ●` (dot a la derecha, mismo color azul)
- Seguidos: `4 [UserCheck]`
- Seguidores: `2 [Users]` (badge de pendientes se mantiene anclado al icono)

Esto se hace invirtiendo el orden de los hijos en cada `<button>`/`<div>` dentro de las secciones "Catálogo counter" (líneas ~582-609) y "Social Stats" (líneas ~650-687). Se mantiene el `gap-1.5` y los tooltips intactos.

**4. Mover botón Itinerarios (Route) a la derecha del avatar**
Hoy `onToggleRoutes` está en SECTION 4 (líneas ~696-710), justo antes del separador y `UserMenu`.

Mover el bloque `{onToggleRoutes && (...)}` al final del componente, **después** del `<UserMenu>` (línea ~733 aprox.) — añadiendo un pequeño separador `w-px h-6 bg-border/50 mx-1` entre avatar y el botón. Eliminar la sección 4 entera si queda vacía tras mover Itinerarios (ya está vacía: solo contenía Itinerarios desde que se eliminó la lista de ubicaciones).

### Resultado visual esperado (referencia barra)

```
[2.452 ●verde] / [2.452 ●azul]  | 4 [UserCheck]  2 [Users]  | [avatar] | [Route]
```

### Archivos tocados

- `src/components/FloatingToolbar.tsx` (único archivo)

### Fuera de alcance

- No se añade preferencia de locale del usuario (se usa `navigator.language` del navegador). Si más adelante el perfil tiene `country_code`, basta con sustituir el argumento del helper.
- No se cambia la lógica de cálculo de stats ni los handlers.
- No se toca `LayersPanel`, `UserMenu` ni `LocationMap` (ese `toLocaleString('es-ES')` ya está hardcodeado en el panel de bienvenida y se puede unificar en otra pasada si lo pides).
