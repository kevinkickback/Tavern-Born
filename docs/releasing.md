# Release procedure

This reference describes the existing pipeline. A release requires separate owner authorization.
Use [CI/CD Workflow](cicd-workflow.md) for PR gates and [Testing Map](testing-map.md#commands) for validation.

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
