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
- For library transactions, cover pending success, rejection/retry, overlapping writes, an edit
  made while saving, and a fresh IndexedDB read after acknowledgement. Verify wizard input and
  deletion selection survive failure, and that bulk deletion is a single transaction. Delay
  initial hydration and verify queued operations retain loaded records; failed reads must reject
  mutations without writing, with retry possible after successful rehydration.
  Include superseded read failures, reentrant hydration callbacks, and an ignored correction
  failure followed by explicit Save retry; unhandled rejections must fail the run.
  Quarantine acknowledgment must retain backups through rejection and later library writes,
  permit export/retry in the dialog, and be absent from a fresh storage read only after success.
  Start a reload during a delayed transaction, then complete the read after acknowledgment;
  neither a successful nor rejected write may be undone or deadlock later queued actions.
- For source-qualified data, include same-name/different-source cases.
- For parser resilience, distinguish required failure from optional degradation.
- Test accessibility through roles/names and keyboard behavior where practical.
- Avoid comments that narrate obvious test steps; name the behavior instead.

## High-risk contracts

Maintain coverage for:

- character schema validation, supported migrations, quarantine/export recovery;
- class progression through level 20, level-down, multiclassing, HP refill, and subclass casting;
- subclass-owned choices, variant replacement, creature-filter resolution, and cleanup when a
  subclass changes;
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
fixtures' assumptions and that normalized class/subclass choice tracks have resolvable
source-qualified dependencies without diagnostics.

## E2E conventions

- `@focused`: narrow mechanics useful for quick diagnosis.
- `@golden`: complete release-blocking progression journeys.
- Seed cache/config so startup prompts are deterministic.
- Assert important checkpoints, not only the final screen: readiness, effective abilities,
  current/max HP, owned profiles/choices, save, and reload.
- Corpus-dependent tests use `runIf` and skip cleanly when local `data/` is absent.

## Commands

During development, run the narrowest relevant Vitest/Playwright files first. Before pushing a
branch for review, run `npm run check:pr`. It covers the PR checks below in one local command,
except Electron smoke. The build includes type checking. Electron smoke needs a display on Linux
and remains required in CI.

To run or diagnose a check individually:

```text
npx biome ci .
npx tsc -b
npm run test:coverage
npm run test:e2e
npm run build
npm run check:health
npm run check:bundle
npm run test:electron
```

Before a release, also run:

```text
npm run test:e2e:release
npm run check:release
```

Electron smoke tests skip local launches on Windows 11 build 26200 through 26399 because those OS
builds can terminate Electron's sandboxed child processes with `0x80000003` during initialization.
Do not make the test green with `--no-sandbox`: the startup smoke test exists in part to verify the
renderer sandbox. The tests remain active on unaffected CI hosts, and the packaged application is
unchanged. Remove the skip after the pinned Electron/Chromium runtime no longer reproduces upstream
Electron issue 52098 on those Windows builds.

`npm run lint` writes formatting/fixes; use `npx biome ci .` for read-only validation.

## Runtime reachability review

`npm run check:dead-code` remains the full-project gate, including tests, corpus reports, manual
scripts, and build configuration. `npm run report:dead-code:production` adds a diagnostic inventory
of the runtime graph; findings do not fail this command or CI. Knip's [production markers](https://knip.dev/features/production-mode)
classify the renderer, Electron main/preload, and HTML-started theme script as runtime roots, with
runtime source/CSS project patterns. Keep both views; test-only imports must not hide retired app paths.

Review each production finding against its actual consumers before removal or gate rollout:

- Preserve the documented provenance test aggregators and their equipment adapter.
- Preserve `classChoiceCoverage.ts` for corpus capability reporting.
- Rest preview and spell-slot mutation modules have domain tests but no current page consumer;
  their future play-feature role requires a product decision before wiring or removing them.
- `layoutHeights.ts` currently has only unit-test consumers; removal is a separate cleanup decision.
- Externally unused exports can still be used inside their module or expose a useful test API.
- `@tailwindcss/vite` is used by build/test configuration; a runtime-only dependency finding does
  not establish that it can be uninstalled.

Do not blanket-ignore these findings. Recheck entry/plugin discovery when adding tooling, and use
the bundle, SRD manifest, and PDF-template checks for packaged assets outside Knip's source graph.

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
