No es planificación nueva — es el gate de aprobación para salir de plan mode y ejecutar la reaplicación. Al aprobar, paso a build mode y ejecuto los pasos en orden, sin reabrir decisiones de diseño.

## Estado de partida (verificado)

- `origin/main` = `a4e0294d` · v1.4.4 · `poi-kml.ts` usa `<description>{texto plano}</description>`, no existen `gurumaps-description.ts` / `render-export-description.ts` / `kml-description-html.ts` / `poi-export-content-model.ts`, no existe `ExportResolver` scope-aware, no existen tests PR-EXPORT-4/5/6.
- Branch de trabajo Lovable (`edit/edt-db7ff5c8…`) = `3a94c613` · v1.5.8 · todos los archivos PR-EXPORT-4/5/6 presentes y coherentes entre sí.
- La branch de edición es exactamente el delta consolidado que `main` necesita.

## Estrategia

Reaplicar **el contenido del working tree actual** como un único PR consolidado sobre `main`. No reescribo PR-EXPORT-4/5/6 desde cero — replico exactamente el estado ya validado en la branch de edición, garantizando que `main` queda funcionalmente idéntica a v1.5.8.

## Pasos de ejecución (build mode)

1. **Inventario delta `main` ↔ working tree** (`git diff --name-status origin/main…HEAD` filtrado por dominios export, content-model, tests, docs, memoria, versionado). Output: lista cerrada de archivos nuevos + modificados. Sin sorpresas fuera de export/versión.
2. **Verificar que el working tree compila y pasa tests** antes de promover:
   - `bunx vitest run src/test/pr-export-4-internal-semantics src/test/pr-export-5-content-model src/test/pr-export-6-gurumaps-renderer src/test/version-parity`
   - Si rojo → diagnóstico forense (código vs canon vs deuda), arreglo en mismo PR, no `.skip`.
3. **Promoción a main**: la branch de edición Lovable ES lo que se publica. Confirmo con `git log origin/main..HEAD --oneline` y dejo el merge real a tu acción "Publish/Update" en la UI Lovable — yo no tengo permiso de mover refs de `main` desde el sandbox.
4. **Pruebas de aceptación del KML**:
   - Generar KML real con fixtures `makeTorreHerculesFixture` y `poi-mazinger-z-export` vía `serializePoiKml(records, { scope: 'internal', documentName: 'qa', target: 'gurumaps' })`.
   - Asserts: el `<description>` contiene `<![CDATA[`, no contiene `<p>`/`<br/>`/`<b>`, contiene separadores `📍`/`🏷`/`🔗` y footer `— Vandits · YYYY-MM-DD`.
   - Guardar el KML resultante en `/mnt/documents/qa-pr-export-6-torre-hercules.kml` + `qa-pr-export-6-mazinger-z.kml` como evidencia descargable.
5. **Verificación de paridad de canon**:
   - `poi-kml.ts` importa `renderExportDescription` (grep).
   - `gurumaps-description.ts` y `render-export-description.ts` existen.
   - `APP_VERSION === '1.5.8'`, `package.json.version === '1.5.8'`, README + `version-history.md` alineados.
   - `version-parity.test.ts` verde.
6. **Reporte final** con: SHAs antes/después, lista de archivos del delta, conteo de tests verdes, snippet del KML generado (primeros 40 líneas), confirmación de los 4 puntos del checklist del usuario.

## Postcondiciones (engineering-discipline)

- Tests verdes (o `.skip` con `// TODO PR-XXX` + issue) — no aplica skip aquí, todo debe pasar.
- `version-parity.test.ts` verde.
- `APP_VERSION` ya bumpeado a 1.5.8 (no requiere re-bump).
- Memoria sync: `mem/logic/export/poi-export-content-model.md` ya actualizada en branch.
- `docs/releases/version-history.md` ya tiene 1.5.5/1.5.6/1.5.7/1.5.8 en branch.
- Si algo de lo anterior falla → corrijo en este mismo PR antes de cerrar.

## Fuera de alcance

- Reescribir PR-EXPORT-4/5/6 con otro diseño.
- Tocar `share-vs-export-contract`, eligibility public/internal, RLS, GPX, jobs, thresholds, DTO core, ExportResolver layout.
- Renombrar capabilities o tocar RBAC.

## Limitación honesta

No puedo hacer el merge físico `edit/edt-…` → `main` desde el sandbox: no tengo permisos sobre el ref `main` del remote. Tras la ejecución, **`main` quedará idéntica en contenido al working tree** y la promoción del ref se cierra cuando hagas "Publish" en la UI Lovable (que es lo que efectivamente actualiza el deploy y, según el flujo configurado, también `main`). Entregaré evidencia verificable de que el contenido es el correcto; el botón final es tuyo.

Aprueba este plan para que pase a build mode y ejecute los 6 pasos.