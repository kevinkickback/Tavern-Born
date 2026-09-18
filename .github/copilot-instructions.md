# Tavern-Born Repository Instructions

Keep changes simple, testable, and consistent with the existing architecture. These are the
repository-wide guardrails; detailed implementation guidance belongs in `docs/`.

## Read the relevant guide first

| Work area | Guide |
| --- | --- |
| Orientation, contribution checklist, character-format policy | [Documentation index](../docs/README.md) |
| Code placement, dependencies, or a new subsystem | [Architecture map](../docs/architecture-map.md) |
| Startup, loading, saving, rendering, or updates | [Data flow](../docs/data-flow.md) |
| 5etools loading, parsing, filtering, or entity resolution | [Data ingestion](../docs/data-ingestion.md) |
| Stores, character fields, schema changes, or mutations | [State management](../docs/state-management.md) |
| Grants, ownership, replacement, or reconciliation | [Provenance](../docs/provenance.md) |
| Components, hooks, styling, responsiveness, or overlays | [React patterns](../docs/react-patterns.md) |
| Tests, fixtures, coverage, or release validation | [Testing map](../docs/testing-map.md) |
| PDF projection, mapping, or templates | [PDF generation](../docs/pdf-generation.md) |
| Branches, pull requests, packaging, or releases | [CI/CD workflow](../docs/cicd-workflow.md) |
| User-visible release notes | [Changelog](../docs/changelog.md) |

Update the relevant guide in the same change when a stable contract or workflow changes.

## Non-negotiable rules

1. **Never edit `data/`.** It is externally managed 5etools input. Fix ingestion or add an isolated,
   validated fallback in source code; never bypass the repository guard.
2. **Parsed data is authoritative.** Do not hardcode canonical game values that can be parsed.
   Preserve source-qualified `name|source` identity in lookups, persistence, and rendered entity
   keys; never guess a printing from an unqualified name.
3. **UI code does not read game-data JSON or recreate rules.** Use `useFilteredGameData()`,
   `useWizardGameData()`, or the named hooks in `src/hooks/data/useGameData.ts`.
4. **Respect layer ownership.** Pure business rules and complete transitions belong in `src/lib/`;
   hooks adapt them to state; components own presentation and interaction. Search for an existing
   calculator, command, resolver, or parser before adding another implementation.
5. **Character mutations are atomic.** Route writes through the character store. Commands own
   replacement/removal behavior and return materialized state with provenance together. Never
   mutate character objects or patch grant state and ownership separately.
6. **Derive deterministic values.** Persist player choices and mutable runtime state, not mirrors of
   calculations such as modifiers, maxima, readiness, or display projections.
7. **Use the established UI boundaries.** Use Radix primitives for overlays, Sonner for
   notifications, Tailwind plus `cn()` for static presentation, and `GameContent` for interactive
   user-facing 5etools rules text. Never render raw 5etools markup or JSON.
8. **Do not weaken validation to make a change pass.** Add or update behavior-focused tests, run the
   relevant suites, then run `npx biome ci .` and `npx tsc -b`. Use `npm run lint` only when writing
   formatting/fixes is intentional. Never bypass a failing check.
