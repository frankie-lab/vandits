# Entendido

Sí: pides que aplique tu norma exacta, sin volver a reinterpretarla y sin más preguntas.

La corrección se hará con este contrato:

- las asignaciones históricas actuales se pueden borrar
- tras ese borrado, se recalculan desde cero con la nueva norma
- a partir de ese nuevo estado, cada color queda fijo e inmutable
- cada nuevo seguido recibe el color más distante del conjunto ya asignado en ese momento
- no se reutilizan colores ya asignados
- no se admiten colores que entren en conflicto con la gramática reservada del sistema

# Plan de ejecución

## 1. Reescribir la regla central del allocator
Actualizar `src/lib/color/identity-allocator.ts` para que la selección deje de depender de la lógica actual y pase a obedecer estrictamente esta norma:

- conjunto base = colores ya asignados válidos tras el reset
- cada nuevo seguido elige el color más distante de ese conjunto
- el conjunto crece de forma incremental
- los colores ya asignados no se recalculan ni se recolorean después
- exclusión dura de familias reservadas del sistema

## 2. Regenerar los datos históricos
Eliminar las asignaciones actuales defectuosas de `user_owner_color_assignments` como operación de datos y dejar que se regeneren con la nueva norma.

Esto se hará como **dato**, no como cambio de esquema.

## 3. Versionar la nueva paleta
Bump de versión en runtime para separar claramente:

- asignaciones antiguas inválidas
- asignaciones nuevas nacidas con la regla correcta

## 4. Endurecer tests según tu norma real
Actualizar `src/test/owner-identity-allocator.test.ts` para validar:

- reinicio limpio y regeneración coherente
- orden incremental
- inmutabilidad después del nuevo cálculo
- no reutilización
- exclusión de colores reservados
- separación perceptiva suficiente entre todos los seguidos ya asignados

## 5. Verificación final sobre el caso real
Comprobar el resultado regenerado con tus seguidos actuales para asegurar que:

- desaparecen los colores semánticamente prohibidos
- no quedan dos usuarios con colores visualmente casi iguales
- la secuencia de asignación sigue la lógica incremental pactada

# Archivos implicados

- `src/lib/color/identity-allocator.ts`
- `src/test/owner-identity-allocator.test.ts`
- `src/components/map/owner-stroke.ts` solo si el fallback necesita endurecerse
- operación de datos sobre `user_owner_color_assignments`
- memoria del contrato, si procede actualizarla

# Resultado esperado

No se va a “maquillar” el resultado actual.
Se va a sustituir la regla equivocada por la tuya, borrar las asignaciones malas y regenerarlas correctamente desde cero.