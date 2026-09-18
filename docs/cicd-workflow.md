# CI/CD Workflow

## Branches and repository settings

`main` is the only long-lived branch. Start each change from current `main` on a short-lived branch,
open a pull request back to `main`, and delete the branch after its squash merge.

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

Create a branch from current `main`:

```bash
git switch main
git pull --ff-only
git switch -c feat/short-description
```

Commit and push the branch, then open a pull request:

```bash
git push -u origin feat/short-description
gh pr create --base main --fill
gh pr merge --auto --squash
```

The final command opts that pull request into GitHub native auto-merge. It does not bypass CI,
branch protection, or an out-of-date base.

`ci.yml` runs on every non-draft pull request targeting `main`. It checks unused code and
architectural boundaries, linting, type checking, coverage thresholds, a production build, bundle
budgets, the complete browser suite, and the compiled Electron smoke test. Repository-run Node
commands use Node 24, matching `.nvmrc` and the package engine requirement.

The browser job includes the `@golden` level-1-to-20 journeys and narrower `@focused` checks.
Developers can run those groups independently with `npm run test:e2e:golden` and
`npm run test:e2e:focused`; `npm run test:e2e:release` runs the complete suite serially for local
release validation.

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

After the release pull request reaches `main`, open **Actions → Release → Run workflow**, select
`main`, leave **Replace an unpublished tag or draft that targets another commit** disabled for a
normal release, and run it.

The workflow:

1. Requires the dispatched revision to be the current `main` head.
2. Validates stable version metadata and the matching changelog section.
3. Refuses to modify a published release.
4. Builds Windows, macOS, and Linux packages in parallel without repository write credentials.
5. Validates the exact ten-file package bundle and updater manifests.
6. Re-checks the exact initial tag and draft state and repeatedly verifies `main` immediately before
   release mutations.
7. Records build provenance, creates or replaces one clean draft, and verifies its tag and assets.

The workflow never publishes the release. Review the release notes, all ten assets, the Windows
portable build, and any advisory review findings before publishing the draft manually.

### Recovery and repeat runs

The manual workflow is state-aware and safe to rerun:

| Existing state | Result |
| --- | --- |
| No tag and no release | Creates both after successful builds |
| Correct tag and no release | Reuses the tag and creates the draft |
| Correct tag and unpublished draft | Replaces the draft after successful builds |
| Missing tag with unpublished draft | Replaces the draft and recreates the tag |
| Unpublished tag points elsewhere | Stops unless the replacement checkbox is enabled |
| Any published release for the version | Always stops; use a new version |

If a tag and release were both deleted, run the workflow normally with the replacement checkbox
disabled. If corrective changes reached `main` while an unpublished tag still points to an older
commit, enable the checkbox. Replacement still occurs only after every new artifact has built and
validated. The workflow uses atomic tag creation plus immediate state revalidation to stop safely
when a concurrent tag, draft, or `main` change is detected.

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

Publish an approved draft with:

```bash
gh release edit v1.0.0 --draft=false --repo kevinkickback/Tavern-Born
```

Inspect release runs with:

```bash
gh run list --repo kevinkickback/Tavern-Born --workflow release.yml --limit 5
gh run view <RUN_ID> --repo kevinkickback/Tavern-Born
```
