# ADR-002 — Use `yaml` (eemeli/yaml) for scenario files

**Status:** Accepted · **Date:** 2026-08-29 · **Ticket:** T-030

## Context
Scenarios are YAML (given in the brief). T-030 requires validation errors that point to the **line and column** of the offending node, which needs access to the parsed document's node ranges, not just a plain JS object.

Options: `yaml` (eemeli), `js-yaml`, hand-rolled subset parser.

## Decision
Add runtime dependency **`yaml`**. It parses to a Document with node ranges (`node.range`) and ships a `LineCounter` to map offsets to line/column. `js-yaml` exposes marks only on syntax errors, not on valid nodes, so semantic errors (zod) could not be located. A hand-rolled parser would be brittle and contradicts Constitution art. 7.

## Consequences
- Second runtime dependency after `commander`/`zod` (~120 KB, no transitive deps).
- Validation pipeline: `yaml.parseDocument` → `doc.toJS()` → zod `strictObject` → on failure, map each zod issue path to `doc.getIn(path, true)` for line/col.
