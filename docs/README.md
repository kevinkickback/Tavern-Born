# Tavern-Born Documentation Hub

This folder contains architecture and implementation docs intended to keep development fast and consistent as the codebase grows.

## Start Here

If you are new to the repository, read these in order:

1. [Contributor Start Here](contributor-start-here.md)
2. [Architecture Map](architecture-map.md)
3. [Data Flow](data-flow.md)
4. [State Management](state-management.md)
5. [Data Ingestion](data-ingestion.md)

## Documents

- [Architecture Map](architecture-map.md): system layers, ownership boundaries, and code placement.
- [Data Flow](data-flow.md): startup, ingestion, editing, persistence, and update flows.
- [Data Ingestion](data-ingestion.md): 5etools loading, parsing, validation, and caching.
- [State Management](state-management.md): store contracts, mutations, persistence, and derived data.
- [Provenance](provenance.md): grant tracking, reconciliation, and invariants.
- [React Patterns](react-patterns.md): repository-specific hook and rendering conventions.
- [Testing Map](testing-map.md): test layers, commands, coverage thresholds, and expectations.
- [Codebase Tour](codebase-tour.md): concern-to-file routing for fast navigation.
- [Changelog](changelog.md): released changes plus the next planned release.

## Update Policy

Update docs in this folder whenever one of these changes:

- Folder ownership boundaries or major architecture direction
- Data loading/parsing/caching behavior
- Character state shape or mutation lifecycle
- Provenance behavior (new grant/reconciliation rules)
- Build, CI, or test conventions

When in doubt, update docs in the same pull request as the behavior change.
