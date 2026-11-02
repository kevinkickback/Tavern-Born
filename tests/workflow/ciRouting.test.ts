import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { describe, expect, test } from 'vitest'
import {
  documentationErrors,
  headingAnchors,
  markdownDestinations,
} from '../../scripts/ci/check-docs.ts'
import { checkResults } from '../../scripts/ci/check-results.ts'
import { classifyPullRequest, isDocumentationPath } from '../../scripts/ci/classify-pr.ts'
import {
  validateCoverageMap,
  validateMembership,
  verifyReportFiles,
} from '../../scripts/ci/coverage-guard.ts'

function repository() {
  const root = mkdtempSync(join(tmpdir(), 'tavern-ci-'))
  const git = (...args: string[]) =>
    execFileSync(
      'git',
      [
        '-c',
        'core.hooksPath=unused-test-hooks',
        '-c',
        'commit.gpgsign=false',
        '-c',
        'user.name=CI fixture',
        '-c',
        'user.email=ci-fixture@example.invalid',
        ...args,
      ],
      { cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true },
    ).trim()
  const put = (file: string, text: string | Uint8Array) => {
    mkdirSync(dirname(join(root, file)), { recursive: true })
    writeFileSync(join(root, file), text)
  }
  const commit = () => {
    git('add', '--all')
    git('commit', '--quiet', '-m', 'fixture')
    return git('rev-parse', 'HEAD')
  }
  git('init', '--quiet')
  put('README.md', '# Project\n')
  put('docs/guide.md', '# Guide\n')
  put('src/example.ts', 'export const example = 1\n')
  return { root, git, put, commit, base: commit() }
}

describe('whole-PR routing', () => {
  test.each([
    'README.md',
    'docs/new-guide.md',
    'docs/contracts/new.md',
    'build/README.md',
    'scripts/pdf-sources/README.md',
  ])('recognizes documentation path %s', (file) => expect(isDocumentationPath(file)).toBe(true))
  test.each([
    'src/example.ts',
    'docs/runtime.ts',
    'docs/assets/icon.png',
    'resources/srd/core/THIRD_PARTY_NOTICES.md',
    '.github/workflows/ci.yml',
    'package-lock.json',
    'docs/../src/guide.md',
    'docs\\guide.md',
    'unknown.md',
  ])('keeps full checks for %s', (file) => expect(isDocumentationPath(file)).toBe(false))
  test.each(['edit', 'add', 'delete', 'rename'])('routes a pure documentation %s', (operation) => {
    const repo = repository()
    if (operation === 'edit') repo.put('docs/guide.md', '# Updated\n')
    if (operation === 'add') repo.put('docs/added.md', '# Added\n')
    if (operation === 'delete') unlinkSync(join(repo.root, 'docs/guide.md'))
    if (operation === 'rename')
      renameSync(join(repo.root, 'docs/guide.md'), join(repo.root, 'docs/renamed.md'))
    expect(classifyPullRequest(repo.base, repo.commit(), repo.root)).toBe('documentation')
  })
  test.each([
    ['src/example.ts', 'docs/example.md'],
    ['docs/guide.md', 'guide.ts'],
  ])('keeps full checks for rename %s to %s', (from, to) => {
    const repo = repository()
    renameSync(join(repo.root, from), join(repo.root, to))
    expect(classifyPullRequest(repo.base, repo.commit(), repo.root)).toBe('code')
  })
  test('a final docs-only commit cannot conceal earlier code changes in the PR', () => {
    const repo = repository()
    repo.put('src/example.ts', 'export const example = 2\n')
    const codeHead = repo.commit()
    repo.put('docs/guide.md', '# Updated\n')
    const head = repo.commit()
    expect(classifyPullRequest(codeHead, head, repo.root)).toBe('documentation')
    expect(classifyPullRequest(repo.base, head, repo.root)).toBe('code')
  })
  test('empty, binary, executable or symlink-like changes cannot select the lighter path', () => {
    const repo = repository()
    expect(classifyPullRequest(repo.base, repo.base, repo.root)).toBe('code')
    repo.put('docs/guide.md', new Uint8Array([0, 255]))
    expect(classifyPullRequest(repo.base, repo.commit(), repo.root)).toBe('code')
    repo.put('docs/guide.md', '# Plain\n')
    repo.git('add', 'docs/guide.md')
    repo.git('update-index', '--chmod=+x', 'docs/guide.md')
    repo.git('commit', '--quiet', '-m', 'executable doc')
    expect(classifyPullRequest(repo.base, repo.git('rev-parse', 'HEAD'), repo.root)).toBe('code')
    const blob = repo.git('rev-parse', 'HEAD:docs/guide.md')
    repo.git('update-index', '--cacheinfo', `120000,${blob},docs/guide.md`)
    repo.git('commit', '--quiet', '-m', 'symbolic doc')
    expect(classifyPullRequest(repo.base, repo.git('rev-parse', 'HEAD'), repo.root)).toBe('code')
  })
  test('malformed or unavailable commits fail instead of granting a documentation exemption', () => {
    const repo = repository()
    expect(() => classifyPullRequest('', repo.base, repo.root)).toThrow()
    expect(() => classifyPullRequest('1'.repeat(40), repo.base, repo.root)).toThrow()
  })
})

describe('required gates', () => {
  for (const kind of ['quality', 'browser']) {
    const workers = kind === 'quality' ? ['code', 'coverage'] : ['browser']
    const needs = (mode: string, result: string) =>
      Object.fromEntries([
        ['changes', { result: 'success', outputs: { mode } }],
        ...workers.map((name) => [name, { result }]),
      ])
    test(`${kind} accepts completed code checks and deliberately skipped documentation workers`, () => {
      expect(() => checkResults(kind, needs('code', 'success'))).not.toThrow()
      expect(() => checkResults(kind, needs('documentation', 'skipped'))).not.toThrow()
    })
    test.each([
      'failure',
      'cancelled',
      'skipped',
      '',
      'unknown',
    ])('%s cannot satisfy a code worker', (result) => {
      for (const worker of workers) {
        const values = needs('code', 'success')
        values[worker] = { result }
        expect(() => checkResults(kind, values)).toThrow()
      }
    })
    test.each([
      'failure',
      'cancelled',
      'success',
      '',
      'unknown',
    ])('%s is not an expected documentation worker skip', (result) =>
      expect(() => checkResults(kind, needs('documentation', result))).toThrow())
    test('failed scope/document checks, unknown modes and missing dependencies always fail', () => {
      for (const mode of ['code', 'documentation', '']) {
        const values = needs(mode, mode === 'code' ? 'success' : 'skipped')
        values.changes.result = 'failure'
        expect(() => checkResults(kind, values)).toThrow()
      }
      expect(() => checkResults(kind, needs('unexpected', 'success'))).toThrow()
      expect(() => checkResults(kind, {})).toThrow()
      expect(() =>
        checkResults(kind, { ...needs('code', 'success'), unexpected: { result: 'success' } }),
      ).toThrow()
    })
  }
})

describe('lightweight documentation validation', () => {
  test.each([
    '[![Preview](missing.png)](guide.md)',
    '[![Preview][image]](guide.md)\n[image]: missing.png',
  ])('checks rendered images inside linked labels: %s', (text) => {
    const repo = repository()
    repo.put('docs/index.md', text)
    expect(documentationErrors(['docs/index.md'], repo.root).join()).toContain('Missing or outside')
    repo.put('docs/missing.png', new Uint8Array([0]))
    expect(documentationErrors(['docs/index.md'], repo.root)).toEqual([])
  })
  test('preserves literal and encoded hashes throughout the complete fragment', () => {
    const repo = repository()
    repo.put('docs/index.md', '[broken](guide.md#guide#missing)')
    expect(documentationErrors(['docs/index.md'], repo.root).join()).toContain('Missing heading')
    repo.put('docs/guide.md', '# Guide\n<a id="guide#missing"></a>\n')
    expect(documentationErrors(['docs/index.md'], repo.root)).toEqual([])
    repo.put('docs/index.md', '[encoded](guide.md#guide%23missing)')
    expect(documentationErrors(['docs/index.md'], repo.root)).toEqual([])
  })
  test('recognizes references/images, encoded paths, explicit anchors and repeated headings', () => {
    const repo = repository()
    repo.put('docs/guide name.md', '# `Guide`\n## Repeated\n## Repeated\n<a id="explicit"></a>\n')
    repo.put('docs/image.png', new Uint8Array([0]))
    repo.put(
      'docs/index.md',
      '[Guide][guide]\n[guide]: <guide name.md#repeated-1>\n![image](image.png)\n<img src="image.png">\n<a href="guide%20name.md#explicit">Anchor</a>\n[anchor](guide%20name.md#explicit)\n[code heading](guide%20name.md#guide)\n',
    )
    expect(documentationErrors(['docs/index.md'], repo.root)).toEqual([])
    expect(headingAnchors('Heading\n===\n## Repeat\n## Repeat\n')).toEqual(
      new Set(['heading', 'repeat', 'repeat-1']),
    )
  })
  test('ignores fenced/inline examples, comments and external links while retaining the GitHub releases route', () => {
    const repo = repository()
    repo.put(
      'README.md',
      '[Release](../../releases)\n[Website](https://example.invalid/)\n`[example](missing.md)`\n~~~md\n[example](missing.md)\n~~~\n<!-- [example](missing.md) -->\n',
    )
    expect(documentationErrors(['README.md'], repo.root)).toEqual([])
    expect(markdownDestinations('[read](guide.md "Title")')).toEqual(['guide.md'])
  })
  test('unchanged incoming links detect deleted targets and removed anchors', () => {
    const repo = repository()
    repo.put('docs/index.md', '[Guide](guide.md#guide)\n')
    repo.put('docs/guide.md', '# Renamed\n')
    expect(documentationErrors(['docs/index.md', 'docs/guide.md'], repo.root).join()).toContain(
      'Missing heading',
    )
    unlinkSync(join(repo.root, 'docs/guide.md'))
    expect(documentationErrors(['docs/index.md', 'docs/guide.md'], repo.root).join()).toContain(
      'Missing or outside',
    )
  })
  test.each([
    '[bad][undefined]',
    '[bad](guide.md',
    '[bad](<guide.md> invalid-title)',
    '[bad](../../../outside.md)',
    '[bad](file:///outside.md)',
  ])('rejects unsupported, malformed or unsafe destination %s', (text) => {
    const repo = repository()
    repo.put('docs/index.md', text)
    expect(documentationErrors(['docs/index.md'], repo.root)).not.toEqual([])
  })
})

describe('coverage completeness guard', () => {
  test('preflight rejects missing, extra, nonregular and outside-checkout artifacts before parsing', () => {
    const repo = repository()
    repo.put('reports/blob-1.json', '{}')
    const directory = join(repo.root, 'reports')
    expect(() => verifyReportFiles(directory, 2, repo.root)).toThrow()
    repo.put('reports/blob-2.json', '{}')
    expect(() => verifyReportFiles(directory, 2, repo.root)).not.toThrow()
    repo.put('reports/blob-3.json', '{}')
    expect(() => verifyReportFiles(directory, 2, repo.root)).toThrow()
    unlinkSync(join(directory, 'blob-3.json'))
    unlinkSync(join(directory, 'blob-2.json'))
    mkdirSync(join(directory, 'blob-2.json'))
    expect(() => verifyReportFiles(directory, 2, repo.root)).toThrow()
    expect(() =>
      verifyReportFiles(mkdtempSync(join(tmpdir(), 'tavern-outside-')), 2, repo.root),
    ).toThrow('inside the checkout')
  })
  const file = resolve('src/example.ts')
  const loc = { start: { line: 1, column: 0 }, end: { line: 1, column: 12 } }
  const coverage = () => ({
    [file]: {
      path: file,
      statementMap: { 0: loc },
      fnMap: {},
      branchMap: {},
      s: { 0: 0 },
      f: {},
      b: {},
    },
  })
  test('retains never-imported source coverage at zero', () =>
    expect(() => validateCoverageMap(coverage(), [file])).not.toThrow())
  test('retains native serialized end-of-line locations', () => {
    const value = coverage()
    Object.assign(value[file].statementMap[0].end, { column: null })
    expect(() => validateCoverageMap(value, [file])).not.toThrow()
  })
  test('retains native implicit-else branch locations', () => {
    const value = coverage()
    Object.assign(value[file].branchMap, {
      0: { type: 'if', loc, locations: [loc, { start: {}, end: {} }] },
    })
    Object.assign(value[file].b, { 0: [1, 0] })
    expect(() => validateCoverageMap(value, [file])).not.toThrow()
  })
  test.each([1, 2])('preserves a native implicit-else difference of -%s', (hit) => {
    const value = coverage()
    Object.assign(value[file].branchMap, {
      0: { type: 'if', loc, locations: [loc, { start: {}, end: {} }] },
    })
    Object.assign(value[file].b, { 0: [hit, -hit] })
    expect(() => validateCoverageMap(value, [file])).not.toThrow()
    expect(value[file].b).toEqual({ 0: [hit, -hit] })
  })
  test('rejects negative counts outside the native implicit-else derivation', () => {
    for (const [type, locations, counts] of [
      ['if', [loc, loc], [1, -1]],
      ['cond-expr', [loc, { start: {}, end: {} }], [1, -1]],
      ['if', [{ start: {}, end: {} }, loc], [-1, 1]],
      [
        'if',
        [
          { start: {}, end: {} },
          { start: {}, end: {} },
        ],
        [1, -1],
      ],
      ['if', [loc, { start: {}, end: {} }], [1, -2]],
      ['if', [loc, { start: {}, end: {} }], [1, -0.5]],
      ['if', [loc, { start: {}, end: {} }], [1, Number.NEGATIVE_INFINITY]],
      ['if', [loc, { start: {}, end: {} }], [1, -Number.MAX_SAFE_INTEGER - 1]],
      ['if', [loc, { start: {}, end: {} }], [-1, -1]],
    ]) {
      const value = coverage()
      Object.assign(value[file].branchMap, { 0: { type, loc, locations } })
      Object.assign(value[file].b, { 0: counts })
      expect(() => validateCoverageMap(value, [file])).toThrow()
    }
    const value = coverage()
    Object.assign(value[file].fnMap, { 0: { loc, decl: loc } })
    Object.assign(value[file].f, { 0: -1 })
    expect(() => validateCoverageMap(value, [file])).toThrow()
  })
  test('retains constructor parameter-property source-map boundaries', () => {
    const value = coverage()
    Object.assign(value[file].statementMap[0], {
      start: { line: 51, column: 4 },
      end: { line: 47, column: 52 },
    })
    expect(() => validateCoverageMap(value, [file])).not.toThrow()
  })
  test('rejects missing/empty coverage, missing or extra sources and malformed counters', () => {
    for (const value of [null, {}, { ...coverage(), extra: {} }])
      expect(() => validateCoverageMap(value, [file])).toThrow()
    expect(() => validateCoverageMap(coverage(), [file, resolve('src/never.ts')])).toThrow()
    for (const hit of [-1, Number.NaN, '1', undefined]) {
      const value = coverage()
      Object.assign(value[file].s, { 0: hit })
      expect(() => validateCoverageMap(value, [file])).toThrow()
    }
  })
  test('rejects duplicate/overlapping, absent and unexpected test files', () => {
    expect(() => validateMembership(['node:a', 'dom:b'], ['dom:b', 'node:a'])).not.toThrow()
    for (const actual of [[], ['node:a'], ['node:a', 'node:a'], ['node:a', 'dom:c']])
      expect(() => validateMembership(actual, ['node:a', 'dom:b'])).toThrow()
  })
})
