## Objetivo
Hacer que los cambios de «Geografía universal» se vean de forma inmediata y coherente en la UI, y que el árbol de POIs geográficos use la misma lógica jerárquica esperada.

## Qué está pasando ahora
- El proceso de normalización sí está actualizando datos de geografía en backend.
- La barra y los contadores reflejan progreso del job, pero la UI principal no siempre muestra el efecto visible al terminar.
- El árbol del panel se construyó con una lógica propia de selección por POIs, distinta de la estructura usada en «Buscar y Filtrar».
- Hay un desacople probable entre:
  - los FKs/campos normalizados que actualiza el job,
  - los campos cacheados de texto que consume la UI,
  - y la rehidratación/refresco del store al completar el proceso.

## Plan
### 1) Definir claramente dónde deben verse los cambios tras procesar
Haré que el resultado del backfill se refleje de forma consistente en estos sitios:
- panel «Geografía universal»:
  - cobertura geográfica,
  - árbol geográfico,
  - selección y conteos;
- árbol de «Buscar y Filtrar»;
- cualquier vista/listado que agrupe por geografía.

### 2) Unificar la fuente de verdad de la jerarquía geográfica
Voy a centralizar el árbol de «Geografía universal» para que reutilice la misma lógica jerárquica canónica ya usada por la app, en lugar de mantener un árbol paralelo con reglas distintas.

### 3) Corregir la visibilidad post-proceso
Al terminar el job, la UI debe refrescar los datos geográficos relevantes de forma explícita para que no ocurra esto:
- el contador dice que procesó;
- pero el árbol/listados siguen mostrando la jerarquía vieja.

### 4) Alinear el árbol con la expectativa de «Buscar y Filtrar»
Voy a hacer que el árbol admin:
- respete el mismo orden jerárquico,
- permita combinaciones libres entre ramas,
- muestre conteos consistentes,
- y trate correctamente los nodos sin datos `(sin ...)`.

### 5) Validar el resultado visible
Comprobaré que, después de ejecutar:
- cambian los porcentajes de cobertura cuando corresponde;
- cambian los nombres/agrupaciones geográficas en el árbol cuando había datos mal normalizados;
- el árbol admin y el árbol de filtros no se contradicen;
- el usuario entiende mejor qué cambió y dónde verlo.

## Resultado esperado
Después de implementar esto, cuando lances el proceso desde «Geografía universal» deberías ver los cambios en:
- los contadores de cobertura del propio panel;
- el árbol geográfico del panel;
- el árbol de «Buscar y Filtrar» si la normalización cambia continente/país/región/zona de esos POIs.

Si el job no cambia la geografía efectiva de un punto, entonces seguirá viéndose igual en el árbol, pero el panel deberá dejar claro que se procesó sin cambios visibles.

## Detalles técnicos
- Revisar la cadena completa `backfill-admin-fks -> geocoding-job-tick -> store/realtime -> árboles geográficos`.
- Reutilizar helpers geográficos compartidos en vez de lógica duplicada en el árbol admin.
- Asegurar refresco/rehidratación del store al completar el job para que los campos usados por la UI queden sincronizados.
- Ajustar el feedback del panel para distinguir claramente entre:
  - procesados,
  - actualizados,
  - y cambios visibles en jerarquía.

```text
Backfill job
   -> actualiza locations
   -> sincroniza cache geográfica
   -> refresca store/UI
   -> árbol admin + Buscar y Filtrar muestran la misma jerarquía
```