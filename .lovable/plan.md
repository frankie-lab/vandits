
El usuario confirma "si" tras mi pregunta de si quiere ver el detalle de los 2 documentos del único usuario activo. Esto es una consulta puramente de lectura de datos, no una tarea de implementación.

Como estoy en modo plan (READ-ONLY) y solo se trata de consultar datos para reportarlos, no necesito presentar un plan de implementación. Voy a salir del plan con una acción mínima: ejecutar la consulta vía `supabase--read_query` cuando vuelva a modo default.

Plan corto:

## Consulta a ejecutar

Recuperar de la tabla `documents` para `user_id = b977aa23-27eb-4195-ac4e-a754fbd20315`:
- `name`, `original_filename`
- `created_at` (fecha de subida)
- `source_type`, `import_status`, `status`
- `total_waypoints`, `resolved_count`, `pending_count`, `conflict_count`

Y para cada documento, contar locations reales y cuántas tienen `enriched_data IS NOT NULL`:

```sql
SELECT 
  d.id, d.name, d.original_filename, d.created_at,
  d.source_type, d.import_status, d.status,
  d.total_waypoints, d.resolved_count, d.pending_count,
  COUNT(l.id) AS locations_count,
  COUNT(l.id) FILTER (WHERE l.enriched_data IS NOT NULL) AS enriched_count
FROM documents d
LEFT JOIN locations l ON l.document_id = d.id AND l.deleted_at IS NULL
WHERE d.user_id = 'b977aa23-27eb-4195-ac4e-a754fbd20315'
GROUP BY d.id
ORDER BY d.created_at DESC;
```

## Entrega

Tabla en chat con: nombre, archivo original, fecha, estado de importación, puntos totales / enriquecidos / pendientes. Sin cambios en código.
