import { describe, expect, test } from 'vitest'
import {
  createCharacteristicsDraft,
  DEFAULT_CUSTOM_GRADIENT,
  getInitials,
} from '@/pages/details/characteristics/model'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

describe('characteristics model', () => {
  test('migrates a legacy organization description into an editable custom draft', () => {
    const draft = createCharacteristicsDraft(
      makeCharacterFixture({ details: { alliesAndOrganizations: 'Legacy description' } }),
    )

    expect(draft.organizationSelectionKey).toBe('__custom__')
    expect(draft.organizationCustomDescription).toBe('Legacy description')
    expect(draft.organizationCustomGradient).toBe(DEFAULT_CUSTOM_GRADIENT)
  })

  test('derives initials from arbitrary labels without a catalog-name table', () => {
    expect(getInitials('Example Group')).toBe('EG')
  })
})
