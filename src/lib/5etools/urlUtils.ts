export type ParsedRemoteDataSourceUrl =
  | { kind: 'remote'; normalizedUrl: string }
  | {
      kind: 'github-repository'
      normalizedUrl: string
      owner: string
      repo: string
      branch?: string
    }
  | { kind: 'invalid'; error: string }

function stripTrailingSlash(value: string): string {
  return value.length > 'https://x/'.length ? value.replace(/\/+$/, '') : value
}

/** Parse and normalize a user-provided remote data source under one HTTPS policy. */
export function parseRemoteDataSourceUrl(input: string): ParsedRemoteDataSourceUrl {
  const value = input.trim()
  if (!value) return { kind: 'invalid', error: 'Path cannot be empty' }

  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') {
      return { kind: 'invalid', error: 'URL must use HTTPS protocol' }
    }
    if (url.username || url.password) {
      return { kind: 'invalid', error: 'URL cannot include credentials' }
    }

    const hostname = url.hostname.toLowerCase().replace(/\.$/, '')
    const labels = hostname.split('.')
    if (labels.length < 2 || labels.some((label) => label.length === 0)) {
      return { kind: 'invalid', error: 'URL must include a complete domain name' }
    }

    url.hostname = hostname
    url.search = ''
    url.hash = ''
    url.pathname = url.pathname.replace(/\/+$/, '') || '/'

    const pathParts = url.pathname.split('/').filter(Boolean)
    if (hostname === 'raw.githubusercontent.com') {
      if (pathParts.length < 3) {
        return {
          kind: 'invalid',
          error: 'GitHub raw URLs must include owner, repository, and branch',
        }
      }
      const [owner, rawRepo, branch] = pathParts
      const repo = rawRepo.replace(/\.git$/i, '')
      return {
        kind: 'github-repository',
        owner,
        repo,
        branch,
        normalizedUrl: `https://raw.githubusercontent.com/${owner}/${repo}/${branch}`,
      }
    }

    if (hostname === 'github.com' || hostname === 'www.github.com') {
      if (pathParts.length < 2) {
        return { kind: 'invalid', error: 'GitHub URLs must include an owner and repository' }
      }
      const owner = pathParts[0]
      const repo = pathParts[1].replace(/\.git$/i, '')
      const markerIndex = pathParts.findIndex((part) => part === 'tree' || part === 'blob')
      const branch = markerIndex >= 0 ? pathParts[markerIndex + 1] : undefined
      return {
        kind: 'github-repository',
        owner,
        repo,
        ...(branch ? { branch } : {}),
        normalizedUrl: `https://raw.githubusercontent.com/${owner}/${repo}/${branch ?? 'main'}`,
      }
    }

    return { kind: 'remote', normalizedUrl: stripTrailingSlash(url.toString()) }
  } catch {
    return { kind: 'invalid', error: 'Invalid URL format' }
  }
}

export function normalizeGitHubUrl(inputUrl: string): string {
  const parsed = parseRemoteDataSourceUrl(inputUrl)
  return parsed.kind === 'invalid' ? inputUrl : parsed.normalizedUrl
}

async function testUrlWithBranch(
  owner: string,
  repo: string,
  branch: string,
  testFile: string,
): Promise<boolean> {
  try {
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/data/${testFile}`
    const response = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000),
    })
    return response.ok
  } catch {
    return false
  }
}

export async function findCorrectBranch(owner: string, repo: string): Promise<string> {
  for (const branch of ['main', 'master']) {
    if (await testUrlWithBranch(owner, repo, branch, 'races.json')) return branch
  }
  return 'main'
}
