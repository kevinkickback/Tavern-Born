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

## Active implementation plans

- [Character Data Compatibility](plans/character-data-compatibility.md): preserve pre-1.0 user
  characters at the 1.0 boundary without committing to unsafe automatic conversion.

## Before changing code

- Choose the owning layer before coding: page/component, hook, pure domain library, store, or parser.
- Search for an existing calculator, command, resolver, or parser first.
- Keep game rules in `src/lib/`, state adapters in `src/hooks/`, and presentation in components.
- Use `name|source` identity for 5etools entities.
- Route character writes through the character store.
- Never edit `data/`.
- Add or update behavior-focused tests and the relevant topic document.

## Character format changes

Tavern-Born exposes one current runtime character shape. For a breaking persisted-data change:

1. Increment `CURRENT_CHARACTER_SCHEMA_VERSION`.
2. Update the type, strict schema, factory, and fixtures together.
3. Add a pure, one-way migration from each supported prior version.
4. Validate after migration and persist only the current shape.
5. Test persistence, every supported migration step, and rejection of newer or unsafe payloads.

Before 1.0, prefer migration over invalidating characters. Do not add downgrade paths,
compatibility mirrors, or historical branches in feature code. At the 1.0 boundary, reassess the
full pre-1.0 migration chain; if it is deliberately removed, keep export-before-removal recovery
and announce the cutoff in advance.

## Review checklist

- No direct game-data JSON imports in UI code.
- No canonical constants where parsed data can supply the value.
- No persisted mirrors of derived values.
- Materialized grants and provenance change atomically.
- Focused tests pass, followed by the checks in [Testing Map](testing-map.md).

Update documentation in the same change when a stable boundary or workflow changes. Prefer links
to an owning directory or entry point over long lists of individual files.
