const COPILOT_REVIEWER = 'copilot-pull-request-reviewer[bot]'
const COPILOT_LOGINS = new Set(['copilot', 'copilot-pull-request-reviewer', COPILOT_REVIEWER])

function isCopilot(user) {
  const login = (user?.login ?? '').toLowerCase()
  return COPILOT_LOGINS.has(login)
}

function getBlockingReason(review, comments) {
  const body = review.body ?? ''
  if (review.state === 'CHANGES_REQUESTED') return 'Copilot requested changes.'
  if (!['APPROVED', 'COMMENTED'].includes(review.state)) {
    return `Copilot review is not complete (state: ${review.state || 'unknown'}).`
  }
  if (/\b(review (?:is |was )?incomplete|incomplete review|could not complete (?:the )?review)\b/i.test(body)) {
    return 'Copilot review is incomplete.'
  }
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
  const latest = reviews
    .filter((review) => review.commit_id === expectedHead && isCopilot(review.user))
    .sort((left, right) => (right.id ?? 0) - (left.id ?? 0))[0]
  return latest?.state === 'PENDING' ? undefined : latest
}

async function requireCopilotReview({
  github,
  core,
  owner,
  repo,
  pullNumber,
  expectedHead,
  timeoutMs = 0,
  pollMs = 10_000,
}) {
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
