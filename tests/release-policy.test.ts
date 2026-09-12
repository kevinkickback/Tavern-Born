import { afterEach, beforeEach, expect, test, vi } from 'vitest'

const state = vi.hoisted(() => ({
  packageVersion: '2.0.0',
  lockVersion: '2.0.0',
  rootLockVersion: '2.0.0',
  changelog: [
    '<details>',
    '<summary><strong>v2.0.0</strong></summary>',
    '',
    '- New release',
    '',
    '</details>',
    '',
    '<details>',
    '<summary><strong>v1.9.0</strong></summary>',
    '',
    '- Previous release',
    '',
    '</details>',
  ].join('\n'),
  writes: [] as Array<{ path: string; contents: string }>,
}))

vi.mock('node:fs/promises', () => {
  const mock = {
    readFile: (url: URL) => {
      const path = url.pathname.replace(/\\/g, '/')
      if (path.endsWith('/package.json')) {
        return JSON.stringify({ version: state.packageVersion })
      }
      if (path.endsWith('/package-lock.json')) {
        return JSON.stringify({
          version: state.lockVersion,
          packages: { '': { version: state.rootLockVersion } },
        })
      }
      if (path.endsWith('/docs/changelog.md')) return state.changelog
      throw new Error(`Missing mocked file: ${path}`)
    },
    writeFile: (path: string, contents: string) => {
      state.writes.push({ path, contents })
    },
  }
  return { ...mock, default: mock }
})

const originalArgv = process.argv

beforeEach(() => {
  vi.resetModules()
  Object.assign(state, {
    packageVersion: '2.0.0',
    lockVersion: '2.0.0',
    rootLockVersion: '2.0.0',
    changelog: [
      '<details>',
      '<summary><strong>v2.0.0</strong></summary>',
      '',
      '- New release',
      '',
      '</details>',
      '',
      '<details>',
      '<summary><strong>v1.9.0</strong></summary>',
      '',
      '- Previous release',
      '',
      '</details>',
    ].join('\n'),
    writes: [],
  })
  process.argv = ['node', 'scripts/check-release.mjs']
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
})

afterEach(() => {
  process.argv = originalArgv
  vi.restoreAllMocks()
})

// @ts-expect-error The release gate intentionally stays native ESM JavaScript for direct Node use.
const run = () => import('../scripts/check-release.mjs')

test('accepts synchronized release metadata and an increased version', async () => {
  process.argv.push('--previous-version', '1.9.0')
  await expect(run()).resolves.toBeDefined()
  expect(state.writes).toEqual([])
})

test('accepts candidate data through an explicit source root', async () => {
  process.argv.push('--source-root', 'candidate')

  await expect(run()).resolves.toBeDefined()
})

test('extracts only the current release section for draft notes', async () => {
  process.argv.push('--notes-file', 'release-notes.md')

  await run()

  expect(state.writes).toEqual([
    {
      path: 'release-notes.md',
      contents: '- New release\n',
    },
  ])
})

test.each([
  [
    'prerelease version',
    () => {
      state.packageVersion = '2.0.0-beta.1'
    },
    'stable X.Y.Z',
  ],
  [
    'lockfile version mismatch',
    () => {
      state.lockVersion = '1.9.0'
    },
    'Version metadata does not match',
  ],
  [
    'root lockfile version mismatch',
    () => {
      state.rootLockVersion = '1.9.0'
    },
    'Version metadata does not match',
  ],
  [
    'duplicate changelog section',
    () => {
      state.changelog += '\n<summary><strong>v2.0.0</strong></summary>\nDuplicate\n'
    },
    'Expected exactly one',
  ],
  [
    'incomplete changelog section',
    () => {
      state.changelog = '<summary><strong>v2.0.0</strong></summary>\n- Missing close'
    },
    'No complete changelog section',
  ],
  [
    'changelog section without an opening details element',
    () => {
      state.changelog = '<summary><strong>v2.0.0</strong></summary>\n- Notes\n</details>'
    },
    'No complete changelog section',
  ],
  [
    'empty changelog section',
    () => {
      state.changelog = '<details>\n<summary><strong>v2.0.0</strong></summary>\n\n</details>'
    },
    'Release notes for v2.0.0 are empty',
  ],
] as const)('rejects %s', async (_name, change, message) => {
  change()
  await expect(run()).rejects.toThrow(message)
})

test.each(['2.0.0', '2.1.0'])('rejects a non-increasing version after %s', async (previous) => {
  process.argv.push('--previous-version', previous)
  await expect(run()).rejects.toThrow(`Release version must increase (${previous} -> 2.0.0).`)
})
