import type { DataSourceConfig } from '@/types/5etools'
import { type ReadSourceJson, ResourceHttpError, readRemoteJson } from './resourceReader'
import { parseRemoteDataSourceUrl } from './urlUtils'

type External = Exclude<DataSourceConfig, { type: 'bundled' }>
const commitSha = /^[a-f\d]{40}$/i

/** The optional GitHub adapter never participates in ordinary HTTPS or local reads. */
export async function resolveSourceRevision(
  config: External,
  signal: AbortSignal,
  read?: ReadSourceJson,
) {
  if (config.type === 'local') return { config, readConfig: config }
  const parsed = parseRemoteDataSourceUrl(config.path)
  if (parsed.kind === 'invalid') throw new Error(parsed.error)
  if (parsed.kind === 'remote') {
    const normalized = { ...config, path: parsed.normalizedUrl }
    return { config: normalized, readConfig: normalized }
  }
  const { owner, repo, branch } = parsed
  const prefix = `https://raw.githubusercontent.com/${owner}/${repo}/`
  const api = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
  const request = async (url: string) => {
    const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(5000)])
    try {
      return (await (read
        ? read({ kind: 'remote', url }, requestSignal)
        : readRemoteJson(url, requestSignal))) as Record<string, unknown>
    } catch (error) {
      if (!(error instanceof ResourceHttpError)) throw error
      throw new Error(
        `GitHub could not resolve the source revision (HTTP ${error.status}). Try again or use a commit URL.`,
      )
    }
  }
  const ref = branch ?? (await request(api)).default_branch
  if (typeof ref !== 'string' || !ref) throw new Error('GitHub did not report a source branch.')
  const revision = commitSha.test(ref)
    ? ref
    : (await request(`${api}/commits/${encodeURIComponent(ref)}`)).sha
  if (typeof revision !== 'string' || !commitSha.test(revision))
    throw new Error('GitHub did not return a valid source revision.')
  const root = parsed.normalizedUrl.slice(prefix.length + (branch ?? 'main').length)
  return {
    config: { ...config, path: config.path.trim() },
    readConfig: { ...config, path: `${prefix}${revision}${root}?ref=${revision}` },
    revision,
  }
}
