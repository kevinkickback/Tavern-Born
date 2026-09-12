import { createRequire } from 'node:module'
import { afterEach, describe, expect, test, vi } from 'vitest'

interface Review {
  id?: number
  state: string
  body?: string
  commit_id?: string
  submitted_at?: string
}

const require = createRequire(import.meta.url)
const gate = require('../../.github/scripts/copilot-review-gate.cjs') as {
  getBlockingReason: (review: Review, comments: unknown[]) => string | null
  isCopilot: (user: { login?: string; type?: string }) => boolean
  requireCopilotReview: (options: Record<string, unknown>) => Promise<Review>
}

function createGithubApi({
  reviews = [],
  reviewBatches,
  comments = [],
  reviewError,
}: {
  reviews?: Array<Review & { user: { login: string; type?: string } }>
  reviewBatches?: Array<Array<Review & { user: { login: string; type?: string } }>>
  comments?: Array<{ pull_request_review_id: number }>
  reviewError?: Error
} = {}) {
  const listReviews = vi.fn()
  const listReviewComments = vi.fn()
  let reviewBatchIndex = 0
  const github = {
    paginate: vi.fn((endpoint: unknown) => {
      if (endpoint === listReviews) {
        if (reviewError) throw reviewError
        if (reviewBatches) {
          const batch = reviewBatches[Math.min(reviewBatchIndex, reviewBatches.length - 1)] ?? []
          reviewBatchIndex += 1
          return batch
        }
        return reviews
      }
      if (endpoint === listReviewComments) return comments
      throw new Error('Unexpected paginated endpoint')
    }),
    rest: {
      pulls: {
        listReviews,
        listReviewComments,
      },
    },
  }
  return github
}

const gateOptions = (github: ReturnType<typeof createGithubApi>, overrides = {}) => ({
  github,
  core: { info: vi.fn() },
  owner: 'owner',
  repo: 'repo',
  pullNumber: 12,
  expectedHead: 'head-sha',
  ...overrides,
})

afterEach(() => vi.useRealTimers())

describe('Copilot review gate', () => {
  test('recognizes the Copilot review identities', () => {
    expect(gate.isCopilot({ login: 'copilot-pull-request-reviewer[bot]', type: 'Bot' })).toBe(true)
    expect(gate.isCopilot({ login: 'Copilot' })).toBe(true)
    expect(gate.isCopilot({ login: 'maintainer' })).toBe(false)
    expect(gate.isCopilot({ login: 'untrusted-copilot-bot', type: 'Bot' })).toBe(false)
  })

  test.each([
    [{ state: 'CHANGES_REQUESTED' }, [], 'requested changes'],
    [{ state: 'DISMISSED' }, [], 'not complete'],
    [{ state: 'COMMENTED', body: '' }, [], 'no completion signal'],
    [{ state: 'COMMENTED', body: 'Review incomplete.' }, [], 'review is incomplete'],
    [{ state: 'COMMENTED', body: '### 🟡 Changes recommended' }, [], 'recommends changes'],
    [{ state: 'COMMENTED', body: '### Suppressed comments (2)' }, [], 'suppressed findings'],
    [{ state: 'COMMENTED' }, [{}], '1 review finding'],
  ] as const)('blocks a review with actionable findings', (review, comments, message) => {
    expect(gate.getBlockingReason(review, [...comments])).toContain(message)
  })

  test('accepts a completed review without findings', () => {
    expect(gate.getBlockingReason({ state: 'COMMENTED', body: 'Review complete.' }, [])).toBeNull()
  })

  test('selects a clean exact-head review and associates comments by review ID', async () => {
    const github = createGithubApi({
      reviews: [
        {
          id: 1,
          state: 'COMMENTED',
          commit_id: 'old-sha',
          submitted_at: '2026-09-12T00:00:00Z',
          user: { login: 'Copilot', type: 'Bot' },
        },
        {
          id: 2,
          state: 'COMMENTED',
          body: 'Review complete.',
          commit_id: 'head-sha',
          submitted_at: '2026-09-12T00:01:00Z',
          user: { login: 'Copilot', type: 'Bot' },
        },
      ],
      comments: [{ pull_request_review_id: 1 }],
    })

    await expect(gate.requireCopilotReview(gateOptions(github))).resolves.toMatchObject({ id: 2 })
  })

  test('rejects an exact-head review with an associated finding', async () => {
    const github = createGithubApi({
      reviews: [
        {
          id: 2,
          state: 'COMMENTED',
          commit_id: 'head-sha',
          submitted_at: '2026-09-12T00:01:00Z',
          user: { login: 'Copilot', type: 'Bot' },
        },
      ],
      comments: [{ pull_request_review_id: 2 }],
    })

    await expect(gate.requireCopilotReview(gateOptions(github))).rejects.toThrow(
      'Copilot left 1 review finding',
    )
  })

  test('fails closed when the exact-head review is missing', async () => {
    const github = createGithubApi()

    await expect(gate.requireCopilotReview(gateOptions(github))).rejects.toThrow(
      'did not complete a review',
    )
  })

  test('keeps polling past an in-progress exact-head review', async () => {
    vi.useFakeTimers()
    const github = createGithubApi({
      reviewBatches: [
        [
          {
            id: 2,
            state: 'PENDING',
            commit_id: 'head-sha',
            submitted_at: '2026-09-12T00:01:00Z',
            user: { login: 'Copilot', type: 'Bot' },
          },
        ],
        [
          {
            id: 2,
            state: 'COMMENTED',
            body: 'Review complete.',
            commit_id: 'head-sha',
            submitted_at: '2026-09-12T00:02:00Z',
            user: { login: 'Copilot', type: 'Bot' },
          },
        ],
      ],
    })
    const expectation = expect(
      gate.requireCopilotReview(gateOptions(github, { timeoutMs: 10, pollMs: 5 })),
    ).resolves.toMatchObject({ id: 2, state: 'COMMENTED' })

    await vi.advanceTimersByTimeAsync(5)
    await expectation
    expect(
      github.paginate.mock.calls.filter(([endpoint]) => endpoint === github.rest.pulls.listReviews),
    ).toHaveLength(2)
  })

  test('does not accept an older clean review while a newer review is pending', async () => {
    vi.useFakeTimers()
    const github = createGithubApi({
      reviews: [
        {
          id: 1,
          state: 'COMMENTED',
          commit_id: 'head-sha',
          submitted_at: '2026-09-12T00:01:00Z',
          user: { login: 'Copilot', type: 'Bot' },
        },
        {
          id: 2,
          state: 'PENDING',
          commit_id: 'head-sha',
          submitted_at: '2026-09-12T00:02:00Z',
          user: { login: 'Copilot', type: 'Bot' },
        },
      ],
    })

    const expectation = expect(
      gate.requireCopilotReview(gateOptions(github, { timeoutMs: 10, pollMs: 5 })),
    ).rejects.toThrow('did not complete a review')

    await vi.advanceTimersByTimeAsync(10)
    await expectation
    expect(
      github.paginate.mock.calls.filter(([endpoint]) => endpoint === github.rest.pulls.listReviews)
        .length,
    ).toBeGreaterThan(1)
  })

  test('fails closed after polling reaches its timeout', async () => {
    vi.useFakeTimers()
    const github = createGithubApi()
    const expectation = expect(
      gate.requireCopilotReview(gateOptions(github, { timeoutMs: 10, pollMs: 5 })),
    ).rejects.toThrow('before the deadline')

    await vi.advanceTimersByTimeAsync(10)
    await expectation
  })

  test('propagates review API failures', async () => {
    const github = createGithubApi({ reviewError: new Error('API unavailable') })

    await expect(gate.requireCopilotReview(gateOptions(github))).rejects.toThrow('API unavailable')
  })
})
