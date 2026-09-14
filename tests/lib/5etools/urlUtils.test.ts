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
