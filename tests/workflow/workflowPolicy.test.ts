import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

const readWorkflow = (name: string) =>
  readFile(resolve(process.cwd(), '.github', 'workflows', name), 'utf8')

describe('trusted workflow policy', () => {
  test('validates the original CI result and merges only the tested base', async () => {
    const workflow = await readWorkflow('merge.yml')

    expect(workflow).toContain(`ref: \${{ github.workflow_sha }}`)
    expect(workflow).not.toContain('branches: [')
    expect(workflow).not.toContain('job.workflow_sha')
    expect(workflow).toContain('github.rest.actions.listJobsForWorkflowRun')
    expect(workflow).toContain("'Lint, type-check, coverage, and build'")
    expect(workflow).toContain("'Browser end-to-end tests'")
    expect(workflow).toContain("matches[0].conclusion !== 'success'")
    expect(workflow).toContain("pr.base.ref !== 'main'")
    expect(workflow).toContain("pr.head.ref !== 'dev'")
    expect(workflow).toContain('pr.draft')
    expect(workflow).not.toContain('actions/setup-node')
    expect(workflow).not.toContain('npm ci')
    expect(workflow).not.toContain('npm run test:coverage')
    expect(workflow).not.toContain('npm run test:e2e')
    expect(workflow).not.toContain('npm run test:electron')
    expect(workflow).toContain('reviewedPr.base.sha !== testedBase')
    expect(workflow).toContain('currentBase.commit.sha !== testedBase')
    expect(workflow).toContain('const testedHead = process.env.TESTED_HEAD_SHA')
    expect(workflow).toContain('const { data: reviewedPr }')
    expect(workflow).toContain('reviewedPr.head.sha !== testedHead')
    expect(workflow).toContain('if (reviewedPr.merged)')
    expect(workflow).toContain('sha: testedHead')
    expect(workflow).not.toContain('sha: run.head_sha')
    expect(workflow).toContain("event_type: 'release-merged'")
    expect(workflow).toContain('github.rest.repos.createDispatchEvent')
    expect(workflow).toContain(
      "join(process.env.GITHUB_WORKSPACE, '.github/scripts/copilot-review-gate.cjs')",
    )
  })

  test('release lookups distinguish a confirmed 404 from operational failures', async () => {
    const workflow = await readWorkflow('release.yml')

    expect(workflow).toContain(`ref: \${{ github.workflow_sha || github.sha }}`)
    expect(workflow).toContain('repository_dispatch:')
    expect(workflow).toContain('types: [release-merged, rebuild-release]')
    expect(workflow).not.toContain('workflow_call:')
    expect(workflow).not.toContain('workflow_dispatch:')
    expect(workflow).not.toContain('gh release delete')
    expect(workflow).not.toContain('/releases/assets/')
    expect(workflow).toContain('refusing to replace or modify it')
    expect(workflow).not.toContain('job.workflow_sha')
    expect(workflow).toContain('if [[ "$output" == *"HTTP 404"* ]]')
    expect(workflow).toContain(
      'node ../trusted/scripts/check-release.mjs --source-root . --notes-file ../release-metadata/release-notes.md',
    )
    expect(workflow).not.toContain('node scripts/check-release.mjs')
    expect(workflow).toContain(
      "join(process.env.GITHUB_WORKSPACE, 'trusted/.github/scripts/copilot-review-gate.cjs')",
    )
    expect(workflow).toContain('expectedHead: process.env.REVIEWED_HEAD_SHA')
    expect(workflow).not.toContain('expectedHead: pull.head.sha')
    expect(workflow).toContain('pullCommits.at(-1)?.sha !== process.env.REVIEWED_HEAD_SHA')
    expect(workflow).not.toContain(
      'gh release view "$RELEASE_TAG" --json isDraft --jq \'isDraft\' 2>/dev/null',
    )
    expect(workflow).not.toContain(
      'gh release view "$tag" --json isDraft --jq \'isDraft\' 2>/dev/null',
    )
    expect(workflow).toContain('Build artifacts and update manifests without publishing')
    expect(workflow).toContain('run: npm run dist -- --publish never')
    expect(workflow).not.toContain('run: npm run release')
    expect(workflow).not.toContain('--method PATCH')
    expect(workflow).not.toContain('force=true')
    expect(workflow).not.toContain('--method DELETE')
    expect(workflow).toContain('needs: [release-source, build]')
    expect(workflow).toContain('name: Create and populate draft release')
    expect(workflow).toContain('pattern: release-build-*')
    expect(workflow).toContain('path: release-metadata/release-notes.md')
    expect(workflow).not.toContain('path: source/release-notes.md')
    expect(workflow.match(/overwrite: true/g)).toHaveLength(2)
    expect(workflow).toContain('Validate completed artifact bundle')
    expect(workflow).toContain('Expected exactly 10 release artifacts')
    expect(workflow).toContain('Expected exactly 10 release assets')
    expect(workflow).toContain("require_manifest 'latest.yml'")
    expect(workflow).toContain("require_manifest 'latest-mac.yml'")
    expect(workflow).toContain("require_manifest 'latest-linux.yml'")
    expect(workflow).toContain('if [[ "$tag_sha" != "$SOURCE_SHA" ]]')

    const buildJob = workflow.slice(
      workflow.indexOf('\n  build:'),
      workflow.indexOf('\n  publish-release:'),
    )
    expect(buildJob).toContain('permissions:\n      contents: read')
    expect(buildJob).not.toContain('GH_TOKEN')
    expect(buildJob).not.toContain('contents: write')

    const publishJob = workflow.slice(
      workflow.indexOf('\n  publish-release:'),
      workflow.indexOf('\n  verify-release:'),
    )
    expect(publishJob).not.toContain('actions/checkout')
    expect(publishJob).toContain('contents: write')
    expect(publishJob).toContain('gh release create')

    const validateIndex = publishJob.indexOf('Validate completed artifact bundle')
    const attestIndex = publishJob.indexOf('Attest build provenance')
    const createIndex = publishJob.indexOf('Create tag and draft from completed artifacts')
    const releaseCheckIndex = publishJob.indexOf('if release_state="$(lookup_release)"')
    const tagCheckIndex = publishJob.indexOf('if tag_sha="$(lookup_tag_sha)"')
    const tagCreateIndex = publishJob.indexOf('gh api --method POST')
    const draftCreateIndex = publishJob.indexOf('gh release create')
    expect(validateIndex).toBeGreaterThan(-1)
    expect(validateIndex).toBeLessThan(attestIndex)
    expect(attestIndex).toBeLessThan(createIndex)
    expect(releaseCheckIndex).toBeGreaterThan(-1)
    expect(tagCheckIndex).toBeGreaterThan(releaseCheckIndex)
    expect(tagCreateIndex).toBeGreaterThan(tagCheckIndex)
    expect(draftCreateIndex).toBeGreaterThan(tagCreateIndex)
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
    const workflows = await Promise.all(
      ['ci.yml', 'merge.yml', 'release.yml'].map((name) => readWorkflow(name)),
    )
    const actionUses = workflows.flatMap((workflow) =>
      [...workflow.matchAll(/uses:\s+(actions\/[^@\s]+)@([^\s#]+)/g)].map((match) => ({
        action: match[1],
        revision: match[2],
      })),
    )

    expect(actionUses.length).toBeGreaterThan(0)
    expect(actionUses.every(({ revision }) => /^[0-9a-f]{40}$/.test(revision))).toBe(true)
  })
})
