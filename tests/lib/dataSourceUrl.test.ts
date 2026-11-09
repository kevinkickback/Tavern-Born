import { describe, expect, test } from 'vitest'
import { parseRemoteDataSourceUrl } from '@/lib/5etools/urlUtils'

describe('remote data source URL validation threshold', () => {
  test.each([
    '',
    'testpage',
    'https://',
    'https://testpage',
    'http://testpage.com',
    'ftp://testpage.com',
  ])('does not validate an incomplete or unsupported URL: %s', (value) => {
    expect(parseRemoteDataSourceUrl(value).kind).toBe('invalid')
  })

  test.each([
    'https://testpage.com',
    'https://github.com/example/data',
    'https://github.com/example/data/releases',
    'https://data.example.co.uk/repository',
  ])('allows validation once a secure HTTPS domain is complete: %s', (value) => {
    expect(parseRemoteDataSourceUrl(value).kind).not.toBe('invalid')
  })
})
