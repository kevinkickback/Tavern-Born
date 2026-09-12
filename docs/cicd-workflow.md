# CI/CD Workflow

## Branches and repository settings

| Branch | Purpose |
|--------|---------|
| `dev` | Active development |
| `main` | Stable releases; updated only by pull request from `dev` |

Protect `main` with the repository's **Main Protection** ruleset:

- Disable direct pushes and require the branch to be up to date before merging.
- Allow squash merging only.
- Require these two CI checks:
  - **Lint, type-check, coverage, and build**
  - **Browser end-to-end tests**
- Allow workflow `contents: write` and `pull-requests: write` permissions.
- Enable automatic Copilot review, including review of new pushes.
- Do not require review-conversation resolution. Copilot runs in the background and its findings are
  reviewed by the maintainer before the draft release is published. Its completion timing never
  controls CI or merging.

`merge.yml` runs from protected `main` after CI. It verifies both required jobs passed for the exact
pull-request revision and automatically squash-merges a ready same-repository `dev` to `main` PR.
It does not rerun tests or wait for Copilot.

Changes to the following release-infrastructure paths are deliberately excluded from automatic
merging and require an explicit maintainer merge after CI:

- `.github/workflows/**`
- `.github/scripts/**`
- `scripts/check-release.mjs`

This exception ensures a pull request cannot redefine the checks or privileged release logic that
will approve that same pull request. Ordinary application and release-version changes remain fully
automatic.

### One-time workflow bootstrap

GitHub loads a `workflow_run` workflow from the default branch, so the pull request that initially
adds or changes this automation must be squash-merged manually after both CI checks pass. Later
release-infrastructure changes use the same manual exception.

---

## Day-to-day development

Work on `dev`, commit, and push normally. `ci.yml` runs on non-draft PRs targeting `dev` or `main`.
It performs linting, type checking, coverage tests, a production build, browser end-to-end tests,
and the Electron smoke test.

For an ordinary ready `dev` to `main` PR:

**deterministic CI → automatic squash merge**

The merge is bound to the exact tested head and base revisions. If `main` or the PR changes after
CI, the new revision must pass CI before merging. Copilot review runs independently in the
background and may finish before or after the merge; it is advisory input to the final manual
release review.

---

## Releasing a new version

### 1. Bump the version and update the changelog

Update `package.json` and `package-lock.json` together, for example:

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

The workflow extracts this section as the draft release notes. A missing, duplicate, empty, or
incomplete matching section stops the release.

### 2. Push to `dev` and open or update the release PR

```bash
git add package.json package-lock.json docs/changelog.md
git commit -m "chore: bump version to 1.0.0"
git push
gh pr create --base main --head dev --title "Release v1.0.0" --body "Release notes here"
```

If the PR is already open, pushing updates it and restarts CI.

### 3. Automated draft creation

The complete flow is:

**PR → deterministic CI → automatic squash merge → secure builds → draft release → manual review
→ manual publish**

Copilot review runs in the background without gating that sequence. Its findings are considered in
the manual review together with the release notes, artifacts, and Windows portable build.

Automated merges send a protected repository event because GitHub does not emit a new push workflow
for a merge performed with `GITHUB_TOKEN`. A manual infrastructure merge emits a normal `main` push.
Both paths load `release.yml` from protected `main`.

The release workflow:

1. Skips the release when the package version did not change, except in explicit draft-rebuild mode.
2. Confirms the source is a squash commit from a merged same-repository `dev` to `main` PR.
3. Validates the stable version, synchronized package metadata, and matching changelog section.
4. Builds Windows, macOS, and Linux packages in parallel without repository write credentials.
5. Validates the exact package bundle and updater manifests before granting publishing credentials.
6. Records build provenance, replaces any matching unpublished drafts with one clean draft, and
   verifies its tag and assets.

The workflow never publishes the release. Review the draft, including any Copilot findings that
arrived after the merge, then publish it manually when satisfied.

### Existing-draft behavior

Normal retries are idempotent:

- A published release always stops the workflow.
- Matching drafts are removed only after the complete replacement bundle validates, then one clean
  draft is created with the new notes and artifacts.
- A matching tag without a release is reused to finish interrupted draft creation.
- A draft or tag targeting another source requires explicit rebuild mode.

To rebuild an unpublished version after corrective code is merged without another version bump,
leave the old draft and tag in place and dispatch:

```bash
gh api --method POST repos/kevinkickback/Tavern-Born/dispatches \
  -f event_type=rebuild-release \
  -f 'client_payload[source_sha]=<corrected-main-sha>'
```

Rebuild mode requires an unchanged package version. It builds and validates the entire replacement
bundle first, enumerates every release using that tag, refuses to modify any published release, then
replaces all matching drafts and the tag. This also repairs duplicate drafts left by an interrupted
run. If an earlier replacement stopped after cleanup, rerunning resumes draft creation. Do not
publish a matching draft while a rebuild run is active. If one is published before its replacement
starts, the workflow stops without modifying it.

### Release artifacts

| File | Platform |
|------|----------|
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

- Do not create the version tag or release manually before the first successful run.
- Never convert a published release back to a draft for replacement.
- Do not publish a draft while its release or rebuild workflow is active.
- Publish only after checking release notes, all ten assets, the Windows portable binary, and any
  background Copilot findings.
- Stable releases use `X.Y.Z` in package metadata and `vX.Y.Z` tags. Prerelease/build suffixes are
  rejected.

Validate release metadata locally with:

```bash
npm run check:release
```

Publish an approved draft with:

```bash
gh release edit v1.0.0 --draft=false --repo kevinkickback/Tavern-Born
```

---

## Recovering from failures

Inspect the separate merge and release runs:

```bash
gh run list --repo kevinkickback/Tavern-Born --workflow merge.yml --limit 5
gh run list --repo kevinkickback/Tavern-Born --workflow release.yml --limit 5
gh run view <RUN_ID> --repo kevinkickback/Tavern-Born
```

- For a transient build failure, rerun the failed jobs.
- For an interrupted first release attempt, rerun the workflow; after validating a complete
  replacement bundle, it repairs the exact-source tag and leaves one clean draft.
- For a corrected source using the same unpublished version, leave the old draft in place and use
  the explicit rebuild event above.
- If the version has already been published, make corrections in a new version.
