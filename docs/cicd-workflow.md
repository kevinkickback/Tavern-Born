# CI/CD Workflow

## Branches

| Branch | Purpose |
|--------|---------|
| `dev` | All active development happens here |
| `main` | Stable branch — only updated via PR from `dev` |

Protect `main` in GitHub so direct pushes are disabled and required CI checks must pass. As a second
line of defense, the release workflow refuses to proceed unless GitHub associates the new `main`
commit with a merged `dev` → `main` PR.

---

## Day-to-day development

Work on `dev`. Every push automatically runs lint, strict type-checking, coverage thresholds, the
production build, and browser end-to-end tests in GitHub Actions. Fix anything that fails before
continuing.

```bash
git add .
git commit -m "your message"
git push
```

`ci.yml` (`.github/workflows/ci.yml`) is a [reusable workflow](https://docs.github.com/actions/using-workflows/reusing-workflows)
— it declares `workflow_call:` alongside its `push` trigger, so `release.yml` can invoke the exact
same checks via `uses: ./.github/workflows/ci.yml`. It intentionally does **not** also trigger on
`pull_request`: GitHub matches required status checks by commit SHA + check name regardless of which
event produced them, so the check that ran on the `dev` push already satisfies the `dev` → `main` PR's
requirement for that same commit. This avoids running the full suite twice for unchanged code. The
release workflow runs CI again after the PR lands on `main`, validating the exact merge result before
creating a tag, draft, or artifacts.

---

## Releasing a new version

Follow these steps **in order**. Skipping or reordering steps can prevent artifact uploads (see
[Critical gotcha](#critical-gotcha--do-not-pre-create-the-tag-or-release) below).

### Step 1 — Bump the version and update the changelog

```json
"version": "1.0.0"
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
git add package.json docs/changelog.md
git commit -m "chore: bump version to 1.0.0"
git push
```

### Step 3 — Open a PR from `dev` → `main` and merge it

Using the GitHub CLI:
```bash
gh pr create --base main --head dev --title "Release v1.0.0" --body "Release notes here"
gh pr merge <PR_NUMBER> --merge --repo kevinkickback/Tavern-Born
```

Merging the PR triggers `release.yml`; do not create or push the version tag manually. The workflow:

1. Confirms the `main` commit came from a merged `dev` → `main` PR
2. Reads the version from `package.json` and validates the matching changelog section
3. Re-runs the complete CI workflow against the merged commit
4. Creates the `v<version>` Git tag and a draft release
5. Copies that version's changelog section into the draft release notes
6. Builds the app on Windows, macOS, and Linux in parallel and attaches the artifacts
7. Verifies every expected artifact exists and the release is still a draft

The workflow never publishes the release. Review the notes and attached artifacts, then publish the
draft manually when it is ready.

> **Signing status:** Windows and macOS artifacts are currently unsigned so releases do not depend
> on paid or identity-verified signing accounts. Windows may display a SmartScreen warning, and
> macOS users may need to approve the application in System Settings → Privacy & Security. Restore
> certificate-backed signing and Apple notarization before representing a future release as signed.

The release will contain:
| File | Platform |
|------|----------|
| `Tavern-Born Setup <version>.exe` + `.exe.blockmap` | Windows installer |
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

...and silently skips every upload from that build job. The final verification job catches missing
artifacts, fails the workflow, and leaves the release as a draft.

**Rules:**
- Do not create or push the version tag manually; the workflow creates it after validation succeeds.
- Do not create the GitHub Release manually; the workflow creates and populates the draft.
- If a draft already exists for the workflow-created tag, a rerun safely refreshes its notes and artifacts.
- If you accidentally published the release before a rerun, convert it back to a draft first:
  ```bash
  gh release edit v1.0.0 --draft=true --repo kevinkickback/Tavern-Born
  gh run rerun <RUN_ID> --repo kevinkickback/Tavern-Born
  ```
- After the workflow completes, inspect the draft and publish it manually when approved:
  ```bash
  gh release view v1.0.0 --repo kevinkickback/Tavern-Born --json isDraft,assets | ConvertFrom-Json
  gh release edit v1.0.0 --draft=false --repo kevinkickback/Tavern-Born
  ```

---

## Version and tag format

Use a semantic version in `package.json`, such as `1.0.0`, `1.2.3`, or `2.0.0-beta`. The workflow
automatically creates the corresponding `v1.0.0`, `v1.2.3`, or `v2.0.0-beta` tag.

---

## If a release build fails

Go to the **Actions** tab on GitHub, open the failed run, and check which platform failed. Each platform builds independently — a failure on one does not cancel the others.

To inspect logs via CLI:
```bash
gh run list --repo kevinkickback/Tavern-Born --workflow release.yml --limit 5
gh run view <RUN_ID> --repo kevinkickback/Tavern-Born
gh run view --repo kevinkickback/Tavern-Born --job <JOB_ID> --log
```

For a transient runner or network failure, rerun the failed jobs; the existing tag and draft are
reused safely. If a code or configuration change is required, fix it on `dev`, delete the broken
draft and tag, then open and merge a new PR:
```bash
gh release delete v1.0.0 --repo kevinkickback/Tavern-Born --yes
git push origin --delete v1.0.0
git tag -d v1.0.0
```
