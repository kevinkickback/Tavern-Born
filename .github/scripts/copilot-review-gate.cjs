const COPILOT_REVIEWER = 'copilot-pull-request-reviewer[bot]'
const COPILOT_LOGINS = new Set(['copilot', 'copilot-pull-request-reviewer', COPILOT_REVIEWER])

function isCopilot(user) {
  const login = (user?.login ?? '').toLowerCase()
  return COPILOT_LOGINS.has(login) || (user?.type === 'Bot' && login.includes('copilot'))
}

function getBlockingReason(review, comments) {
  const body = review.body ?? ''
  if (review.state === 'CHANGES_REQUESTED') return 'Copilot requested changes.'
  if (/changes recommended/i.test(body)) return 'Copilot recommends changes.'
  if (/suppressed comments\s*\([1-9]\d*\)/i.test(body)) {
    return 'Copilot reported suppressed findings.'
  }
  if (comments.length > 0) return `Copilot left ${comments.length} review finding(s).`
  return null
}

async function getExactReview({ github, owner, repo, pullNumber, expectedHead }) {
  const reviews = await github.paginate(github.rest.pulls.listReviews, {
    owner,
    repo,
    pull_number: pullNumber,
    per_page: 100,
  })
  return reviews
    .filter((review) => review.commit_id === expectedHead && isCopilot(review.user))
    .sort((left, right) => Date.parse(right.submitted_at) - Date.parse(left.submitted_at))[0]
}

async function requestReviewIfNeeded({ github, core, owner, repo, pullNumber, expectedHead }) {
  if (await getExactReview({ github, owner, repo, pullNumber, expectedHead })) return

  const { data } = await github.rest.pulls.listRequestedReviewers({
    owner,
    repo,
    pull_number: pullNumber,
  })
  if (data.users.some(isCopilot)) return

  try {
    await github.rest.pulls.requestReviewers({
      owner,
      repo,
      pull_number: pullNumber,
      reviewers: [COPILOT_REVIEWER],
    })
    core.info(`Requested Copilot review of ${expectedHead}.`)
  } catch (error) {
    if (error.status !== 422) throw error
    core.info('Copilot review was already requested or started; waiting for completion.')
  }
}

async function requireCopilotReview({
  github,
  core,
  owner,
  repo,
  pullNumber,
  expectedHead,
  requestReview = false,
  timeoutMs = 0,
  pollMs = 10_000,
}) {
  if (requestReview) {
    await requestReviewIfNeeded({ github, core, owner, repo, pullNumber, expectedHead })
  }

  const deadline = Date.now() + timeoutMs
  do {
    const review = await getExactReview({ github, owner, repo, pullNumber, expectedHead })
    if (review) {
      const comments = (
        await github.paginate(github.rest.pulls.listReviewComments, {
          owner,
          repo,
          pull_number: pullNumber,
          per_page: 100,
        })
      ).filter((comment) => comment.pull_request_review_id === review.id)
      const blockingReason = getBlockingReason(review, comments)
      if (blockingReason) throw new Error(`${blockingReason} Address the findings and re-review.`)

      core.info(`Copilot completed a clean review of ${expectedHead}.`)
      return review
    }

    if (Date.now() >= deadline) break
    await new Promise((resolve) => setTimeout(resolve, Math.min(pollMs, deadline - Date.now())))
  } while (Date.now() <= deadline)

  throw new Error(`Copilot did not complete a review of ${expectedHead} before the deadline.`)
}

module.exports = { getBlockingReason, isCopilot, requireCopilotReview }
