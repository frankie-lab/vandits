## Objetivo
Corregir la lógica de identidad de usuarios seguidos con esta regla explícita:

- **seguidos no pueden usar verdes**
- **seguidos no pueden usar grises**
- la identidad sigue siendo **triángulo invertido**
- el color sigue siendo **persistente por viewer+followed**
- no se recalculan colores válidos ya existentes; solo se corrigen los inválidos según la nueva norma

## Regla canónica actualizada
Para seguidos:
- forma = triángulo invertido
- fill = identidad social persistente
- exclusiones cromáticas duras = **vecindad perceptual del verde curado** + **zona neutral/gris de baja cromaticidad**
- resto de la rueda disponible
- cada nuevo seguido recibe el color que maximiza distancia perceptual contra los ya asignados válidos
- los colores asignados no se recalculan jamás, salvo si ya incumplen esta nueva regla dura

## Qué está roto hoy
1. **La norma del allocator está incompleta para tu criterio actual**
   - ahora solo excluye verde
   - no excluye grises/neutrales

2. **La sidebar está contaminando la semántica**
   - asegura colores para usuarios visibles, no solo seguidos aceptados
   - puede enseñar color de fallback antes de cargar la asignación persistida
   - puede mostrar triángulo donde no toca

3. **Puede haber datos persistidos que ya nacieron con una regla incorrecta**
   - esos casos no se arreglan solo cambiando render
   - hay que corregir las filas inválidas en datos

## Implementación
### 1) Corregir la fuente de verdad del allocator
En `src/lib/color/identity-allocator.ts`:
- añadir una segunda exclusión dura para **grises/neutrales**
- definir la regla de neutralidad de forma explícita y testeable
  - opción esperable: excluir candidatos con `C` por debajo de un umbral neutral
  - como el muestreo actual usa `C ∈ {0.14, 0.18}`, revisaré si `0.14` se considera todavía demasiado gris para identidad social y, si lo es, se elimina del espacio útil
- mantener el maximin incremental e inmutable sobre el nuevo espacio válido

### 2) Corregir el conjunto de usuarios que participa en el orden
En `src/components/UsersSidebar.tsx`:
- `followedUids` debe salir **solo** de `followStatus === 'accepted'`
- mantener el orden determinista únicamente sobre ese subconjunto
- no generar identidad para usuarios visibles que no son seguidos reales

### 3) Corregir render y carga en sidebar
En `src/components/UsersSidebar.tsx`:
- cargar asignaciones persistidas antes del primer render útil de la insignia
- mostrar triángulo solo para seguidos aceptados
- suscribir la sidebar a `OWNER_IDENTITY_UPDATED_EVENT` para refrescar cuando entren asignaciones nuevas
- evitar que el fallback visual se haga pasar por identidad persistida en sidebar

### 4) Corregir datos existentes que ya sean inválidos
Si hay filas en `user_owner_color_assignments` con color prohibido por la nueva norma:
- **no usar migración**
- corregirlas con operación de datos
- estrategia prevista:
  - leer asignaciones actuales del viewer
  - detectar filas inválidas por verde o gris
  - regenerar solo esas filas inválidas respetando el conjunto ya válido
  - preservar las válidas

## Validación
### Código
Añadir/ajustar tests para confirmar:
- ningún candidato válido cae en verde
- ningún candidato válido cae en gris/neutral
- el primer pick y los siguientes picks nunca salen verdes ni grises
- el allocator sigue siendo determinista e inmutable

### UI
Verificar que:
- mapa y sidebar coinciden
- usuarios no seguidos no muestran triángulo
- no aparece ningún seguido con verde o gris
- no rota el orden al recargar

## Archivos previstos
- `src/lib/color/identity-allocator.ts`
- `src/test/owner-identity-allocator.test.ts`
- `src/components/UsersSidebar.tsx`
- posible ajuste pequeño en `src/components/map/owner-stroke.ts` si hace falta separar mejor fallback técnico de color persistido visible

## Nota importante
No voy a volver a tratar verde o gris como válidos para seguidos en esta iteración.