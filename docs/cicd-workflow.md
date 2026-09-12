# CI/CD Workflow

## Branches

| Branch | Purpose |
|--------|---------|
| `dev` | All active development happens here |
| `main` | Stable branch — only updated via PR from `dev` |

Protect `main` in GitHub so direct pushes are disabled and required CI checks must pass.
Enable squash merging and allow the workflow's `contents: write` and `pull-requests: write`
permissions. Select the two CI jobs as required checks:

- **Lint, type-check, coverage, and build**
- **Browser end-to-end tests**

Do not require the downstream merge or release jobs as pre-merge checks. Required reviews and
other branch protection rules still apply; the workflow does not bypass them. Automatic squash
merging is restricted to non-draft PRs from this repository's `dev` branch into `main`.
Other PRs are not automatically merged.

If automatic Copilot review is enabled, the merge job gives a review of the exact checked revision
time to finish. It waits one minute for review activity to appear and up to ten minutes when a
review is active. Copilot remains advisory: unavailable review capacity or a timeout does not block
the release, while unresolved conversations can still be enforced by the repository ruleset.

---

## Day-to-day development

Work on `dev` and push your changes:

```bash
git add .
git commit -m "your message"
git push
```

`ci.yml` runs on PRs targeting `dev` or `main` when opened, updated, reopened, or marked ready
for review. Draft PRs wait until they are marked ready. There is no push-triggered CI run.
Lint, type checking, coverage tests, production builds, browser end-to-end tests, and the Electron
smoke test run before merging. Each new PR revision needs passing checks; lint and tests are not
repeated after the squash merge.

Both CI jobs must pass before the automatic merge job runs. It merges only the checked PR head.
If `main` changed during checks, update the PR to include the latest base before retrying.

---

## Releasing a new version

Follow these steps **in order**. Skipping or reordering steps can prevent artifact uploads (see
[Critical gotcha](#critical-gotcha--do-not-pre-create-the-tag-or-release) below).

### Step 1 — Bump the version and update the changelog

Update `package.json` and `package-lock.json` together, for example:

```bash
npm version 1.0.0 --no-git-tag-version
```

Add a matching section to `docs/changelog.md`. The summary line must exactly match the generated tag:

```html
<details>
<summary><strong>v1.0.0</strong></summary>

## Changes

* Release note

</details>
```

The workflow extracts only the content inside that version's `<details>` block and uses it as the
draft release notes. A missing, empty, or incomplete matching section stops the release.

### Step 2 — Commit and push to `dev`

```bash
git add package.json package-lock.json docs/changelog.md
git commit -m "chore: bump version to 1.0.0"
git push
```

### Step 3 — Open a PR from `dev` to `main`

Using the GitHub CLI:

```bash
gh pr create --base main --head dev --title "Release v1.0.0" --body "Release notes here"
```

The workflow automatically squash merges the PR after both CI jobs pass and GitHub's merge
requirements are satisfied. No manual merge command is needed.
If the ready `dev` to `main` PR is already open, pushing the version-bump commit updates that PR
and starts this sequence automatically; otherwise, opening the PR starts it.

**PR checks → automatic squash merge → version/tag and source validation → draft creation →
Electron builds → asset upload and verification**

After merging, `ci.yml` calls the reusable `release.yml` directly. This avoids relying on a
push event, which a merge performed with `GITHUB_TOKEN` does not trigger for other workflows.
The release workflow:

1. Compares the package version at the squash commit with its parent. If unchanged, all remaining
   release stages are skipped. The PR still merges; its title alone does not request a release.
2. Confirms the exact squash commit came from a merged same-repository `dev` to `main` PR.
3. Runs `scripts/check-release.mjs` to require an increased stable version, matching versions in
   `package.json` and both root version fields in `package-lock.json`, and exactly one complete,
   nonempty changelog section. Ensures any existing version tag points to the squash commit.
4. Creates the `v<version>` tag and draft release, using the version's changelog section as notes.
5. Builds Windows, macOS, and Linux packages in parallel from the exact squash commit and uploads
   them to the draft. Each build records provenance attestations for its installers, updater
   manifests, and blockmaps. Compilation for packaging is required; lint and tests are not rerun.
6. Verifies every expected artifact exists and the release is still a draft.

Electron Builder receives `PUBLISH_FOR_PULL_REQUEST=true` only in the release build step because
reusable workflows retain the caller's PR context. Source validation first requires a merged commit;
unmerged PRs do not reach this publishing step.

The workflow never publishes the release. Review the notes and attached artifacts, then publish the
draft manually when it is ready.

> **Signing status:** Windows and macOS artifacts are currently unsigned so releases do not depend
> on paid or identity-verified signing accounts. Windows may display a SmartScreen warning, and
> macOS users may need to approve the application in System Settings → Privacy & Security. Restore
> certificate-backed signing and Apple notarization before representing a future release as signed.

The release will contain:

| File | Platform |
|------|----------|
| `Tavern-Born-Setup-<version>.exe` + `.exe.blockmap` | Windows installer |
| `Tavern-Born-<version>-portable.exe` | Windows portable |
| `Tavern-Born-<version>-arm64.dmg` + `.dmg.blockmap` | macOS (Apple Silicon) |
| `Tavern-Born-<version>.AppImage` | Linux (portable) |
| `tavern-born_<version>_amd64.deb` | Linux (Debian/Ubuntu) |
| `latest.yml`, `latest-mac.yml`, `latest-linux.yml` | Auto-update manifests |

---

## Critical gotcha — do not pre-create the tag or release

electron-builder (`--publish always`) uploads artifacts into the **draft** GitHub Release created by
the workflow. If a published (non-draft) release already exists for the tag, electron-builder logs:

```
GitHub release not created  reason=existing type not compatible with publishing type
existingType=release publishingType=draft
skipped publishing  file=... reason=existing type not compatible...
```

...and skips uploads from that build job. The workflow refuses to reuse an already published
release before building; final verification also rejects missing assets or a non-draft release.

**Rules:**

- Do not create or push the version tag manually; the workflow creates it after validation succeeds.
- Do not create the GitHub Release manually; the workflow creates and populates the draft.
- If a draft already exists for the workflow-created tag, a rerun safely refreshes its notes and artifacts.
- If you accidentally published the release before a rerun, convert it back to a draft first:
  ```bash
  gh release edit v1.0.0 --draft=true --repo kevinkickback/Tavern-Born
  gh run rerun <RUN_ID> --failed --repo kevinkickback/Tavern-Born
  ```
- After the workflow completes, inspect the draft and publish it manually when approved:
  ```bash
  gh release view v1.0.0 --repo kevinkickback/Tavern-Born --json isDraft,assets | ConvertFrom-Json
  gh release edit v1.0.0 --draft=false --repo kevinkickback/Tavern-Born
  ```

---

## Version and tag format

Use a stable `X.Y.Z` version in `package.json`, such as `1.0.0` or `1.2.3`. The workflow
automatically creates the corresponding `v1.0.0` or `v1.2.3` tag. Prerelease versions and build
suffixes are rejected because release verification uses the stable `latest*.yml` update manifests.

The release metadata check runs after version-change detection and before tag or draft creation.
It does not install dependencies or rerun lint or tests. To check release metadata locally, run:

```bash
npm run check:release
```

---

## If a release build fails

Go to the **Actions** tab on GitHub, open the failed run, and check which platform failed. Each platform builds independently — a failure on one does not cancel the others.

To inspect logs via CLI:
```bash
gh run list --repo kevinkickback/Tavern-Born --workflow ci.yml --limit 5
gh run view <RUN_ID> --repo kevinkickback/Tavern-Born
gh run view --repo kevinkickback/Tavern-Born --job <JOB_ID> --log
```

For a transient runner or network failure, rerun the failed jobs; the existing tag and draft are
reused safely. Use **Re-run failed jobs** (or `gh run rerun <RUN_ID> --failed`) to avoid repeating
successful PR checks. Release jobs appear inside the calling **CI** run.

If only the release workflow needs correction, fix it through the normal `dev` to `main` process,
then run the **Release** workflow manually from `main`. Supply the original version-bump squash
commit as `source-sha`; the current workflow will rebuild and verify that already-validated source.
Do not supply the later workflow-fix commit, because its package version did not change.

If application source or packaging configuration needs correction, use a new version and changelog
section in the next `dev` to `main` PR. A manual recovery deliberately checks out the original
release source, so it cannot incorporate later product changes.

If needed, remove the failed draft and its tag separately (only for an unpublished failed release):
```bash
gh release delete v1.0.0 --repo kevinkickback/Tavern-Born --yes
git push origin --delete v1.0.0
git tag -d v1.0.0
```
