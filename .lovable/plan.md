

## Decisión

Sí a unificar, **pero con la jerarquía corregida que has propuesto**: dos tabs de origen + una tab de resultado, no tres tabs al mismo nivel.

## Estructura final del panel único

**`ImportedContentPanel`** (Sheet único) con dos secciones:

```text
┌─ Contenido ────────────────────────────────┐
│                                            │
│ FUENTES                                    │
│  [ Archivos ]  [ Fotos OneDrive ]          │
│                                            │
│ ────────────────────────────────────────── │
│                                            │
│ BIBLIOTECA                                 │
│  [ Documentos importados ]                 │
│                                            │
└────────────────────────────────────────────┘
```

Implementación: dos `TabsList` separados (encabezado "Fuentes" / "Biblioteca") dentro del mismo `Tabs` controlado, para reflejar la jerarquía conceptual (origen ≠ resultado) sin romper la accesibilidad de Radix.

## Auditoría previa (necesaria antes de tocar UX)

Confirmar en código, en este orden:

1. **`UserMenu.tsx`** — ya sé por el contexto que las tres entradas viven aquí (`onUploadClick`, `onOpenDocuments`, `onOpenOneDrivePhotos`). Verificar que no hay otros puntos de entrada.
2. **`FloatingToolbar.tsx`** — comprobar si replica alguno de esos accesos.
3. **`Index.tsx`** — ver cómo monta hoy `FileUploadZone`, `DocumentsPanel`, `OneDrivePhotosPanel` (¿Sheets independientes? ¿Dialogs?).
4. **`usePanelToggles.ts`** — confirmar los 3 booleanos actuales (`upload`, `documents`, `oneDrivePhotos`) y su uso.
5. **`UploadPreviewDialog`** — confirmar que sigue siendo modal independiente disparado desde `FileUploadZone` (no se toca).

## Cambios

| Archivo | Acción |
|---|---|
| `src/components/ImportedContentPanel.tsx` | **Nuevo**. Sheet con dos grupos de tabs (Fuentes / Biblioteca). Recibe `defaultTab?: 'upload' \| 'onedrive' \| 'documents'` |
| `src/hooks/use-panel-toggles.ts` | Reemplazar `upload`/`documents`/`oneDrivePhotos` por `importedContent: boolean` + `importedContentTab: 'upload' \| 'onedrive' \| 'documents' \| null` |
| `src/components/UserMenu.tsx` | Las 3 entradas pasan a 1 sola: **"Contenido"**. Cada entrada antigua se conserva como submenú que abre el panel en el tab correspondiente (no perdemos el atajo directo). Alternativa: 1 sola entrada que abre en última tab usada |
| `src/pages/Index.tsx` | Sustituir los 3 `<...Panel>` por `<ImportedContentPanel>` |
| `src/test/index-composition.test.tsx` | Sin cambios (el budget de useState baja, no sube) |
| Memoria | Nueva: `mem://ui/imported-content-panel` con la regla "Fuentes vs Biblioteca" para que no se reintroduzca como 3 entradas planas |

## UX de apertura

Mantener atajo directo a la pestaña: cada entrada del submenú "Contenido" en `UserMenu` abre el panel en su tab (igual que hoy en términos de clicks, solo cambia el contenedor). Así:

- 0 disrupciones para usuarios actuales.
- Al estar dentro, el usuario descubre que las tres están relacionadas y puede saltar entre ellas.

## Lo que NO se toca

- Lógica interna de `FileUploadZone`, `DocumentsPanel`, `OneDrivePhotosPanel`.
- `UploadPreviewDialog`.
- Marcadores `photo_thumbnail` del sistema (siguen como capa Sistema en mapa).
- Contratos congelados (mapa, preferencias, V2).

## Riesgo

Bajo. Es un cambio de contenedor + reagrupación de menú. Los tres componentes hijos siguen siendo autónomos.

