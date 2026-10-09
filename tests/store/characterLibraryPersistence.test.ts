import { beforeEach, describe, expect, test, vi } from 'vitest'
import { prepareUnsupportedCharacterDownloads } from '@/lib/character/characterTransfer'
import { buildInitialCharacter } from '@/lib/character/commands/originSelectionCommand'
import { setRacialSpellChoice } from '@/lib/character/commands/spellCommands'
import { CURRENT_CHARACTER_SCHEMA_VERSION } from '@/lib/schema/characterSchemaVersion'
import { pruneSpellsForDisabledSources } from '@/lib/sourceConflicts'
import { createIdbStorage } from '@/lib/storage/idb-storage'
import { useCharacterStore } from '@/store/characterStore'
import type { Race5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeRacialSourceCharacter } from '../fixtures/racialSourceCharacter'

vi.unmock('@/lib/storage/idb-storage')

const reader = createIdbStorage<{ characters: Character[]; unsupportedCharacters: unknown[] }>()
const readCharacters = async () => (await reader.getItem('character-storage'))?.state.characters

describe('acknowledged character library in IndexedDB', () => {
  beforeEach(async () => {
    await vi.waitFor(() => expect(useCharacterStore.persist.hasHydrated()).toBe(true))
    await useCharacterStore.persist.clearStorage()
    await useCharacterStore.setState({
      characters: [],
      activeCharacterId: null,
      activeCharacter: null,
      isActiveCharacterDirty: false,
      unsupportedCharacters: [],
    })
  })

  test('a new character is available to a fresh storage read when creation completes', async () => {
    const created = await useCharacterStore.getState().createNewCharacter({ name: 'Durable Hero' })
    expect(await readCharacters()).toEqual([created])
  })

  test('racial source removal survives an acknowledged save and fresh library reopen', async () => {
    const original = makeRacialSourceCharacter()
    const neighbor = makeCharacterFixture({ id: 'neighbor', allowedSources: [] })
    await useCharacterStore.getState().importCharacters([original, neighbor])
    useCharacterStore.getState().setActiveCharacter(original.id)
    const prune = pruneSpellsForDisabledSources(original, ['XPHB'], [])!
    useCharacterStore.getState().updateCharacter(original.id, { ...prune, allowedSources: [] })
    expect(useCharacterStore.getState().isActiveCharacterDirty).toBe(true)
    await useCharacterStore.getState().saveActiveCharacter()

    useCharacterStore.getState().setActiveCharacter(null)
    await useCharacterStore.persist.rehydrate()
    useCharacterStore.getState().setActiveCharacter(original.id)
    const reopened = useCharacterStore.getState().activeCharacter!
    expect(reopened.allowedSources).toEqual([])
    expect(
      reopened.spells.spellProfiles.find((profile) => profile.type === 'racial')?.choices?.[0]
        ?.selected,
    ).toEqual([])
    expect(
      reopened.spells.spellProfiles.find((profile) => profile.type === 'special')?.cantrips,
    ).toEqual(['Toll the Dead|XPHB'])
    expect(reopened.provenance.spells['toll the dead']).toEqual([
      expect.objectContaining({ sourceType: 'manual', grantSource: 'XPHB' }),
    ])
    expect(
      useCharacterStore.getState().characters.find((character) => character.id === neighbor.id),
    ).toEqual(neighbor)
    expect(useCharacterStore.getState().unsupportedCharacters).toEqual([])
    expect(await readCharacters()).toEqual(useCharacterStore.getState().characters)
  })

  test('quarantine acknowledgment is durable and retains the supported library', async () => {
    const saved = await useCharacterStore.getState().createNewCharacter({ name: 'Supported' })
    const unsupported = { ...makeCharacterFixture({ id: 'backup' }), schemaVersion: 0 }
    await useCharacterStore.setState({ unsupportedCharacters: [unsupported] })
    await useCharacterStore.getState().dismissUnsupportedCharacters()
    expect((await reader.getItem('character-storage'))?.state).toEqual({
      characters: [saved],
      unsupportedCharacters: [],
    })
  })

  test('unsupported variant settings remain unchanged and exportable through reload and later writes', async () => {
    const valid = makeCharacterFixture({
      id: 'canonical',
      name: 'Canonical settings',
      allowedSources: [],
    })
    const neighbor = makeCharacterFixture({
      id: 'neighbor',
      name: 'Valid neighbor',
      allowedSources: [],
    })
    const originals = [
      { bladesingerAnyRace: true },
      { bladesingerAnyRace: false },
      { battleragerAnyRace: true },
      { battleragerAnyRace: false },
      { anyRaceSubclasses: false, bladesingerAnyRace: true },
      { anyRaceSubclasses: true, unknownRule: false },
    ].map((variantRules, index) => ({
      ...makeCharacterFixture({
        id: `unsupported-settings-${index}`,
        name: `Unsupported ${index}`,
      }),
      variantRules,
    }))
    const before = structuredClone(originals)
    const rawStorage = createIdbStorage<{
      characters: unknown[]
      unsupportedCharacters: unknown[]
    }>()
    await rawStorage.setItem('character-storage', {
      state: { characters: [valid, ...originals, neighbor], unsupportedCharacters: [] },
      version: 0,
    })
    await useCharacterStore.persist.rehydrate()
    expect(useCharacterStore.getState().characters).toEqual([valid, neighbor])
    expect(useCharacterStore.getState().unsupportedCharacters).toEqual(before)

    const created = await useCharacterStore
      .getState()
      .createNewCharacter({ name: 'Later canonical write' })
    await useCharacterStore.persist.rehydrate()
    const persisted = (await reader.getItem('character-storage'))?.state
    expect(persisted).toEqual({
      characters: [valid, neighbor, created],
      unsupportedCharacters: before,
    })
    expect(
      prepareUnsupportedCharacterDownloads(useCharacterStore.getState().unsupportedCharacters).map(
        (download) => JSON.parse(download.text),
      ),
    ).toEqual(before)
    await expect(
      useCharacterStore.getState().importCharacters([valid, originals[0] as unknown as Character]),
    ).rejects.toThrow()
    expect((await reader.getItem('character-storage'))?.state).toEqual(persisted)
    expect(originals).toEqual(before)
  })

  test('rejected old, newer and malformed current originals survive reload and later durable writes unchanged', async () => {
    const valid = makeCharacterFixture({ id: 'supported', name: 'Supported', allowedSources: [] })
    const malformed = buildInitialCharacter(
      {
        initial: { name: 'Ambiguous blocks', originSystem: '2014' },
        race: {
          name: 'Native',
          source: 'TEST',
          ability: [{ choose: { from: ['str', 'dex'], amount: 2 } }],
        } as Race5e,
        raceAsiChoices: [['strength']],
      },
      new Map(),
      () => [],
    )
    const malformedRevised = structuredClone(malformed)
    malformedRevised.originSystem = '2024'
    malformedRevised.provenance!.choices[0].selected = ['dexterity']
    malformedRevised.provenance!.choices[0].status = 'pending'
    malformed.provenance!.choices.push(structuredClone(malformed.provenance!.choices[0]))
    const missingTarget = makeCharacterFixture({ id: 'missing-spell-target' })
    missingTarget.provenance.spells.light = [
      {
        sourceType: 'race',
        sourceName: missingTarget.race,
        sourceRef: missingTarget.raceSource,
        grantType: 'fixed',
        label: missingTarget.race,
      },
    ]
    const originals = [
      {
        ...makeCharacterFixture({ id: 'old', name: 'Old' }),
        schemaVersion: CURRENT_CHARACTER_SCHEMA_VERSION - 1,
      },
      {
        ...makeCharacterFixture({ id: 'newer', name: 'Newer' }),
        schemaVersion: CURRENT_CHARACTER_SCHEMA_VERSION + 1,
      },
      malformed,
      malformedRevised,
      missingTarget,
    ]
    const before = structuredClone(originals)
    const rawStorage = createIdbStorage<{
      characters: unknown[]
      unsupportedCharacters: unknown[]
    }>()
    await rawStorage.setItem('character-storage', {
      state: { characters: [valid, ...originals], unsupportedCharacters: [] },
      version: 0,
    })
    await useCharacterStore.persist.rehydrate()
    expect(useCharacterStore.getState().characters).toEqual([valid])
    expect(useCharacterStore.getState().unsupportedCharacters).toEqual(before)
    const created = await useCharacterStore
      .getState()
      .createNewCharacter({ name: 'Later valid write' })
    await useCharacterStore.persist.rehydrate()
    expect((await reader.getItem('character-storage'))?.state).toEqual({
      characters: [valid, created],
      unsupportedCharacters: before,
    })
    expect(
      prepareUnsupportedCharacterDownloads(useCharacterStore.getState().unsupportedCharacters).map(
        (download) => JSON.parse(download.text),
      ),
    ).toEqual(before)
    expect(originals).toEqual(before)
    const library = useCharacterStore.getState().characters
    await expect(
      useCharacterStore.getState().importCharacters([valid, malformedRevised]),
    ).rejects.toThrow()
    expect(useCharacterStore.getState().characters).toBe(library)
    expect((await reader.getItem('character-storage'))?.state.characters).toEqual(library)
    expect(originals).toEqual(before)
    await expect(
      useCharacterStore.getState().importCharacters([valid, malformed]),
    ).rejects.toThrow()
    expect(useCharacterStore.getState().characters).toBe(library)
    expect((await reader.getItem('character-storage'))?.state.characters).toEqual(library)
    expect(originals).toEqual(before)
  })

  test.each([
    'mismatched target',
    'unaccounted materialization',
    'active other owner',
    'outside declared pool',
    'missing fixed ownership',
    'manual fixed ownership',
    'other fixed printing',
  ])('racial %s stays quarantined and exportable after durable writes', async (corruption) => {
    const fixed = corruption.includes('fixed')
    const initial = buildInitialCharacter(
      {
        initial: { name: 'Canonical racial choice', originSystem: '2014' },
        race: {
          name: corruption === 'active other owner' ? 'Parent' : 'Choosing Caster',
          source: 'OWNER',
          additionalSpells:
            corruption === 'active other owner'
              ? undefined
              : [{ known: { _: fixed ? ['light|PHB#c'] : [{ choose: 'level=0|class=Wizard' }] } }],
        } as Race5e,
        ...(corruption === 'active other owner'
          ? {
              subrace: {
                name: 'Child',
                source: 'CHILD',
                additionalSpells: [{ known: { _: [{ choose: 'level=0|class=Wizard' }] } }],
              } as Race5e,
            }
          : {}),
      },
      new Map(),
      () => [],
    )
    const id = initial.spells.spellProfiles.find((profile) => profile.type === 'racial')!.id
    const result = fixed
      ? { characterPatch: {}, provenanceUpdate: initial.provenance }
      : setRacialSpellChoice(initial, initial.provenance, id, 'direct-_-choose-0', ['Light|PHB'])
    const valid = {
      ...initial,
      ...result.characterPatch,
      provenance: result.provenanceUpdate,
      allowedSources: [],
    }
    const malformed = structuredClone(valid)
    malformed.id = corruption
    if (corruption === 'missing fixed ownership') delete malformed.provenance.spells.light
    else if (corruption === 'manual fixed ownership')
      Object.assign(malformed.provenance.spells.light[0], {
        sourceType: 'manual',
        sourceName: 'User Choice',
        sourceRef: undefined,
      })
    else if (corruption === 'other fixed printing')
      malformed.provenance.spells.light[0].grantSource = 'TCE'
    else if (corruption === 'mismatched target')
      malformed.provenance.spells.light[0].grantSource = 'XPHB'
    else if (corruption === 'active other owner')
      Object.assign(malformed.provenance.spells.light[0], {
        sourceType: 'race',
        sourceName: 'Parent',
        sourceRef: 'OWNER',
      })
    else if (corruption === 'outside declared pool')
      malformed.spells.spellProfiles.find((profile) => profile.type === 'racial')!
        .choices![0].pool = ['Mage Hand|PHB']
    else
      malformed.spells.spellProfiles
        .find((profile) => profile.type === 'racial')!
        .cantrips.push('Mage Hand|PHB')
    const original = structuredClone(malformed)
    const neighbor = makeCharacterFixture({
      id: 'valid-neighbor',
      name: 'Valid neighbor',
      allowedSources: [],
    })
    const rawStorage = createIdbStorage<{
      characters: unknown[]
      unsupportedCharacters: unknown[]
    }>()
    await rawStorage.setItem('character-storage', {
      state: { characters: [valid, malformed, neighbor], unsupportedCharacters: [] },
      version: 0,
    })
    await useCharacterStore.persist.rehydrate()
    expect(useCharacterStore.getState().characters).toEqual([valid, neighbor])
    expect(useCharacterStore.getState().unsupportedCharacters).toEqual([original])
    const created = await useCharacterStore.getState().createNewCharacter({ name: 'Later write' })
    await useCharacterStore.persist.rehydrate()
    const persisted = (await reader.getItem('character-storage'))?.state
    expect(persisted).toEqual({
      characters: [valid, neighbor, created],
      unsupportedCharacters: [original],
    })
    expect(
      prepareUnsupportedCharacterDownloads(useCharacterStore.getState().unsupportedCharacters).map(
        (download) => JSON.parse(download.text),
      ),
    ).toEqual([original])
    for (const batch of [
      [valid, malformed],
      [malformed, valid],
    ]) {
      await expect(useCharacterStore.getState().importCharacters(batch)).rejects.toThrow()
      expect((await reader.getItem('character-storage'))?.state).toEqual(persisted)
    }
    expect(malformed).toEqual(original)
  })

  test('overlapping duplicates receive independent identities and collision-free names', async () => {
    const source = await useCharacterStore
      .getState()
      .addCharacter(makeCharacterFixture({ id: 'source', name: 'Hero' }))
    const [first, second] = await Promise.all([
      useCharacterStore.getState().duplicateCharacter(source.id),
      useCharacterStore.getState().duplicateCharacter(source.id),
    ])
    const saved = await readCharacters()
    expect(saved?.map((character) => character.name)).toEqual([
      'Hero',
      'Hero (Copy)',
      'Hero (Copy 2)',
    ])
    expect(new Set(saved?.map((character) => character.id)).size).toBe(3)
    expect(first.hitPoints).toEqual(source.hitPoints)
    expect(second.hitPoints).toEqual(source.hitPoints)
    expect(first.hitPoints).not.toBe(source.hitPoints)
  })

  test('inactive updates and batch deletion commit before their promises resolve', async () => {
    const characters = await useCharacterStore
      .getState()
      .importCharacters([
        makeCharacterFixture({ id: 'first', name: 'First' }),
        makeCharacterFixture({ id: 'second', name: 'Second' }),
        makeCharacterFixture({ id: 'third', name: 'Third' }),
      ])
    await useCharacterStore.getState().updateCharacter(characters[1].id, { name: 'Updated Second' })
    expect((await readCharacters())?.map((character) => character.name)).toEqual([
      'First',
      'Updated Second',
      'Third',
    ])
    await useCharacterStore.getState().deleteCharacters([characters[0].id, characters[2].id])
    expect((await readCharacters())?.map((character) => [character.id, character.name])).toEqual([
      ['second', 'Updated Second'],
    ])
  })

  test('draft-only changes stay out of durable storage until an acknowledged save', async () => {
    const saved = await useCharacterStore.getState().createNewCharacter({ name: 'Saved Hero' })
    useCharacterStore.getState().setActiveCharacter(saved.id)
    useCharacterStore.getState().updateActiveCharacter({ name: 'Draft Hero' })
    expect((await readCharacters())?.[0].name).toBe('Saved Hero')
    await useCharacterStore.getState().saveActiveCharacter()
    expect((await readCharacters())?.[0].name).toBe('Draft Hero')
    expect(useCharacterStore.getState().hasUnsavedChanges()).toBe(false)
  })
})
