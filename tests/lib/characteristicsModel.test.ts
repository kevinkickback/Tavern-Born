import { describe, expect, test } from 'vitest'
import {
  createCharacteristicsDraft,
  DEFAULT_CUSTOM_GRADIENT,
  getInitials,
} from '@/pages/details/characteristics/model'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

describe('characteristics model', () => {
  test('creates a draft from the current structured organization fields', () => {
    const draft = createCharacteristicsDraft(
      makeCharacterFixture({
        details: {
          organizationSelectionKey: '__custom__',
          organizationCustomDescription: 'Current description',
        },
      }),
    )

    expect(draft.organizationSelectionKey).toBe('__custom__')
    expect(draft.organizationCustomDescription).toBe('Current description')
    expect(draft.organizationCustomGradient).toBe(DEFAULT_CUSTOM_GRADIENT)
  })

  test('derives initials from arbitrary labels without a catalog-name table', () => {
    expect(getInitials('Example Group')).toBe('EG')
  })
})
