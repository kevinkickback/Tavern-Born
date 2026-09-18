import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { useSpellProfileMutations } from '@/hooks/character/useSpellProfileMutations'
import type { SpellcastingClassDetail } from '@/lib/calculations/spellProfiles'
import { useCharacterStore } from '@/store/characterStore'
import type { SpellProfile } from '@/types/character'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { resetCharacterStore, setActiveCharacter } from '../fixtures/characterStoreFixtures'

vi.mock('sonner', () => ({ toast: { warning: vi.fn() } }))

const WIZARD_PROFILE_ID = 'class:Wizard|PHB'

function makeProfiles(): SpellProfile[] {
  return [
    {
      id: WIZARD_PROFILE_ID,
      type: 'class',
      label: 'Wizard (Lv 2)',
      className: 'Wizard',
      classSource: 'PHB',
      cantrips: ['Fire Bolt'],
      spellsKnown: ['Magic Missile', 'Shield'],
      preparedSpells: ['Magic Missile'],
      alwaysPrepared: false,
    },
    {
      id: 'special:unrestricted',
      type: 'special',
      label: 'Bonus Spells',
      cantrips: [],
      spellsKnown: [],
      preparedSpells: [],
      alwaysPrepared: true,
    },
  ]
}

function makeDetail(overrides: Partial<SpellcastingClassDetail> = {}): SpellcastingClassDetail {
  return {
    profileId: WIZARD_PROFILE_ID,
    className: 'Wizard',
    classSource: 'PHB',
    classLevel: 2,
    casterProgression: 'full',
    spellcastingAbility: 'intelligence',
    spellSaveDC: 13,
    spellAttackBonus: 5,
    maxSpellLevel: 1,
    preparedSpellLimit: 2,
    knownSpellLimit: null,
    cantripLimit: 3,
    isPreparedCaster: true,
    isTruePreparedCaster: true,
    isLevelOnlyPreparedCaster: false,
    ...overrides,
  }
}

function renderMutations(
  profiles = makeProfiles(),
  details = new Map([[WIZARD_PROFILE_ID, makeDetail()]]),
) {
  const character = makeCharacterFixture({
    id: 'spell-hook-character',
    classProgression: [{ name: 'Wizard', source: 'PHB', levels: 2 }],
    spells: { ...makeCharacterFixture().spells, spellProfiles: profiles },
  })
  setActiveCharacter(character)
  return renderHook(() => useSpellProfileMutations(profiles, details))
}

function getProfile(profileId = WIZARD_PROFILE_ID) {
  return useCharacterStore
    .getState()
    .activeCharacter?.spells.spellProfiles.find((profile) => profile.id === profileId)
}

describe('useSpellProfileMutations', () => {
  beforeEach(resetCharacterStore)

  test('commits profile and provenance updates atomically', () => {
    const { result } = renderMutations()

    act(() => result.current.addSpellToProfile(WIZARD_PROFILE_ID, 'Light', 'cantrip'))

    expect(getProfile()?.cantrips).toContain('Light')
    expect(
      useCharacterStore.getState().activeCharacter?.provenance?.spells.light?.[0],
    ).toMatchObject({
      sourceType: 'class',
      sourceName: 'Wizard',
      sourceRef: 'PHB',
    })
  })

  test('removes known, prepared, and provenance state together', () => {
    const profiles = makeProfiles()
    const character = makeCharacterFixture({
      id: 'spell-hook-remove',
      classProgression: [{ name: 'Wizard', source: 'PHB', levels: 2 }],
      spells: { ...makeCharacterFixture().spells, spellProfiles: profiles },
      provenance: {
        ...makeCharacterFixture().provenance!,
        spells: {
          'magic missile': [
            {
              sourceType: 'class',
              sourceName: 'Wizard',
              sourceRef: 'PHB',
              grantType: 'choice',
              label: 'Wizard',
            },
          ],
        },
      },
    })
    setActiveCharacter(character)
    const { result } = renderHook(() => useSpellProfileMutations(profiles, new Map()))

    act(() => result.current.removeSpellFromProfile(WIZARD_PROFILE_ID, 'Magic Missile', 'spell'))

    expect(getProfile()?.spellsKnown).not.toContain('Magic Missile')
    expect(getProfile()?.preparedSpells).not.toContain('Magic Missile')
    expect(useCharacterStore.getState().activeCharacter?.provenance?.spells).not.toHaveProperty(
      'magic missile',
    )
  })

  test('syncs newly derived class profiles without dropping the special profile', () => {
    const profiles = [
      ...makeProfiles(),
      {
        id: 'class:Cleric|PHB',
        type: 'class' as const,
        label: 'Cleric (Lv 1)',
        className: 'Cleric',
        classSource: 'PHB',
        cantrips: [],
        spellsKnown: [],
        preparedSpells: [],
        alwaysPrepared: false,
      },
    ]
    const { result } = renderMutations(profiles)

    act(() => result.current.syncProfiles())

    expect(
      useCharacterStore.getState().activeCharacter?.spells.spellProfiles.map(({ id }) => id),
    ).toEqual(expect.arrayContaining(['class:Cleric|PHB', 'special:unrestricted']))
  })

  test('does not prepare a spell already prepared by another profile', () => {
    const profiles: SpellProfile[] = [
      ...makeProfiles(),
      {
        id: 'class:Cleric|PHB',
        type: 'class',
        label: 'Cleric (Lv 2)',
        className: 'Cleric',
        classSource: 'PHB',
        cantrips: [],
        spellsKnown: ['shield'],
        preparedSpells: ['shield'],
        alwaysPrepared: false,
      },
    ]
    const { result } = renderMutations(profiles)

    act(() => result.current.togglePrepared(WIZARD_PROFILE_ID, 'Shield'))

    expect(getProfile()?.preparedSpells).toEqual(['Magic Missile'])
  })

  test('enforces fixed, always-prepared, and prepared-limit guards', () => {
    const profiles = makeProfiles().map((profile) =>
      profile.id === WIZARD_PROFILE_ID
        ? {
            ...profile,
            fixedSpells: ['Magic Missile'],
            alwaysPreparedSpells: ['Magic Missile'],
          }
        : profile,
    )
    const { result } = renderMutations(
      profiles,
      new Map([[WIZARD_PROFILE_ID, makeDetail({ preparedSpellLimit: 0 })]]),
    )

    act(() => result.current.removeSpellFromProfile(WIZARD_PROFILE_ID, 'Magic Missile', 'spell'))
    act(() => result.current.togglePrepared(WIZARD_PROFILE_ID, 'Magic Missile'))
    act(() => result.current.togglePrepared(WIZARD_PROFILE_ID, 'Shield'))

    expect(getProfile()?.spellsKnown).toContain('Magic Missile')
    expect(getProfile()?.preparedSpells).toEqual(['Magic Missile'])
  })
})
