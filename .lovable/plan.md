

## Plan: clearAllDocuments borra de la base de datos

### Problema
`clearAllDocuments()` solo vacía el array de Zustand. Los documentos y ubicaciones siguen en la base de datos y reaparecen al recargar.

### Solución
Convertir `clearAllDocuments` en una acción que primero borra de la BD y luego limpia el store.

### Cambios

**1. `src/domains/content/store/locations-store.ts`**

Cambiar `clearAllDocuments` de síncrono a asíncrono. Antes de limpiar el store:
- Obtener el usuario actual con `supabase.auth.getUser()`
- Consultar todos los `documents` del usuario
- Llamar a `deleteDocumentFromDatabase(docId)` para cada uno (el CASCADE en la tabla elimina las `locations` asociadas)
- Solo después de confirmar el borrado, limpiar el store como ya hace hoy
- Si falla algún borrado, mostrar toast de error y no limpiar el store

**2. `src/domains/content/lib/db-operations.ts`**

Añadir una función `deleteAllUserDocuments()`:
```typescript
export async function deleteAllUserDocuments(): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  
  const { error } = await supabase
    .from('documents')
    .delete()
    .eq('user_id', user.id);
    
  if (error) { toast.error('Error al eliminar documentos'); return false; }
  return true;
}
```

**3. Actualizar la firma en el tipo del store**
`clearAllDocuments: () => void` pasa a `clearAllDocuments: () => Promise<void>`

**4. Sin cambios en los consumidores**
`Header.tsx` y `UserMenu.tsx` llaman a `clearAllDocuments()` sin await, lo cual es aceptable — el store se limpia solo tras confirmación de la BD.

### Nota sobre curator/druid mode y useDatabaseSync
Esos usos de `clearAllDocuments` son resets visuales temporales antes de recargar datos de otro contexto. Esos NO deben borrar de la BD. Se creará una función interna separada `_resetStoreState()` para esos casos, y `clearAllDocuments` quedará exclusivamente para el borrado real del usuario.

