# Objetivo
Corregir el pipeline de geografía para que la recodificación no reutilice FKs canónicas incorrectas y deje el árbol coherente al recalcular puntos existentes.

# Qué voy a hacer
1. Endurecer la resolución geográfica central
   - Ajustar `resolve-admin-area` para priorizar coincidencias por ISO reales y por cadena jerárquica consistente.
   - Evitar reutilizar filas por nombre cuando su padre no coincide con el país/región que trae el reverse-geocode.
   - Reducir la lógica de “cross-level reuse” cuando pueda mezclar niveles o países distintos.

2. Hacer que la recodificación valide la cadena, no solo el nombre
   - Actualizar `backfill-admin-fks` para que en modo `reconcile` detecte también inconsistencias estructurales (`continent → country → region → zone`) aunque los IDs existan.
   - Reescribir FKs cuando el `country_code` del punto no cuadra con el `iso_code` del `country_id`, o cuando un padre no coincide.

3. Mejorar la señal que llega desde reverse-geocode
   - Aprovechar mejor `country_code`, `region_type`, `zone_type` y la jerarquía normalizada para desambiguar países/regiones homónimas.
   - Mantener el helper centralizado como única vía transversal, sin parches puntuales.

4. Verificar con datos reales
   - Medir antes y después cuántas `locations` tienen cadena rota.
   - Comprobar especialmente los casos que ya salieron mal (`Francia` enlazada con `Centro/PT-02`, etc.).
   - Validar que el árbol geográfico quede limpio y consistente tras recodificar.

# Resultado esperado
- Si luego recodificas geografía, sí hará trabajo real.
- Los puntos con FKs “canónicas pero mal asignadas” se volverán a enlazar a la rama correcta.
- El árbol debería reflejar la jerarquía correcta, no solo nombres bonitos.

# Detalles técnicos
- Archivos clave a tocar:
  - `supabase/functions/resolve-admin-area/index.ts`
  - `supabase/functions/backfill-admin-fks/index.ts`
  - posiblemente `supabase/functions/_shared/reverse-geocode.ts` o `geo-normalizer.ts`
- Validación con consultas sobre:
  - parent mismatch entre `country_id/region_id/zone_id`
  - divergencia entre `locations.country_code` y `admin_areas.iso_code`
  - muestras concretas de puntos mal asignados

# Hallazgo que justifica el cambio
Ahora mismo no es un problema visual menor:
- 2.748 puntos tienen la cadena jerárquica rota.
- 1.286 puntos tienen `country_code` incompatible con el `country_id` actual.

# Después de implementar
- Ejecutaríamos una recodificación en modo `reconcile` u `overwrite` sobre el scope que elijas.
- Luego te diré exactamente cuántos puntos quedaron corregidos y si ya “vemos el árbol correcto” con números, no con suposiciones.