import { createRequire } from 'node:module'
import { describe, expect, test } from 'vitest'

interface Review {
  state: string
  body?: string
}

const require = createRequire(import.meta.url)
const gate = require('../../.github/scripts/copilot-review-gate.cjs') as {
  getBlockingReason: (review: Review, comments: unknown[]) => string | null
  isCopilot: (user: { login?: string; type?: string }) => boolean
}

describe('Copilot review gate', () => {
  test('recognizes the Copilot review identities', () => {
    expect(gate.isCopilot({ login: 'copilot-pull-request-reviewer[bot]', type: 'Bot' })).toBe(true)
    expect(gate.isCopilot({ login: 'Copilot' })).toBe(true)
    expect(gate.isCopilot({ login: 'maintainer' })).toBe(false)
  })

  test.each([
    [{ state: 'CHANGES_REQUESTED' }, [], 'requested changes'],
    [{ state: 'COMMENTED', body: '### 🟡 Changes recommended' }, [], 'recommends changes'],
    [{ state: 'COMMENTED', body: '### Suppressed comments (2)' }, [], 'suppressed findings'],
    [{ state: 'COMMENTED' }, [{}], '1 review finding'],
  ] as const)('blocks a review with actionable findings', (review, comments, message) => {
    expect(gate.getBlockingReason(review, [...comments])).toContain(message)
  })

  test('accepts a completed review without findings', () => {
    expect(gate.getBlockingReason({ state: 'COMMENTED', body: 'Review complete.' }, [])).toBeNull()
  })
})
