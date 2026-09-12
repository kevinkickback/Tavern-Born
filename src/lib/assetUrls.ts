const DEFAULT_BASE_URL = import.meta.env.BASE_URL

const EXTERNAL_URL_PATTERN = /^(?:[a-z][a-z\d+.-]*:|\/\/)/i
const BUNDLED_ASSET_PATTERN = /^(?:\.?\/)?assets\//

function normalizeBaseUrl(baseUrl: string): string {
  if (!baseUrl) return ''
  return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
}

/** Resolves a file shipped in Vite's public directory for dev and packaged Electron runtimes. */
export function getBundledFileUrl(path: string, baseUrl = DEFAULT_BASE_URL): string {
  if (!path || EXTERNAL_URL_PATTERN.test(path)) return path
  const relativePath = path.replace(/^(?:\.?\/)+/, '')
  return `${normalizeBaseUrl(baseUrl)}${relativePath}`
}

/** Rewrites legacy root-relative bundled asset paths without changing user or remote images. */
export function resolveBundledAssetSrc(src: string, baseUrl = DEFAULT_BASE_URL): string {
  return BUNDLED_ASSET_PATTERN.test(src) ? getBundledFileUrl(src, baseUrl) : src
}
