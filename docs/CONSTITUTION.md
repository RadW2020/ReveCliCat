# Constitución del proyecto

> Written by the maintainer (RadW2020) before any code existed, as part of the brief that drove the whole build. Kept verbatim (Spanish) because it is the primary artefact of the method: every ticket, test, ADR and worklog entry in this repository exists because these ten articles required it. English summary at the end.

Estos artículos rigen TODO el trabajo. Ante cualquier conflicto entre velocidad y Constitución, gana la Constitución.

1. **Spec primero.** No se implementa nada que no tenga un ticket con criterios de aceptación escritos. Si durante la implementación descubres que la spec es ambigua, primero corriges la spec, luego el código.
2. **Tests primero.** Cada ticket empieza escribiendo tests que fallan, derivados de sus criterios de aceptación. Un ticket no se cierra con tests en rojo o saltados. Prohibido debilitar un test para que pase.
3. **Trazabilidad total.** Cada commit referencia su ticket (`feat(T-011): ...`). Cada sesión de trabajo queda registrada en `docs/WORKLOG.md`. Cada decisión de diseño no trivial queda en `docs/adr/` (formato ADR corto: contexto, decisión, consecuencias).
4. **Fidelidad de payloads.** Los esquemas de eventos se basan en la documentación oficial de RevenueCat, nunca en memoria. Cada esquema anota su fuente y fecha en `docs/payload-sources.md`. Si la documentación no es accesible en algún momento, marca el esquema como `PROVISIONAL` en ese archivo, crea un ticket de alta prioridad para validarlo, y continúa: nunca te quedes bloqueado esperando.
5. **Alcance cerrado.** La lista "Fuera de alcance" es ley. Toda idea nueva que surja se anota en la sección Icebox del backlog con una línea de justificación — jamás se implementa en v0.1.
6. **Autonomía con verificación.** Avanza ticket a ticket sin pedir permiso. Las puertas son objetivas: suite completa en verde + lint limpio antes de cada commit. Si un ticket queda bloqueado, regístralo en el WORKLOG con la causa y pasa al siguiente ticket no bloqueado.
7. **Simplicidad deliberada.** La solución más simple que cumpla los criterios de aceptación. Nada de abstracciones especulativas ni configuración que nadie pidió.
8. **DX primero.** Mensajes de error accionables (qué falló, qué comando probar). `--help` útil en cada comando. La salida del CLI es parte del producto.
9. **Commits pequeños y convencionales.** Conventional Commits (`feat`, `fix`, `test`, `docs`, `chore`, `refactor`), un ticket por commit como norma, mensaje en inglés.
10. **Documentación viva.** Si un ticket cambia la superficie del CLI (comandos, flags, formato YAML), el mismo ticket actualiza README y CHANGELOG. Documentar no es una fase final, es parte de la definición de hecho.

---

**English summary.** Spec first (no code without a ticket with acceptance criteria) · tests first, never weakened · full traceability (ticket-referenced commits, worklog, ADRs) · payload fidelity from official docs only, with provisional markers · closed scope with an Icebox · autonomy gated by green suite + clean lint · deliberate simplicity · developer experience as product · small conventional commits · living documentation.
