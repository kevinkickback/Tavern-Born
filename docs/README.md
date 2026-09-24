# Tavern-Born Documentation

These documents record stable architecture and maintenance contracts. Source code and tests remain
the authority for implementation details; avoid turning this folder into a file-by-file inventory.

## Reading order

1. [Architecture Map](architecture-map.md)
2. The topic document for the area being changed
3. [Testing Map](testing-map.md)

## Topic guides

- [Architecture Map](architecture-map.md): layer ownership and where new code belongs.
- [Data Flow](data-flow.md): startup, editing, persistence, rendering, and updates.
- [State Management](state-management.md): stores, derived values, mutations, and character format.
- [Data Ingestion](data-ingestion.md): 5etools loading, normalization, lookup, and cache contracts.
- [Provenance](provenance.md): grant ownership and source-change reconciliation.
- [React Patterns](react-patterns.md): repository-specific component and hook conventions.
- [Testing Map](testing-map.md): test boundaries, commands, and release checks.
- [CI/CD Workflow](cicd-workflow.md): short-lived branches, merging, and manual releases.
- [PDF Generation](pdf-generation.md): template and export boundaries.
- [Changelog](changelog.md): user-facing release notes.

## Contributing

Follow the [repository instructions](../.github/copilot-instructions.md), then use the owning topic
guide above. Character format changes follow [State Management](state-management.md#schema-compatibility);
validation follows [Testing Map](testing-map.md#commands).

Keep each contract in its owning guide and link to it elsewhere. Update that guide when behavior
changes; prefer entry points and invariants over exhaustive file lists or implementation history.
Asset preparation instructions belong with their source assets, and audit records with the resource
they document. Local review prompts and findings under `docs/review/` are deliberately untracked.
