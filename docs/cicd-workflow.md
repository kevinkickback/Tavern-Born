# CI/CD workflow

This guide owns validation and protected PR delivery. [Testing](testing-map.md) owns test selection;
the [release procedure](releasing.md) owns separately authorized release operations.

## Branches and repository settings

Start scoped branches from current `main` and deliver reviewed changes through protected squash PRs.
Keep dependencies behind their foundation, then reconcile descendants with the actual squash merge.

The **Main Protection** ruleset requires an up-to-date branch, a PR, and both checks at the final head:

- **Lint, type-check, coverage, and build**
- **Browser end-to-end tests**

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

For executable changes under `.github/workflows/**`, `.github/scripts/**` or `scripts/check-release.mjs`,
review the complete script/workflow diff and advisory findings before auto-merge. A check name cannot
establish trust in its changed producer. Honor applicable maintainer/CODEOWNERS requirements; add
required CODEOWNERS approval when a second maintainer is available. Self-approval does not replace it.

## Validation

Use Node 24.15 or later in the Node 24 line. During implementation choose checks that answer a concrete
question. Run local external-data/platform checks CI cannot exercise; broaden local validation for
shared bootstrap, persistence, security or unresolved integration risk. `npm run check:pr` remains a
complete local option, without automatically repeating the final CI matrix.

Documentation-only changes need text, links/anchors, whitespace and scope review. Every final PR
head still requires both CI checks. Preserve coverage floors, meaningful assertions, timeouts and
bundle budgets; intentional budget changes require review of measured artifacts. Do not repeat
successful validation without a new change, failure or unresolved concern.

`ci.yml` runs on non-draft PRs targeting main with pinned actions, Node 24 and Ubuntu 26.04:

| Job | Work |
| --- | --- |
| Quality | Architecture/dead-code checks, lint, type-checking production build, bundle budgets, coverage |
| Browser shards 1 and 2 | Disjoint halves of the complete Playwright suite, one worker per job |
| Browser aggregate | Required check; succeeds only when the complete browser matrix succeeds |

Shard 1 also builds the desktop app and runs Electron smoke under a virtual display. The aggregate
runs even after dependency failure/cancellation and rejects every result except success. Each shard
keeps separate failure diagnostics. New runs cancel older runs for the PR; only the final head qualifies.

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

Read the [release procedure](releasing.md) for version/changelog preparation, protected-main dispatch,
the ten-asset draft, recovery and publication. Release authorization is separate from a PR or merge.
