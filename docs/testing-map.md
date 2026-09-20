# Testing Map

Tests should protect behavior at the narrowest useful layer. This guide records strategy and
release commands; it intentionally does not inventory every test file.

## Layers

| Layer | Use it for | Location |
| --- | --- | --- |
| Unit/domain | Calculations, commands, parsers, schemas, reconciliation | `tests/lib/`, `tests/unit/` |
| Hook/store | React adapters, Zustand lifecycle, async state boundaries | `tests/hooks/`, `tests/store/` |
| Integration | Page/component workflows with controlled dependencies | `tests/integration/` |
| Browser E2E | Critical user journeys and persistence across reload | `tests/e2e/` |
| Electron | IPC, updater, security, packaged startup | `tests/electron/`, `tests/electron-smoke/` |
| Corpus | Assumptions about the external local 5etools checkout | `tests/corpus/` |
| Workflow | Release/CI policy contracts | `tests/workflow/` |

Prefer pure command tests for combinatorial game rules. Use integration tests for wiring and user
interaction, not to repeat every command case. E2E covers a small number of high-risk complete
journeys rather than every display branch.

## Shared setup

`tests/setup.ts` owns browser shims and the default no-op IndexedDB adapter for tests that do not
exercise persistence. Store-specific tests may override that module locally.

Reusable character factories live in `tests/fixtures/characterFixtures.ts`; active-character store
setup lives in `tests/fixtures/characterStoreFixtures.ts`. Add focused fixture builders instead of
copying full character literals. Large representative `.tbc` fixtures are reserved for import/PDF
and cross-surface contracts.

## Patterns

- Use `test.each` for input/output matrices and ruleset/class variants.
- Assert the public command/hook result, not intermediate implementation calls.
- For ownership changes, assert materialized state and provenance together.
- For store saves, cover pending success, rejection/retry, and an edit made while saving.
- For source-qualified data, include same-name/different-source cases.
- For parser resilience, distinguish required failure from optional degradation.
- Test accessibility through roles/names and keyboard behavior where practical.
- Avoid comments that narrate obvious test steps; name the behavior instead.

## High-risk contracts

Maintain coverage for:

- character schema validation, supported migrations, quarantine/export recovery;
- class progression through level 20, level-down, multiclassing, HP refill, and subclass casting;
- origin-system feat/ability ownership and readiness navigation;
- spell profile/provenance atomicity, prepared-caster models, replacements, and slot pools;
- overlapping provenance owners and source changes;
- source filtering, exact fallback resolution, and ingestion atomicity;
- recursive rules previews, pin/transient behavior, anchoring, scrolling, and modal interaction;
- character save/reload, copy/import/export, and unsaved-close protection;
- PDF view-model/template contracts and shipped form compatibility;
- Electron IPC/local-path boundaries, updater lifecycle, and packaged startup;
- CI/release policy.

The golden browser journeys cover deterministic 2014 Variant Human/Arcane Trickster and 2024
Human/Eldritch Knight creation through level 20. The fast progression matrix covers every supported
core class and level. Guarded corpus tests verify that the external catalog still satisfies the
fixtures' assumptions.

## E2E conventions

- `@focused`: narrow mechanics useful for quick diagnosis.
- `@golden`: complete release-blocking progression journeys.
- Seed cache/config so startup prompts are deterministic.
- Assert important checkpoints, not only the final screen: readiness, effective abilities,
  current/max HP, owned profiles/choices, save, and reload.
- Corpus-dependent tests use `runIf` and skip cleanly when local `data/` is absent.

## Commands

During development, run the narrowest relevant Vitest/Playwright files first. Before merging:

```text
npx biome ci .
npx tsc -b
npm run test:coverage
npm run test:e2e
npm run build
npm run check:health
```

Before a release, also run:

```text
npm run test:e2e:release
npm run test:electron
npm run check:bundle
npm run check:release
```

Electron smoke tests skip local launches on Windows 11 build 26200 through 26399 because those OS
builds can terminate Electron's sandboxed child processes with `0x80000003` during initialization.
Do not make the test green with `--no-sandbox`: the startup smoke test exists in part to verify the
renderer sandbox. The tests remain active on unaffected CI hosts, and the packaged application is
unchanged. Remove the skip after the pinned Electron/Chromium runtime no longer reproduces upstream
Electron issue 52098 on those Windows builds.

`npm run lint` writes formatting/fixes; use `npx biome ci .` for read-only validation.

## Coverage policy

Coverage thresholds are configured in Vitest and are a floor, not a target. Removing duplicate or
obsolete tests is acceptable only when the supported behavior remains covered at a stronger layer
and the coverage gate stays green. Do not preserve tests that verify direct store mutation,
historical APIs, or comments saying the asserted workflow does not run.

Large suites should be split by behavior domain when navigation becomes difficult. Do not split
only to satisfy a line count; shared setup and cohesive assertions matter more than file size.

## Definition of done

- New/changed behavior has appropriate unit and/or E2E coverage.
- Relevant focused tests pass.
- Full coverage, static checks, build, and health checks pass before merge.
- Release checks pass before publishing.
- Stable architecture/test conventions changed by the work are documented here.
