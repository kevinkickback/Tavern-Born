import { existsSync, readFileSync } from 'node:fs'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { parseCreatures } from '@/lib/5etools/parsers/basic'
import { parseClassDocument, parseClasses, parseClassFeatures } from '@/lib/5etools/parsers/classes'
import {
  buildClassChoiceFeatureCatalogs,
  createClassChoiceCatalogs,
  resolveClassChoiceOptions,
} from '@/lib/character/classChoiceOptions'
import { applyClassChoiceSelectionWithGrantsCommand } from '@/lib/character/commands/classChoiceCommands'
import { BuildClassPage } from '@/pages/build/class/ClassPage'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Class5e, ClassFeature } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { resetCharacterStore, setActiveCharacter } from '../fixtures/characterStoreFixtures'
import { makeFeatureOptionFixture, selectFeatureOption } from '../fixtures/featureOptionFixtures'
import { makeGameDataFixture } from '../fixtures/gameDataFixtures'

beforeEach(() => {
  resetCharacterStore()
  useCharacterStore.setState({ isActiveCharacterDirty: false })
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.hasAttribute('data-selection-scroll-container') ? 600 : 100
  })
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(800)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  resetCharacterStore()
  useGameDataStore.setState({ gameData: null })
})
const active = () => useCharacterStore.getState().activeCharacter!
const modal = () => within(screen.getByRole('dialog'))

function footer(name: 'Confirm' | 'Cancel') {
  const candidate = modal().getByText(name, { selector: 'button' })
  const control = within(candidate.parentElement!).getByRole('button', { name })
  expect(control).toBe(candidate)
  if (name === 'Cancel') expect(control.hasAttribute('disabled')).toBe(false)
  return control
}
async function levelButton(level: number) {
  const label = await screen.findByText(`Level ${level}`, {
    selector: '[data-slot="accordion-trigger"] span',
  })
  const candidate = label.closest('button')!
  const control = await within(candidate.parentElement!).findByRole('button', {
    name: new RegExp(`Level ${level}\\b`),
  })
  expect(control).toBe(candidate)
  return control
}

function mount(data: ReturnType<typeof makeGameDataFixture>, character: Character) {
  useGameDataStore.setState({ gameData: data })
  setActiveCharacter(character)
  return render(
    <MemoryRouter>
      <BuildClassPage />
    </MemoryRouter>,
  )
}
async function expand(level: number) {
  const button = await levelButton(level)
  if (button.getAttribute('data-state') === 'closed') fireEvent.click(button)
}
function row(name: string) {
  fireEvent.change(modal().getByPlaceholderText('Search available options'), {
    target: { value: name },
  })
  return modal().findByRole('button', { name: new RegExp(`^${name}`) })
}
async function confirm() {
  const button = footer('Confirm')
  expect(button.hasAttribute('disabled')).toBe(false)
  fireEvent.click(button)
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
}
async function pickSubclass(parent: string, name: string) {
  fireEvent.click(
    within(screen.getByRole('group', { name: parent })).getByRole('button', {
      name: /^(Choose|Change)$/,
    }),
  )
  fireEvent.click(await row(name))
  fireEvent.click(footer('Confirm'))
}
function unselected(character: Character): Character {
  return {
    ...character,
    classProgression: character.classProgression.map((entry) => ({
      ...entry,
      subclass: undefined,
      subclassSource: undefined,
    })),
  }
}

function withoutDraconicSubclass(data: ReturnType<typeof makeGameDataFixture>) {
  const unavailable = {
    ...data,
    classes: data.classes.map((row) =>
      row.name === 'Sorcerer' && row.source === 'PHB'
        ? {
            ...row,
            subclasses: row.subclasses?.filter(
              (subclass) => subclass.name !== 'Draconic Bloodline' || subclass.source !== 'PHB',
            ),
          }
        : row,
    ),
  }
  unavailable.lookups = buildGameDataLookups(unavailable)
  return unavailable
}

test('configured ancestry parent becomes incomplete when its subclass disappears and completes on exact restoration without a write', async () => {
  const fixture = makeFeatureOptionFixture()
  const reopened = characterPersistenceSchema.parse(
    JSON.parse(JSON.stringify(selectFeatureOption(fixture))),
  )
  mount(fixture.data, reopened)
  await expand(1)
  const bytes = JSON.stringify(active())
  expect(screen.getByRole('group', { name: 'Sorcerous Origin' }).className).toContain(
    'border-success',
  )
  await act(async () => {
    useGameDataStore.setState({ gameData: withoutDraconicSubclass(fixture.data) })
  })
  expect(screen.getByRole('group', { name: 'Sorcerous Origin' }).className).toContain(
    'border-warning',
  )
  expect(screen.queryByRole('button', { name: 'Edit Dragon Ancestor' })).toBeNull()
  expect(JSON.stringify(active())).toBe(bytes)
  expect(useCharacterStore.getState().isActiveCharacterDirty).toBe(false)
  await act(async () => {
    useGameDataStore.setState({ gameData: fixture.data })
  })
  expect(screen.getByRole('group', { name: 'Sorcerous Origin' }).className).toContain(
    'border-success',
  )
  expect(screen.getByRole('button', { name: 'Edit Dragon Ancestor' })).toBeTruthy()
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(JSON.stringify(active())).toBe(bytes)
  expect(active().features).toEqual(reopened.features)
  expect(useCharacterStore.getState().isActiveCharacterDirty).toBe(false)
})

test('unconfigured ancestry parent stays incomplete when the persisted subclass is unavailable', async () => {
  const fixture = makeFeatureOptionFixture()
  const reopened = characterPersistenceSchema.parse(JSON.parse(JSON.stringify(fixture.character)))
  mount(withoutDraconicSubclass(fixture.data), reopened)
  await expand(1)
  expect(screen.getByRole('group', { name: 'Sorcerous Origin' }).className).toContain(
    'border-warning',
  )
  expect(active().classProgression).toEqual(reopened.classProgression)
  expect(active().classChoiceSelections).toEqual(reopened.classChoiceSelections)
  expect(active().features).toEqual(reopened.features)
  expect(useCharacterStore.getState().isActiveCharacterDirty).toBe(false)
})

test('resolved Champion parent completes without a separate initial configuration', async () => {
  const document = JSON.parse(
    readFileSync('resources/srd/core/data/class/class-fighter.json', 'utf8'),
  )
  const data = makeGameDataFixture({
    classes: parseClasses(document) as Class5e[],
    classFeatures: parseClassFeatures(document) as ClassFeature[],
  })
  data.lookups = buildGameDataLookups(data)
  const character = makeCharacterFixture({
    originSystem: '2014',
    allowedSources: ['PHB'],
    classProgression: [
      { name: 'Fighter', source: 'PHB', levels: 3, subclass: 'Champion', subclassSource: 'PHB' },
    ],
  })
  mount(data, character)
  await expand(3)
  expect(screen.getByRole('group', { name: 'Martial Archetype' }).className).toContain(
    'border-success',
  )
  expect(active().classProgression).toEqual(character.classProgression)
  expect(active().classChoiceSelections ?? []).toEqual([])
})

test('subclass confirmation immediately configures ancestry; one parent holds both badges and its own edit control', async () => {
  const fixture = makeFeatureOptionFixture()
  mount(fixture.data, unselected(fixture.character))
  await expand(1)
  await pickSubclass('Sorcerous Origin', 'Draconic Bloodline')
  expect(
    await within(await screen.findByRole('dialog')).findByRole('heading', {
      name: 'Choose Dragon Ancestor',
    }),
  ).toBeTruthy()
  fireEvent.click(await row('Red'))
  await confirm()
  const parent = within(screen.getByRole('group', { name: 'Sorcerous Origin' }))
  expect(parent.getByRole('button', { name: 'Draconic Bloodline' })).toBeTruthy()
  expect(parent.getByRole('button', { name: 'Red' })).toBeTruthy()
  expect(screen.queryByRole('group', { name: 'Dragon Ancestor' })).toBeNull()
  const saved = characterPersistenceSchema.parse(JSON.parse(JSON.stringify(active())))
  const bytes = JSON.stringify(active())
  useCharacterStore.setState({ isActiveCharacterDirty: false })
  fireEvent.click(parent.getByRole('button', { name: 'Edit Dragon Ancestor' }))
  await confirm()
  expect(JSON.stringify(active())).toBe(bytes)
  expect(useCharacterStore.getState().isActiveCharacterDirty).toBe(false)
  expect(saved.classChoiceSelections).toEqual(active().classChoiceSelections)
})

test('Cancel leaves the selected subclass and missing setup editable; Clear ends setup without auto-reopening', async () => {
  const fixture = makeFeatureOptionFixture()
  mount(fixture.data, unselected(fixture.character))
  await expand(1)
  await pickSubclass('Sorcerous Origin', 'Draconic Bloodline')
  await within(await screen.findByRole('dialog')).findByRole('heading', {
    name: 'Choose Dragon Ancestor',
  })
  const bytes = JSON.stringify(active())
  fireEvent.click(footer('Cancel'))
  expect(JSON.stringify(active())).toBe(bytes)
  const parent = screen.getByRole('group', { name: 'Sorcerous Origin' })
  expect(parent.className).toContain('border-warning')
  fireEvent.click(within(parent).getByRole('button', { name: 'Choose Dragon Ancestor' }))
  await confirm()
  expect(active().classProgression[0].subclass).toBe('Draconic Bloodline')
  expect(active().classChoiceSelections ?? []).toEqual([])
  expect(screen.queryByRole('dialog')).toBeNull()
})

test('configured reselect does not reopen ancestry; changing only ancestry preserves subclass and unrelated features', async () => {
  const fixture = makeFeatureOptionFixture()
  mount(fixture.data, selectFeatureOption(fixture))
  await expand(1)
  const subclass = structuredClone(active().classProgression)
  const features = structuredClone(active().features)
  fireEvent.click(
    within(screen.getByRole('group', { name: 'Sorcerous Origin' })).getByRole('button', {
      name: 'Change',
    }),
  )
  await confirm()
  expect(screen.queryByRole('dialog')).toBeNull()
  fireEvent.click(
    within(screen.getByRole('group', { name: 'Sorcerous Origin' })).getByRole('button', {
      name: 'Edit Dragon Ancestor',
    }),
  )
  fireEvent.click(await row('Red'))
  fireEvent.click(await row('Blue'))
  await confirm()
  expect(active().classChoiceSelections?.[0].selected.map((option) => option.name)).toEqual([
    'Blue',
  ])
  expect(active().classProgression).toEqual(subclass)
  expect(active().features).toEqual(features)
})

const rangerAvailable =
  existsSync('data/class/class-ranger.json') && existsSync('data/bestiary/bestiary-mm.json')
function classicCompanionFixture() {
  const document = JSON.parse(readFileSync('data/class/class-ranger.json', 'utf8'))
  const data = makeGameDataFixture({
    classes: parseClasses(document) as Class5e[],
    classFeatures: parseClassFeatures(document) as ClassFeature[],
    creatures: parseCreatures(JSON.parse(readFileSync('data/bestiary/bestiary-mm.json', 'utf8'))),
  })
  data.lookups = buildGameDataLookups(data)
  const character = makeCharacterFixture({
    originSystem: '2014',
    allowedSources: ['PHB', 'MM'],
    classProgression: [{ name: 'Ranger', source: 'PHB', levels: 3 }],
    features: [{ id: 'manual:keep', name: 'Independent', source: 'PHB', description: 'Keep me' }],
  })
  return { data, character }
}

test.runIf(rangerAvailable)(
  'actual classic Beast Master companion configures under Ranger Archetype and strictly reopens',
  async () => {
    const { data, character } = classicCompanionFixture()
    mount(data, character)
    await expand(3)
    await pickSubclass('Ranger Archetype', 'Beast Master')
    expect(
      await within(await screen.findByRole('dialog')).findByRole('heading', {
        name: "Choose Ranger's Companion",
      }),
    ).toBeTruthy()
    fireEvent.click(await row('Wolf'))
    await confirm()
    expect(screen.queryByRole('group', { name: "Ranger's Companion" })).toBeNull()
    expect(
      within(screen.getByRole('group', { name: 'Ranger Archetype' })).getByRole('button', {
        name: 'Wolf',
      }),
    ).toBeTruthy()
    const reopened = characterPersistenceSchema.parse(JSON.parse(JSON.stringify(active())))
    expect(reopened.classChoiceSelections).toEqual(active().classChoiceSelections)
    expect(reopened.classChoiceSelections?.[0]).toMatchObject({
      className: 'Ranger',
      classSource: 'PHB',
      subclassName: 'Beast Master',
      subclassSource: 'PHB',
      classLevel: 3,
      selected: [{ name: 'Wolf', source: 'MM', slotLevel: 3 }],
    })
    expect(active().features).toEqual(character.features)
  },
)

test.runIf(rangerAvailable)(
  'strictly reopened actual classic companion unchanged Edit preserves bytes, dirty state and manual features',
  async () => {
    const { data, character } = classicCompanionFixture()
    const classData = data.classes.find((row) => row.name === 'Ranger' && row.source === 'PHB')!
    const subclass = classData.subclasses!.find(
      (row) => row.name === 'Beast Master' && row.source === 'PHB',
    )!
    const choice = subclass.normalizedRules!.choices.find(
      (row) => row.label === "Ranger's Companion",
    )!
    const catalogs = {
      ...createClassChoiceCatalogs(buildClassChoiceFeatureCatalogs(data)),
      creatures: data.creatures ?? [],
    }
    const wolf = resolveClassChoiceOptions(choice, catalogs).find(
      (option) => option.reference.name === 'Wolf' && option.reference.source === 'MM',
    )!
    expect(wolf.availability).toBe('eligible')
    const selected = {
      ...character,
      classProgression: character.classProgression.map((entry) => ({
        ...entry,
        subclass: 'Beast Master',
        subclassSource: 'PHB',
      })),
    }
    const result = applyClassChoiceSelectionWithGrantsCommand(
      selected,
      selected.provenance!,
      choice,
      [wolf.reference],
    )
    const reopened = characterPersistenceSchema.parse(
      JSON.parse(
        JSON.stringify({
          ...selected,
          ...result.characterPatch,
          provenance: result.provenanceUpdate,
        }),
      ),
    )
    mount(data, reopened)
    await expand(3)
    const bytes = JSON.stringify(active())
    await act(async () => {
      await useCharacterStore.setState({ isActiveCharacterDirty: false })
    })
    fireEvent.click(screen.getByRole('button', { name: "Edit Ranger's Companion" }))
    await confirm()
    expect(JSON.stringify(active())).toBe(bytes)
    expect(active().classChoiceSelections).toEqual(reopened.classChoiceSelections)
    expect(useCharacterStore.getState().isActiveCharacterDirty).toBe(false)
    expect(active().features).toEqual(character.features)
  },
)

test.runIf(existsSync('data/class/class-sorcerer.json'))(
  'existing 2024 source policy does not offer a replaced legacy subclass or launch its setup',
  async () => {
    const document = JSON.parse(readFileSync('data/class/class-sorcerer.json', 'utf8'))
    const data = makeGameDataFixture({
      classes: parseClasses(document) as Class5e[],
      classFeatures: parseClassFeatures(document) as ClassFeature[],
    })
    data.lookups = buildGameDataLookups(data)
    const character = makeCharacterFixture({
      originSystem: '2024',
      allowedSources: ['PHB', 'XPHB'],
      classProgression: [{ name: 'Sorcerer', source: 'XPHB', levels: 3 }],
    })
    mount(data, character)
    await expand(3)
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Sorcerer Subclass' })).getByRole('button', {
        name: 'Choose',
      }),
    )
    fireEvent.change(modal().getByPlaceholderText('Search available options'), {
      target: { value: 'Draconic Bloodline' },
    })
    expect(modal().queryByRole('button', { name: /^Draconic Bloodline/ })).toBeNull()
    fireEvent.click(footer('Cancel'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(active().classProgression).toEqual(character.classProgression)
    expect(active().classChoiceSelections ?? []).toEqual([])
  },
)

test
  .runIf(
    rangerAvailable &&
      existsSync('data/bestiary/bestiary-tce.json') &&
      existsSync('data/bestiary/bestiary-xphb.json'),
  )
  .each([
    ['PHB', 'PHB', 'TCE', 'Ranger Archetype', true],
    ['XPHB', 'XPHB', 'XPHB', 'Ranger Subclass', false],
  ] as const)(
  'actual %s/%s Primal Companion keeps an independent rest-changing picker',
  async (classSource, subclassSource, creatureSource, parent, optional) => {
    const document = JSON.parse(readFileSync('data/class/class-ranger.json', 'utf8'))
    const parsed = parseClassDocument(document)
    const data = makeGameDataFixture({
      classes: parsed.classes as Class5e[],
      classFeatures: parsed.classFeatures as ClassFeature[],
      optionalClassFeatureSources: parsed.optionalClassFeatureSources,
      creatures: parseCreatures(
        JSON.parse(
          readFileSync(`data/bestiary/bestiary-${creatureSource.toLowerCase()}.json`, 'utf8'),
        ),
      ),
    })
    data.lookups = buildGameDataLookups(data)
    const character = makeCharacterFixture({
      originSystem: classSource === 'PHB' ? '2014' : '2024',
      allowedSources: ['PHB', creatureSource],
      classProgression: [{ name: 'Ranger', source: classSource, levels: 3 }],
    })
    character.variantRules = { ...character.variantRules, optionalClassFeatures: optional }
    mount(data, character)
    await expand(3)
    await pickSubclass(parent, 'Beast Master')
    if (optional) {
      expect(active().optionalClassFeatureAdoptions ?? []).toEqual([])
      expect(await screen.findByRole('heading', { name: "Choose Ranger's Companion" })).toBeTruthy()
      fireEvent.click(footer('Cancel'))
      fireEvent.mouseDown(screen.getByRole('tab', { name: 'Primal Companion' }), {
        button: 0,
        ctrlKey: false,
      })
      expect(active().optionalClassFeatureAdoptions).toHaveLength(1)
    }
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(
      within(screen.getByRole('group', { name: parent })).queryByRole('button', {
        name: /Primal Companion/,
      }),
    ).toBeNull()
    const choice = within(screen.getByRole('group', { name: 'Primal Companion' }))
    fireEvent.click(choice.getByRole('button', { name: 'Choose' }))
    fireEvent.click(await row('Beast of the Land'))
    await confirm()
    expect(
      active().classChoiceSelections?.find((selection) => selection.label === 'Primal Companion'),
    ).toMatchObject({
      subclassSource,
      selected: [{ name: 'Beast of the Land', source: creatureSource }],
    })
  },
)
