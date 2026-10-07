# CI/CD Workflow

## Branches and repository settings

`main` is the only long-lived branch. Normally start each change from current `main` on a
short-lived branch, open a pull request back to `main`, and delete the branch after its squash
merge. A user-requested [local-only remediation phase](#local-only-remediation) postpones publishing
and merging while allowing implementation, independent review, validation, and local commits.

Protect `main` with the repository's **Main Protection** ruleset:

- Disable direct pushes and require the branch to be up to date before merging.
- Allow squash merging only; disable merge commits and rebase merging.
- Enable GitHub native auto-merge and automatic head-branch deletion.
- Require these two CI checks:
  - **Lint, type-check, coverage, and build**
  - **Browser end-to-end tests**
- Enable automatic Copilot review, including review of new pushes.
- Do not require review-conversation resolution. Copilot is advisory input before enabling
  auto-merge and before publishing a release.

Passing CI does not opt a pull request into merging. Once a change is intentionally ready, select
**Enable auto-merge** with the squash method. GitHub then merges the exact eligible revision after
all branch-protection requirements pass. There is no custom merge workflow or repository-dispatch
handoff.

Pull requests that change `.github/workflows/**`, `.github/scripts/**`, or
`scripts/check-release.mjs` are the exception: do not enable auto-merge until the complete workflow
diff and advisory review have been inspected. Once that review is complete, the pull request may use
the same native squash auto-merge path. CI status names alone are not a trust boundary because a pull
request can change the workflow that produces them. Add required CODEOWNERS approval for these paths
when the project has a second maintainer; a solo maintainer cannot provide an independent approval.

---

## Day-to-day development

When GitHub delivery is enabled, create a branch from current `main`:

```bash
git switch main
git pull --ff-only
git switch -c feat/short-description
```

Complete the [independent review](#independent-review) for each bounded change, including changes
kept locally. Local-only delivery follows the section below; the following push/PR commands apply
only after the user explicitly resumes GitHub delivery.

Before each push, pull current `main` into the branch, inspect the exact branch diff against
`origin/main`, and run the relevant checks. Review the changed behavior and nearby callers for
correctness, error handling, and regressions; passing lint and tests is not a substitute for this
local code review. Check both the committed diff and any uncommitted changes that will be included
in the push. Fix findings and repeat the review before pushing:

```bash
git pull --no-rebase origin main
git diff --check origin/main...HEAD
git diff --check
git diff --stat origin/main...HEAD
git diff origin/main...HEAD
git diff
npm run check:pr
```

When Copilot finds an issue on a pull request, inspect the related code paths for other instances or
missed edge cases while fixing it. Run focused tests and repeat the local diff review before pushing
the fix. One completed Copilot review satisfies the Copilot advisory review step; request another
only when a later change needs fresh review, rather than after every fix push. The separate local
independent review is also required. It does not replace the eventual Copilot review or required
GitHub checks.

Commit and push the reviewed branch, then open a pull request:

```bash
git push -u origin feat/short-description
gh pr create --base main --fill
gh pr merge --auto --squash
```

`check:pr` runs the main PR checks locally before the push: architecture and dead-code checks,
read-only linting, the production build (which type-checks) and bundle budgets, full coverage, and
browser E2E. Run focused tests during development, then use this command once the branch is ready
for review. Install Chromium with `npx playwright install chromium` if Playwright has not been set
up on the machine. Electron smoke remains a separate local command because headless Linux needs a
virtual display and the test skips affected Windows builds; CI runs it on Linux.

The final command opts that pull request into GitHub native auto-merge. It does not bypass CI,
branch protection, or an out-of-date base.

`ci.yml` runs on every non-draft pull request targeting `main`. It checks unused code and
architectural boundaries, linting, type checking, coverage thresholds, a production build, bundle
budgets, the complete browser suite, and the compiled Electron smoke test. Repository-run Node
commands use Node 24, matching `.nvmrc` and the package engine requirement.
Build and bundle checks run before coverage so a budget failure is reported without waiting for the
full test suite. A new run for the same pull request cancels its older run; only the latest revision
needs to finish validation.

Linux CI and release jobs use the explicit `ubuntu-26.04` runner instead of `ubuntu-latest`, so a
future GitHub runner migration cannot change the build environment without a reviewed repository
change.

The browser job includes the `@golden` level-1-to-20 journeys and narrower `@focused` checks.
Developers can run those groups independently with `npm run test:e2e:golden` and
`npm run test:e2e:focused`; `npm run test:e2e:release` runs the complete suite serially for local
release validation.

---

## Independent review

Each completed change, including a documentation-only change, needs a separate read-only review
before it is marked locally reviewed or published. The implementer still inspects the exact diff
and nearby callers; the second review is performed in a fresh session without the implementation
conversation history. Prefer a dedicated reviewer subagent with `fork_turns="none"`. This is standing
authorization to delegate that review without asking again. When subagents are unavailable, use a
fresh dedicated Codex review session or a qualified human reviewer. If no fresh reviewer is available,
continue implementation and validation but record review pending; do not represent self-review as
the completed second review.

Give the reviewer the repository path, exact base and final revisions, the task's expected behavior,
applicable constraints, and report destination. Do not supply the implementer's explanation as proof
that the change is correct. A completed commit can be reviewed with `codex review --commit <sha>`;
a complete branch can be reviewed with `codex review --base <base-ref>`. The app's `/review` supports
review against a base branch. These are review entry points, not substitutes for recording scope and
checking the resulting evidence.

The review must:

- Inspect the complete final diff, affected callers, and relevant unchanged surrounding code.
- Challenge failure handling, ordering/concurrency, saved-character compatibility, source-qualified
  identities, and upstream data contracts where relevant to the change.
- Check that tests have independently expected outcomes and exercise meaningful edge cases;
  passing CI or a large test count does not establish correctness.
- Report actionable findings with priority, file/line, triggering input or sequence, expected and
  actual behavior, and supporting evidence. Distinguish verified defects from untested concerns.
- Make no source edits, commits, network publications, or merge/release decisions.

The implementer verifies each finding, reproduces defects where practical, inspects nearby paths,
and adds behavior regressions for confirmed defects. Record false positives with code or test
evidence. Repeat focused validation after fixes, then review the final diff. A substantive fix needs
fresh review of the corrected behavior; unchanged, already-reviewed areas need not be reviewed
repeatedly. Run `npm run check:pr` before marking a functional change locally validated. For changes
limited to instructions/documentation, validate the exact diff and referenced paths/anchors; runtime
tests are needed only when executable behavior also changes. Existing mandatory pre-push validation
still applies once publishing resumes.

Keep the reviewer report and finding dispositions in ignored `docs/review/`. Record base/head
revisions, covered paths, pending concerns, and validation results. A report does not cover later
source changes automatically. Track implementation, local validation, independent review, Copilot
review, GitHub CI, and merge as separate states. A fresh Codex review adds evidence but can share
blind spots with the implementing model; neither an empty report nor passing tests certifies a
defect-free release.

## Local-only remediation

When the user pauses GitHub delivery, including when Copilot review is unavailable, that pause
persists across new chats until the user explicitly resumes publishing. Read `AGENTS.md`, the
repository instructions, and private `docs/review/workflow-state.md` when present at the start of
remediation. The private state file records the active mode, authorization to resume, branch
dependencies, holds, review reports and checkpoints; it is not source material for public issues
or PR descriptions. A current explicit user instruction takes precedence over an older mode
record; update the record before continuing work.

Continue bounded implementations on local branches. Local checkpoint commits may freeze a revision
for review; mark a checkpoint locally accepted only after validation and independent review.
Fetching current `origin/main` for comparison is allowed. Do not push branches,
create/update PRs, enable auto-merge, merge into local or remote `main`, publish findings, or release
during this phase. Preserve existing PRs and their heads for eventual Copilot review; implement
follow-ups on separate local branches and record their relationship instead of extending those PRs.

Keep the review-policy commit in the ancestry of subsequent local remediation branches so new chats
retain these rules. Start unrelated changes from that policy branch. For a dependent change, start
from the exact local dependency revision and record the parent branch/commit in the private state
file. Review the bounded change against that dependency base and inspect the accumulated diff
against `origin/main` for interactions. A deferred merge is not permission to collect unrelated
changes into one large branch. Do not discard or overwrite another branch's reviewed work.

### Local remediation scope

While Copilot review is unavailable, prioritize independent fixes, regression tests, data-contract
checks, and profiling. Start each independent implementation from the latest locally accepted
review-policy revision based on `main`, not from an unrelated functional branch. Read the private
workflow state to identify that exact revision and any held branch chains before creating a branch.

Preserve dependency chains marked on hold at their exact reviewed checkpoints. Do not extend a
held chain or begin a larger dependent rewrite, including a saved-character identity migration,
until the user explicitly authorizes it or the required Copilot review of its foundation completes
and the hold is updated. Read-only characterization and isolated probes can continue; they do not
change acceptance status or justify extending a held implementation chain.

For each new bounded change, record why it is independent of held work, its exact base/head,
validation, and fresh review. Policy updates use their own branch and review; do not silently add
them to previously reviewed heads. Existing branches still read the private workflow state, and
new implementation branches inherit the latest accepted policy revision. Do not treat a clean
merge or passing tests as proof that two changes are independent.

When review findings change an earlier dependency, identify every affected descendant, incorporate
the correction, resolve interactions, and repeat validation and fresh review at the updated exact
heads. Prior acceptance records remain historical evidence, not approval of later revisions. After
a dependency is squash-merged, reconcile its descendants with the resulting `main` history before
delivery so the parent changes are not submitted again. Keep integration validation separate from
the acceptance of individual branches.

Mark completed local work as locally implemented/validated/reviewed, with Copilot/CI/merge pending;
do not close its audit finding or public issue as delivered. Record partial coverage explicitly.
Keep security-sensitive fixes and evidence local until the user authorizes an appropriate private
publication path; resuming ordinary GitHub delivery does not authorize public disclosure.

When the user resumes delivery, record that authorization and prepare focused PRs in dependency
order. Include the policy change, reconcile each branch with current `main`, and review/test the
exact final diff again after integration.
Obtain Copilot review, address available actionable findings, and require both GitHub CI jobs before
using native squash auto-merge. Never bypass these steps merely because a local checkpoint passed.

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
