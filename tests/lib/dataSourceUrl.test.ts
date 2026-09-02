import { describe, expect, test } from 'vitest'
import { isValidatableRemoteUrl } from '@/components/settings/DataSourceConfigurator'

describe('remote data source URL validation threshold', () => {
  test.each([
    '',
    'testpage',
    'https://',
    'https://testpage',
    'http://testpage.com',
    'ftp://testpage.com',
  ])('does not validate an incomplete or unsupported URL: %s', (value) => {
    expect(isValidatableRemoteUrl(value)).toBe(false)
  })

  test.each([
    'https://testpage.com',
    'https://github.com/example/data',
    'https://data.example.co.uk/repository',
  ])('allows validation once a secure HTTPS domain is complete: %s', (value) => {
    expect(isValidatableRemoteUrl(value)).toBe(true)
  })
})
