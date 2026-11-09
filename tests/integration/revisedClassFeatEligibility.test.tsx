import { readFileSync } from 'node:fs'
import { act, cleanup, fireEvent, render, renderHook, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'
import { DataFilter } from '@/lib/5etools/filters'
import { buildClassLookup, buildGameDataLookups } from '@/lib/5etools/lookups'
import { parseFeats } from '@/lib/5etools/parsers/basic'
import { parseClassDocument } from '@/lib/5etools/parsers/classes'
import { checkAllPrerequisites } from '@/lib/calculations/prerequisiteRules'
import { buildClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import { applyCharacterCommandResult } from '@/lib/character/commands/featCommandSupport'
import { replaceFeatSelectionsCommand } from '@/lib/character/commands/featCommands'
import { getRevisedClassFeatSlot } from '@/lib/character/revisedClassFeatSlot'
import { applyFeatGrantBlocks } from '@/lib/provenance/applyFeatAndOptionalFeatureGrants'
import { BuildClassPage } from '@/pages/build/class/ClassPage'
import { useClassAsiFeatController } from '@/pages/build/class/hooks/useClassAsiFeatController'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Class5e, ClassFeature, Feat5e } from '@/types/5etools'
import type { Character, HitPointGain } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { resetCharacterStore, setActiveCharacter } from '../fixtures/characterStoreFixtures'
import { makeClassCastingData } from '../fixtures/classCastingFixtures'
import { makeGameDataFixture } from '../fixtures/gameDataFixtures'

const read = (file: string) => JSON.parse(readFileSync(`resources/srd/data/${file}`, 'utf8'))
const feats = (parseFeats(read('feats.json')) as Feat5e[]).filter((feat) => feat.source === 'XPHB')
const alert = feats.find((feat) => feat.name === 'Alert')!
const combat = feats.find((feat) => feat.name === 'Boon of Combat Prowess')!
const recall = feats.find((feat) => feat.name === 'Boon of Spell Recall')!
const grappler = feats.find((feat) => feat.name === 'Grappler')!
const initiate = feats.find((feat) => feat.name === 'Magic Initiate')!

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  resetCharacterStore()
  useGameDataStore.setState({ gameData: null })
})

function loadClassFeatCatalog(character: Character, linkedFeat = false) {
  const declarations = character.classProgression.map((entry) => {
    const file = `class/class-${entry.name.toLowerCase()}.json`
    const parsed = read(file)
    const document = linkedFeat
      ? JSON.parse(
          JSON.stringify(parsed).replace(
            'You gain an Epic Boon feat (see \\"Feats\\") or another feat',
            'You gain an {@filter Epic Boon feat|feats|category=EB} or another {@5etools feat|feats.html}',
          ),
        )
      : parsed
    return parseClassDocument(document, file)
  })
  const classes = declarations.flatMap((row) => row.classes as Class5e[])
  const classFeatures = declarations.flatMap((row) => row.classFeatures as ClassFeature[])
  const classCastingSources = declarations.flatMap((row) => row.classCastingSources)
  const data = makeGameDataFixture({ classes, classFeatures, classCastingSources, feats })
  data.lookups = buildGameDataLookups(data)
  const classLookup = buildClassLookup(classes)
  useGameDataStore.setState({ gameData: data })
  setActiveCharacter(character)
  return classLookup
}

function openClassFeatPicker(
  character: Character,
  name: string,
  level: number,
  linkedFeat = false,
) {
  const classLookup = loadClassFeatCatalog(character, linkedFeat)
  const { result, unmount } = renderHook(() =>
    useClassAsiFeatController({
      character: useCharacterStore((state) => state.activeCharacter),
      viewingClass: name,
      viewingClassSource: character.classProgression.find((entry) => entry.name === name)!.source,
      classLookup,
      feats,
    }),
  )
  act(() => result.current.setFeatPickerLevel(level))
  return { result, unmount }
}

function reopen() {
  return characterPersistenceSchema.parse(
    JSON.parse(JSON.stringify(useCharacterStore.getState().activeCharacter)),
  )
}

test.each([
  ['Ranger', true],
  ['Rogue', false],
] as const)('Builder %s uses one Epic Boon row for feats, ASI and recovery', async (name, tagged) => {
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(600)
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(800)
  const initial = makeCharacterFixture({
    originSystem: '2024',
    classProgression: [{ name, source: 'XPHB', levels: 19 }],
  })
  loadClassFeatCatalog(
    {
      ...initial,
      abilityScores: { ...initial.abilityScores, strength: 19 },
    },
    tagged,
  )
  render(
    <MemoryRouter>
      <BuildClassPage />
    </MemoryRouter>,
  )
  const level = await screen.findByRole('button', { name: /^Level 19,/ })
  expect(level.getAttribute('aria-label')).toMatch(/1 pending choice$/)
  fireEvent.click(level)
  const row = () => within(screen.getByRole('group', { name: 'Epic Boon' }))
  const dialog = () => within(screen.getByRole('dialog'))
  const search = (name: string) =>
    fireEvent.change(dialog().getByPlaceholderText('Search available options'), {
      target: { value: name },
    })

  fireEvent.click(row().getByRole('button', { name: 'Choose Feat' }))
  await screen.findByRole('dialog')
  search('Ability Score Improvement')
  expect(dialog().queryByText('Ability Score Improvement', { selector: 'span' })).toBeNull()
  search(combat.name)
  fireEvent.click(await dialog().findByText(combat.name, { selector: 'span' }))
  fireEvent.click(dialog().getByRole('button', { name: 'Confirm' }))
  fireEvent.click(await dialog().findByRole('button', { name: 'Wisdom' }))
  fireEvent.click(dialog().getByRole('button', { name: 'Finish' }))
  expect(reopen().feats).toEqual([
    expect.objectContaining({
      name: combat.name,
      options: { abilityScore: 'wis' },
      classLevel: 19,
    }),
  ])
  expect(reopen().classChoiceSelections ?? []).toEqual([])
  expect(level.getAttribute('aria-label')).toMatch(/All choices made$/)

  fireEvent.click(row().getByRole('button', { name: 'Ability Score Improvement' }))
  expect((await dialog().findByRole('button', { name: /^STR / })).hasAttribute('disabled')).toBe(
    true,
  )
  fireEvent.click(dialog().getByRole('button', { name: 'Cancel' }))
  expect(reopen().feats[0].name).toBe(combat.name)

  fireEvent.click(row().getByRole('button', { name: 'Replace with Feat' }))
  search(alert.name)
  fireEvent.click(await dialog().findByText(alert.name, { selector: 'span' }))
  fireEvent.click(dialog().getByRole('button', { name: 'Confirm' }))
  expect(reopen().feats.map((feat) => feat.name)).toEqual([alert.name])

  fireEvent.click(row().getByRole('button', { name: 'Ability Score Improvement' }))
  fireEvent.click(await dialog().findByRole('button', { name: /^\+1 \/ \+1/ }))
  fireEvent.click(dialog().getByRole('button', { name: /^STR / }))
  fireEvent.click(dialog().getByRole('button', { name: /^WIS / }))
  fireEvent.click(dialog().getByRole('button', { name: 'Apply' }))
  expect(reopen().feats).toEqual([])
  expect(reopen().asiChoices).toEqual([
    expect.objectContaining({ level: 19, abilityChanges: { strength: 1, wisdom: 1 } }),
  ])

  act(() => {
    const data = useGameDataStore.getState().gameData!
    useGameDataStore.setState({ gameData: { ...data, classes: [], classFeatures: [] } })
  })
  expect(row().getByText(/This Epic Boon is unavailable/)).toBeDefined()
  expect(row().queryByRole('button', { name: 'Ability Score Improvement' })).toBeNull()
  fireEvent.click(row().getByRole('button', { name: 'Clear Epic Boon' }))
  expect(reopen().asiChoices).toEqual([])
})

test('Epic Boon picker rejects stale actors and an ordinary feat owned elsewhere', () => {
  const initial = makeCharacterFixture({
    originSystem: '2024',
    classProgression: [{ name: 'Rogue', source: 'XPHB', levels: 19 }],
  })
  const character = applyCharacterCommandResult(
    initial,
    replaceFeatSelectionsCommand(initial, initial.provenance, [alert]),
  )
  const { result } = openClassFeatPicker(character, 'Rogue', 19)
  expect(result.current.featModalFeats).not.toContain(alert)
  act(() => result.current.confirmFeat([alert]))
  expect(reopen().feats).toEqual(character.feats)

  const next = { ...character, id: 'other-character' }
  act(() => setActiveCharacter(next))
  act(() => result.current.confirmFeat([combat]))
  expect(reopen().id).toBe(next.id)
  expect(reopen().feats).toEqual(next.feats)
})

test.each([
  'Fighter',
  'Rogue',
])('revised %s offers Origin and earned Epic Boon feats through its existing slots', (name) => {
  const character = makeCharacterFixture({
    originSystem: '2024',
    classProgression: [{ name, source: 'XPHB', levels: 19 }],
  })
  const { result } = openClassFeatPicker(character, name, 4, name === 'Fighter')
  expect(result.current.featModalFeats).toContain(alert)
  expect(result.current.featModalFeats).toContain(initiate)
  expect(checkAllPrerequisites(combat, result.current.featPickerSnapshot).status).toBe('unmet')
  act(() => result.current.confirmFeat([{ ...combat, prerequisite: [] }]))
  expect(reopen().feats).toEqual([])
  act(() => result.current.confirmFeat([alert]))
  expect(reopen().feats).toContainEqual(
    expect.objectContaining({
      name: alert.name,
      source: alert.source,
      className: name,
      classSource: 'XPHB',
      classLevel: 4,
    }),
  )
  act(() => result.current.setFeatPickerLevel(19))
  expect(result.current.featModalFeats).toContain(combat)
  expect(checkAllPrerequisites(recall, result.current.featPickerSnapshot).status).toBe('unmet')
  act(() => result.current.confirmFeat([combat]))
  expect(reopen().feats).toContainEqual(
    expect.objectContaining({
      name: combat.name,
      source: combat.source,
      className: name,
      classSource: 'XPHB',
      classLevel: 19,
    }),
  )
  act(() => result.current.clearFeatSelection(19))
  expect(reopen().feats.map((feat) => feat.name)).toEqual([alert.name])
})

function gains(order: string[]): HitPointGain[] {
  const levels = new Map([[order[0], 1]])
  return order.slice(1).map((className, index) => {
    const classLevel = (levels.get(className) ?? 0) + 1
    levels.set(className, classLevel)
    const hitDie = className === 'Fighter' ? 10 : 6
    return {
      className,
      classSource: 'XPHB',
      classLevel,
      characterLevel: index + 2,
      hitDie,
      dieResult: hitDie / 2 + 1,
      method: 'average',
    }
  })
}

test.each([
  ['late', gains([...Array(15).fill('Fighter'), ...Array(4).fill('Wizard')]), 'met'],
  ['early', gains(['Fighter', ...Array(4).fill('Wizard'), ...Array(14).fill('Fighter')]), 'unmet'],
  ['unknown', [], 'unsupported'],
] as const)('%s multiclass ASI uses the level when the slot was earned', (_label, hitPointGains, expected) => {
  const character = makeCharacterFixture({
    originSystem: '2024',
    classProgression: [
      { name: 'Fighter', source: 'XPHB', levels: 15 },
      { name: 'Wizard', source: 'XPHB', levels: 4 },
    ],
    hitPointGains: [...hitPointGains],
  })
  const { result } = openClassFeatPicker(character, 'Wizard', 4)
  expect(checkAllPrerequisites(combat, result.current.featPickerSnapshot).status).toBe(expected)
  expect(checkAllPrerequisites(recall, result.current.featPickerSnapshot).status).toBe(expected)
  act(() => result.current.confirmFeat([recall]))
  expect(reopen().feats.map((feat) => feat.name)).toEqual(expected === 'met' ? [recall.name] : [])
})

test('an incomplete multiclass history leaves Spell Recall casting eligibility unverified', () => {
  const character = makeCharacterFixture({
    originSystem: '2024',
    classProgression: [
      { name: 'Fighter', source: 'XPHB', levels: 19 },
      { name: 'Wizard', source: 'XPHB', levels: 1 },
    ],
  })
  const { result } = openClassFeatPicker(character, 'Fighter', 19)
  expect(checkAllPrerequisites(combat, result.current.featPickerSnapshot).status).toBe('met')
  expect(checkAllPrerequisites(recall, result.current.featPickerSnapshot).status).toBe(
    'unsupported',
  )
  act(() => result.current.confirmFeat([recall]))
  expect(reopen().feats).toEqual([])
})

test('replacing a feat cannot use the ability increase it would remove', () => {
  const initial = makeCharacterFixture()
  const character = makeCharacterFixture({
    originSystem: '2024',
    classProgression: [{ name: 'Rogue', source: 'XPHB', levels: 19 }],
    abilityScores: { ...initial.abilityScores, strength: 12, dexterity: 12 },
  })
  const { result } = openClassFeatPicker(character, 'Rogue', 19)
  act(() => result.current.confirmFeat([combat]))
  act(() =>
    result.current.commitFeatWithOptions(
      { ...combat, selectionKind: 'ordinary' },
      { abilityScore: 'str' },
      [],
    ),
  )
  expect(reopen().feats[0].options?.abilityScore).toBe('str')
  act(() => result.current.setFeatPickerLevel(19))
  expect(checkAllPrerequisites(grappler, result.current.characterSnapshot).status).toBe('met')
  expect(checkAllPrerequisites(grappler, result.current.featPickerSnapshot).status).toBe('unmet')
  act(() => result.current.confirmFeat([grappler]))
  expect(reopen().feats.map((feat) => feat.name)).toEqual([combat.name])
})

test('an independent Magic Initiate grant remains when repeated spell-list selection is unavailable', () => {
  const sage = read('backgrounds.json').background.find(
    (row: { name: string; source: string }) => row.name === 'Sage' && row.source === 'XPHB',
  )
  const initial = makeCharacterFixture({
    originSystem: '2024',
    classProgression: [{ name: 'Fighter', source: 'XPHB', levels: 19 }],
    background: sage.name,
    backgroundSource: sage.source,
  })
  const character = {
    ...initial,
    provenance: applyFeatGrantBlocks(
      initial.provenance,
      sage.feats,
      'background',
      sage.name,
      sage.source,
    ),
  }
  const { result } = openClassFeatPicker(character, 'Fighter', 19)
  expect(result.current.featModalFeats).not.toContain(initiate)
  act(() => result.current.confirmFeat([initiate]))
  expect(reopen().feats).toEqual([])
  expect(reopen().provenance.feats['magic initiate']).toContainEqual(
    expect.objectContaining({
      sourceType: 'background',
      grantSource: 'xphb',
      grantVariant: 'wizard',
    }),
  )
})

test('withdrawal of a gain declaration leaves its exact saved feat editable', () => {
  const character = makeCharacterFixture({
    originSystem: '2024',
    classProgression: [{ name: 'Fighter', source: 'XPHB', levels: 19 }],
  })
  const { result } = openClassFeatPicker(character, 'Fighter', 19)
  act(() => result.current.confirmFeat([combat]))
  const saved = reopen()
  act(() => {
    const data = useGameDataStore.getState().gameData!
    useGameDataStore.setState({
      gameData: {
        ...data,
        classFeatures: data.classFeatures.filter((row) => row.name !== 'Epic Boon'),
      },
    })
    result.current.setFeatPickerLevel(19)
  })
  expect(result.current.featModalFeats).not.toContain(alert)
  act(() => result.current.confirmFeat([alert]))
  expect(reopen().feats).toEqual(saved.feats)
  act(() => result.current.confirmFeat([combat]))
  expect(reopen().feats).toEqual(saved.feats)
  act(() => result.current.clearFeatSelection(19))
  expect(reopen().feats).toEqual([])
})

test.each([
  ['Fighter', 'Eldritch Knight'],
  ['Rogue', 'Arcane Trickster'],
])('configured %s recognizes an earned %s Spellcasting declaration', (name, subclass) => {
  const data = makeClassCastingData()
  const filters = { sources: ['XPHB'] }
  const catalogs = buildClassChoiceFeatureCatalogs({
    ...data,
    classes: DataFilter.filterClasses(data.classes, filters),
    classFeatures: DataFilter.filterClassFeatures(data.classFeatures, filters),
  })
  const character = makeCharacterFixture({
    originSystem: '2024',
    classProgression: [{ name, source: 'XPHB', levels: 19, subclass, subclassSource: 'XPHB' }],
  })
  const request = { name, source: 'XPHB', level: 19 }
  expect(getRevisedClassFeatSlot(character, request, catalogs)?.hasSpellcastingFeature).toBe(true)
  expect(
    getRevisedClassFeatSlot(character, request, { ...catalogs, classCastingSources: [] })
      ?.hasSpellcastingFeature,
  ).toBeUndefined()
})
