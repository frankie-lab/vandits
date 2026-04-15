

## Plan: Hardening de Seguridad — Cambios invisibles + ajustes menores en UI existente

### Hallazgos clave del analisis

**Storage — paths ya correctos**: Los uploads existentes ya usan la convencion `<userId>/...`:
- `avatars`: `${user.id}/avatar.${ext}` (UserProfileEditor)
- `location-photos`: `${user.id}/${locationId}/${timestamp}.${ext}` (LocationPhotoUpload, OneDrivePhotoBrowser)
- `location-photos` admin: `default/${locationId}/...` (LocationPhotoSearch en modo admin)
- `avatars` curators: `curator-${curatorId}.${ext}` (raiz, sin carpeta uid)

**No hay `list()` en ningun componente** — ningun componente del cliente hace `storage.from(...).list()`. Todos acceden por URL publica directa o via tabla `location_photos`. Esto significa que **el cambio de RLS no rompera nada visible**.

**Extensiones**: Solo `pg_net` en `public` — no accion, accepted risk.

**Passwords**: Actualmente valida con `min(6)`. Hay que subir a `min(8)` y anadir feedback visual de requisitos.

---

### Acciones a ejecutar

#### 1. Migracion SQL — Storage RLS (invisible para usuario)

Drop 3 politicas SELECT abiertas, crear 2 nuevas restringidas:

```sql
DROP POLICY IF EXISTS "Anyone can read avatars" ON storage.objects;
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view public location photos" ON storage.objects;

CREATE POLICY "Users list own avatars"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'avatars' 
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR name LIKE 'curator-%'
  )
);

CREATE POLICY "Users list own location photos"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'location-photos' 
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR (storage.foldername(name))[1] = 'default'
  )
);
```

Nota: se anade condicion `'default'` para location-photos porque el modo admin sube a `default/...`.

#### 2. Auth config — HIBP + password hardening (invisible para usuario)

Usar `configure_auth`:
- `password_hibp_enabled: true`
- `password_min_length: 8`
- Requerir lowercase, uppercase, digits

#### 3. Auth.tsx — Actualizar validacion de contrasena (ajuste menor en pantalla existente)

Cambios en `src/pages/Auth.tsx`:
- Subir `passwordSchema` de `min(6)` a `min(8)` con mensaje actualizado
- Anadir validaciones de complejidad (mayuscula, minuscula, digito)
- Mostrar indicadores visuales de requisitos bajo el campo de contrasena en modo signup/reset
- Capturar error HIBP del backend y mostrar mensaje claro ("Esa contrasena ha sido filtrada en una brecha de datos")

#### 4. Security findings — Documentar pg_net como accepted risk

Usar `manage_security_finding` para marcar el warning de `pg_net` como ignored con justificacion.

---

### Lo que NO se toca

- No se crean pantallas nuevas
- No se cambian flujos de upload (los paths ya son correctos)
- No se mueve `pg_net` (accepted risk)
- No se cambian buckets de publico a privado (URLs directas deben seguir funcionando)

### Archivos modificados

| Archivo | Cambio |
|---------|--------|
| Nueva migracion SQL | DROP 3 + CREATE 2 politicas storage |
| `src/pages/Auth.tsx` | passwordSchema min(8) + validacion complejidad + feedback visual |
| Auth config | HIBP + password policy |
| Security findings | Marcar pg_net como accepted risk |

