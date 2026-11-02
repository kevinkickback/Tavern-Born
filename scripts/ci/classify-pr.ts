import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export function isDocumentationPath(file: string): boolean {
  if (file.includes('\\') || file.split('/').some((part) => !part || part === '.' || part === '..'))
    return false
  return (
    file === 'README.md' ||
    /^docs\/(?!.*(?:^|\/)\.\.\/)[^\\\r\n]+\.md$/.test(file) ||
    file === 'build/README.md' ||
    file === 'scripts/pdf-sources/README.md'
  )
}

export function classifyPullRequest(base: string, head: string, cwd = process.cwd()) {
  if (![base, head].every((sha) => /^[a-f0-9]{40}$/i.test(sha))) {
    throw new Error('Full PR base and head commit IDs are required')
  }
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
  // No rename detection: both the deleted and added paths must qualify independently.
  const paths = new TextDecoder('utf-8', { fatal: true })
    .decode(git('diff', '--name-only', '--no-renames', '-z', `${base}...${head}`))
    .split('\0')
    .filter(Boolean)
  if (paths.length === 0 || paths.some((file) => !isDocumentationPath(file))) return 'code'
  for (const file of paths) {
    let found = false
    for (const commit of [base, head]) {
      const entry = git('ls-tree', '-z', commit, '--', file).toString('utf8')
      if (!entry) continue
      found = true
      if (!/^100644 blob [a-f0-9]+\t/.test(entry)) return 'code'
      const bytes = git('show', `${commit}:${file}`)
      if (bytes.includes(0)) return 'code'
      try {
        new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      } catch {
        return 'code'
      }
    }
    if (!found) throw new Error('Changed path is absent from both PR commits')
  }
  return 'documentation'
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const mode = classifyPullRequest(process.env.PR_BASE_SHA ?? '', process.env.PR_HEAD_SHA ?? '')
  if (!process.env.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT is required')
  appendFileSync(process.env.GITHUB_OUTPUT, `mode=${mode}\n`)
  console.log(`PR validation mode: ${mode}`)
}
