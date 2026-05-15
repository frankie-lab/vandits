## Objetivo

En el popup de POIs sin enriquecer y **sin localización clara** (variante simple, `!parsed` en `UnenrichedRecoveryBlock.tsx`), el botón **"Enriquecer"** sólo debe aparecer **después de que el usuario haya abierto al menos una vez "Contexto cercano"**. Antes de eso, el único CTA visible es "Contexto cercano".

Razón: enriquecer sin haber revisado los puntos cercanos produce resultados pobres porque el modelo no tiene un ancla geográfica fiable.

## Diagnóstico

`src/domains/content/components/UnenrichedRecoveryBlock.tsx`, rama `if (!parsed)` (líneas 379–414): hoy se renderizan ambos botones a la vez, "Enriquecer" (primario) y "Contexto cercano" (ghost).

El estado `showNearby` ya existe (línea 99) y se togglea en `handleOpenContext` (línea 143).

## Cambio

1. Añadir un nuevo estado local `nearbyEverOpened` (boolean) que se ponga a `true` la primera vez que el usuario abre "Contexto cercano" y nunca vuelva a `false`.

   ```tsx
   const [nearbyEverOpened, setNearbyEverOpened] = React.useState(false);

   const handleOpenContext = () => {
     setShowNearby((v) => {
       const next = !v;
       if (next) setNearbyEverOpened(true);
       return next;
     });
   };
   ```

2. En la rama `if (!parsed)`:
   - Si `!nearbyEverOpened`: renderizar **sólo** el botón "Contexto cercano", a ancho completo (`flex-1`), como CTA principal (variant `default`).
   - Si `nearbyEverOpened`: renderizar la fila actual con "Enriquecer" (primary, flex-1) + "Contexto cercano" (ghost), tal cual está hoy.

3. El badge "Sin localización clara" y el bloque inline `inlineNearby` no cambian.

## Alcance

- Sólo afecta la variante `card` de `UnenrichedRecoveryBlock` cuando `parsed == null` (caso "Sin localización clara").
- La variante `row` y la rama `parsed != null` (con candidatos de coherencia) no se tocan.
- Sin cambios de lógica de negocio, sin cambios en `triggerEnrichLocation`, sin cambios en `NearbyPanel`.

## Fuera de alcance

- No se persiste el flag entre sesiones: si el usuario cierra y reabre el popup, vuelve a tener que abrir "Contexto cercano" primero. Esto refuerza la intención (revisar antes de enriquecer).
- No se cambia el comportamiento cuando hay conflicto/coherencia.
