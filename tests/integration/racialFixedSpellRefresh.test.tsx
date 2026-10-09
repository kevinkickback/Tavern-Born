import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useCharacterActions } from '@/hooks/character/useCharacterActions'
import { useRaceProvenanceMutations } from '@/hooks/character/useRaceProvenanceMutations'
import { useSpellProfileMutations } from '@/hooks/character/useSpellProfileMutations'
import { useSpellSlots } from '@/hooks/character/useSpellSlots'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { parseRaces } from '@/lib/5etools/parsers/races'
import { buildInitialCharacter } from '@/lib/character/commands/originSelectionCommand'
import { addSpellToCharacter } from '@/lib/character/commands/spellCommands'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import { addSpellGrant, makeSourceTag } from '@/lib/provenance'
import { getSpellRows } from '@/lib/provenance/summaries'
import { SpellsPage } from '@/pages/spells/SpellsPage'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Race5e } from '@/types/5etools'
import type { SpellProfile } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { resetCharacterStore, setActiveCharacter } from '../fixtures/characterStoreFixtures'
import { makeGameDataFixture, makeSpellFixture } from '../fixtures/gameDataFixtures'

const lightBlock = { ability: 'int', known: { _: ['light|PHB#c'] } }

function owner(name: string, source: string, blocks?: unknown[]): Race5e {
  return parseRaces({
    race: [{ name, source, ...(blocks ? { additionalSpells: blocks } : {}) }],
  })[0] as Race5e
}

function native(childGrants = false, originSystem: '2014' | '2024' = '2014') {
  const child = owner('Fixed Child', 'CHILD', childGrants ? [lightBlock] : undefined)
  const parent = owner('Fixed Parent', 'PARENT', childGrants ? undefined : [lightBlock])
  parent.subraces = [child]
  const character = buildInitialCharacter(
    {
      initial: {
        name: 'Fixed spell caster',
        originSystem,
        allowedSources: ['PARENT', 'CHILD', 'PHB', 'TCE'],
      },
      race: parent,
      subrace: child,
    },
    new Map(),
    () => [],
  )
  return { parent, child, character }
}

function racial(profiles: SpellProfile[]) {
  return profiles.find((profile) => profile.type === 'racial')!
}

function install(races: Race5e[]) {
  const data = makeGameDataFixture({
    races,
    classes: [],
    spells: [
      makeSpellFixture({ name: 'Light', level: 0 }),
      makeSpellFixture({ name: 'Light', source: 'TCE', level: 0 }),
      makeSpellFixture({ name: 'Mage Hand', level: 0 }),
      makeSpellFixture({ name: 'Bonus', level: 0 }),
    ],
    sources: ['PARENT', 'CHILD', 'PHB', 'TCE'].map((abbreviation) => ({
      abbreviation,
      name: abbreviation,
      group: 'Test',
    })),
  })
  data.lookups = buildGameDataLookups(data)
  useGameDataStore.setState({ gameData: data })
  return data
}

function editing() {
  return renderHook(() => {
    const slots = useSpellSlots()
    return {
      slots,
      mutations: useSpellProfileMutations(slots.spellProfiles, slots.spellcastingDetailByProfileId),
      race: useRaceProvenanceMutations(),
    }
  })
}

function reopenedActive() {
  return characterPersistenceSchema.parse(
    JSON.parse(JSON.stringify(useCharacterStore.getState().activeCharacter)),
  )
}

beforeEach(() => {
  resetCharacterStore()
  useGameDataStore.setState({ gameData: null })
})
afterEach(() => {
  cleanup()
  resetCharacterStore()
  useGameDataStore.setState({ gameData: null })
  localStorage.clear()
})

test.each(
  (['2014', '2024'] as const).flatMap((edition) =>
    (['printing', 'add', 'remove'] as const).map((transition) => ({ edition, transition })),
  ),
)('actual Sources follows restored $transition rules before writes ($edition)', ({
  edition,
  transition,
}) => {
  const { character: initial, child } = native(false, edition)
  const added = addSpellToCharacter(
    initial,
    initial.provenance,
    'Light|TCE',
    'cantrip',
    'special:unrestricted',
    { sourceType: 'manual', sourceName: 'User Choice' },
  )
  const character = characterPersistenceSchema.parse({
    ...initial,
    ...added.characterPatch,
    provenance: addSpellGrant(
      added.provenanceUpdate,
      'Light|TCE',
      makeSourceTag('feat', 'Independent Feat', 'fixed', 'OTHER'),
    ),
  })
  setActiveCharacter(character)
  const original = structuredClone(character)
  install([])
  render(
    <TooltipProvider>
      <MemoryRouter>
        <SpellsPage />
      </MemoryRouter>
    </TooltipProvider>,
  )
  const refreshed = owner(
    'Fixed Parent',
    'PARENT',
    transition === 'remove'
      ? undefined
      : [
          {
            ability: 'int',
            known: {
              _: transition === 'printing' ? ['light|TCE#c'] : ['light|PHB#c', 'mage hand|PHB#c'],
            },
          },
        ],
  )
  refreshed.subraces = [child]
  act(() => {
    install([refreshed])
  })
  const trigger = screen.getByRole('button', { name: /Sources/ })
  fireEvent.click(trigger)
  const panel = document.getElementById(trigger.getAttribute('aria-controls')!)!
  expect(panel.textContent).toContain('Light (TCE)')
  expect(panel.textContent).toContain('feat')
  expect(panel.textContent).not.toContain('manual')
  if (transition === 'add') {
    expect(panel.textContent).toContain('Light (PHB)')
    expect(panel.textContent).toContain('Mage Hand (PHB)')
  } else {
    expect(panel.textContent).not.toContain('Light (PHB)')
    expect(panel.textContent).not.toContain('Mage Hand (PHB)')
  }
  expect(useCharacterStore.getState().activeCharacter).toEqual(original)
})

test.each([
  false,
  true,
])('Finish and reopen retain the actual fixed granting owner (%s)', (childGrants) => {
  const { character } = native(childGrants)
  const reopened = characterPersistenceSchema.parse(JSON.parse(JSON.stringify(character)))
  expect(racial(reopened.spells.spellProfiles).fixedSpells).toEqual(['light|PHB'])
  expect(racial(reopened.spells.spellProfiles).cantrips).toEqual(['light|PHB'])
  expect(reopened.provenance.spells.light[0].sourceType).toBe(childGrants ? 'subrace' : 'race')
  reopened.provenance.spells.light[0].sourceName = ` ${reopened.provenance.spells.light[0].sourceName.toUpperCase()} `
  reopened.provenance.spells.light[0].sourceRef = ` ${reopened.provenance.spells.light[0].sourceRef!.toLowerCase()} `
  reopened.provenance.spells.light[0].grantSource = ' phb '
  expect(characterPersistenceSchema.safeParse(reopened).success).toBe(true)
})

test.each([
  'absent',
  'manual',
  'class',
  'feat',
  'different-printing',
  'not-fixed',
] as const)('%s cannot authorize a saved racial fixed declaration', (mode) => {
  const { character } = native()
  if (mode === 'absent') delete character.provenance.spells.light
  else if (mode === 'different-printing') character.provenance.spells.light[0].grantSource = 'TCE'
  else if (mode === 'not-fixed') character.provenance.spells.light[0].grantType = 'placeholder'
  else
    Object.assign(character.provenance.spells.light[0], {
      sourceType: mode,
      sourceName: 'Independent',
      sourceRef: 'OTHER',
    })
  const original = structuredClone(character)
  expect(characterPersistenceSchema.safeParse(character).success).toBe(false)
  expect(character).toEqual(original)
})

test('complete owner literals normalize without truncation', () => {
  const parent = owner('Fixed Parent | Full Literal', 'PARENT|SOURCE', [lightBlock])
  const character = buildInitialCharacter(
    { initial: { name: 'Complete owner literal', originSystem: '2014' }, race: parent },
    new Map(),
    () => [],
  )
  Object.assign(character.provenance.spells.light[0], {
    sourceName: ' fixed parent | full literal ',
    sourceRef: ' parent|source ',
    grantSource: ' phb ',
  })
  expect(characterPersistenceSchema.safeParse(character).success).toBe(true)
  character.provenance.spells.light[0].sourceName = 'Fixed Parent'
  expect(characterPersistenceSchema.safeParse(character).success).toBe(false)
})

test.each([
  'parent',
  'child',
  'parent printing',
  'child printing',
] as const)('unavailable %s then restored rules preserve saved fixed state through unrelated edits', (availability) => {
  const { character, parent } = native()
  const original = structuredClone(character)
  setActiveCharacter(character)
  install(
    availability === 'parent'
      ? []
      : [
          {
            ...parent,
            source: availability === 'parent printing' ? 'OTHER' : parent.source,
            subraces:
              availability === 'child'
                ? []
                : parent.subraces?.map((child) => ({
                    ...child,
                    source: availability === 'child printing' ? 'OTHER' : child.source,
                  })),
          },
        ],
  )
  const { result } = editing()
  expect(racial(result.current.slots.spellProfiles)).toEqual(racial(character.spells.spellProfiles))
  expect(result.current.slots.spellProvenance).toEqual(character.provenance)
  act(() => result.current.mutations.syncProfiles())
  expect(reopenedActive().provenance.spells.light).toEqual(original.provenance.spells.light)
  act(() => install([parent]))
  act(() => result.current.mutations.setProfileSpells('special:unrestricted', ['Bonus|PHB'], []))
  expect(reopenedActive().provenance.spells.light).toEqual(original.provenance.spells.light)
  expect(character).toEqual(original)
})

test.each([
  { operation: 'sync', childGrants: false },
  { operation: 'unrelated', childGrants: false },
  { operation: 'sync', childGrants: true },
  { operation: 'unrelated', childGrants: true },
])('restored changed printing refreshes profile and Sources on $operation (child: $childGrants)', ({
  operation,
  childGrants,
}) => {
  const { character, parent, child } = native(childGrants)
  for (const sourceType of ['class', 'feat'] as const)
    character.provenance = addSpellGrant(
      character.provenance,
      'Light|PHB',
      makeSourceTag(sourceType, 'Independent', 'choice', 'OTHER'),
    )
  character.spells.spellSlots[1] = { max: 3, used: 2 }
  character.spells.pactSpellSlots = { 1: { max: 2, used: 1 } }
  setActiveCharacter(character)
  install([])
  const { result } = editing()
  act(() =>
    result.current.mutations.addSpellToProfile('special:unrestricted', 'Light|PHB', 'cantrip'),
  )
  const before = structuredClone(useCharacterStore.getState().activeCharacter!)
  const refreshed = owner(
    childGrants ? 'Fixed Child' : 'Fixed Parent',
    childGrants ? 'CHILD' : 'PARENT',
    [{ ability: 'int', known: { _: ['light|TCE#c'] } }],
  )
  const refreshedParent = childGrants
    ? { ...parent, subraces: [refreshed] }
    : { ...refreshed, subraces: [child] }
  let data = install([])
  act(() => {
    data = install([refreshedParent])
  })
  expect(racial(result.current.slots.spellProfiles).fixedSpells).toEqual(['light|TCE'])
  expect(getSpellRows(result.current.slots.spellProvenance)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ itemName: 'Light', itemSource: 'TCE' }),
      expect.objectContaining({ itemName: 'Light', itemSource: 'PHB' }),
    ]),
  )
  const view = createCharacterSheetViewModel(before, data.lookups!)
  expect(racial(view.character.spells.spellProfiles).fixedSpells).toEqual(['light|TCE'])
  expect(view.character.provenance.spells.light).toEqual(
    result.current.slots.spellProvenance.spells.light,
  )
  const { result: actions } = renderHook(() => useCharacterActions(before))
  for (const projected of [actions.current, view.actions])
    expect(
      projected
        .filter((action) => action.name === 'Light')
        .map((action) => action.source?.source)
        .sort(),
    ).toEqual(['PHB', 'TCE'])
  expect(useCharacterStore.getState().activeCharacter).toEqual(before)
  act(() => {
    if (operation === 'sync') result.current.mutations.syncProfiles()
    else
      result.current.mutations.setProfileSpells(
        'special:unrestricted',
        ['Light|PHB', 'Bonus|PHB'],
        [],
      )
  })
  const reopened = reopenedActive()
  expect(racial(reopened.spells.spellProfiles).fixedSpells).toEqual(['light|TCE'])
  expect(reopened.provenance.spells.light).toEqual([
    expect.objectContaining({ sourceType: 'class', grantSource: 'PHB' }),
    expect.objectContaining({ sourceType: 'feat', grantSource: 'PHB' }),
    expect.objectContaining({ sourceType: 'manual', grantSource: 'PHB' }),
    expect.objectContaining({
      sourceType: childGrants ? 'subrace' : 'race',
      sourceName: childGrants ? 'Fixed Child' : 'Fixed Parent',
      sourceRef: childGrants ? 'CHILD' : 'PARENT',
      grantType: 'fixed',
      grantSource: 'TCE',
    }),
  ])
  expect(reopened.spells.spellSlots[1]).toEqual({ max: 3, used: 2 })
  expect(reopened.spells.pactSpellSlots?.[1]).toEqual({ max: 2, used: 1 })
  expect(character.spells.spellProfiles).toEqual(native(childGrants).character.spells.spellProfiles)
})

test('PDF racial refresh preserves independent saved class and special preparation state', () => {
  const { character, child } = native()
  character.spells.spellProfiles.push({
    id: 'class:Unresolved|OTHER',
    type: 'class',
    label: 'Unresolved',
    className: 'Unresolved',
    classSource: 'OTHER',
    castingAbility: 'wis',
    cantrips: ['Mage Hand|PHB'],
    spellsKnown: ['Bonus|PHB'],
    preparedSpells: ['Bonus|PHB'],
    alwaysPreparedSpells: ['Bonus|PHB'],
  })
  const special = character.spells.spellProfiles.find((profile) => profile.type === 'special')!
  Object.assign(special, {
    castingAbility: 'cha',
    fixedSpells: ['Light|TCE'],
    cantrips: ['Light|TCE'],
    preparedSpells: ['Light|TCE'],
  })
  character.spells.spellSlots[1] = { max: 3, used: 2 }
  character.spells.pactSpellSlots = { 1: { max: 2, used: 1 } }
  characterPersistenceSchema.parse(character)
  const original = structuredClone(character)
  const refreshed = owner('Fixed Parent', 'PARENT', [
    { ability: 'int', known: { _: ['light|TCE#c'] } },
  ])
  refreshed.subraces = [child]
  const data = install([refreshed])
  const view = createCharacterSheetViewModel(character, data.lookups!)
  expect(racial(view.character.spells.spellProfiles).fixedSpells).toEqual(['light|TCE'])
  expect(
    view.character.spells.spellProfiles.filter((profile) => profile.type !== 'racial'),
  ).toEqual(original.spells.spellProfiles.filter((profile) => profile.type !== 'racial'))
  expect(view.spellRows.find((row) => row.id === 'bonus|phb')?.prepared).toBe(true)
  expect(view.character.spells.spellSlots).toEqual(original.spells.spellSlots)
  expect(view.character.spells.pactSpellSlots).toEqual(original.spells.pactSpellSlots)
  expect(character).toEqual(original)
})

test.each([
  'add',
  'remove',
] as const)('resolved fixed %s updates the display and persisted Sources', (operation) => {
  const { character, child } = native()
  const parent = owner(
    'Fixed Parent',
    'PARENT',
    operation === 'add'
      ? [{ ability: 'int', known: { _: ['light|PHB#c', 'mage hand|PHB#c'] } }]
      : undefined,
  )
  parent.subraces = [child]
  setActiveCharacter(character)
  const data = install([parent])
  const { result } = editing()
  const projectedRows = getSpellRows(result.current.slots.spellProvenance)
  if (operation === 'add') {
    expect(projectedRows).toContainEqual(
      expect.objectContaining({ itemName: 'Mage Hand', itemSource: 'PHB' }),
    )
    expect(createCharacterSheetViewModel(character, data.lookups!).actions).toContainEqual(
      expect.objectContaining({ name: 'Mage Hand', active: true }),
    )
  } else {
    expect(
      result.current.slots.spellProfiles.filter((profile) => profile.type === 'racial'),
    ).toEqual([])
    expect(projectedRows).toEqual([])
    expect(
      createCharacterSheetViewModel(character, data.lookups!).actions.some(
        (action) => action.name === 'Light',
      ),
    ).toBe(false)
  }
  act(() => result.current.mutations.syncProfiles())
  const reopened = reopenedActive()
  expect(getSpellRows(reopened.provenance)).toEqual(projectedRows)
})

test('Builder Clear child and Replace parent retain an independent printing', () => {
  const { character, parent } = native()
  install([parent])
  setActiveCharacter(character)
  const { result } = editing()
  act(() =>
    result.current.mutations.addSpellToProfile('special:unrestricted', 'Light|TCE', 'cantrip'),
  )
  act(() => result.current.race.applySubraceChange(parent, undefined))
  const cleared = reopenedActive()
  expect(cleared.subrace).toBeUndefined()
  expect(racial(cleared.spells.spellProfiles).fixedSpells).toEqual(['light|PHB'])
  const replacement = owner('Replacement', 'PARENT')
  act(() => result.current.race.applyRaceSelection(replacement))
  const replaced = reopenedActive()
  expect(replaced.spells.spellProfiles.filter((profile) => profile.type === 'racial')).toEqual([])
  expect(
    replaced.spells.spellProfiles.find((profile) => profile.type === 'special')?.cantrips,
  ).toEqual(['Light|TCE'])
  expect(replaced.provenance.spells.light).toEqual([
    expect.objectContaining({ sourceType: 'manual', grantSource: 'TCE' }),
  ])
})
