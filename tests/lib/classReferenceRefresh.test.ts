import { expect, test } from 'vitest'
import { DataFilter } from '@/lib/5etools/filters'
import { buildClassLookup } from '@/lib/5etools/lookups'
import { parseClasses } from '@/lib/5etools/parsers/classes'
import { deriveRulesTextActions } from '@/lib/calculations/actions'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { buildPrerequisiteSnapshot } from '@/lib/calculations/prerequisites'
import { getExpertiseSlotsFromClasses } from '@/lib/calculations/skills'
import { buildSpellcastingClassDetails } from '@/lib/calculations/spellProfiles.casting'
import { calculateCharacterSpellSlots } from '@/lib/calculations/spellProfiles.slots'
import { applyClassChoiceSelectionWithGrantsCommand } from '@/lib/character/commands/classChoiceCommands'
import {
  applyLevelDown,
  applyLevelUp,
  selectBaseClass,
  selectSubclass,
} from '@/lib/character/commands/classCommands'
import { buildRetainedCharacterDetails } from '@/lib/character/retainedCharacterDetails'
import { deriveSpellProfileState } from '@/lib/character/spellProfileState'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import { validateClassChoices } from '@/lib/readiness/classReadiness'
import { validateSourceReferences } from '@/lib/readiness/sourceReadiness'
import type { Class5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeClassFixture, makeGameDataFixture } from '../fixtures/gameDataFixtures'

function fixture() {
  const [wizard] = parseClasses({
    class: [
      {
        name: 'Wizard',
        source: 'PHB',
        hd: { number: 1, faces: 6 },
        casterProgression: 'full',
        spellcastingAbility: 'int',
        classTableGroups: [{ rowsSpellProgression: [[2], [3]] }],
        classFeatures: ['Beacon|Wizard|PHB|1', 'Expertise|Wizard|PHB|1'],
      },
    ],
    classFeature: [
      {
        name: 'Beacon',
        source: 'PHB',
        className: 'Wizard',
        classSource: 'PHB',
        level: 1,
        entries: ['As an action, light a beacon.'],
      },
      {
        name: 'Expertise',
        source: 'PHB',
        className: 'Wizard',
        classSource: 'PHB',
        level: 1,
        entries: ['Choose two skill proficiencies.'],
      },
    ],
    subclass: [
      {
        name: 'School',
        shortName: 'SC',
        source: 'TCE',
        className: 'Wizard',
        classSource: 'PHB',
      },
    ],
  }) as Class5e[]
  const base = makeCharacterFixture({
    features: [],
    classProgression: [],
    abilityScores: { ...makeCharacterFixture().abilityScores, intelligence: 14 },
  })
  const selected = selectBaseClass(base, base.provenance!, 'Wizard', wizard, 'PHB')
  const selectedCharacter: Character = {
    ...base,
    ...selected.characterPatch,
    provenance: selected.provenanceUpdate,
    spells: { ...base.spells, spellProfiles: [] },
  }
  const character = deriveSpellProfileState(
    selectedCharacter,
    new Map([['class:Wizard|PHB', wizard]]),
  )
  const reopen = (saved: Character) =>
    characterPersistenceSchema.parse(JSON.parse(JSON.stringify(saved)))
  return { wizard, character: reopen(character), reopen }
}

test.each([
  ['WIZARD', 'phb'],
  [' Wizard ', ' PHB '],
])('qualified refresh %s/%s retains calculation rules, Actions, PDF and strict reopen', (name, source) => {
  const { wizard, character, reopen } = fixture()
  const refreshed = { ...wizard, name, source }
  const competing = {
    ...wizard,
    source: 'XPHB',
    hd: { number: 1, faces: 12 },
    classFeatureRefs: [],
  }
  const lookups = { classesByKey: buildClassLookup([competing, refreshed]) }
  const before = structuredClone({ character, refreshed })
  const context = createCharacterCalculationContext(character, lookups)
  expect.soft(context.classes).toEqual([refreshed])
  expect
    .soft(
      validateSourceReferences(character, context).filter((issue) =>
        issue.id.startsWith('source:class:'),
      ),
    )
    .toEqual([])
  const actions = deriveRulesTextActions(character, undefined, { classes: context.classes })
  expect.soft(actions.map((action) => action.name)).toEqual(['Beacon'])
  expect.soft(actions).toEqual(deriveRulesTextActions(character, undefined, { classes: [wizard] }))
  const sheet = createCharacterSheetViewModel(reopen(character), lookups)
  expect.soft(sheet.actions).toEqual(actions)
  expect.soft(sheet.maxHP).toBe(6)
  expect.soft(sheet.spellSlots.shared[1]?.max).toBe(2)
  expect
    .soft(sheet.spellcastingDetails)
    .toMatchObject([{ profileId: 'class:Wizard|PHB', spellSaveDC: 12 }])
  expect
    .soft(sheet.character.spells.spellProfiles.map((profile) => profile.id))
    .toContain('class:Wizard|PHB')
  expect.soft({ character, refreshed }).toEqual(before)

  const raised = applyLevelUp(
    character,
    character.provenance!,
    [{ name: 'Wizard', source: 'PHB', levels: 2 }],
    {
      className: 'Wizard',
      classSource: 'PHB',
      classLevel: 2,
      hitDie: 6,
      dieResult: 4,
      method: 'average',
    },
    context,
  )
  const saved = reopen({
    ...character,
    ...raised.characterPatch,
    provenance: raised.provenanceUpdate,
  })
  expect.soft(saved.hitPoints.current).toBe(10)
  expect.soft(saved.classProgression).toEqual([{ name: 'Wizard', source: 'PHB', levels: 2 }])
  expect.soft(createCharacterSheetViewModel(saved, lookups).maxHP).toBe(10)
  const lowered = applyLevelDown(
    saved,
    saved.provenance!,
    createCharacterCalculationContext(saved, lookups),
  )
  const undone = reopen({
    ...saved,
    ...lowered.characterPatch,
    provenance: lowered.provenanceUpdate,
  })
  expect.soft(undone.classProgression).toEqual(character.classProgression)
  expect.soft(undone.hitPointGains).toEqual([])
  expect.soft(createCharacterSheetViewModel(undone, lookups).actions).toEqual(actions)
})

test('missing and restored exact class rules never borrow the competing printing or rewrite saved state', () => {
  const { wizard, character, reopen } = fixture()
  const saved = JSON.stringify(character)
  const other = { ...wizard, source: 'XPHB', classFeatureRefs: [] }
  const missing = { classesByKey: buildClassLookup([other]) }
  const absent = createCharacterCalculationContext(character, missing)
  expect(absent.classes).toEqual([])
  expect(
    validateSourceReferences(character, absent).some((issue) =>
      issue.id.startsWith('source:class:'),
    ),
  ).toBe(true)
  expect(createCharacterSheetViewModel(character, missing).actions).toEqual([])
  const restored = {
    classesByKey: buildClassLookup([other, { ...wizard, name: ' WIZARD ', source: ' phb ' }]),
  }
  expect(
    createCharacterSheetViewModel(reopen(character), restored).actions.map((action) => action.name),
  ).toEqual(['Beacon'])
  expect(JSON.stringify(character)).toBe(saved)
})

test('parent spelling refresh retains expertise, selected subclass prerequisites, readiness and Overview details', () => {
  const { wizard, character, reopen } = fixture()
  const selected = selectSubclass(character, character.provenance!, 'School', 'TCE')
  const saved = reopen({
    ...character,
    ...selected.characterPatch,
    provenance: selected.provenanceUpdate,
  })
  const refreshed = { ...wizard, name: ' WIZARD ', source: ' phb ' }
  const classesByKey = buildClassLookup([refreshed])
  expect(getExpertiseSlotsFromClasses(saved.classProgression, classesByKey)).toBe(2)
  expect(
    buildPrerequisiteSnapshot({ character: saved, classLookup: classesByKey }).progression[0],
  ).toMatchObject({
    name: 'Wizard',
    source: 'PHB',
    subclass: 'School',
    subclassSource: 'TCE',
    subclassShortName: 'SC',
  })
  const context = createCharacterCalculationContext(saved, { classesByKey })
  expect(validateClassChoices(saved, context)).toEqual([])
  const details = buildRetainedCharacterDetails(
    saved,
    makeGameDataFixture({ classes: [refreshed] }),
    undefined,
  )
  expect(details.featureEntriesByKey.get('Beacon|PHB')).toEqual(['As an action, light a beacon.'])
  expect(saved.classProgression[0]).toMatchObject({ name: 'Wizard', source: 'PHB' })
})

test.each([
  'PHB',
  'XPHB',
])('multiclass shared slots retain the exact %s table after spelling refresh', (source) => {
  const wizard = makeClassFixture({ source, spellSlotProgression: [[2], [3], [4, 2]] })
  const paladin = makeClassFixture({ name: 'Paladin', source, casterProgression: '1/2' })
  const character = makeCharacterFixture({
    classProgression: [
      { name: 'Wizard', source, levels: 2 },
      { name: 'Paladin', source, levels: 2 },
    ],
  })
  const refreshed = { ...wizard, name: ' WIZARD ', source: ` ${source.toLowerCase()} ` }
  const classes = [paladin, refreshed]
  const slots = calculateCharacterSpellSlots(
    character,
    new Map(classes.map((cls) => [cls.name, cls])),
  )
  expect(slots.shared).toEqual({ 1: { max: 4, used: 0 }, 2: { max: 2, used: 0 } })
  expect(
    createCharacterSheetViewModel(character, { classesByKey: buildClassLookup(classes) }).spellSlots
      .shared,
  ).toEqual(slots.shared)
})

test.each([
  ['Wizard', 'Arcane Recovery', undefined, 'wizard-arcane-recovery'],
  [
    'Sorcerer',
    'Font of Magic',
    [{ colLabels: ['Sorcery Points'], rows: [[0], [2], [3]] }],
    'sorcerer-sorcery-points',
  ],
] as const)('source filtering retains parsed %s resources and stored usage IDs after spelling refresh', (name, featureName, classTableGroups, resourceId) => {
  const [original] = parseClasses({
    class: [
      { name, source: 'PHB', classTableGroups, classFeatures: [`${featureName}|${name}|PHB|1`] },
    ],
    classFeature: [
      {
        name: featureName,
        className: name,
        classSource: 'PHB',
        source: 'PHB',
        level: 1,
        entries: ['Resource rules.'],
      },
    ],
  }) as Class5e[]
  const [baseline] = DataFilter.filterClasses([original], { sources: ['PHB'] })
  const [refreshed] = DataFilter.filterClasses(
    [{ ...original, name: ` ${name.toUpperCase()} `, source: ' phb ' }],
    { sources: ['PHB'] },
  )
  expect(refreshed.normalizedRules?.resources.map((resource) => resource.id)).toContain(resourceId)
  expect(refreshed.normalizedRules?.resources).toEqual(baseline.normalizedRules?.resources)
  const character = makeCharacterFixture({
    classProgression: [{ name, source: 'PHB', levels: 2 }],
    classResources: { [resourceId]: 0 },
  })
  const view = (cls: Class5e) =>
    createCharacterSheetViewModel(character, { classesByKey: buildClassLookup([cls]) })
  expect(view(refreshed).classResourceRows).toEqual(view(baseline).classResourceRows)
  const [other] = DataFilter.filterClasses([{ ...original, source: 'OTHER' }], {
    sources: ['OTHER'],
  })
  expect(other.normalizedRules?.resources).toEqual([])
  expect(character.classResources).toEqual({ [resourceId]: 0 })
})

test('a produced class choice keeps the saved owner through refresh, Edit, Clear and strict reopen', () => {
  const [original] = parseClasses({
    class: [{ name: 'Wizard', source: 'PHB', classFeatures: ['Arcane Training|Wizard|PHB|1'] }],
    classFeature: [
      {
        name: 'Arcane Training',
        className: 'Wizard',
        classSource: 'PHB',
        source: 'PHB',
        level: 1,
        entries: [
          {
            type: 'options',
            count: 1,
            entries: [{ type: 'refClassFeature', classFeature: 'Trick|Wizard|PHB|1' }],
          },
        ],
      },
      {
        name: 'Trick',
        className: 'Wizard',
        classSource: 'PHB',
        source: 'PHB',
        level: 1,
        entries: ['As an action, do a trick.'],
      },
    ],
  }) as Class5e[]
  const [baseline] = DataFilter.filterClasses([original], { sources: ['PHB'] })
  const initialChoice = baseline.normalizedRules!.choices[0]
  const character = makeCharacterFixture({
    classProgression: [{ name: 'Wizard', source: 'PHB', levels: 1 }],
    features: [],
  })
  const apply = (
    saved: Character,
    choice: typeof initialChoice,
    selected: typeof initialChoice.options,
  ) => {
    const result = applyClassChoiceSelectionWithGrantsCommand(
      saved,
      saved.provenance!,
      choice,
      selected,
    )
    return characterPersistenceSchema.parse(
      JSON.parse(
        JSON.stringify({ ...saved, ...result.characterPatch, provenance: result.provenanceUpdate }),
      ),
    )
  }
  const selected = apply(character, initialChoice, initialChoice.options)
  const [refreshed] = DataFilter.filterClasses(
    [{ ...original, name: ' WIZARD ', source: ' phb ' }],
    { sources: ['PHB'] },
  )
  const currentChoice = refreshed.normalizedRules!.choices[0]
  expect(currentChoice.id).toBe(initialChoice.id)
  const edited = apply(selected, currentChoice, currentChoice.options)
  expect(edited.classChoiceSelections).toEqual(selected.classChoiceSelections)
  expect(edited.provenance!.features).toEqual(selected.provenance!.features)
  const cleared = apply(edited, currentChoice, [])
  expect(cleared.classChoiceSelections).toEqual([])
  expect(cleared.features).toEqual([])
  expect(cleared.provenance!.features.trick).toBeUndefined()
  expect(cleared.classProgression).toEqual(character.classProgression)
})

test('a refreshed XPHB parent retains its casting subclass spell limit and exact shared table', () => {
  const wizard = makeClassFixture({ source: 'XPHB' })
  const fighter = makeClassFixture({
    name: ' FIGHTER ',
    source: ' xphb ',
    casterProgression: 'none',
    classTableGroups: [],
    subclasses: [
      {
        name: 'Eldritch Knight',
        shortName: 'EK',
        source: 'XPHB',
        className: 'Fighter',
        classSource: 'XPHB',
        casterProgression: '1/3',
        spellcastingAbility: 'int',
      },
    ],
  })
  const character = makeCharacterFixture({
    classProgression: [
      {
        name: 'Fighter',
        source: 'XPHB',
        levels: 3,
        subclass: 'Eldritch Knight',
        subclassSource: 'XPHB',
      },
    ],
  })
  const classes = new Map([
    ['wizard', wizard],
    ['fighter', fighter],
  ])
  expect(calculateCharacterSpellSlots(character, classes).shared[1]?.max).toBe(2)
  expect(
    buildSpellcastingClassDetails(character, classes, character.abilityScores)[0],
  ).toMatchObject({ profileId: 'class:Fighter|XPHB', maxSpellLevel: 1 })
})
