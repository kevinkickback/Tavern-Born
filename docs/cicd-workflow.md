# CI/CD Workflow

This guide owns repository protection, validation and PR delivery. [Release procedure](releasing.md)
owns release mechanics. Use the
[documentation index](README.md) for architecture and implementation contracts.

## Branches and repository settings

Start scoped feature branches from current `main`; merge reviewed work by protected squash PR.
Keep dependent work behind its foundation until that change has merged. After a squash merge,
reconcile any descendants with the resulting main so the parent changes are not submitted again.

The **Main Protection** ruleset requires:

- An up-to-date branch and both **Lint, type-check, coverage, and build** and
  **Browser end-to-end tests** at the final PR revision.
- Pull requests and squash merging, with no protection bypass or direct pushes to main.
- Automatic advisory review, including new pushes. Review-conversation resolution is not a
  protection requirement; findings still need disposition before opting into merge.

GitHub native auto-merge and automatic head-branch deletion are enabled. Passing checks alone
never opts a PR into merge. No release is implied by a feature PR or merge.

## Day-to-day development

1. Pull current main and create a scoped branch. State the intended behavior and affected callers.
2. Implement the change, update its owning guide, inspect the complete diff and run focused checks.
3. Obtain independent read-only review. Resolve verified blockers and validate the final revision.
4. Before each push, pull main into the branch and inspect committed and uncommitted changes.
   Renew affected review and validation when integration or later edits change accepted behavior.
5. Publish the focused PR. Read the completed advisory review's summary and all findings, reproduce
   concerns, and record their disposition. Zero findings or a COMMENTED review is not approval.
   Automatic review covers new pushes; avoid duplicate review requests.
6. After review disposition and both required checks pass at the exact head, enable native squash
   auto-merge. Verify the actual merge, synchronize main, and update related issues.

Useful commands, in that sequence:

```bash
git switch main
git pull --ff-only
git switch -c feat/short-description
# Implement, review and validate the bounded change.
git pull --no-rebase origin main
git diff --check origin/main...HEAD
git diff --check
git diff origin/main...HEAD
git diff
git push -u origin feat/short-description
gh pr create --base main --fill
# Wait for completed review disposition and both exact-head checks.
gh pr merge --auto --squash --match-head-commit <reviewed-head-sha>
```

For changes to `.github/workflows/**`, `.github/scripts/**` or `scripts/check-release.mjs`, inspect
the complete workflow/script diff and advisory review before enabling auto-merge. Check names
alone cannot establish trust when the PR changes the workflow that produces them. Add required
CODEOWNERS approval for these paths when a second maintainer is available; a solo maintainer
cannot provide independent approval for their own changes.

## Validation

Use Node 24.15 or later in the Node 24 line, matching `.nvmrc` and the test environment's minimum
version. Run `npm run check:pr` at the final functional head after focused tests and independent
review. It runs architecture/dead-code checks, read-only
lint, types, production build, normal bundle budgets, coverage and the complete browser suite.
See the [testing commands](testing-map.md#commands) for focused runs and platform details.

Documentation-only edits require exact-text, relative-link and scope validation; runtime tests
are unnecessary unless executable behavior changes. Required GitHub checks remain mandatory for
all PRs. Do not weaken tests or budgets to pass a change. An intentional bundle allowance increase
requires explicit review of the measured artifact. Do not repeat successful validation without a
new change, failure or unresolved concern; distinguish setup failures from product failures.

`ci.yml` runs for non-draft PRs targeting main. Both required jobs use Node 24 and `ubuntu-26.04`.
The quality job checks architecture, lint, types, build, budgets and coverage. The browser job runs
the complete suite, builds the desktop application and runs Electron smoke tests under a virtual
display. Electron smoke remains a separate, platform-dependent local command. A new run for the
same PR cancels its older run; only the final revision qualifies for merge.

## Independent review

Every completed change, including documentation, needs a separate reviewer who did not implement
it before acceptance or publication. The initial review starts without the implementation history;
provide the exact base/head, expected behavior and constraints for independent assessment. If a
separate reviewer is unavailable, record review pending; self-review does not satisfy this gate.

Review behavior and affected callers, including failure paths, ordering, persistence, identity and
ownership where relevant. Derive expected results independently from the implementation. Record
verified findings with an exact revision, location, trigger, expected/actual result and evidence.
Reviewers make no source edits or publication decisions. The implementer verifies findings, adds
meaningful regressions, resolves blockers and renews affected review after corrections. Passing
checks or an empty review does not certify a defect-free release.

## Local-only remediation

During an explicit delivery pause, keep work on scoped local branches. Do not push, update PRs,
merge into main or release until delivery is explicitly resumed. Preserve existing PRs and accepted
checkpoints; fetching for comparison and read-only investigation remain allowed. Record dependency
holds before starting related work. Resumption does not lift an unrelated hold or authorize a
release or disclosure of private findings.

Resume bounded changes on current main. Reconcile dependency corrections, renew affected review
and validation, and complete the protected delivery steps above. Only mark an issue delivered after
its acceptance criteria and actual merge are verified. Keep private evidence outside public work.

## Releasing a version

The complete [release procedure](releasing.md) owns version/changelog preparation, protected-main
dispatch, the ten-asset draft, recovery and publication. Read it only for release work. Release
authorization is separate from implementation, a PR or merge.
