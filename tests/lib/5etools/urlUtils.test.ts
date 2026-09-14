import { describe, expect, test } from 'vitest'
import { parseRemoteDataSourceUrl } from '@/lib/5etools/urlUtils'

describe('parseRemoteDataSourceUrl', () => {
  test('normalizes GitHub repository and raw URLs using exact hosts', () => {
    expect(parseRemoteDataSourceUrl('https://github.com/5etools-mirror-3/5etools-src')).toEqual({
      kind: 'github-repository',
      owner: '5etools-mirror-3',
      repo: '5etools-src',
      normalizedUrl: 'https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main',
    })
    expect(
      parseRemoteDataSourceUrl(
        'https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/master/data/races.json',
      ),
    ).toMatchObject({
      kind: 'github-repository',
      branch: 'master',
      normalizedUrl: 'https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/master',
    })
  })

  test.each([
    [
      'https://github.com/example/rules?ref=feature%2F5etools',
      'https://raw.githubusercontent.com/example/rules/feature/5etools',
    ],
    [
      'https://github.com/example/rules/tree/feature/5etools?ref=feature%2F5etools',
      'https://raw.githubusercontent.com/example/rules/feature/5etools',
    ],
    [
      'https://github.com/example/rules/tree/feature/5etools/packages/core?ref=feature%2F5etools',
      'https://raw.githubusercontent.com/example/rules/feature/5etools/packages/core',
    ],
    [
      'https://github.com/example/rules/blob/feature/5etools/packages/core/data/races.json?ref=feature%2F5etools',
      'https://raw.githubusercontent.com/example/rules/feature/5etools/packages/core',
    ],
    [
      'https://raw.githubusercontent.com/example/rules/feature/5etools/packages/core/data/races.json?ref=feature%2F5etools',
      'https://raw.githubusercontent.com/example/rules/feature/5etools/packages/core',
    ],
  ])('normalizes an explicit slash-containing ref in %s', (url, normalizedUrl) => {
    expect(parseRemoteDataSourceUrl(url)).toMatchObject({
      kind: 'github-repository',
      branch: 'feature/5etools',
      normalizedUrl,
    })
  })

  test('rejects ambiguous tree and raw paths instead of truncating a slash-containing ref', () => {
    expect(
      parseRemoteDataSourceUrl('https://github.com/example/rules/tree/feature/5etools'),
    ).toMatchObject({
      kind: 'invalid',
    })
    expect(
      parseRemoteDataSourceUrl('https://raw.githubusercontent.com/example/rules/feature/5etools'),
    ).toMatchObject({ kind: 'invalid' })
  })

  test('does not treat lookalike hosts as GitHub repositories', () => {
    expect(parseRemoteDataSourceUrl('https://github.com.evil.example/owner/repo')).toEqual({
      kind: 'remote',
      normalizedUrl: 'https://github.com.evil.example/owner/repo',
    })
  })

  test.each([
    ['http://example.com/data', 'URL must use HTTPS protocol'],
    ['https://user@example.com/data', 'URL cannot include credentials'],
    ['not a URL', 'Invalid URL format'],
  ])('rejects unsafe remote URL %s', (url, error) => {
    expect(parseRemoteDataSourceUrl(url)).toEqual({ kind: 'invalid', error })
  })
})
