## Plan: persistir documento de Deuda Técnica verbatim

**Acción única**: crear `docs/tech-debt.md` con el contenido exacto que el usuario pegó, sin añadidos, enriquecimientos, links ni reordenaciones.

**Contenido del archivo** (verbatim, salvo el primer `# Technical Debt` que pasa a ser título H1 del documento):

- Cabecera `# Technical Debt` + línea `Estado inicial: 2026-05-19`.
- Sección `## Objetivo` con su párrafo.
- Sección `## Deuda priorizada` con los 6 ítems numerados (1..6) tal cual: cada uno con `Severidad`, `Facilidad`, `Riesgo de cambio`, `Estado` (sólo el ítem 1 lo trae) y descripción.

**Restricciones**:
- Cero cambios fuera de crear `docs/tech-debt.md`.
- No tocar `package.json`, README, código, tests, memorias ni ningún otro archivo.
- No iniciar ninguno de los 6 ítems de deuda (incluido el ítem 1 "Versionado y documentación de estado"), aunque esté marcado "en curso".
- No añadir tabla resumen, índice, ni metadata extra.
- No crear memoria asociada en `mem://`.

**Criterio de aceptación**: el archivo `docs/tech-debt.md` existe con el texto exacto proporcionado; ningún otro archivo cambia.
