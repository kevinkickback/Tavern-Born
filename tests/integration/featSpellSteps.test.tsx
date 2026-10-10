import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { FeatOptionsModal } from '@/components/modals/FeatOptionsModal'
import { TooltipProvider } from '@/components/ui/tooltip'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import {
  clearFeatOptionsCommand,
  commitFeatOptionsCommand,
  replaceBonusFeatSelectionsCommand,
  replaceFeatSelectionsCommand,
} from '@/lib/character/commands/featCommands'
import { applyFeatGrant } from '@/lib/provenance'
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

function selectedCharacterFixture(overrides: Partial<Character>) {
  const character = makeCharacterFixture(overrides)
  for (const [records, kind] of [
    [character.feats, 'ordinary'],
    [character.specialFeats ?? [], 'bonus'],
  ] as const) {
    for (const record of records)
      character.provenance = applyFeatGrant(
        character.provenance,
        record.name,
        record.source,
        true,
        kind,
      )
  }
  return character
}

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
function openEdit(name = feat.name) {
  const card = screen.getByRole('button', { name: `Select ${name}` }).parentElement!
  fireEvent.click(within(card).getByRole('button', { name: /^Edit Setup$/ }))
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

test('saved zero-step setup requires an explicit clear callback instead of borrowing Finish', () => {
  const onFinish = modal(saved, { name: feat.name, source: feat.source, entries: [] })
  expect(controls().getByText('spark (test), Ray (TEST)')).toBeTruthy()
  expect(screen.queryByRole('button', { name: /Clear saved setup|Finish/ })).toBeNull()
  click(/^Cancel$/)
  expect(onFinish).not.toHaveBeenCalled()
})

async function recoveryPage(fixedGrant: boolean, renderPage = true) {
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
  let original = selectedCharacterFixture({
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
    { name: 'Companion', source: 'TEST', selectionKind: 'ordinary' },
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
      selectionKind: fixedGrant ? undefined : 'ordinary',
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
  if (renderPage) page()
  return {
    before: useCharacterStore.getState().activeCharacter,
    original,
    originalRules,
    noChoices,
    otherRay,
    independent,
    independentOptions,
  }
}

test.each([
  false,
  true,
])('zero-step Cancel, Escape and Close preserve the original setup (fixed=%s)', async (fixedGrant) => {
  const { before } = await recoveryPage(fixedGrant)
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
})

test.each([
  false,
  true,
])('restoring rules after zero-step recovery retains literal saved choices (fixed=%s)', async (fixedGrant) => {
  const { before, originalRules } = await recoveryPage(fixedGrant)
  openEdit()
  click(/^Cancel$/)
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(useCharacterStore.getState().activeCharacter).toBe(before)
  // Restored rules are picked up on reopening, without rewriting the literal saved references.
  catalog(originalRules)
  openEdit()
  checked(/^Spark/)
  click(/Next/)
  checked(/^Ray/)
  click(/^Close$/)
  expect(useCharacterStore.getState().activeCharacter).toBe(before)
  expect(useCharacterStore.getState().isActiveCharacterDirty).toBe(false)
})

test.each([
  false,
  true,
])('zero-step clear saves only its owner removal and preserves independent benefits (fixed=%s)', async (fixedGrant) => {
  const { original, noChoices, otherRay, independent, independentOptions } =
    await recoveryPage(fixedGrant)
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
})

test.each([
  false,
  true,
])('cleared zero-step setup reopens durably and restored choices start empty (fixed=%s)', async (fixedGrant) => {
  const { original, originalRules } = await recoveryPage(fixedGrant, false)
  const result = clearFeatOptionsCommand(
    original,
    original.provenance,
    {
      name: feat.name,
      source: feat.source,
      fixedGrant,
      grantVariant: fixedGrant ? 'Wizard' : undefined,
      selectionKind: fixedGrant ? undefined : 'ordinary',
    },
    {},
  )
  await act(async () => {
    await useCharacterStore.getState().updateCharacter(original.id, {
      ...result.characterPatch,
      provenance: result.provenanceUpdate,
    })
    await useCharacterStore.getState().saveActiveCharacter()
  })
  const durable = (await reader.getItem('character-storage'))?.state.characters[0]
  expect(durable).toBeTruthy()
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

test.each([
  'ordinary',
  'bonus',
] as const)('normal Complete Setup and Finish use only the requested copy through durable reopen: %s', async (selectionKind) => {
  let character = makeCharacterFixture({ allowedSources: ['TEST'] })
  for (const select of [replaceFeatSelectionsCommand, replaceBonusFeatSelectionsCommand]) {
    const result = select(character, character.provenance, [feat])
    character = { ...character, ...result.characterPatch, provenance: result.provenanceUpdate }
  }
  const independentKind = selectionKind === 'ordinary' ? 'bonus' : 'ordinary'
  const independentOptions = { spells: ['Other Spark|TEST', 'Ray|TEST'] }
  const result = commitFeatOptionsCommand(
    character,
    character.provenance,
    { ...feat, selectionKind: independentKind },
    independentOptions,
    [replacement, ray],
  )
  character = characterPersistenceSchema.parse({
    ...character,
    ...result.characterPatch,
    provenance: result.provenanceUpdate,
  })
  await useCharacterStore.getState().importCharacters([character])
  useCharacterStore.getState().setActiveCharacter(character.id)
  page()
  fireEvent.click(
    screen.getByRole('tab', { name: selectionKind === 'bonus' ? /^Bonus/ : /^Character/ }),
  )
  click(/^Complete Setup$/)
  fireEvent.click(box(/^Spark/))
  click(/Next/)
  fireEvent.click(box(/^Ray/))
  click(/Finish/)
  const configured = useCharacterStore.getState().activeCharacter!
  expect(configured.feats[0].options).toEqual(
    selectionKind === 'ordinary' ? { spells: ['Spark|TEST', 'Ray|TEST'] } : independentOptions,
  )
  expect(configured.specialFeats?.[0].options).toEqual(
    selectionKind === 'bonus' ? { spells: ['Spark|TEST', 'Ray|TEST'] } : independentOptions,
  )
  expect(configured.provenance.spells.ray).toHaveLength(2)
  expect(configured.provenance.spells.spark[0].grantVariant).toBe(`selection:${selectionKind}`)
  await act(async () => {
    await useCharacterStore.getState().saveActiveCharacter()
  })
  const durable = (await reader.getItem('character-storage'))?.state.characters[0]
  expect(characterPersistenceSchema.parse(durable)).toEqual({
    ...configured,
    lastModified: durable?.lastModified,
  })
  await act(async () => {
    await useCharacterStore.persist.rehydrate()
  })
  expect(useCharacterStore.getState().characters[0]).toEqual(durable)
})

test.each([
  'ordinary',
  'bonus',
] as const)('an unavailable feat retains recovery and clears only its saved copy: %s', (selectionKind) => {
  let character = makeCharacterFixture({ allowedSources: ['TEST'] })
  for (const select of [replaceFeatSelectionsCommand, replaceBonusFeatSelectionsCommand]) {
    const result = select(character, character.provenance, [feat])
    character = { ...character, ...result.characterPatch, provenance: result.provenanceUpdate }
  }
  for (const kind of ['ordinary', 'bonus'] as const) {
    const result = commitFeatOptionsCommand(
      character,
      character.provenance,
      { ...feat, selectionKind: kind },
      saved,
      [spark, ray],
    )
    character = { ...character, ...result.characterPatch, provenance: result.provenanceUpdate }
  }
  useCharacterStore.setState({ activeCharacter: character })
  const data = makeGameDataFixture({ feats: [], spells: [] })
  useGameDataStore.setState({ gameData: { ...data, lookups: buildGameDataLookups(data) } })
  page()
  fireEvent.click(
    screen.getByRole('tab', { name: selectionKind === 'bonus' ? /^Bonus/ : /^Character/ }),
  )
  openEdit()
  click(/^Cancel$/)
  expect(useCharacterStore.getState().activeCharacter).toBe(character)
  openEdit()
  click(/^Clear saved setup$/)
  const cleared = useCharacterStore.getState().activeCharacter!
  expect(cleared.provenance.spells.spark).toHaveLength(1)
  expect(cleared.provenance.spells.spark[0].grantVariant).toBe(
    selectionKind === 'ordinary' ? 'selection:bonus' : 'selection:ordinary',
  )
  expect(characterPersistenceSchema.safeParse(cleared).success).toBe(true)
})

test('confirming the bonus picker without its catalog preserves the configured saved selection', () => {
  let character = makeCharacterFixture({ allowedSources: ['TEST'] })
  const selected = replaceBonusFeatSelectionsCommand(character, character.provenance, [feat])
  character = { ...character, ...selected.characterPatch, provenance: selected.provenanceUpdate }
  const configured = commitFeatOptionsCommand(
    character,
    character.provenance,
    { ...feat, selectionKind: 'bonus' },
    saved,
    [spark, ray],
  )
  character = characterPersistenceSchema.parse({
    ...character,
    ...configured.characterPatch,
    provenance: configured.provenanceUpdate,
  })
  useCharacterStore.setState({ activeCharacter: character })
  const data = makeGameDataFixture({ feats: [], spells: [] })
  useGameDataStore.setState({ gameData: { ...data, lookups: buildGameDataLookups(data) } })
  page()
  fireEvent.click(screen.getByRole('tab', { name: /^Bonus/ }))
  fireEvent.click(screen.getByRole('button', { name: /^Add Feat$/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
  const retained = useCharacterStore.getState().activeCharacter!
  expect(retained.specialFeats).toEqual(character.specialFeats)
  expect(retained.provenance).toEqual(character.provenance)
  expect(retained.spells).toEqual(character.spells)
  expect(characterPersistenceSchema.safeParse(retained).success).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Remove Training' }))
  const removed = useCharacterStore.getState().activeCharacter!
  expect(removed.specialFeats).toEqual([])
  expect(removed.provenance.spells.spark).toBeUndefined()
  expect(characterPersistenceSchema.safeParse(removed).success).toBe(true)
})

test.each([
  false,
  true,
])('zero-step clear retracts only the requested copy of the same printing (bonus=%s)', async (bonus) => {
  let character = selectedCharacterFixture({
    allowedSources: ['TEST'],
    feats: [{ id: 'ordinary', name: feat.name, source: feat.source, description: '' }],
    specialFeats: [{ id: 'bonus', name: feat.name, source: feat.source, description: '' }],
  })
  const bonusSaved = { spells: ['Spark|TEST'], skills: ['History'] }
  for (const [selectionKind, selections] of [
    ['ordinary', saved],
    ['bonus', bonusSaved],
  ] as const) {
    const result = commitFeatOptionsCommand(
      character,
      character.provenance,
      { ...feat, selectionKind },
      selections,
      [spark, ray],
    )
    character = characterPersistenceSchema.parse({
      ...character,
      ...result.characterPatch,
      provenance: result.provenanceUpdate,
    })
  }
  useCharacterStore.setState({ activeCharacter: null, activeCharacterId: null })
  await useCharacterStore.getState().importCharacters([character])
  useCharacterStore.getState().setActiveCharacter(character.id)
  catalog({ name: feat.name, source: feat.source, entries: [] })
  page()
  fireEvent.click(screen.getByRole('tab', { name: bonus ? /^Bonus/ : /^Character/ }))
  openEdit()
  enabled(/^Clear saved setup$/)
  click(/^Clear saved setup$/)
  const cleared = useCharacterStore.getState().activeCharacter!
  expect(cleared.feats[0].options).toEqual(bonus ? saved : {})
  expect(cleared.specialFeats?.[0].options).toEqual(bonus ? {} : bonusSaved)
  expect(cleared.provenance.spells.spark).toEqual([
    expect.objectContaining({ grantVariant: bonus ? 'selection:ordinary' : 'selection:bonus' }),
  ])
  expect(cleared.proficiencies.skills).toEqual(bonus ? [] : ['history'])
  expect(screen.queryByRole('dialog')).toBeNull()
  await act(async () => {
    await useCharacterStore.getState().saveActiveCharacter()
  })
  const durable = (await reader.getItem('character-storage'))?.state.characters[0]
  expect(characterPersistenceSchema.parse(durable)).toEqual({
    ...cleared,
    lastModified: durable?.lastModified,
  })
  await act(async () => {
    await useCharacterStore.persist.rehydrate()
  })
  expect(useCharacterStore.getState().characters[0]).toEqual(durable)
})

test('zero-step clear remains available for a standalone bonus setup', () => {
  const character = selectedCharacterFixture({
    allowedSources: ['TEST'],
    specialFeats: [{ id: 'bonus', name: feat.name, source: feat.source, description: '' }],
  })
  const result = commitFeatOptionsCommand(
    character,
    character.provenance,
    { ...feat, selectionKind: 'bonus' },
    saved,
    [spark, ray],
  )
  useCharacterStore.setState({
    activeCharacter: {
      ...character,
      ...result.characterPatch,
      provenance: result.provenanceUpdate,
    },
  })
  catalog({ name: feat.name, source: feat.source, entries: [] })
  page()
  fireEvent.click(screen.getByRole('tab', { name: /^Bonus/ }))
  openEdit()
  enabled(/^Clear saved setup$/)
  click(/^Clear saved setup$/)
  const cleared = useCharacterStore.getState().activeCharacter
  expect(cleared?.specialFeats?.[0].options).toEqual({})
  expect(
    cleared?.spells.spellProfiles.find((profile) => profile.type === 'special')?.cantrips,
  ).toEqual([])
  expect(cleared?.provenance.spells).toEqual({})
  expect(useCharacterStore.getState().isActiveCharacterDirty).toBe(true)
})

test.each([
  'source',
  'name',
])('zero-step clear preserves the distinct complete literal feat %s beside it', async (field) => {
  const selected = {
    name: field === 'name' ? 'Training|Selected' : 'Training',
    source: field === 'source' ? 'HB|Selected' : 'HB',
  }
  const other = {
    name: field === 'name' ? 'Training|Other' : 'Training',
    source: field === 'source' ? 'HB|Other' : 'HB',
  }
  let character = selectedCharacterFixture({
    allowedSources: [selected.source, other.source],
    feats: [{ ...selected, id: 'ordinary', description: '' }],
    specialFeats: [{ ...other, id: 'bonus', description: '' }],
  })
  for (const [target, skills] of [
    [{ ...selected, selectionKind: 'ordinary' }, ['Arcana']],
    [{ ...other, selectionKind: 'bonus' }, ['History']],
  ] as const) {
    const result = commitFeatOptionsCommand(character, character.provenance, target, {
      skills: [...skills],
    })
    character = { ...character, ...result.characterPatch, provenance: result.provenanceUpdate }
  }
  character = characterPersistenceSchema.parse(character)
  useCharacterStore.setState({ activeCharacter: null, activeCharacterId: null })
  await useCharacterStore.getState().importCharacters([character])
  useCharacterStore.getState().setActiveCharacter(character.id)
  catalog({ ...selected, entries: [] }, [], [{ ...other, entries: [] }])
  page()
  fireEvent.click(screen.getByRole('tab', { name: /^Character/ }))
  openEdit(selected.name)
  enabled(/^Clear saved setup$/)
  click(/^Clear saved setup$/)
  expect(screen.queryByRole('dialog')).toBeNull()
  const cleared = useCharacterStore.getState().activeCharacter
  expect(cleared?.feats[0].options).toEqual({})
  expect(cleared?.specialFeats?.[0].options).toEqual({ skills: ['History'] })
  expect(cleared?.proficiencies.skills).toEqual(['history'])
  expect(useCharacterStore.getState().isActiveCharacterDirty).toBe(true)
})

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

async function configuredEditCharacter(fixedGrant: boolean) {
  let original = selectedCharacterFixture({
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
    { name: 'Companion', source: 'TEST', fixedGrant: true },
    { spells: ['Spark|TEST'] },
    [spark],
  )
  original = { ...original, ...other.characterPatch, provenance: other.provenanceUpdate }
  const configured = commitFeatOptionsCommand(
    original,
    original.provenance,
    {
      name: feat.name,
      source: feat.source,
      fixedGrant,
      selectionKind: fixedGrant ? undefined : 'ordinary',
    },
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
  return original
}

test.each([
  false,
  true,
])('unchanged page edit and Finish save the literal choices and owners (fixed=%s)', async (fixedGrant) => {
  const original = await configuredEditCharacter(fixedGrant)
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
})

test.each([
  false,
  true,
])('page replacement after durable reopen preserves separate owners (fixed=%s)', async (fixedGrant) => {
  const original = await configuredEditCharacter(fixedGrant)
  await act(async () => {
    useCharacterStore.getState().setActiveCharacter(null)
    await useCharacterStore.persist.rehydrate()
    useCharacterStore.getState().setActiveCharacter(original.id)
  })
  expect(useCharacterStore.getState().unsupportedCharacters).toEqual([])
  expect(useCharacterStore.getState().activeCharacter?.spells).toEqual(original.spells)
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
