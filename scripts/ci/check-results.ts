import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

type Dependency = { result?: string; outputs?: { mode?: string } }

export function checkResults(kind: string, needs: Record<string, Dependency>): void {
  const expected =
    kind === 'quality'
      ? ['changes', 'code', 'coverage']
      : kind === 'browser'
        ? ['browser', 'changes']
        : []
  if (
    expected.length === 0 ||
    JSON.stringify(Object.keys(needs).sort()) !== JSON.stringify(expected)
  ) {
    throw new Error('Missing or unexpected gate dependencies')
  }
  const scope = needs.changes
  const mode = scope?.outputs?.mode
  if (scope?.result !== 'success' || !['code', 'documentation'].includes(mode ?? '')) {
    throw new Error('PR scope and documentation checks must succeed with a known mode')
  }
  for (const name of expected.filter((name) => name !== 'changes')) {
    const result = mode === 'code' ? 'success' : 'skipped'
    if (needs[name]?.result !== result)
      throw new Error(`${name} must be ${result} for ${mode} mode`)
  }
  console.log(`Required ${kind} dependencies passed (${mode})`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  checkResults(process.argv[2] ?? '', JSON.parse(process.env.NEEDS_RESULTS ?? '{}'))
}
