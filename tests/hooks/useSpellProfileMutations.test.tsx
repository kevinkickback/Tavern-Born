import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { useSpellProfileMutations } from '@/hooks/character/useSpellProfileMutations'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import type { SpellcastingClassDetail } from '@/lib/calculations/spellProfiles'
import { buildInitialCharacter } from '@/lib/character/commands/originSelectionCommand'
import { setRacialSpellChoice } from '@/lib/character/commands/spellCommands'
import { addSpellGrant, makeSourceTag } from '@/lib/provenance'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Race5e } from '@/types/5etools'
import type { SpellProfile } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { resetCharacterStore, setActiveCharacter } from '../fixtures/characterStoreFixtures'
import { makeGameDataFixture } from '../fixtures/gameDataFixtures'
import {
  nativeChoiceSpellLookup,
  nativeChoiceSpells,
  nativeRaceResolution,
} from '../fixtures/nativeRacialCharacter'

vi.mock('sonner', () => ({ toast: { warning: vi.fn() } }))

const WIZARD_PROFILE_ID = 'class:Wizard|PHB'

function installRace(race: Race5e) {
  const gameData = makeGameDataFixture({ races: [race], spells: nativeChoiceSpells })
  gameData.lookups = buildGameDataLookups(gameData)
  useGameDataStore.setState({ gameData })
}

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
  beforeEach(() => {
    resetCharacterStore()
    useGameDataStore.setState({ gameData: null })
  })
  afterEach(() => useGameDataStore.setState({ gameData: null }))

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

  test('actual racial Replace and Clear retain independent printing and slot usage through strict reopen', () => {
    const race = {
      name: 'Hook Caster',
      source: 'OWNER',
      additionalSpells: [{ known: { _: [{ choose: 'level=0|class=Wizard' }] } }],
    } as Race5e
    installRace(race)
    const character = buildInitialCharacter(
      { initial: { name: race.name, originSystem: '2024' }, race },
      new Map(),
      () => [],
    )
    character.spells.spellSlots[1] = { max: 2, used: 1 }
    character.spells.spellProfiles.find((profile) => profile.type === 'special')!.cantrips = [
      'Light|PHB',
    ]
    character.provenance.spells.light = [
      {
        sourceType: 'manual',
        sourceName: 'User Choice',
        grantType: 'choice',
        label: 'User Choice',
        grantSource: 'PHB',
      },
    ]
    setActiveCharacter(character)
    const id = character.spells.spellProfiles.find((profile) => profile.type === 'racial')!.id
    const { result, unmount } = renderHook(() => {
      const active = useCharacterStore((state) => state.activeCharacter)!
      return useSpellProfileMutations(active.spells.spellProfiles, new Map())
    })
    for (const source of ['PHB', 'XPHB']) {
      act(() =>
        result.current.setRacialSpellChoice(
          id,
          useCharacterStore
            .getState()
            .activeCharacter!.spells.spellProfiles.find((profile) => profile.id === id)!.choices![0]
            .id,
          [`Light|${source}`],
        ),
      )
      const active = characterPersistenceSchema.parse(
        JSON.parse(JSON.stringify(useCharacterStore.getState().activeCharacter)),
      )
      expect(active.spells.spellProfiles.find((profile) => profile.id === id)?.cantrips).toEqual([
        `Light|${source}`,
      ])
      expect(active.provenance.spells.light.filter((tag) => tag.sourceType === 'race')).toEqual([
        expect.objectContaining({ grantSource: source }),
      ])
    }
    act(() =>
      result.current.setRacialSpellChoice(
        id,
        useCharacterStore
          .getState()
          .activeCharacter!.spells.spellProfiles.find((profile) => profile.id === id)!.choices![0]
          .id,
        [],
      ),
    )
    const active = characterPersistenceSchema.parse(
      JSON.parse(JSON.stringify(useCharacterStore.getState().activeCharacter)),
    )
    expect(active.provenance.spells.light).toEqual(character.provenance.spells.light)
    expect(
      active.spells.spellProfiles.find((profile) => profile.type === 'special')?.cantrips,
    ).toEqual(['Light|PHB'])
    expect(active.spells.spellSlots[1]).toEqual({ max: 2, used: 1 })
    unmount()
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

  test.each([
    'sync',
    'bonus edit',
  ])('a changed native block resets its setup while preserving independent owners during %s', (operation) => {
    const race = {
      name: 'Refresh caster',
      source: 'OWNER',
      additionalSpells: [
        {
          known: {
            _: [
              'light|PHB#c',
              { choose: 'level=0|class=Wizard' },
              { choose: 'level=0|class=Cleric' },
            ],
          },
        },
      ],
    } as Race5e
    installRace(race)
    let character = buildInitialCharacter(
      { initial: { name: race.name, originSystem: '2014' }, race },
      new Map(),
      () => [],
    )
    const id = character.spells.spellProfiles.find((profile) => profile.type === 'racial')!.id
    for (const choice of character.spells.spellProfiles
      .find((profile) => profile.id === id)!
      .choices!.map((choice) => choice.id)) {
      const result = setRacialSpellChoice(
        character,
        character.provenance,
        id,
        choice,
        ['Light|XPHB'],
        nativeRaceResolution(race),
        nativeChoiceSpellLookup,
      )
      character = { ...character, ...result.characterPatch, provenance: result.provenanceUpdate }
    }
    for (const sourceType of ['manual', 'class', 'feat'] as const) {
      character.provenance = addSpellGrant(
        character.provenance,
        'Light|XPHB',
        makeSourceTag(sourceType, 'Independent', 'choice', 'OTHER'),
      )
    }
    character.spells.spellSlots[1] = { max: 2, used: 1 }
    const original = structuredClone(character)
    const changedRace = {
      ...race,
      additionalSpells: [{ known: { _: ['light|PHB#c', { choose: 'level=0|class=Cleric' }] } }],
    } as Race5e
    installRace(changedRace)
    const profiles = character.spells.spellProfiles
    setActiveCharacter(character)
    const { result, unmount } = renderHook(() => useSpellProfileMutations(profiles, new Map()))
    act(() => {
      if (operation === 'sync') result.current.syncProfiles()
      else result.current.addSpellToProfile('special:unrestricted', 'Bonus|PHB', 'cantrip')
    })
    const reopened = characterPersistenceSchema.parse(
      JSON.parse(JSON.stringify(useCharacterStore.getState().activeCharacter)),
    )
    expect(reopened.provenance!.spells.light).toEqual(
      expect.arrayContaining(
        original.provenance.spells.light.filter((tag) => tag.sourceType !== 'race'),
      ),
    )
    expect(reopened.spells.spellSlots[1]?.used).toBe(1)
    expect(
      reopened.spells.spellProfiles.find((profile) => profile.type === 'racial')?.choices,
    ).toEqual([expect.objectContaining({ selected: [] })])
    expect(reopened.provenance.spells.light.filter((tag) => tag.sourceType === 'race')).toEqual([
      expect.objectContaining({ grantType: 'fixed', grantSource: 'PHB' }),
    ])
    expect(character).toEqual(original)
    unmount()
  })

  test.each([
    'clear',
    'replace',
  ])('accepted normalized racial choice ownership supports actual %s and reopen', (operation) => {
    const race = {
      name: 'Normalized Caster',
      source: 'OWNER',
      additionalSpells: [{ known: { _: [{ choose: 'level=0|class=Wizard' }] } }],
    } as Race5e
    installRace(race)
    const initial = buildInitialCharacter(
      { initial: { name: race.name, originSystem: '2014' }, race },
      new Map(),
      () => [],
    )
    const id = initial.spells.spellProfiles.find((profile) => profile.type === 'racial')!.id
    const result = setRacialSpellChoice(
      initial,
      initial.provenance,
      id,
      initial.spells.spellProfiles.find((profile) => profile.id === id)!.choices![0].id,
      ['Light|PHB'],
      nativeRaceResolution(race),
      nativeChoiceSpellLookup,
    )
    const character = { ...initial, ...result.characterPatch, provenance: result.provenanceUpdate }
    character.provenance.spells.light[0].sourceName = ' nORMALIZED cASTER '
    character.provenance.spells.light[0].sourceRef = ' owner '
    character.provenance = addSpellGrant(
      character.provenance,
      'Light|XPHB',
      makeSourceTag('manual', 'Independent', 'choice'),
    )
    expect(characterPersistenceSchema.safeParse(character).success).toBe(true)
    const original = structuredClone(character)
    setActiveCharacter(character)
    const { result: mutations, unmount } = renderHook(() => {
      const active = useCharacterStore((state) => state.activeCharacter)!
      return useSpellProfileMutations(active.spells.spellProfiles, new Map())
    })
    const selected = operation === 'clear' ? [] : ['Mage Hand|XPHB']
    act(() =>
      mutations.current.setRacialSpellChoice(
        id,
        useCharacterStore
          .getState()
          .activeCharacter!.spells.spellProfiles.find((profile) => profile.id === id)!.choices![0]
          .id,
        selected,
      ),
    )
    const reopened = characterPersistenceSchema.parse(
      JSON.parse(JSON.stringify(useCharacterStore.getState().activeCharacter)),
    )
    expect(
      reopened.spells.spellProfiles.find((profile) => profile.id === id)?.choices?.[0].selected,
    ).toEqual(selected)
    expect(reopened.provenance!.spells.light).toEqual([
      expect.objectContaining({ sourceType: 'manual', grantSource: 'XPHB' }),
    ])
    expect(character).toEqual(original)
    unmount()
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
