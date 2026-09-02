import { describe, expect, test } from 'vitest'
import { isValidatableRemoteUrl } from '@/components/settings/DataSourceConfigurator'

describe('remote data source URL validation threshold', () => {
  test.each([
    '',
    'testpage',
    'https://',
    'https://testpage',
    'ftp://testpage.com',
  ])('does not validate an incomplete or unsupported URL: %s', (value) => {
    expect(isValidatableRemoteUrl(value)).toBe(false)
  })

  test.each([
    'http://testpage.com',
    'https://testpage.com',
    'https://github.com/example/data',
    'https://data.example.co.uk/repository',
  ])('allows validation once an HTTP(S) domain is complete: %s', (value) => {
    expect(isValidatableRemoteUrl(value)).toBe(true)
  })
})
