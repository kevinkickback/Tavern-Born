import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { useCharacterCalculationContext } from '@/hooks/character/useCharacterCalculationContext'
import { useSpellProfileMutations } from '@/hooks/character/useSpellProfileMutations'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { ensureSpellProfiles } from '@/lib/calculations/spellProfiles.profiles'
import { setDailyClassSpellPreparedCommand } from '@/lib/character/commands/dailyClassSpellCommands'
import {
  commitFeatOptionsCommand,
  replaceFeatSelectionsCommand,
} from '@/lib/character/commands/featCommands'
import { setManagedClassSpellChoiceCommand } from '@/lib/character/commands/managedClassSpellCommands'
import { buildInitialCharacter } from '@/lib/character/commands/originSelectionCommand'
import { addSpellToCharacter, setRacialSpellChoice } from '@/lib/character/commands/spellCommands'
import { addSpellGrant, makeSourceTag } from '@/lib/provenance'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Race5e } from '@/types/5etools'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { resetCharacterStore, setActiveCharacter } from '../fixtures/characterStoreFixtures'
import { makeGameDataFixture } from '../fixtures/gameDataFixtures'
import { makeManagedClassSpellFixtures } from '../fixtures/managedClassSpellFixtures'
import {
  nativeChoiceSpellLookup,
  nativeChoiceSpells,
  nativeRaceResolution,
} from '../fixtures/nativeRacialCharacter'

vi.mock('sonner', () => ({ toast: { warning: vi.fn(), error: vi.fn() } }))

const WIZARD_PROFILE_ID = 'class:Wizard|PHB'

function installRace(race: Race5e) {
  const gameData = makeGameDataFixture({ races: [race], spells: nativeChoiceSpells })
  gameData.lookups = buildGameDataLookups(gameData)
  useGameDataStore.setState({ gameData })
}

describe('useSpellProfileMutations', () => {
  beforeEach(() => {
    resetCharacterStore()
    useGameDataStore.setState({ gameData: null })
  })
  afterEach(() => {
    cleanup()
    useGameDataStore.setState({ gameData: null })
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

  test.each([
    'sync',
    'bonus edit',
  ])('a removed native sibling preserves compatible setup and independent owners during %s', (operation) => {
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
    for (const sourceType of ['manual'] as const) {
      character.provenance = addSpellGrant(
        character.provenance,
        'Light|XPHB',
        makeSourceTag(sourceType, 'Independent', 'choice', 'OTHER'),
      )
    }
    const feat = { name: 'Independent', source: 'OTHER' }
    const selected = replaceFeatSelectionsCommand(character, character.provenance, [feat])
    character = { ...character, ...selected.characterPatch, provenance: selected.provenanceUpdate }
    const configured = commitFeatOptionsCommand(
      character,
      character.provenance,
      { ...feat, selectionKind: 'ordinary' },
      { spells: ['Light|XPHB'] },
      nativeChoiceSpells,
    )
    character = characterPersistenceSchema.parse({
      ...character,
      ...configured.characterPatch,
      provenance: configured.provenanceUpdate,
    })
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
    ).toEqual([expect.objectContaining({ selected: ['Light|XPHB'] })])
    expect(reopened.provenance.spells.light.filter((tag) => tag.sourceType === 'race')).toEqual([
      expect.objectContaining({ grantType: 'fixed', grantSource: 'PHB' }),
      expect.objectContaining({
        grantType: 'choice',
        grantSource: 'XPHB',
        grantVariant: reopened.spells.spellProfiles.find((profile) => profile.type === 'racial')!
          .choices![0].id,
      }),
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

  test('latest Wizard Prepare/Clear addresses learned I and retains another owner of that target', () => {
    const fixture = makeManagedClassSpellFixtures()
    const gameData = { ...fixture.data, spells: fixture.spells }
    gameData.lookups = buildGameDataLookups(gameData)
    useGameDataStore.setState({ gameData })
    let character = makeCharacterFixture({
      classProgression: [{ name: 'Wizard', source: 'PHB', levels: 1 }],
    })
    const learned = setManagedClassSpellChoiceCommand(
      character,
      character.provenance,
      {
        slot: [
          ['class', 'wizard', 'phb'],
          'class-spellbook',
          'class-feature|spellcasting|wizard|phb|1|phb',
          1,
          0,
        ],
        expected: null,
        expectedEmptyRevision: 0,
        target: { name: 'Shield', source: 'PHB' },
        policy: 'default',
      },
      fixture.context,
    )
    character = characterPersistenceSchema.parse({
      ...character,
      ...learned.characterPatch,
      provenance: learned.provenanceUpdate,
    })
    const bonus = addSpellToCharacter(
      character,
      character.provenance,
      'Shield|PHB',
      'spell',
      'special:unrestricted',
    )
    character = characterPersistenceSchema.parse({
      ...character,
      ...bonus.characterPatch,
      provenance: bonus.provenanceUpdate,
    })
    setActiveCharacter(character)
    const { result } = renderHook(() => {
      const active = useCharacterStore((state) => state.activeCharacter)!
      const calculation = useCharacterCalculationContext(active)!
      return useSpellProfileMutations(calculation.character.spells.spellProfiles, new Map())
    })
    act(() =>
      useCharacterStore.getState().updateCharacter(character.id, { name: 'Latest unrelated name' }),
    )
    act(() => result.current.togglePrepared(WIZARD_PROFILE_ID, 'Shield|PHB'))
    const prepared = useCharacterStore.getState().activeCharacter!
    expect(prepared.name).toBe('Latest unrelated name')
    expect(prepared.managedClassSpellChoices?.[0]).toMatchObject({ prepare: true, revision: 2 })
    const beforeInvalid = JSON.stringify(prepared)
    act(() => result.current.togglePrepared(WIZARD_PROFILE_ID, 'Magic Missile|PHB'))
    expect(JSON.stringify(useCharacterStore.getState().activeCharacter)).toBe(beforeInvalid)
    act(() => result.current.removeSpellFromProfile(WIZARD_PROFILE_ID, 'Shield|PHB', 'spell'))
    const cleared = characterPersistenceSchema.parse(useCharacterStore.getState().activeCharacter)
    expect(cleared.managedClassSpellChoices).toEqual([])
    expect(cleared.managedClassSpellRevision).toBe(2)
    expect(cleared.spells.spellProfiles.find((row) => row.type === 'special')?.spellsKnown).toEqual(
      ['Shield|PHB'],
    )
    expect(cleared.provenance.spells.shield).toEqual([
      expect.objectContaining({ sourceType: 'manual' }),
    ])
  })

  test('Bonus edit and profile sync preserve dormant daily intent; exact withdrawal clears it', () => {
    const fixture = makeManagedClassSpellFixtures()
    let character = makeCharacterFixture({
      classProgression: [{ name: 'Cleric', source: 'PHB', levels: 1 }],
    })
    character.spells.spellProfiles = ensureSpellProfiles(character)
    const selected = setDailyClassSpellPreparedCommand(
      character,
      character.provenance,
      'class:Cleric|PHB',
      'Bless|PHB',
      true,
      { ...fixture.context, abilityScores: character.abilityScores },
    )
    character = characterPersistenceSchema.parse({
      ...character,
      ...selected.characterPatch,
      provenance: selected.provenanceUpdate,
    })
    const gameData = {
      ...fixture.data,
      spells: fixture.spells.filter((row) => row.name !== 'Bless'),
    }
    gameData.lookups = buildGameDataLookups(gameData)
    useGameDataStore.setState({ gameData })
    setActiveCharacter(character)
    const { result } = renderHook(() => {
      const active = useCharacterStore((state) => state.activeCharacter)!
      const calculation = useCharacterCalculationContext(active)!
      expect(
        calculation.character.spells.spellProfiles.find((row) => row.className === 'Cleric')
          ?.preparedSpells,
      ).toEqual([])
      return useSpellProfileMutations(calculation.character.spells.spellProfiles, new Map())
    })
    act(() => result.current.addSpellToProfile('special:unrestricted', 'Light|PHB', 'cantrip'))
    act(() => result.current.syncProfiles())
    expect(
      useCharacterStore
        .getState()
        .activeCharacter?.spells.spellProfiles.find((row) => row.className === 'Cleric')
        ?.preparedSpells,
    ).toEqual(['Bless|PHB'])
    act(() => result.current.togglePrepared('class:Cleric|PHB', 'Bless|PHB'))
    expect(
      characterPersistenceSchema
        .parse(useCharacterStore.getState().activeCharacter)
        .spells.spellProfiles.find((row) => row.className === 'Cleric')?.preparedSpells,
    ).toEqual([])
  })
})
