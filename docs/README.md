# Documentation

Read the row matching the task, then only the relevant contract section. Open the architecture map
when placement or a new boundary is unclear. No task requires preloading every topic guide.

## Choose an owner

| Task | Start here | Load detail when needed |
| --- | --- | --- |
| Code placement or shared boundaries | [Architecture](architecture-map.md) | Actual callers and dependency rules |
| Startup, refresh or user-to-save sequence | [Data flow](data-flow.md) | [Ingestion](data-ingestion.md), [state](state-management.md) |
| Store writes, drafts or calculations | [State](state-management.md) | [Character format](contracts/character-format.md), [equipment](contracts/equipment-state.md) |
| Grant/remove/replace or source ownership | [Provenance](provenance.md) | [Feat](contracts/feat-ownership.md), [racial](contracts/racial-ownership.md), [class/actions](contracts/class-ownership.md) |
| 5etools loading, layering or cache | [Ingestion](data-ingestion.md) | [Race](contracts/race-ingestion.md), [feature UIDs](contracts/feature-references.md), [items](contracts/item-ingestion.md), [compound references](contracts/reference-collections.md) |
| Exact saved selection, filters or eligibility | [Reference resolution](contracts/reference-resolution.md) | [Prerequisites](contracts/prerequisites.md), relevant owner above |
| Components, controllers or selection lists | [React patterns](react-patterns.md) | [Workspaces](contracts/workspaces.md), [previews](contracts/rules-previews.md), [spell selection](contracts/spell-selection.md) |
| PDF projection, fitting or forms | [PDF generation](pdf-generation.md) | [Template maintenance](../scripts/pdf-sources/README.md) |
| Verification | [Testing](testing-map.md) | Relevant existing tests and their fixtures |
| CI, PRs or packaging | [CI/CD](cicd-workflow.md) | [Release procedure](releasing.md), only for authorized release work |
| Bundled content or artwork | [SRD pack](../resources/srd/core/README.md), [artwork](../build/README.md) | Retained provenance/notices and manifests |
| Historical release behavior | [Changelog](changelog.md) | The relevant release section only |

## Current behavior and release requirements

Source and tests determine implemented behavior. These guides describe stable contracts and
explicit limits; an architecture rule is not proof that every existing caller complies. Current
character admission is format 11, and parsed cache schema is 40; see [their separate boundaries](state-management.md#schema-compatibility).

The v1.0 goal is complete required choices through levels 1–20 for all offered classes/subclasses,
with explicit content limits, shared implementations, measured responsiveness and continued security.
That qualification is pending; fixture or parser success alone does not prove complete user journeys.
The public [release tracker](https://github.com/kevinkickback/Tavern-Born/issues/53) tracks scope.
No pre-v1 compatibility project is required. Released v1.x characters must survive later 1.x updates;
see the [compatibility policy](state-management.md#schema-compatibility).

## Keeping docs useful

Give each stable contract one owner. Link to it from other guides; keep examples and edge cases in
the narrow reference instead of repeating them at startup. Update that owner with a behavior change.
Preserve source attribution, explicit missing/unsupported cases and required security/validation gates.

Use issues for outstanding work and the changelog for historical release notes. Keep status, private
review records, raw logs and assistant configuration outside public guides. Archived evidence is
immutable context on demand and never current startup guidance. Retain existing section links when
moving a contract. Avoid file-by-file inventories, generic tutorials and duplicated version history.
