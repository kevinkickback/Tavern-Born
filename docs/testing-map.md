# Testing

Put rule combinations in domain tests, adapter behavior in integration tests, and complete journeys
in Playwright. For changes to identity or ownership, cover a conflicting source and the inverse
operation as well as success. Persistence tests should exercise acknowledgement, a write failure
and reopening. Establish expected results from the contract independently of the helper under test.

## Commands

Use Node 24.15 or later in the Node 24 line.

| Need | Command |
| --- | --- |
| Focused test | `npm test -- tests/path/to/file.test.ts` |
| Default suite | `npm test` |
| Default suite with coverage | `npm run test:coverage` |
| Focused browser checks | `npm run test:e2e -- tests/e2e/affected.spec.ts` |
| Full Chromium and desktop smoke | `npm run test:e2e` and `npm run test:electron` |
| Standard subclass journeys | `npm run test:journeys:standard` |
| Local PR checks | `npm run check:pr` |

Vitest separates Node and jsdom. Use jsdom only for tests that need browser APIs or rendering.
Shared setup provides browser shims and a no-op persistence adapter. Storage tests exercise the
real transaction path. Keep runs isolated when fixtures or stores can change.

The default suite uses the bundled catalog and runs additional guarded cases when the configured
local `data/` is present. A skipped case supplies no evidence. Run affected configured-catalog
checks when changing the source, rule, or fixture they cover. The Standard journeys use a separate
config. The [source compatibility workflow](../.github/workflows/source-compatibility.yml) runs remote
checks separately.

The [PR workflow](../.github/workflows/ci.yml) validates the whole diff. Code changes run checks,
build, merged Vitest coverage, Chromium and Linux Electron smoke. Documentation-only changes use
scope, text, and link checks. Both required checks apply to the final PR revision. For changes to
installers, see the [desktop package workflow](../.github/workflows/desktop-packages.yml).
