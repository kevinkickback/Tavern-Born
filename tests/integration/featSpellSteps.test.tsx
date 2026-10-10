import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { FeatOptionsModal } from '@/components/modals/FeatOptionsModal'
import { TooltipProvider } from '@/components/ui/tooltip'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { commitFeatOptionsCommand } from '@/lib/character/commands/featCommands'
import { createIdbStorage } from '@/lib/storage/idb-storage'
import { FeatsPage } from '@/pages/feats/FeatsPage'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Feat5e, Spell5e } from '@/types/5etools'
import type { Character, FeatOptionSelections } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeGameDataFixture, makeSpellFixture } from '../fixtures/gameDataFixtures'

vi.unmock('@/lib/storage/idb-storage')

const spark = makeSpellFixture({ name: 'Spark', source: 'TEST', level: 0 })
const ray = makeSpellFixture({ name: 'Ray', source: 'TEST', level: 1 })
const replacement = { ...spark, name: 'Other Spark' }
const feat: Feat5e = {
  name: 'Training',
  source: 'TEST',
  entries: [],
  additionalSpells: [
    {
      known: {
        _: [
          { choose: 'level=0', count: 1 },
          { choose: 'level=1', count: 1 },
        ],
      },
    },
  ],
}
const saved = { spells: [' spark | test ', '{@spell Ray|TEST|My ray}'] }
const reader = createIdbStorage<{ characters: Character[] }>()

function catalog(
  record = feat,
  spells: Spell5e[] = [spark, ray, replacement],
  otherFeats: Feat5e[] = [],
) {
  const data = makeGameDataFixture({ feats: [record, ...otherFeats], spells })
  act(() => {
    useGameDataStore.setState({
      gameData: { ...data, lookups: buildGameDataLookups(data) },
      isLoading: false,
      error: null,
    })
  })
}
function modal(initialSelections: FeatOptionSelections = saved, record = feat) {
  const onFinish = vi.fn()
  render(
    <FeatOptionsModal
      open
      onOpenChange={vi.fn()}
      feat={record}
      initialSelections={initialSelections}
      onFinish={onFinish}
    />,
  )
  return onFinish
}
function controls() {
  const dialog = screen.queryByRole('dialog')
  return dialog ? within(dialog) : screen
}
function click(name: RegExp) {
  fireEvent.click(controls().getByRole('button', { name }))
}
function box(name: RegExp) {
  return controls().getByRole('checkbox', { name })
}
function checked(name: RegExp, value = true) {
  expect(box(name).getAttribute('aria-checked')).toBe(String(value))
}
function enabled(name: RegExp, value = true) {
  expect(controls().getByRole('button', { name }).hasAttribute('disabled')).toBe(!value)
}
function openEdit() {
  click(/^Edit Setup$/)
  click(/^Continue$/)
}
function page() {
  render(
    <TooltipProvider>
      <MemoryRouter>
        <FeatsPage />
      </MemoryRouter>
    </TooltipProvider>,
  )
}

beforeEach(async () => {
  await vi.waitFor(() => expect(useCharacterStore.persist.hasHydrated()).toBe(true))
  await useCharacterStore.persist.clearStorage()
  const character = makeCharacterFixture({ allowedSources: ['TEST'] })
  useCharacterStore.setState({
    characters: [],
    activeCharacter: character,
    activeCharacterId: character.id,
    isActiveCharacterDirty: false,
    unsupportedCharacters: [],
  })
  catalog()
})

test('a no-choice new setup is dismissible and cannot commit empty choices', () => {
  const onFinish = modal({}, { name: feat.name, source: feat.source, entries: [] })
  expect(screen.getByRole('dialog')).toBeTruthy()
  expect(screen.getByText(/have no setup choices/)).toBeTruthy()
  expect(screen.queryByRole('button', { name: /Clear saved setup|Finish/ })).toBeNull()
  click(/^Cancel$/)
  expect(onFinish).not.toHaveBeenCalled()
})

test.each([
  false,
  true,
])('zero-step recovery preserves on dismissal, restores choices and clears only its owner durably (fixed=%s)', async (fixedGrant) => {
  const originalRules: Feat5e = fixedGrant
    ? {
        ...feat,
        additionalSpells: [
          {
            name: 'Wizard',
            known: {
              _: [
                { choose: 'level=0', count: 1 },
                { choose: 'level=1', count: 1 },
              ],
            },
          },
          { name: 'Bard', known: { _: [{ choose: 'level=0', count: 1 }] } },
        ],
      }
    : feat
  const noChoices: Feat5e = fixedGrant
    ? {
        ...feat,
        additionalSpells: [
          { name: 'Wizard' },
          { name: 'Bard', known: { _: [{ choose: 'level=0' }] } },
        ],
      }
    : { name: feat.name, source: feat.source, entries: [] }
  const priorOptions: FeatOptionSelections = {
    ...saved,
    ...(fixedGrant ? { spellcastingClass: 'Wizard' } : {}),
    skills: ['Arcana', 'History'],
    languages: ['Elvish', 'Dwarvish'],
    tools: ['Lute'],
    abilityScore: 'wis',
    optionalFeature: 'Guard',
    expertiseSkill: 'History',
  }
  const independentOptions: FeatOptionSelections = {
    spells: ['Spark|TEST', 'Ray|OTHER'],
    skills: ['Arcana'],
    languages: ['Elvish'],
    tools: ['Flute'],
    abilityScore: 'int',
    optionalFeature: 'Other Guard',
  }
  const otherRay = { ...ray, source: 'OTHER' }
  let original = makeCharacterFixture({
    allowedSources: ['TEST', 'OTHER'],
    background: 'Scholar',
    backgroundSource: 'TEST',
    feats: [
      ...(!fixedGrant
        ? [{ id: 'training', name: feat.name, source: feat.source, description: '' }]
        : []),
      { id: 'companion', name: 'Companion', source: 'TEST', description: '' },
    ],
  })
  if (fixedGrant)
    original.provenance.feats.training = [
      {
        sourceType: 'background',
        sourceName: 'Scholar',
        sourceRef: 'TEST',
        grantSource: 'TEST',
        grantType: 'fixed',
        grantVariant: 'Wizard',
        label: 'Scholar',
      },
    ]
  const independent = commitFeatOptionsCommand(
    original,
    original.provenance,
    { name: 'Companion', source: 'TEST' },
    independentOptions,
    [spark, otherRay],
  )
  original = {
    ...original,
    ...independent.characterPatch,
    provenance: independent.provenanceUpdate,
  }
  const configured = commitFeatOptionsCommand(
    original,
    original.provenance,
    {
      name: feat.name,
      source: feat.source,
      fixedGrant,
      grantVariant: fixedGrant ? 'Wizard' : undefined,
    },
    priorOptions,
    [spark, ray],
  )
  original = characterPersistenceSchema.parse({
    ...original,
    ...configured.characterPatch,
    provenance: configured.provenanceUpdate,
  })
  useCharacterStore.setState({ activeCharacter: null, activeCharacterId: null })
  await useCharacterStore.getState().importCharacters([original])
  useCharacterStore.getState().setActiveCharacter(original.id)
  // A competing feat printing still has choices; exact spells may be entirely unavailable.
  catalog(noChoices, [otherRay], [{ ...originalRules, source: 'OTHER' }])
  page()
  const before = useCharacterStore.getState().activeCharacter
  openEdit()
  expect(screen.getByText(/Current rules for Training \(TEST\) have no setup choices/)).toBeTruthy()
  expect(controls().getByText('spark (test), Ray (TEST)')).toBeTruthy()
  expect(controls().getByText('Arcana, History')).toBeTruthy()
  expect(controls().getByText('Wisdom')).toBeTruthy()
  if (fixedGrant) expect(controls().getByText('Wizard')).toBeTruthy()
  expect(screen.queryByRole('combobox')).toBeNull()
  expect(useCharacterStore.getState().activeCharacter).toBe(before)
  expect(useCharacterStore.getState().isActiveCharacterDirty).toBe(false)
  click(/^Cancel$/)
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(useCharacterStore.getState().activeCharacter).toBe(before)
  openEdit()
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(useCharacterStore.getState().activeCharacter).toBe(before)
  openEdit()
  click(/^Close$/)
  expect(useCharacterStore.getState().activeCharacter).toBe(before)
  expect(useCharacterStore.getState().isActiveCharacterDirty).toBe(false)
  // Restored rules are picked up on reopening, without rewriting the literal saved references.
  catalog(originalRules)
  openEdit()
  checked(/^Spark/)
  click(/Next/)
  checked(/^Ray/)
  click(/^Close$/)
  expect(useCharacterStore.getState().activeCharacter).toBe(before)
  catalog(noChoices, [otherRay])
  openEdit()
  click(/^Clear saved setup$/)
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(useCharacterStore.getState().isActiveCharacterDirty).toBe(true)
  await act(async () => {
    await useCharacterStore.getState().saveActiveCharacter()
  })
  const durable = (await reader.getItem('character-storage'))?.state.characters[0]
  expect(durable).toBeTruthy()
  const options = fixedGrant
    ? durable?.fixedFeatOptions?.['training|test|wizard']
    : durable?.feats[0].options
  expect(options).toEqual({})
  expect(durable?.feats.find((entry) => entry.name === 'Companion')?.options).toEqual(
    independentOptions,
  )
  expect(durable?.spells.spellProfiles.find((entry) => entry.type === 'special')).toMatchObject({
    cantrips: ['Spark|TEST'],
    spellsKnown: ['Ray|OTHER'],
    fixedSpells: ['Spark|TEST', 'Ray|OTHER'],
  })
  expect(durable?.provenance.spells).toEqual(independent.provenanceUpdate.spells)
  expect(durable?.provenance.abilityBonuses).toEqual(independent.provenanceUpdate.abilityBonuses)
  expect(durable?.provenance.proficiencies).toEqual({
    ...independent.provenanceUpdate.proficiencies,
    expertise: independent.provenanceUpdate.proficiencies.expertise ?? {},
  })
  expect(durable?.provenance.features).toEqual(independent.provenanceUpdate.features)
  expect(durable?.proficiencies).toEqual(independent.characterPatch.proficiencies)
  if (fixedGrant) expect(durable?.provenance.feats).toEqual(original.provenance.feats)
  else expect(durable?.feats[0]).toMatchObject({ name: feat.name, source: feat.source })
  cleanup()
  await act(async () => {
    useCharacterStore.getState().setActiveCharacter(null)
    await useCharacterStore.persist.rehydrate()
    useCharacterStore.getState().setActiveCharacter(original.id)
  })
  expect(useCharacterStore.getState().unsupportedCharacters).toEqual([])
  expect(useCharacterStore.getState().activeCharacter).toEqual(durable)
  page()
  openEdit()
  expect(screen.queryByRole('button', { name: /^Clear saved setup$/ })).toBeNull()
  click(/^Cancel$/)
  catalog(originalRules)
  openEdit()
  checked(/^Spark/, false)
  expect(controls().getByRole('button', { name: /Next/ }).hasAttribute('disabled')).toBe(true)
})
afterEach(cleanup)

test('unchanged multi-step Finish retains each literal once', () => {
  const onFinish = modal(saved)
  expect(screen.getByText('(1/1 chosen)')).toBeTruthy()
  checked(/^Spark/)
  expect(screen.queryByRole('checkbox', { name: /^Ray/ })).toBeNull()
  click(/Next/)
  checked(/^Ray/)
  expect(screen.getByText('(1/1 chosen)')).toBeTruthy()
  click(/Back/)
  checked(/^Spark/)
  click(/Next/)
  click(/Finish/)
  expect(onFinish).toHaveBeenCalledExactlyOnceWith(saved)
})

test('overlapping filters do not strand a valid saved set or allow the same reference twice', () => {
  const overlap = {
    ...feat,
    additionalSpells: [
      {
        known: {
          _: [
            { choose: 'level=0;1', count: 1 },
            { choose: 'level=0', count: 1 },
          ],
        },
      },
    ],
  }
  catalog(overlap)
  const onFinish = modal(saved, overlap)
  checked(/^Ray/)
  expect(box(/^Spark/).hasAttribute('disabled')).toBe(true)
  fireEvent.click(box(/^Ray/))
  expect(box(/^Spark/).hasAttribute('disabled')).toBe(true)
  fireEvent.click(box(/^Other Spark/))
  click(/Next/)
  checked(/^Spark/)
  click(/Finish/)
  expect(onFinish).toHaveBeenCalledExactlyOnceWith({
    spells: [' spark | test ', 'Other Spark|TEST'],
  })
})

test('missing exact data stays recoverable through restoration', () => {
  catalog(feat, [{ ...spark, source: 'OTHER', level: 1 }, ray, replacement])
  const onFinish = modal(saved)
  expect(screen.getByRole('button', { name: 'Remove saved choice: spark (test)' })).toBeTruthy()
  expect(screen.getByText('Saved spells need attention')).toBeTruthy()
  enabled(/Next/, false)
  catalog()
  fireEvent.click(box(/^Spark/))
  expect(screen.queryByText('Saved spells need attention')).toBeNull()
  click(/Next/)
  checked(/^Ray/)
  click(/Finish/)
  expect(onFinish).toHaveBeenCalledExactlyOnceWith(saved)
})

test('replacing unavailable data requires explicit removal of the unplaced saved choice', () => {
  catalog(feat, [ray, replacement])
  const onFinish = modal()
  fireEvent.click(box(/^Other Spark/))
  click(/Next/)
  enabled(/Finish/, false)
  click(/^Remove saved choice: spark/)
  enabled(/Finish/)
  click(/Finish/)
  expect(onFinish).toHaveBeenCalledExactlyOnceWith({
    spells: ['{@spell Ray|TEST|My ray}', 'Other Spark|TEST'],
  })
})

test('a catalog refresh after Next cannot allow Finish with unavailable prior-step data', () => {
  const onFinish = modal()
  click(/Next/)
  catalog(feat, [ray, replacement])
  enabled(/Finish/, false)
  click(/Back/)
  fireEvent.click(box(/Spell data unavailable/))
  fireEvent.click(box(/^Other Spark/))
  click(/Next/)
  click(/Finish/)
  expect(onFinish).toHaveBeenCalledExactlyOnceWith({
    spells: ['{@spell Ray|TEST|My ray}', 'Other Spark|TEST'],
  })
})

test('normalized duplicate saved references remain checked once and removable', () => {
  const onFinish = modal({ spells: [' spark | test ', 'Spark|TEST', 'Ray|TEST'] })
  checked(/^Spark/)
  expect(screen.getAllByRole('checkbox', { name: /^Spark/ })).toHaveLength(1)
  fireEvent.click(box(/^Spark/))
  enabled(/Next/, false)
  fireEvent.click(box(/^Other Spark/))
  click(/Next/)
  click(/Finish/)
  expect(onFinish).toHaveBeenCalledExactlyOnceWith({ spells: ['Ray|TEST', 'Other Spark|TEST'] })
})

test('a newly chosen spell remains removable if its exact data disappears before Finish', () => {
  const onFinish = modal({ spells: ['Ray|TEST'] })
  fireEvent.click(box(/^Spark/))
  catalog(feat, [ray, replacement])
  checked(/Spell data unavailable: Spark/)
  enabled(/Next/, false)
  fireEvent.click(box(/Spell data unavailable: Spark/))
  fireEvent.click(box(/^Other Spark/))
  click(/Next/)
  click(/Finish/)
  expect(onFinish).toHaveBeenCalledExactlyOnceWith({ spells: ['Ray|TEST', 'Other Spark|TEST'] })
})

test('changing class resets spell steps and preserves later non-spell choices after step counts change', () => {
  const classFeat: Feat5e = {
    ...feat,
    ability: [{ choose: { from: ['int', 'wis'], count: 1 } }],
    additionalSpells: [
      {
        name: 'Wizard',
        known: {
          _: [
            { choose: 'level=0|class=Wizard', count: 1 },
            { choose: 'level=1|class=Wizard', count: 1 },
          ],
        },
      },
      { name: 'Bard', known: { _: [{ choose: 'level=0|class=Bard', count: 1 }] } },
    ],
  }
  const song = {
    ...spark,
    name: 'Song',
    classes: { fromClassList: [{ name: 'Bard', source: 'PHB' }] },
  }
  catalog(
    classFeat,
    [spark, ray]
      .map((s) => ({ ...s, classes: { fromClassList: [{ name: 'Wizard', source: 'PHB' }] } }))
      .concat(song),
  )
  const onFinish = modal({ ...saved, spellcastingClass: 'Wizard', abilityScore: 'int' }, classFeat)
  fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' })
  fireEvent.click(screen.getByRole('option', { name: 'Bard' }))
  click(/Next/)
  expect(screen.getByText('Song')).toBeTruthy()
  expect(screen.queryByText('(1/1 chosen)')).toBeNull()
  enabled(/Next/, false)
  fireEvent.click(box(/^Song/))
  click(/Next/)
  enabled(/Finish/)
  click(/Finish/)
  expect(onFinish).toHaveBeenCalledExactlyOnceWith({
    spellcastingClass: 'Bard',
    spells: ['Song|TEST'],
    abilityScore: 'int',
  })
})

test('a fixed casting class assigns multiple spell steps without exposing another class', () => {
  const classFeat: Feat5e = {
    ...feat,
    additionalSpells: [
      {
        name: 'Wizard',
        known: {
          _: [
            { choose: 'level=0|class=Wizard', count: 1 },
            { choose: 'level=1|class=Wizard', count: 1 },
          ],
        },
      },
      { name: 'Bard', known: { _: [{ choose: 'level=0|class=Bard', count: 1 }] } },
    ],
  }
  catalog(
    classFeat,
    [spark, ray].map((spell) => ({
      ...spell,
      classes: { fromClassList: [{ name: 'Wizard', source: 'PHB' }] },
    })),
  )
  const onFinish = vi.fn()
  render(
    <FeatOptionsModal
      open
      onOpenChange={vi.fn()}
      feat={classFeat}
      fixedSpellcastingClass="Wizard"
      initialSelections={{ ...saved, spellcastingClass: 'Wizard' }}
      onFinish={onFinish}
    />,
  )
  expect(screen.queryByRole('combobox')).toBeNull()
  checked(/^Spark/)
  click(/Next/)
  checked(/^Ray/)
  click(/Finish/)
  expect(onFinish).toHaveBeenCalledExactlyOnceWith({ ...saved, spellcastingClass: 'Wizard' })
})

test.each([
  false,
  true,
])('page edit, replacement and durable reopen preserve separate owners (fixed=%s)', async (fixedGrant) => {
  let original = makeCharacterFixture({
    allowedSources: ['TEST'],
    background: 'Scholar',
    backgroundSource: 'TEST',
    feats: fixedGrant
      ? []
      : [{ id: 'training-test', name: feat.name, source: feat.source, description: '' }],
  })
  if (fixedGrant)
    original.provenance.feats.training = [
      {
        sourceType: 'background',
        sourceName: 'Scholar',
        sourceRef: 'TEST',
        grantSource: 'TEST',
        grantType: 'fixed',
        label: 'Scholar',
      },
    ]
  const other = commitFeatOptionsCommand(
    original,
    original.provenance,
    { name: 'Companion', source: 'TEST' },
    { spells: ['Spark|TEST'] },
    [spark],
  )
  original = { ...original, ...other.characterPatch, provenance: other.provenanceUpdate }
  const configured = commitFeatOptionsCommand(
    original,
    original.provenance,
    { name: feat.name, source: feat.source, fixedGrant },
    saved,
    [spark, ray],
  )
  original = characterPersistenceSchema.parse({
    ...original,
    ...configured.characterPatch,
    provenance: configured.provenanceUpdate,
  })
  useCharacterStore.setState({ activeCharacter: null, activeCharacterId: null })
  await useCharacterStore.getState().importCharacters([original])
  useCharacterStore.getState().setActiveCharacter(original.id)
  page()
  openEdit()
  checked(/^Spark/)
  click(/Next/)
  checked(/^Ray/)
  click(/Finish/)
  expect(useCharacterStore.getState().activeCharacter?.provenance).toEqual(original.provenance)
  await act(async () => {
    await useCharacterStore.getState().saveActiveCharacter()
  })
  expect((await reader.getItem('character-storage'))?.state.characters[0].spells).toEqual(
    original.spells,
  )
  cleanup()
  await act(async () => {
    useCharacterStore.getState().setActiveCharacter(null)
    await useCharacterStore.persist.rehydrate()
    useCharacterStore.getState().setActiveCharacter(original.id)
  })
  expect(useCharacterStore.getState().unsupportedCharacters).toEqual([])
  page()
  openEdit()
  checked(/^Spark/)
  fireEvent.click(box(/^Spark/))
  fireEvent.click(box(/^Other Spark/))
  click(/Next/)
  checked(/^Ray/)
  click(/Finish/)
  await act(async () => {
    await useCharacterStore.getState().saveActiveCharacter()
  })
  const durable = (await reader.getItem('character-storage'))?.state.characters[0]
  expect(durable?.provenance.spells.spark).toEqual([
    expect.objectContaining({ sourceName: 'Companion', grantSource: 'TEST' }),
  ])
  expect(durable?.spells.spellProfiles.find((p) => p.type === 'special')?.cantrips).toEqual([
    'Spark|TEST',
    'Other Spark|TEST',
  ])
  const options = fixedGrant
    ? durable?.fixedFeatOptions?.['training|test|']
    : durable?.feats[0].options
  expect(options).toEqual({ spells: ['{@spell Ray|TEST|My ray}', 'Other Spark|TEST'] })
})
