## Problema detectado
Sí: el problema es real y está en dos capas distintas.

1. **La persistencia sí funciona**
   En base de datos ya existen 5 asignaciones `owner-v2.1-oklch` distintas para Frankie GMZ. O sea, no estamos ante “todos guardados igual” ni ante un fallo de escritura general.

2. **La matemática del allocator sigue rompiendo la regla pactada**
   Ahora mismo `pickNextIdentityColor()` hace esto:
   - primer seguido: maximiza distancia contra `FORBIDDEN_ANCHORS`
   - siguientes seguidos: maximiza distancia **solo contra los colores ya asignados**

   Eso **no cumple** tu norma operativa real, que es:
   ```text
   S = colores ya asignados + anchors reservados
   ```
   
   Por eso ya hay colores persistidos demasiado cerca de anchors reservados:
   - Explorador Alpha: cerca de naranja/verde/ámbar
   - frankie: cerca de magenta
   - Aventurera Beta: cerca de verde

   Es decir: aunque sean distintos entre sí, el allocator no está respetando la exclusión continua frente a la gramática del sistema.

3. **El sidebar probablemente muestra color stale aunque el store ya cambió**
   `UsersSidebar` lee `getOwnerIdentityOklch(user.id)` directamente, pero **no está suscrito** al store externo. Las asignaciones nuevas se escriben en background y el mapa sí repinta porque escucha `lovable:owner-identity-updated`; el sidebar no. Eso explica perfectamente que en Social sigas viendo todos “iguales” o sin actualizar aunque la base ya tenga otros valores.

## Plan
1. **Corregir el allocator**
   Reescribir la función de scoring para que cada nuevo color maximice su distancia mínima frente a:
   - colores ya asignados
   - `FORBIDDEN_ANCHORS`

   Así el primer seguido y todos los siguientes obedecen la misma regla incremental e inmutable.

2. **Purgar las asignaciones `owner-v2.1-oklch` ya generadas con la matemática defectuosa**
   Como esas 5 filas actuales ya nacieron con una regla incorrecta, hay que borrarlas y regenerarlas con la versión corregida. Mantendría trazabilidad subiendo la versión de paleta.

3. **Hacer reactivo el sidebar**
   Añadir suscripción del `UsersSidebar` al store de identidad usando el patrón React correcto para store externo (`useSyncExternalStore` o equivalente centralizado del proyecto), para que los badges de color se actualicen cuando entren los assignments nuevos.

4. **Validación**
   - tests del allocator: cada nuevo pick debe optimizar contra `assigned + anchors`
   - test/regresión del sidebar/store: al emitirse `lovable:owner-identity-updated`, el color visible cambia sin recargar
   - comprobación en preview: Social y mapa deben mostrar identidades claramente distintas y no cercanas al verde curado ni al resto de anchors reservados

## Detalles técnicos
- Archivos probables:
  - `src/lib/color/identity-allocator.ts`
  - `src/stores/owner-identity-store.ts`
  - `src/components/UsersSidebar.tsx`
  - `src/test/owner-identity-allocator.test.ts`
  - nueva migración SQL para purga de filas generadas con la lógica defectuosa
- Mantendré el contrato de inmutabilidad para lo correcto; solo se purgan las filas creadas por una versión matemáticamente inválida.
- No tocaré renderer de mapa salvo que la validación muestre un segundo bug independiente.