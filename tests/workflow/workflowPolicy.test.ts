import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

const readWorkflow = (name: string) =>
  readFile(resolve(process.cwd(), '.github', 'workflows', name), 'utf8')

describe('trusted workflow policy', () => {
  test('auto-merges only tested application changes from dev to main', async () => {
    const workflow = await readWorkflow('merge.yml')

    expect(workflow).toContain('github.rest.actions.listJobsForWorkflowRun')
    expect(workflow).toContain("'Lint, type-check, coverage, and build'")
    expect(workflow).toContain("'Browser end-to-end tests'")
    expect(workflow).toContain("matches[0].conclusion !== 'success'")
    expect(workflow).toContain("pr.base.ref !== 'main'")
    expect(workflow).toContain("pr.head.ref !== 'dev'")
    expect(workflow).toContain('pr.draft')
    expect(workflow).toContain('github.rest.pulls.listFiles')
    expect(workflow).toContain("path.startsWith('.github/workflows/')")
    expect(workflow).toContain("path.startsWith('.github/scripts/')")
    expect(workflow).toContain("path === 'scripts/check-release.mjs'")
    expect(workflow).toContain('Release infrastructure changes require a manual merge')

    expect(workflow).not.toContain('copilot-review-gate')
    expect(workflow).not.toContain('requireCopilotReview')
    expect(workflow).not.toContain('actions/checkout')
    expect(workflow).not.toContain('actions/setup-node')
    expect(workflow).not.toContain('npm ci')
    expect(workflow).not.toContain('npm run test:coverage')
    expect(workflow).not.toContain('npm run test:e2e')
    expect(workflow).not.toContain('npm run test:electron')

    expect(workflow).toContain('pr.base.sha !== testedBase')
    expect(workflow).toContain('currentBase.commit.sha !== testedBase')
    expect(workflow).toContain('sha: testedHead')
    expect(workflow).not.toContain('sha: run.head_sha')
    expect(workflow).toContain("event_type: 'release-merged'")
    expect(workflow).toContain('github.rest.repos.createDispatchEvent')
  })

  test('builds without write credentials and handles existing drafts explicitly', async () => {
    const workflow = await readWorkflow('release.yml')

    expect(workflow).toContain('push:')
    expect(workflow).toContain('branches: [main]')
    expect(workflow).toContain('repository_dispatch:')
    expect(workflow).toContain('types: [release-merged, rebuild-release]')
    expect(workflow).not.toContain('workflow_call:')
    expect(workflow).not.toContain('workflow_dispatch:')
    expect(workflow).not.toContain('copilot-review-gate')
    expect(workflow).not.toContain('requireCopilotReview')
    expect(workflow).toContain(`ref: \${{ github.workflow_sha || github.sha }}`)
    expect(workflow).not.toContain('job.workflow_sha')
    expect(workflow).toContain('if [[ "$output" == *"HTTP 404"* ]]')
    expect(workflow).toContain(
      'node ../trusted/scripts/check-release.mjs --source-root . --notes-file ../release-metadata/release-notes.md',
    )
    expect(workflow).not.toContain('node scripts/check-release.mjs')
    expect(workflow).toContain('Build artifacts and update manifests without publishing')
    expect(workflow).toContain('run: npm run dist -- --publish never')
    expect(workflow).not.toContain('run: npm run release')
    expect(workflow).toContain('needs: [release-source, build]')
    expect(workflow).toContain('name: Replace or create draft from completed artifacts')
    expect(workflow).toContain('pattern: release-build-*')
    expect(workflow).toContain('path: release-metadata/release-notes.md')
    expect(workflow).not.toContain('path: source/release-notes.md')
    expect(workflow.match(/overwrite: true/g)).toHaveLength(2)
    expect(workflow).toContain('Validate completed artifact bundle')
    expect(workflow).toContain('Expected exactly 10 release artifacts')
    expect(workflow).toContain('Expected exactly 10 release assets')
    expect(workflow).toContain('Expected exactly one draft for $RELEASE_TAG')
    expect(workflow).toContain('gh api --paginate')
    expect(workflow).not.toContain('--slurp')
    expect(workflow).not.toContain('/releases/tags/')
    expect(workflow).toContain("require_manifest 'latest.yml'")
    expect(workflow).toContain("require_manifest 'latest-mac.yml'")
    expect(workflow).toContain("require_manifest 'latest-linux.yml'")

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
    expect(publishJob).toContain(`for release_id in "\${release_ids[@]}"`)
    expect(publishJob).toContain('assert_draft "$release_id"')
    expect(publishJob).toContain('Release $RELEASE_TAG is published; refusing to modify it.')
    expect(publishJob).toContain(
      'gh api --method DELETE "repos/$GITHUB_REPOSITORY/releases/$release_id"',
    )
    expect(publishJob).toContain(
      'gh api --method DELETE "repos/$GITHUB_REPOSITORY/git/refs/tags/$RELEASE_TAG"',
    )
    expect(publishJob).not.toContain('gh release upload')
    expect(publishJob).toContain('gh release create "$RELEASE_TAG" release-artifacts/*')

    const validateIndex = publishJob.indexOf('Validate completed artifact bundle')
    const attestIndex = publishJob.indexOf('Attest build provenance')
    const mutateIndex = publishJob.indexOf('Replace or create draft from completed artifacts')
    const deleteIndex = publishJob.indexOf('gh api --method DELETE')
    expect(validateIndex).toBeGreaterThan(-1)
    expect(validateIndex).toBeLessThan(attestIndex)
    expect(attestIndex).toBeLessThan(mutateIndex)
    expect(mutateIndex).toBeLessThan(deleteIndex)
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
