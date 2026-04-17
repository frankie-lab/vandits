

## Entrega: Fase 0 + Fase 1 (piloto `ImportedContentPanel`)

Apruebo los 5 guardarraíles. La API de `PanelShell` queda **flexible** hasta que el piloto pase aceptación; solo entonces se congela.

## Estructura de entrega

### Fase 0 — Sistema base (en `src/shared/components/ui/panel/`)

| Archivo | Responsabilidad |
|---|---|
| `tokens.css` | CSS variables: `--panel-header-h: 56px`, `--panel-padding: 16px`, `--panel-section-gap: 24px`, `--panel-footer-min-h: 72px`, `--panel-radius: 16px`, etc. Importado desde `index.css` |
| `tokens.ts` | Re-exporta los tokens como constantes tipadas para tests y uso JS puntual (NO como source of truth) |
| `PanelShell.tsx` | Wrapper sobre `FloatingPanel` (desktop) y `Drawer` (mobile). Acepta `variant: 'form' \| 'library' \| 'workflow'`. Preserva contrato actual (isOpen, onClose, position, topOffset) |
| `PanelHeader.tsx` | Slots: `icon`, `title`, `actions`. Altura fija desde token |
| `PanelBody.tsx` | Único scroll, padding y gap desde tokens. Prop `variant` ajusta densidad |
| `PanelFooter.tsx` | Sticky opcional, separador superior, minHeight desde token |
| `PanelSection.tsx` | Título sistemático (uppercase pequeña) + slot, gap fijo |
| `PanelTabs.tsx` | Wrapper de Radix Tabs con altura 40, radio 12, estilos uniformes. Soporta agrupación con `<PanelTabs.Group label="...">` para casos como Fuentes/Biblioteca |
| `PanelEmptyState.tsx` | Icon + título + texto + CTA opcional + lista de formatos soportados |
| `index.ts` | Barrel |

`FloatingPanel` queda intacto y se marca como `@deprecated` solo **después** de aceptar el piloto.

### Fase 1 — Migración piloto: `ImportedContentPanel`

Reescritura con `PanelShell variant="library"` + `PanelTabs.Group`:

```text
<PanelShell variant="library" title="Contenido" icon={<FolderOpen/>}>
  <PanelTabs value={tab} onValueChange={...}>
    <PanelTabs.Group label="Fuentes">
      <PanelTabs.Trigger value="upload" icon={<Upload/>}>Archivos</PanelTabs.Trigger>
      <PanelTabs.Trigger value="onedrive" icon={<Cloud/>}>OneDrive</PanelTabs.Trigger>
    </PanelTabs.Group>
    <PanelTabs.Group label="Biblioteca">
      <PanelTabs.Trigger value="documents" icon={<FileStack/>}>Documentos importados</PanelTabs.Trigger>
    </PanelTabs.Group>

    <PanelBody>
      <PanelTabs.Content value="upload"><FileUploadZone .../></PanelTabs.Content>
      <PanelTabs.Content value="onedrive"><OneDrivePhotosPanel/></PanelTabs.Content>
      <PanelTabs.Content value="documents"><DocumentsPanel/></PanelTabs.Content>
    </PanelBody>
  </PanelTabs>
</PanelShell>
```

Nada más se migra en esta entrega.

## Criterios de aceptación (cierre del piloto)

Funcional:
- Apertura/cierre desde `UserMenu` mantiene los 3 atajos directos a tab.
- `Drawer` mobile funciona idéntico a hoy.
- `onUploadComplete={onClose}` sigue cerrando el panel tras subida.
- 128/128 tests siguen verdes.

Visual (desktop 1390px + mobile 375px):
- Header 56px, padding 16, divisor inferior visible.
- Tabs altura 40, radio 12, mismo estado activo en los dos grupos.
- Un único scroll en body (no doble scroll con `DocumentsPanel`).
- Separadores entre grupos Fuentes/Biblioteca consistentes.
- Sin regresión en `topOffset` ni `position="right"`.

## Tests

| Archivo | Qué valida |
|---|---|
| `src/test/panel-system.test.tsx` (nuevo) | (1) `PanelShell` aplica clases de tokens correctas por variante. (2) `PanelTabs.Group` renderiza label + triggers. (3) `PanelEmptyState` requiere icon+title |
| `src/test/index-composition.test.tsx` | Sin cambios (no aumenta budget de useState) |

## Memoria + ADR

- `docs/adr/003-panel-system.md` — ADR con norma completa, variantes, tokens y checklist PR.
- `mem://ui/panel-system` — Regla corta: "Todo panel nuevo usa PanelShell. Variantes: form/library/workflow. Tokens vía CSS vars, no JS sueltos."
- Actualizar `mem://index.md` Core: añadir línea sobre PanelShell obligatorio.

## Lo que NO se toca

- `Perfil`, `OneDrivePhotosPanel`, `Categorías personales`, `Admin`, `RouteBuilder`, `LayersPanel`, etc. — quedan para Fase 2 tras aceptación.
- Lógica interna de `FileUploadZone` / `DocumentsPanel` / `OneDrivePhotosPanel`.
- `UploadPreviewDialog` (es Dialog modal, fuera del sistema de paneles laterales).
- `FloatingPanel` (vivo y sin `@deprecated` hasta cerrar piloto).
- Contratos congelados: mapa, V2 marker grammar, preferencias, eventos.

## Riesgo

Bajo-medio. El único riesgo real es que la API de `PanelTabs.Group` no encaje bien con Radix (Radix exige un único `TabsList` por accesibilidad). Mitigación ya prevista: el componente actual ya resuelve esto con dos `TabsList` visuales dentro del mismo `Tabs` controlado — replicaremos ese patrón dentro de `PanelTabs.Group`.

