# PR Checklist — impacto documental

Pegar esta lista en la descripción de toda PR que toque paths sensibles (ver `docs/ci/documentation-rules.md`).

## Documentation impact

- [ ] No toco paths sensibles → resto de la checklist no aplica.
- [ ] Toco paths sensibles → he actualizado el contrato/ADR correspondiente.

## Si añado estado global o listener

- [ ] Documenté en sección "Variables canónicas" del contrato afectado.
- [ ] Si es listener: añadí entrada en `docs/audits/duplicate-listeners-audit.md`.
- [ ] Cleanup en `useEffect` return verificado.

## Si modifico subset-fit / popup / focus / heavy-ops

- [ ] Validation Notes del contrato actualizadas con archivo / símbolo / evidencia.
- [ ] Invariantes revisadas; si cambio alguna → ADR nuevo.

## Si modifico ownership de filtros

- [ ] Actualicé `filter-axis-contract.md`.
- [ ] Actualicé `docs/audits/source-of-truth-audit.md`.

## Si descubro / resuelvo un finding

- [ ] Entrada en `docs/audits/backlog.md`:
  - [ ] Si resuelvo: `Status: resolved` + PR enlazada.
  - [ ] Si descubro: `Status: open` + severity asignada.
  - [ ] Si acepto deuda: `accepted-debt` + ADR.

## Si creo ADR nuevo

- [ ] Entrada en `docs/architecture-timeline.md`.
- [ ] README actualizado con link al ADR.

## Si introduzco zona peligrosa

- [ ] Entrada en `docs/danger-zones.md`.

## Final

- [ ] Reviewer ha verificado que el diff documental refleja el cambio real.
