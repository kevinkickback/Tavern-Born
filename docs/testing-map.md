# Testing map

Protect behavior at the narrowest useful layer. Run focused checks while implementing; the finished
PR revision receives the broad [CI gates](cicd-workflow.md#validation). Add local checks for data or
platform coverage CI cannot exercise and for unresolved shared-boundary uncertainty.

## Layers

| Layer | Protects | Location |
| --- | --- | --- |
| Unit/domain | Calculations, commands, parsers, schemas, reconciliation | `tests/lib/`, `tests/unit/` |
| Hook/store | React adapters and async state boundaries | `tests/hooks/`, `tests/store/` |
| Integration | Component workflows with controlled dependencies | `tests/integration/` |
| Browser | Critical journeys and persistence across reload | `tests/e2e/` |
| Electron | IPC, updater, security, desktop startup | `tests/electron/`, `tests/electron-smoke/` |
| Corpus | Assumptions about the external local catalog | `tests/corpus/` |
| Workflow | Executable CI/release gates | `tests/workflow/` |

Prefer domain matrices for combinatorial rules, integration for wiring, and browser tests for
complete journeys. A new test should protect a distinct behavior or failure, not repeat a lower
layer's assertions. Routine wording, layout and documentation edits need appropriate text/link
review rather than tests that mirror strings.

## Shared setup

`vitest.config.ts` separates Node tests from DOM suites. Hooks, stores, integration and `.tsx` tests
use jsdom; `.test.ts` files that need rendering, storage, sanitization or `window.electronAPI` declare
`// @vitest-environment jsdom` explicitly. Pure tests use Node. Keep per-file isolation and the shared
`tests/setup.ts`: fake IndexedDB/default no-op adapter in both environments, browser shims only in
jsdom. Persistence tests override the adapter to exercise real transactions.

Reusable character and active-store factories live in `tests/fixtures/`. Large `.tbc` fixtures serve
import/PDF and cross-surface contracts. Derive expectations independently of production helpers;
fixture generation alone does not establish correctness.

## Patterns and coverage

- Assert public outcomes and complete materialization/provenance together. Use `test.each` for
  ruleset and input matrices; keep exact source/owner identities in collision cases.
- Test pending writes, acknowledgement, rejection/retry and overlapping revisions at the durable
  storage boundary; see [saved-library transactions](state-management.md#saved-library-transactions).
- Distinguish required ingestion failure from optional degradation. Deterministic fixtures own
  expectations; guarded corpus checks verify real upstream assumptions.
- Use roles, accessible names and keyboard paths for interactions. Test retained intent and exact
  restoration as well as successful selection when ownership or source access can change.
- Coverage thresholds in Vitest are floors. Remove obsolete/duplicate cases only when supported
  behavior remains covered at a stronger layer. Preserve meaningful assertions, budgets and timeouts.

The golden journeys cover 2014 Variant Human/Arcane Trickster and 2024 Human/Eldritch Knight through
level 20. The progression matrix covers core level/HP transitions. Neither qualifies every offered
class/subclass's required choices. Guarded corpus tests and generated fixtures add source/readiness
checks; complete creator qualification remains a separate release obligation.

## E2E conventions

`@focused` marks narrow diagnostic journeys; `@golden` marks complete release-blocking progression.
Seed startup deterministically and assert important intermediate choices, readiness, save and reload.
CI uses two isolated shards with one worker each; retries and timeouts remain configured in
`playwright.config.ts`. Their union must preserve the full suite. Local runs use the same config.
Data-dependent checks skip when the required external `data/` is absent; a skip is not a pass.

## Commands

Use Node 24.15 or later in the Node 24 line. Common focused and individual checks:

```text
npx vitest run tests/path/to/affected.test.ts --maxWorkers=4
npx playwright test tests/e2e/affected.spec.ts
npx biome ci .
npm run check:health
npm run build
npm run check:bundle
npm run test:coverage
npm run test:e2e
npm run test:electron
```

`build` includes type checking. `npm run check:pr` remains available for a complete local gate when
needed; it is not an automatic duplicate of completed-head CI. Add broader local validation for
concrete cross-cutting uncertainty, shared setup/security changes or CI gaps. After a correction,
rerun affected checks; repeat successful broad validation only for a new change, failure or concern.
Documentation-only work uses text, links/anchors and scope checks plus independent review.
Every published final head still needs both required CI checks and advisory disposition.

Electron smoke requires a display on Linux. It skips local Windows builds 26200–26399 because of
upstream Electron issue 52098 (`0x80000003` during sandboxed child initialization). Keep CI coverage;
never use `--no-sandbox` to make this check pass. Remove the skip once the pinned runtime is fixed.
Before an authorized release also run `test:e2e:release` and `check:release` under the
[release procedure](releasing.md). `npm run lint` writes fixes; `npx biome ci .` is read-only.

## Runtime reachability review

`check:dead-code` covers the full project, including tests and tooling.
`report:dead-code:production` is a nonblocking runtime-graph diagnostic using Knip's production
markers. Inspect actual callers before deleting findings: test-only use does not prove production
reachability, while tooling and asset consumers may sit outside that graph. Do not blanket-ignore
findings. Bundle, SRD manifest and PDF-template checks cover packaged assets outside the source graph.
