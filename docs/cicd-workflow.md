# CI/CD workflow

This guide covers validation and protected PR delivery. See [Testing](testing-map.md) for test selection.

## Branches and repository settings

Start scoped branches from current `main` and deliver reviewed changes through protected squash PRs.
Keep dependencies behind their foundation, then reconcile descendants with the actual squash merge.

The **Main Protection** ruleset requires an up-to-date branch, a PR, and both checks at the final head:

- **Code checks, build & coverage**
- **Browser & desktop checks**

Do not bypass protection or push directly to main. Native auto-merge and automatic head-branch
deletion are enabled; passing checks alone never opts a PR into merge. Automatic advisory review
covers new pushes. Conversation resolution is not a protection requirement, but findings still need
disposition. A feature merge does not authorize a release.

## Day-to-day development

1. Establish the intended behavior and affected callers on a scoped branch from current main.
2. Implement and run focused checks. Update permanent docs for changed shared contracts, persisted
   data, support limits, nonobvious rationale or maintainer procedures; ordinary copy/layout stays
   in code, relevant tests and the PR.
3. Obtain independent read-only review of the bounded diff. Resolve verified blockers and validate
   corrections. Integrate current main before publishing and renew affected review if it changes behavior.
4. Publish a focused PR. Read the actual completed advisory summary and every finding; verify and
   record dispositions. Zero findings or a COMMENTED review is not approval. Avoid duplicate requests.
5. After both exact-head checks and review disposition, enable protected squash auto-merge only with
   merge authorization. Verify the actual merge, synchronize main and update related issues.

For executable changes under `.github/workflows/**`, `.github/scripts/**`, `scripts/ci/**` or `scripts/check-release.mjs`,
review the complete script/workflow diff and advisory findings before auto-merge. A check name cannot
establish trust in its changed producer. Honor applicable maintainer/CODEOWNERS requirements; add
required CODEOWNERS approval when a second maintainer is available. Self-approval does not replace it.

## Validation

Use Node 24.15 or later in the Node 24 line. During implementation choose checks that answer a concrete
question. Run local external-data/platform checks CI cannot exercise; broaden local validation for
shared bootstrap, persistence, security or unresolved integration risk. `npm run check:pr` remains a
complete local option, without automatically repeating the final CI matrix.

Every final PR head needs both required checks and advisory disposition. Preserve coverage floors,
meaningful assertions, timeouts and bundle budgets; intentional budget changes need measured review.
Do not repeat successful validation without a new change, failure or unresolved concern.

`ci.yml` runs on non-draft PRs targeting main with pinned actions, Node 24 and Ubuntu 26.04. Scope
checks classify the complete PR diff and validate tracked Markdown targets, anchors and whitespace.
Only root `README.md`, Markdown under `docs/`, `build/README.md` and `scripts/pdf-sources/README.md`
qualify for documentation-only validation. Mixed changes, runtime resources/notices, configuration,
dependencies and unknown paths receive full checks. Both sides of a rename count. Routing eligibility
does not authorize a README edit.

| Job | Work |
| --- | --- |
| PR scope checks | Whole-PR classification and dependency-free documentation validation |
| Code checks & build | Architecture/dead-code checks, lint, type-checking build and bundle budgets |
| Coverage tests (parts 1 and 2) | Disjoint native Vitest parts, four workers each, preserving blob evidence |
| Code checks, build & coverage | Required gate; verifies code workers and merges complete coverage with the normal global floors |
| Browser tests (parts 1 and 2) | Disjoint Playwright parts, one worker each; part 1 also builds desktop and runs Electron smoke |
| Browser & desktop checks | Required gate for the complete browser matrix |

Code/build, coverage parts and browser parts run independently after scope checks. Coverage collection
uses `config/vitest.coverage-shard.ts`; partial coverage has no independent threshold decision. The
required merge uses normal `vitest.config.ts`, checks both reports against dynamic test/source inventories,
and rejects missing, corrupt, duplicate or incomplete evidence before enforcing the existing floors.

For a documentation-only PR, scope/document checks run and build/runtime workers skip. Both required
gates accept those skips only for that verified mode. On a code PR, every corresponding worker must
succeed. Gates run after dependency failure/cancellation and reject missing or unexpected results.
Browser parts keep separate failure diagnostics. A new PR run cancels its predecessor; final-head
checks qualify merge readiness. Required-name changes must be coordinated with branch protection.
Root `vite.config.ts`, `vitest.config.ts` and `playwright.config.ts` retain normal tool discovery.
`config/renderer.ts` shares renderer plugins/alias setup; `config/vite.e2e.ts` serves browser tests and
data generators, and `config/playwright.electron.ts` configures desktop smoke. Root `index.html` is
the renderer entry used by Vite and is required.

## Independent review

Every bounded change, including docs, requires a reviewer who did not implement it. Start that review
without implementation history; supply the base/head, expected behavior and constraints. Assess
affected callers, failure paths, identity, ownership, persistence and inverses as relevant, deriving
expectations independently. Record reproducible findings at an exact revision. Reviewers do not edit
source or decide publication. Reuse the reviewer for narrow corrections; absent review stays pending.

## Local-only remediation

During an explicit delivery pause, preserve scoped local work and accepted checkpoints. Read-only
investigation is allowed; push, PR updates, merge and release wait for explicit resumption. Resuming
one change does not lift unrelated holds or authorize release/private disclosure. Mark delivery only
after acceptance criteria and the actual merge are verified.

## Releasing a version

Release authorization is separate from a PR or merge. The [release workflow](../.github/workflows/release.yml)
validates the current protected main revision and builds a draft for maintainer review.
