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
    expect(workflow).toContain('reviewedPr.base.sha !== testedPull.base.sha')
    expect(workflow).toContain('currentBase.commit.sha !== testedPull.base.sha')
    expect(workflow).toContain('const testedHead = testedPull.head.sha')
    expect(workflow).toContain('const { data: reviewedPr }')
    expect(workflow).toContain('reviewedPr.head.sha !== testedHead')
    expect(workflow).toContain('sha: testedHead')
    expect(workflow).not.toContain('sha: run.head_sha')
  })

  test('release lookups distinguish a confirmed 404 from operational failures', async () => {
    const workflow = await readWorkflow('release.yml')

    expect(workflow).toContain(`ref: \${{ github.workflow_sha || github.sha }}`)
    expect(workflow).toContain('repository_dispatch:')
    expect(workflow).not.toContain('workflow_dispatch:')
    expect(workflow).toContain('refusing to change its tag')
    expect(workflow).not.toContain('job.workflow_sha')
    expect(workflow).toContain('if [[ "$output" == *"HTTP 404"* ]]')
    expect(workflow).toContain('node ../trusted/scripts/check-release.mjs --source-root .')
    expect(workflow).not.toContain('node scripts/check-release.mjs')
    expect(workflow).toContain('expectedHead: process.env.REVIEWED_HEAD_SHA')
    expect(workflow).not.toContain('expectedHead: pull.head.sha')
    expect(workflow).toContain('pullCommits.at(-1)?.sha !== process.env.REVIEWED_HEAD_SHA')
    expect(workflow).not.toContain(
      'gh release view "$RELEASE_TAG" --json isDraft --jq \'isDraft\' 2>/dev/null',
    )
    expect(workflow).not.toContain(
      'gh release view "$tag" --json isDraft --jq \'isDraft\' 2>/dev/null',
    )
  })
})
