## Plan: Gramatica Visual V2 — Implementacion Completa

> **Estado**: Implementado (marker-types, marker-validation, marker-grammar, legacy-to-feature.mapper, tests). Pendiente: integracion en hook y renderer.

### Decisiones cerradas

1. **Propio no enriquecido = Waypoint** hasta enriquecido o promovido manualmente a Place
2. **renderContext = por que se muestra** (default, document, search). Sin estado de dominio. No afecta apariencia.
3. **Enrichment = boolean unico** (isEnriched). Sin eje current/previous
4. **Catalog vs Workspace = distincion visual preservada** via `isCatalog` flag en MapFeature
5. **Promocion manual = `entityType: 'place'` con `isEnriched: false`** — caso valido y explicito
6. **Validador solo valida entrada de dominio**, no salida de gramatica
7. **`isApproved` influye en `entityType`**, no en ownershipSource ni shape
8. **Waypoint siempre circle-hollow**. Nunca circle-solid. Si se enriquece, pasa a place.
9. **isCatalog se deriva de resolveIsCatalogMarker()** en el mapper. Una sola fuente de logica.
10. **resolveVisibility decide mostrar/ocultar; marker-grammar decide apariencia. Nunca al reves.**
11. **renderContext y viewMode son ejes ortogonales**. renderContext no participa en visibilidad. viewMode no participa en gramatica.
12. **Estados V1 (hover, focused, recent) no migran a V2**. V2 usa isSelected, isConflict, isFavorite, isVisited (composables).

### Contratos de separacion

```
Validacion (marker-validation.ts)    → ¿Feature legal?
Gramatica  (marker-grammar.ts)       → ¿Como se ve?
Visibilidad (use-layer-visibility.ts) → ¿Se muestra?
```

Ortogonales. Nunca se mezclan.

### Paleta V2 definitiva (own)

| Caso | entityType | shape | Color | Fallback HSL |
|------|-----------|-------|-------|-------------|
| Own enriched catalog | place | teardrop | catalog_enriched.fill_color | hsl(207,90%,54%) azul cielo |
| Own enriched workspace | place | teardrop | own_enriched.fill_color | hsl(142,76%,36%) verde |
| Own unenriched (waypoint) | waypoint | circle-hollow | own_empty.fill_color | hsl(24,95%,53%) naranja |
| Own promoted (not enriched) | place | circle-solid | own_new.fill_color | hsl(24,95%,53%) naranja |
| Followed | place | circle-solid | HSL determinista | hsl(userHue,65%,45%) |
| Curator enriched | place | teardrop | curator color | hsl(168,76%,42%) teal |
| Druid enriched | place | teardrop | druid color | hsl(270,60%,60%) purpura |

### Archivos implementados

| Archivo | Estado |
|---------|--------|
| `src/domains/v2/marker-types.ts` | ✅ Creado |
| `src/domains/v2/marker-validation.ts` | ✅ Creado |
| `src/domains/v2/marker-grammar.ts` | ✅ Creado |
| `src/domains/v2/legacy-to-feature.mapper.ts` | ✅ Creado |
| `src/test/marker-grammar.test.ts` | ✅ Creado (27 tests passing) |
| `src/domains/v2/visual-grammar.ts` | ✅ Refactored a compat layer |
| `src/domains/v2/types.ts` | ✅ isCatalog añadido |
| `src/domains/v2/index.ts` | ✅ Exports actualizados |

### Pendiente de integracion

| Archivo | Accion |
|---------|--------|
| `src/hooks/use-resolved-map-features.ts` | Integrar validateFeature + resolveMarkerGrammar + discarded[] |
| `src/components/map/map-v2-renderer.ts` | Usar zIndex del MarkerGrammarOutput |

### Documentacion alineada

Los tres documentos de referencia han sido actualizados para reflejar estas decisiones sin conflictos:

- `VANDITS-Marker-System-Reference.md` v2.0 — Seccion 6 reescrita con gramatica congelada
- `VISIBILITY_SPEC_v1.md` v1.1 — Contrato de separacion visibilidad/apariencia documentado
- `.lovable/plan.md` — Este archivo (contratos y estado de implementacion)
