import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

const readWorkflow = (name: string) =>
  readFile(resolve(process.cwd(), '.github', 'workflows', name), 'utf8')

describe('trusted workflow policy', () => {
  test('runs protected CI for pull requests targeting main without a custom merge workflow', async () => {
    const workflow = await readWorkflow('ci.yml')

    expect(workflow).toContain('pull_request:')
    expect(workflow).toContain('branches: [main]')
    expect(workflow).not.toContain('branches: [dev, main]')
    expect(workflow).toContain("if: '!github.event.pull_request.draft'")
    expect(workflow).toContain('name: Lint, type-check, coverage, and build')
    expect(workflow).toContain('name: Browser end-to-end tests')
    await expect(readWorkflow('merge.yml')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  test('creates release drafts only through a manual main-branch dispatch', async () => {
    const workflow = await readWorkflow('release.yml')

    expect(workflow).toContain('workflow_dispatch:')
    expect(workflow).not.toContain('replace_unpublished')
    expect(workflow).not.toContain('REPLACE_UNPUBLISHED')
    expect(workflow).not.toContain('repository_dispatch:')
    expect(workflow).not.toContain('release-merged')
    expect(workflow).not.toContain('rebuild-release')
    expect(workflow).not.toContain('\n  push:')
    expect(workflow).not.toContain('detect-version-change:')
    expect(workflow).toContain("context.ref !== 'refs/heads/main'")
    expect(workflow).toContain("github.rest.repos.getBranch({ owner, repo, branch: 'main' })")
    expect(workflow).toContain('branch.commit.sha !== process.env.SOURCE_SHA')
    expect(workflow).toContain(
      'node scripts/check-release.mjs --notes-file release-metadata/release-notes.md',
    )
  })

  test('builds before safely creating a clean unpublished draft', async () => {
    const workflow = await readWorkflow('release.yml')

    expect(workflow).toContain('Build artifacts and update manifests without publishing')
    expect(workflow).toContain('run: npm run dist -- --publish never')
    expect(workflow).toContain('needs: [release-source, build]')
    expect(workflow).toContain('name: Create draft from completed artifacts')
    expect(workflow).toContain('pattern: release-build-*')
    expect(workflow).toContain('path: release-metadata/release-notes.md')
    expect(workflow.match(/overwrite: true/g)).toHaveLength(2)
    expect(workflow).toContain('Validate completed artifact bundle')
    expect(workflow).toContain('Expected exactly 10 release artifacts')
    expect(workflow).toContain('Expected exactly 10 release assets')
    expect(workflow).toContain('Expected exactly one draft for $RELEASE_TAG')
    expect(workflow).toContain("require_manifest 'latest.yml'")
    expect(workflow).toContain("require_manifest 'latest-mac.yml'")
    expect(workflow).toContain("require_manifest 'latest-linux.yml'")
    expect(workflow).toContain('No tag or release exists for $tag; both will be created')
    expect(workflow).toContain('draft(s) already exist for $tag; inspect and remove them')
    expect(workflow).toContain('inspect and remove the unpublished tag before rerunning')
    expect(workflow).toContain('main changed while release artifacts were building')
    expect(workflow).toContain(
      ['initial_tag_state: $', '{{ steps.release.outputs.initial_tag_state }}'].join(''),
    )
    expect(workflow).toContain(
      ['initial_tag_sha: $', '{{ steps.release.outputs.initial_tag_sha }}'].join(''),
    )
    expect(workflow).not.toContain('initial_release_fingerprint')

    const buildJob = workflow.slice(
      workflow.indexOf('\n  build:'),
      workflow.indexOf('\n  publish-release:'),
    )
    const releaseSourceJob = workflow.slice(
      workflow.indexOf('\n  release-source:'),
      workflow.indexOf('\n  build:'),
    )
    expect(releaseSourceJob).toContain('permissions:\n      contents: write')
    expect(releaseSourceJob).toContain('[.id, .draft, .updated_at] | @tsv')

    expect(buildJob).toContain('permissions:\n      contents: read')
    expect(buildJob).not.toContain('GH_TOKEN')
    expect(buildJob).not.toContain('contents: write')

    const publishJob = workflow.slice(
      workflow.indexOf('\n  publish-release:'),
      workflow.indexOf('\n  verify-release:'),
    )
    expect(publishJob).not.toContain('actions/checkout')
    expect(publishJob).toContain('contents: write')
    expect(publishJob).not.toContain('REPLACE_UNPUBLISHED')
    expect(publishJob).not.toContain('assert_unchanged_draft')
    expect(publishJob).toContain('"$tag_sha" != "$INITIAL_TAG_SHA"')
    expect(publishJob).toContain('Tag $RELEASE_TAG changed after release preparation')
    expect(publishJob).toContain('Tag $RELEASE_TAG was created after release preparation')
    expect(publishJob).toContain('assert_no_releases()')
    expect(publishJob).toContain('A release for $RELEASE_TAG appeared while this run was active')
    expect(publishJob.match(/assert_no_releases/g)?.length).toBeGreaterThanOrEqual(3)
    expect(publishJob.match(/assert_current_main/g)?.length).toBeGreaterThanOrEqual(4)
    expect(publishJob).not.toContain(
      'gh api --method DELETE "repos/$GITHUB_REPOSITORY/git/refs/tags/$RELEASE_TAG"',
    )
    expect(publishJob).toContain('gh release create "$RELEASE_TAG" release-artifacts/*')
    expect(publishJob).toContain('Tag $RELEASE_TAG no longer points to $SOURCE_SHA')
    expect(publishJob).toContain('--draft --title "$RELEASE_TAG"')
    expect(publishJob).toContain('Tag $RELEASE_TAG moved during draft creation')
    expect(publishJob).not.toContain('gh api --method DELETE')
    expect(publishJob).not.toContain('gh api --method PATCH')
    expect(publishJob).not.toContain('gh release upload')

    const validateIndex = publishJob.indexOf('Validate completed artifact bundle')
    const attestIndex = publishJob.indexOf('Attest build provenance')
    const mutateIndex = publishJob.indexOf('Create draft from completed artifacts')
    const createDraftIndex = publishJob.indexOf('gh release create "$RELEASE_TAG"')
    const verifyCreatedTagIndex = publishJob.indexOf('Tag $RELEASE_TAG moved during draft creation')
    expect(validateIndex).toBeGreaterThan(-1)
    expect(validateIndex).toBeLessThan(attestIndex)
    expect(attestIndex).toBeLessThan(mutateIndex)
    expect(createDraftIndex).toBeGreaterThan(mutateIndex)
    expect(verifyCreatedTagIndex).toBeGreaterThan(createDraftIndex)
  })

  test('uses upload-safe Windows installer names that match update metadata', async () => {
    const packageJson = JSON.parse(await readFile(resolve(process.cwd(), 'package.json'), 'utf8'))
    const expectedArtifactName = [
      '$' + '{productName}',
      'Setup',
      '$' + '{version}.' + '$' + '{ext}',
    ].join('-')

    expect(packageJson.build.nsis.artifactName).toBe(expectedArtifactName)
  })

  test('pins every official action to an immutable commit', async () => {
    const workflows = await Promise.all(['ci.yml', 'release.yml'].map((name) => readWorkflow(name)))
    const actionUses = workflows.flatMap((workflow) =>
      [...workflow.matchAll(/uses:\s+(actions\/[^@\s]+)@([^\s#]+)/g)].map((match) => ({
        action: match[1],
        revision: match[2],
      })),
    )

    expect(actionUses.length).toBeGreaterThan(0)
    expect(actionUses.every(({ revision }) => /^[0-9a-f]{40}$/.test(revision))).toBe(true)
  })

  test('uses Node 24 for every repository-run Node step', async () => {
    const workflows = await Promise.all(['ci.yml', 'release.yml'].map((name) => readWorkflow(name)))
    const nodeVersions = workflows.flatMap((workflow) =>
      [
        ...workflow.matchAll(/uses: actions\/setup-node@[^\n]+\n\s+with:\n\s+node-version: (\d+)/g),
      ].map((match) => match[1]),
    )

    expect(nodeVersions.length).toBeGreaterThan(0)
    expect(nodeVersions.every((version) => version === '24')).toBe(true)
  })

  test('pins every Linux job to Ubuntu 26.04', async () => {
    const ciWorkflow = await readWorkflow('ci.yml')
    const releaseWorkflow = await readWorkflow('release.yml')
    const workflows = [ciWorkflow, releaseWorkflow]

    expect(workflows.every((workflow) => !workflow.includes('ubuntu-latest'))).toBe(true)
    expect(ciWorkflow.match(/runs-on: ubuntu-26\.04/g)).toHaveLength(2)
    expect(releaseWorkflow.match(/runs-on: ubuntu-26\.04/g)).toHaveLength(3)
    expect(releaseWorkflow).toContain('os: [windows-latest, macos-latest, ubuntu-26.04]')
  })
})
