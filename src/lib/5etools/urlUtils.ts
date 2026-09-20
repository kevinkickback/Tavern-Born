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

function parseExplicitGitHubRef(url: URL): string | undefined {
  const value = url.searchParams
    .get('ref')
    ?.trim()
    .replace(/^refs\/heads\//, '')
  return value || undefined
}

function isValidGitHubRef(ref: string): boolean {
  return (
    !ref.startsWith('/') &&
    !ref.endsWith('/') &&
    !ref.includes('..') &&
    !ref.includes('//') &&
    !/[\\\s~^:?*[\]]/.test(ref)
  )
}

function startsWithParts(parts: readonly string[], prefix: readonly string[]): boolean {
  return prefix.every((part, index) => parts[index] === part)
}

function getRepositoryRootParts(contentParts: readonly string[]): string[] {
  const dataIndex = contentParts.findIndex((part) => part.toLowerCase() === 'data')
  return [...(dataIndex >= 0 ? contentParts.slice(0, dataIndex) : contentParts)]
}

function buildGitHubRawBase(
  owner: string,
  repo: string,
  branch: string,
  contentParts: readonly string[],
): string {
  const rootParts = getRepositoryRootParts(contentParts)
  return `https://raw.githubusercontent.com/${owner}/${repo}/${[branch, ...rootParts].join('/')}`
}

function ambiguousRefError(): ParsedRemoteDataSourceUrl {
  return {
    kind: 'invalid',
    error:
      'GitHub branch and folder path are ambiguous; add ?ref=branch-name (URL-encode slashes as %2F)',
  }
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
    const isGitHubHost =
      hostname === 'raw.githubusercontent.com' ||
      hostname === 'github.com' ||
      hostname === 'www.github.com'
    const explicitRef = isGitHubHost ? parseExplicitGitHubRef(url) : undefined
    if (explicitRef && !isValidGitHubRef(explicitRef)) {
      return { kind: 'invalid', error: 'GitHub ref is not valid' }
    }
    url.pathname = url.pathname.replace(/\/+$/, '') || '/'

    const pathParts = url.pathname.split('/').filter(Boolean)
    if (hostname === 'raw.githubusercontent.com') {
      if (pathParts.length < 3) {
        return {
          kind: 'invalid',
          error: 'GitHub raw URLs must include owner, repository, and branch',
        }
      }
      const [owner, rawRepo] = pathParts
      const repo = rawRepo.replace(/\.git$/i, '')
      const refAndContent = pathParts.slice(2)
      let branch: string
      let contentParts: string[]
      if (explicitRef) {
        const refParts = explicitRef.split('/')
        if (!startsWithParts(refAndContent, refParts)) return ambiguousRefError()
        branch = explicitRef
        contentParts = refAndContent.slice(refParts.length)
      } else if (
        refAndContent.length === 1 ||
        refAndContent[0] === 'main' ||
        refAndContent[0] === 'master' ||
        refAndContent[1]?.toLowerCase() === 'data'
      ) {
        branch = refAndContent[0]
        contentParts = refAndContent.slice(1)
      } else {
        return ambiguousRefError()
      }
      return {
        kind: 'github-repository',
        owner,
        repo,
        branch,
        normalizedUrl: buildGitHubRawBase(owner, repo, branch, contentParts),
      }
    }

    if (hostname === 'github.com' || hostname === 'www.github.com') {
      if (pathParts.length < 2) {
        return { kind: 'invalid', error: 'GitHub URLs must include an owner and repository' }
      }
      const owner = pathParts[0]
      const repo = pathParts[1].replace(/\.git$/i, '')
      const marker = pathParts[2]
      const markerIndex = marker === 'tree' || marker === 'blob' ? 2 : -1
      const isReleasesPage = marker === 'releases'
      if (pathParts.length > 2 && markerIndex < 0 && !isReleasesPage) {
        return { kind: 'invalid', error: 'Unsupported GitHub repository URL path' }
      }

      const refAndContent = markerIndex >= 0 ? pathParts.slice(markerIndex + 1) : []
      let branch = explicitRef
      let contentParts: string[] = []
      if (explicitRef && markerIndex >= 0) {
        const refParts = explicitRef.split('/')
        if (!startsWithParts(refAndContent, refParts)) return ambiguousRefError()
        contentParts = refAndContent.slice(refParts.length)
      } else if (!explicitRef && markerIndex >= 0) {
        if (refAndContent.length === 0) {
          return { kind: 'invalid', error: 'GitHub tree/blob URLs must include a branch' }
        }
        if (
          refAndContent.length > 1 &&
          refAndContent[0] !== 'main' &&
          refAndContent[0] !== 'master' &&
          refAndContent[1]?.toLowerCase() !== 'data'
        ) {
          return ambiguousRefError()
        }
        branch = refAndContent[0]
        contentParts = refAndContent.slice(1)
      }

      return {
        kind: 'github-repository',
        owner,
        repo,
        ...(branch ? { branch } : {}),
        normalizedUrl: buildGitHubRawBase(owner, repo, branch ?? 'main', contentParts),
      }
    }

    url.search = ''
    url.hash = ''
    return { kind: 'remote', normalizedUrl: stripTrailingSlash(url.toString()) }
  } catch {
    return { kind: 'invalid', error: 'Invalid URL format' }
  }
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
