# Tavern-Born Documentation

These documents record stable architecture and maintenance contracts. Source code and tests remain
the authority for implementation details; avoid turning this folder into a file-by-file inventory.

While preparing for 1.0, breaking character-format changes require pre-release characters to be
recreated. The current format is schema 7; saved schema 2–6 originals remain exportable before removal.
See [character compatibility](state-management.md#schema-compatibility) for the cutoff and recovery policy.

## Start with the task

For a new code area, read the [Architecture Map](architecture-map.md), then the owning topic
below. Use the [Testing Map](testing-map.md) for validation and the [CI/CD Workflow](cicd-workflow.md)
for delivery. There is no need to read every guide for each change.

## Topic guides

- [Architecture Map](architecture-map.md): layer ownership and where new code belongs.
- [Data Flow](data-flow.md): startup, editing, persistence, rendering, and updates.
- [State Management](state-management.md): stores, derived values, mutations, and character format.
- [Data Ingestion](data-ingestion.md): 5etools loading, normalization, lookup, and cache contracts.
- [Provenance](provenance.md): grant ownership and source-change reconciliation.
- [React Patterns](react-patterns.md): repository-specific component and hook conventions.
- [Testing Map](testing-map.md): test boundaries, commands, and release checks.
- [CI/CD Workflow](cicd-workflow.md): independent reviews, delivery pauses/resumption, PRs, and releases.
- [PDF Generation](pdf-generation.md): template and export boundaries.
- [Changelog](changelog.md): user-facing release notes.

## Contributing

Use the owning topic guide above. Character format changes follow [State Management](state-management.md#schema-compatibility);
validation follows [Testing Map](testing-map.md#commands).

Keep each contract in its owning guide and link to it elsewhere. Update that guide when behavior
changes; prefer entry points and invariants over exhaustive file lists or implementation history.
Track outstanding work in issues and completed changes in the changelog. Keep delivery journals,
command output and repeated status snapshots out of these topic guides.
Asset preparation instructions belong with their source assets, and audit records with the resource
they document. Local review notes and findings under `docs/review/` are deliberately untracked.
