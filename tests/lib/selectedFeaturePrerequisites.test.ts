// @vitest-environment jsdom
import { expect, test } from 'vitest'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { setManagedClassSpellChoicesCommand } from '@/lib/character/commands/managedClassSpellCommands'
import { getEffectiveClassChoiceFeatureRoutes } from '@/lib/character/effectiveClassChoiceFeatures'
import { getManagedClassSpellSlots } from '@/lib/character/managedClassSpellSlots'
import { projectManagedClassSpellState } from '@/lib/character/managedClassSpells'
import { buildRetainedCharacterDetails } from '@/lib/character/retainedCharacterDetails'
import { getSelectedFeatureCantripSlots } from '@/lib/character/selectedFeatureSpells'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import { validateSpells } from '@/lib/readiness/spellReadiness'
import type { Raw5ePrereq } from '@/types/5etools'
import type { Character } from '@/types/character'
import {
  applyWarriorResult,
  makeWarriorSpellFixtures,
  selectWarriorFixture,
} from '../fixtures/warriorSpellFixtures'

const fixture = makeWarriorSpellFixtures()
function saved(withOrdinary = false) {
  const { character, entry } = selectWarriorFixture(fixture, 'Ranger', 'PHB')
  const requests = getSelectedFeatureCantripSlots(character, fixture.context.catalogs).map(
    (slot, index) => ({
      slot,
      expected: null,
      expectedEmptyRevision: 0,
      target: { name: index ? 'Resistance' : 'Guidance', source: 'PHB' },
      policy: 'default' as const,
    }),
  )
  if (withOrdinary)
    requests.push({
      slot: getManagedClassSpellSlots(entry).find((slot) => slot[1] === 'class-known')!,
      expected: null,
      expectedEmptyRevision: 0,
      target: { name: "Hunter's Mark", source: 'PHB' },
      policy: 'default',
    })
  return applyWarriorResult(
    character,
    setManagedClassSpellChoicesCommand(character, character.provenance, requests, fixture.context),
  )
}
function changed(prerequisite: Raw5ePrereq[]) {
  return {
    ...fixture.context,
    catalogs: {
      ...fixture.context.catalogs,
      optionalFeatures: fixture.context.catalogs.optionalFeatures!.map((row) =>
        row.name === 'Druidic Warrior' ? { ...row, prerequisite } : row,
      ),
    },
  }
}

test('effective ability qualification suspends and restores saved choices without allocating revisions', () => {
  const character = saved()
  character.abilityScores.wisdom = 12
  character.manualEffects = [
    {
      id: 'wisdom',
      label: 'Wisdom adjustment',
      target: { kind: 'ability-score', ability: 'wisdom' },
      operation: { kind: 'add', value: 4 },
      source: { kind: 'manual', name: 'Adjustment' },
    },
  ]
  const context = changed([{ ability: [{ wis: 13 }] }])
  const lookups = { ...fixture.lookups, classChoiceFeatureCatalogs: context.catalogs }
  const calculation = createCharacterCalculationContext(character, lookups, lookups)
  expect(calculation.abilityScores.total.wisdom).toBe(16)
  expect(calculation.managedClassSpellStatuses.map((row) => row.active)).toEqual([true, true])
  expect(calculation.character.managedClassSpellRevision).toBe(character.managedClassSpellRevision)
  expect(
    projectManagedClassSpellState(character, context).statuses.every((row) => !row.active),
  ).toBe(true)
  expect(
    projectManagedClassSpellState(character, {
      ...context,
      abilityScores: { ...character.abilityScores, wisdom: 16 },
    }).statuses.every((row) => row.active),
  ).toBe(true)
  const lowered = createCharacterCalculationContext(
    { ...character, manualEffects: [] },
    lookups,
    lookups,
  )
  expect(lowered.managedClassSpellStatuses.every((row) => !row.active)).toBe(true)
  expect(
    createCharacterCalculationContext(character, lookups, lookups).managedClassSpellStatuses.every(
      (row) => row.active,
    ),
  ).toBe(true)
  const routes = getEffectiveClassChoiceFeatureRoutes(
    character,
    context.catalogs,
    calculation.classChoices.prerequisites,
  )
  expect(routes.selectedOptions).toHaveLength(1)
  expect(
    getEffectiveClassChoiceFeatureRoutes(character, context.catalogs).selectedOptions,
  ).toHaveLength(0)
  expect(
    getEffectiveClassChoiceFeatureRoutes(
      character,
      context.catalogs,
      calculation.classChoices.prerequisites,
    ).selectedOptions,
  ).toHaveLength(1)
  expect(
    validateSpells(character, calculation, fixture.context.spellsByKey).some(
      (issue) => issue.id.startsWith('spells:managed:') && issue.title.includes('cantrip'),
    ),
  ).toBe(false)
  const data = { ...fixture.data, optionalfeatures: context.catalogs.optionalFeatures! }
  expect(
    buildRetainedCharacterDetails(
      character,
      data,
      data,
      undefined,
      calculation.classChoices.prerequisites,
    ).choiceDetailsById.get(character.classChoiceSelections![0].choiceId)?.[0].availability,
  ).toBe('available')
  expect(
    createCharacterSheetViewModel(character, lookups, lookups).spellRows.some(
      (row) => row.name === 'Guidance',
    ),
  ).toBe(true)
})

test('an independently managed known spell qualifies a feature; saved feature spells cannot bootstrap qualification', () => {
  const character = saved(true)
  const context = changed([{ spell: ["hunter's mark|phb"] }])
  const projection = projectManagedClassSpellState(character, context)
  expect(projection.statuses.every((row) => row.active)).toBe(true)
  expect(projection.independentSpellProfiles.flatMap((profile) => profile.cantrips)).not.toContain(
    'Guidance|PHB',
  )
  expect(projection.independentSpellProfiles.flatMap((profile) => profile.spellsKnown)).toContain(
    "Hunter's Mark|PHB",
  )
  const lookups = { ...fixture.lookups, classChoiceFeatureCatalogs: context.catalogs }
  expect(
    createCharacterCalculationContext(character, lookups, lookups).managedClassSpellStatuses.every(
      (row) => row.active,
    ),
  ).toBe(true)
  for (const prerequisite of [
    [{ spell: ['guidance|phb'] }],
    [{ spell: ['guidance|phb', 'resistance|phb'] }],
  ]) {
    const result = projectManagedClassSpellState(character, changed(prerequisite))
    expect(
      result.statuses
        .filter((row) => row.choice.slot[1] === 'feature-cantrip')
        .every((row) => !row.active),
    ).toBe(true)
    expect(result.statuses.find((row) => row.choice.slot[1] === 'class-known')?.active).toBe(true)
  }
})

test('two actual Warrior producers cannot qualify each other through their saved cantrips', () => {
  const ranger = selectWarriorFixture(fixture, 'Ranger', 'PHB').character
  const paladin = selectWarriorFixture(fixture, 'Paladin', 'PHB').character
  let character: Character = {
    ...ranger,
    classProgression: [...ranger.classProgression, ...paladin.classProgression],
    classChoiceSelections: [...ranger.classChoiceSelections!, ...paladin.classChoiceSelections!],
    optionalClassFeatureAdoptions: [
      ...(ranger.optionalClassFeatureAdoptions ?? []),
      ...(paladin.optionalClassFeatureAdoptions ?? []),
    ],
  }
  const slots = getSelectedFeatureCantripSlots(character, fixture.context.catalogs)
  expect(slots).toHaveLength(4)
  character = applyWarriorResult(
    character,
    setManagedClassSpellChoicesCommand(
      character,
      character.provenance,
      slots.map((slot) => ({
        slot,
        expected: null,
        expectedEmptyRevision: 0,
        target: {
          name:
            slot[0][1] === 'ranger'
              ? slot[4]
                ? 'Resistance'
                : 'Guidance'
              : slot[4]
                ? 'Mending'
                : 'Light',
          source: 'PHB',
        },
        policy: 'default',
      })),
      fixture.context,
    ),
  )
  const context = {
    ...fixture.context,
    catalogs: {
      ...fixture.context.catalogs,
      optionalFeatures: fixture.context.catalogs.optionalFeatures!.map((row) =>
        row.name === 'Druidic Warrior'
          ? { ...row, prerequisite: [{ spell: ['light|phb'] }] }
          : row.name === 'Blessed Warrior'
            ? { ...row, prerequisite: [{ spell: ['guidance|phb'] }] }
            : row,
      ),
    },
  }
  const projection = projectManagedClassSpellState(character, context)
  expect(projection.statuses).toHaveLength(4)
  expect(projection.statuses.every((row) => !row.active)).toBe(true)
  expect(projection.independentSpellProfiles.flatMap((profile) => profile.cantrips)).toEqual([])
  expect(
    projectManagedClassSpellState(character, fixture.context).statuses.every((row) => row.active),
  ).toBe(true)
  expect(projection.character.managedClassSpellRevision).toBe(character.managedClassSpellRevision)
})
