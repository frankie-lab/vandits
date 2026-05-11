## Por qué se veía al revés

Tu captura es correcta. La causa la introduje yo al añadir el "boost de propietario" en `micro`:

- En `micro` (z≤9, vista global), los puntos propios se fuerzan a **9 px** (`isOwn` → 9, ajenos → 5).
- En `compact` (z10–13), el tamaño es `base_normal × 0.7` ≈ `12 × 0.7 = 8 px`.
- Resultado: tus puntos en global (9 px) salen **más grandes** que al acercar a zoom medio (8 px).

Eso explica exactamente la sensación "grande lejos, pequeño cerca". El plan original decía "global 5 px, compact 8 px, standard 12 px, rich 14 px" — monotónico. Lo rompió la excepción `isOwn=9` en `micro`.

Has elegido **Sin boost en global**: en vista global todos los puntos son micro pequeño; la pertenencia se distingue solo por halo/capa, no por tamaño.

## Cambios

Archivo único: `src/components/map/map-icons.ts`.

1. **Quitar el boost de tamaño en `micro`**
   - `microSize` pasa a ser fijo `5 px` para todos (propios y ajenos).
   - Se mantiene la diferenciación visual de `isOwn` mediante el halo blanco más visible (`box-shadow 0 0 0 1.5px rgba(255,255,255,1)` + sombra externa), pero **sin cambiar el diámetro**.
   - Los puntos propios siguen yendo al pane `mine-pane` (ya está hecho en `LocationMap`), así que se dibujan encima de los ajenos.

2. **Asegurar progresión monotónica**
   ```text
   micro    z≤9    → 5 px (plano, sin SVG)
   compact  z10–13 → base × 0.7  (~8 px con base 12)
   standard z14–16 → base × 1.0  (~12 px)
   rich     z17+   → base × 1.15 (~14 px)
   ```
   Como `micro` < `compact` < `standard` < `rich` se respeta sin excepciones.

3. **No tocar nada más**
   - `LocationMap.tsx`, `useMarkerSizeConfig`, BD (`marker_size_config`): sin cambios.
   - Health rings, collection tint, paleta 3 estados, panes mine/others: intactos.

## Verificación

- z3 (global): todos los puntos a 5 px planos; los propios destacan por halo blanco más marcado y por estar en `mine-pane` encima.
- z10: salto perceptible a ~8 px con SVG sin gradiente.
- z14: ~12 px (canon BD).
- z18: ~14 px, con health rings y gradiente.
- Comprobar en la misma vista de tu captura (Luarca/global) que el punto pasa de "gordo lejano" a "fino lejano + crece al acercar".

## Riesgos

- Pérdida de "size cue" para identificar puntos propios en vista global. Se compensa con el halo y el pane superior. Si más adelante quieres recuperar tamaño extra para `isOwn`, lo haremos con un modificador que escale **todos** los modos a la vez, no solo `micro`, para no romper la monotonía.
