# CI/CD Workflow

This guide owns repository protection, validation and release operations. Use the
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

Use Node 24, matching `.nvmrc` and package engines. Run `npm run check:pr` at the final functional
head after focused tests and independent review. It runs architecture/dead-code checks, read-only
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

---

## Releasing a version

### 1. Prepare the release on a feature branch

Update `package.json` and `package-lock.json` together:

```bash
npm version 1.0.0 --no-git-tag-version
```

Add a matching section to `docs/changelog.md`. Its summary must exactly match the generated tag:

```html
<details>
<summary><strong>v1.0.0</strong></summary>

## Changes

* Release note

</details>
```

Validate it locally with `npm run check:release`, then open a normal pull request to `main` and
enable squash auto-merge.

### 2. Manually create the draft

After the release pull request reaches `main`, fetch its exact revision and send the manual release
request:

```bash
git fetch origin main
gh api --method POST repos/kevinkickback/Tavern-Born/dispatches \
  -f event_type=release-requested \
  -f "client_payload[source_sha]=$(git rev-parse origin/main)"
```

Repository dispatch always loads the workflow from protected `main`; the supplied revision must
still be the current `main` head when validation and draft creation run.

The workflow:

1. Requires a full source revision that is the current `main` head.
2. Validates stable version metadata, the matching changelog, and a version newer than every
   published stable release in a read-only job.
3. Inspects draft and tag state in a separate job that executes no repository code.
4. Refuses to modify any existing release or move an existing tag.
5. Builds Windows, macOS, and Linux packages in parallel without repository write credentials.
6. Validates the exact ten-file package bundle and updater manifests.
7. Re-checks that no release appeared or published stable version changed, and repeatedly verifies
   `main` and the tag immediately before creating the draft.
8. Records build provenance, creates one clean draft, and verifies its notes, tag, and non-empty
   assets.

The workflow never publishes the release. Review the release notes, all ten assets, the Windows
portable build, and any advisory review findings before publishing the draft manually.

### Recovery and repeat runs

The manual workflow is state-aware and never deletes or moves pre-existing release state:

| Existing state | Result |
| --- | --- |
| No tag and no release | Creates both after successful builds |
| Correct tag and no release | Reuses the tag and creates the draft |
| Any unpublished draft | Stops; inspect and delete the draft deliberately before rerunning |
| Unpublished tag points elsewhere | Stops; inspect and delete the tag deliberately before rerunning |
| Any published release for the version | Always stops; use a new version |

If a tag and release were both deleted, run the workflow normally. If a failed attempt left a draft
or an unpublished tag at the wrong commit, inspect that state on GitHub, remove only the confirmed
unpublished object, and rerun. The workflow uses atomic tag creation and immediate state
revalidation to stop safely when a concurrent tag, draft, or `main` change is detected.

### Release artifacts

| File | Platform |
| --- | --- |
| `Tavern-Born-Setup-<version>.exe` + `.exe.blockmap` | Windows installer |
| `Tavern-Born-<version>-portable.exe` | Windows portable |
| `Tavern-Born-<version>-arm64.dmg` + `.dmg.blockmap` | macOS (Apple Silicon) |
| `Tavern-Born-<version>.AppImage` | Linux portable |
| `tavern-born_<version>_amd64.deb` | Debian/Ubuntu |
| `latest.yml`, `latest-mac.yml`, `latest-linux.yml` | Auto-update manifests |

Windows and macOS artifacts are currently unsigned. Windows may display a SmartScreen warning,
and macOS users may need to approve the application under Privacy & Security.

---

## Operational rules

- Do not create version tags or releases manually; run the release workflow.
- Never replace or convert a published release. Corrections to a published version require a new
  version.
- Do not publish a draft while its workflow is active.
- Publish only after reviewing release notes, all ten assets, the Windows portable binary, and any
  advisory findings.
- Stable releases use `X.Y.Z` package versions and `vX.Y.Z` tags. Prerelease/build suffixes are
  rejected.

`npm run dist` runs the production build and bundle-budget check before packaging. A deliberate
bundle increase requires an explicit budget review rather than silently growing release artifacts.
Current limits live in `scripts/check-bundle-budget.mjs`. PDF source preparation and lossless
optimization are documented with the [template inputs](../scripts/pdf-sources/README.md).
Source, duplicate, and superseded PDFs must never enter `public/pdf/` or the package.
Electron Builder copies the approved runtime subset of `resources/srd/core/` to `srd/core` beside the packaged
application archive so the restricted bundled-resource reader can resolve it through
`process.resourcesPath`. The external development-only `data/` tree remains excluded.

The bundle report measures the packaged SRD resources separately and includes them in the total
distribution budget. Normal pull-request builds can measure a review snapshot without treating it
as releasable. `npm run dist` uses the stricter release mode: it requires matching
`approved-for-distribution` provenance and manifest metadata, complete packaged notices, an exact
manifest/data file set, and a valid SHA-256 checksum for every SRD JSON file before Electron Builder
runs. Only `data/`, `manifest.json`, and `THIRD_PARTY_NOTICES.md` from the managed SRD root enter an
installer or portable build.

Publish an approved draft with:

```bash
gh release edit v1.0.0 --draft=false --repo kevinkickback/Tavern-Born
```

Inspect release runs with:

```bash
gh run list --repo kevinkickback/Tavern-Born --workflow release.yml --limit 5
gh run view <RUN_ID> --repo kevinkickback/Tavern-Born
```
