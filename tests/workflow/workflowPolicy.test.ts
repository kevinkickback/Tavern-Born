import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

const readWorkflow = (name: string) =>
  readFile(resolve(process.cwd(), '.github', 'workflows', name), 'utf8')

describe('trusted workflow policy', () => {
  test('pins trusted workflow checkouts and merges only the tested base', async () => {
    const workflow = await readWorkflow('merge.yml')

    expect(workflow).toContain(`ref: \${{ github.workflow_sha }}`)
    expect(workflow).not.toContain('branches: [')
    expect(workflow).not.toContain('job.workflow_sha')
    expect(workflow).toContain('needs: [trusted-quality, trusted-e2e]')
    expect(workflow).toContain("pull_requests[0].base.ref == 'main'")
    expect(workflow).toContain("pull_requests[0].head.ref == 'dev'")
    expect(workflow).toContain(`ref: \${{ github.event.workflow_run.pull_requests[0].head.sha }}`)
    expect(workflow).toContain('npm run test:coverage')
    expect(workflow).toContain('npm run test:e2e')
    expect(workflow).toContain('npm run test:electron')
    expect(workflow).toContain('reviewedPr.base.sha !== testedPull.base.sha')
    expect(workflow).toContain('currentBase.commit.sha !== testedPull.base.sha')
    expect(workflow).toContain('const testedHead = testedPull.head.sha')
    expect(workflow).toContain('const { data: reviewedPr }')
    expect(workflow).toContain('reviewedPr.head.sha !== testedHead')
    expect(workflow).toContain('sha: testedHead')
    expect(workflow).not.toContain('sha: run.head_sha')
    expect(workflow).toContain(
      "join(process.env.GITHUB_WORKSPACE, '.github/scripts/copilot-review-gate.cjs')",
    )
  })

  test('release lookups distinguish a confirmed 404 from operational failures', async () => {
    const workflow = await readWorkflow('release.yml')

    expect(workflow).toContain(`ref: \${{ github.workflow_sha || github.sha }}`)
    expect(workflow).toContain('repository_dispatch:')
    expect(workflow).not.toContain('workflow_dispatch:')
    expect(workflow).not.toContain('gh release delete')
    expect(workflow).not.toContain('/releases/assets/')
    expect(workflow).toContain('refusing to replace or modify it')
    expect(workflow).not.toContain('job.workflow_sha')
    expect(workflow).toContain('if [[ "$output" == *"HTTP 404"* ]]')
    expect(workflow).toContain('node ../trusted/scripts/check-release.mjs --source-root .')
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
    expect(workflow).toContain('Build artifacts without repository credentials')
    expect(workflow).toContain('run: npm run dist')
    expect(workflow).not.toContain('run: npm run release')
    expect(workflow).toContain('needs: [release-source, build]')
    expect(workflow).toContain('name: Create and populate draft release')
    expect(workflow).toContain('pattern: release-build-*')

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
  })
})
