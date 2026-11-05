import { existsSync, readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { parseClassDocument } from '@/lib/5etools/parsers/classes'
import { parseSpells, type SpellSourceLookup } from '@/lib/5etools/parsers/spells'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { deriveAllSkills } from '@/lib/calculations/skills'
import {
  buildClassChoiceFeatureCatalogs,
  type ClassChoiceFeatureCatalogs,
} from '@/lib/character/classChoiceFeatureCatalogs'
import {
  applyClassChoiceSelectionWithGrantsCommand,
  retainSavedFeatureOptionsCommand,
} from '@/lib/character/commands/classChoiceCommands'
import { setManagedClassSpellChoiceCommand } from '@/lib/character/commands/managedClassSpellCommands'
import { createEmptyCharacter } from '@/lib/character/createCharacter'
import { getFeatureOptionSelectionStates } from '@/lib/character/featureOptionSelections'
import { getOptionalPoolSelectionHandle } from '@/lib/character/optionalClassPoolSelections'
import {
  getSelectedFeatureCantripPool,
  getSelectedFeatureCantripSlots,
} from '@/lib/character/selectedFeatureSpells'
import { validateSpells } from '@/lib/readiness/spellReadiness'
import type { Class5e, ClassFeature, GameData, Spell5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeGameDataFixture } from '../fixtures/gameDataFixtures'

const bundled = 'resources/srd/core/data'
const configured = 'data'
const read = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'))

function setup(path: string) {
  const parsed = parseClassDocument(
    read(`${path}/class/class-cleric.json`),
    'class/class-cleric.json',
  )
  const data: GameData = makeGameDataFixture({
    ...parsed,
    classes: parsed.classes as Class5e[],
    classFeatures: parsed.classFeatures as ClassFeature[],
    spells: parseSpells(read(`${path}/spells/spells-xphb.json`), {
      sourceLookup: read(`${path}/generated/gendata-spell-source-lookup.json`) as SpellSourceLookup,
    }) as Spell5e[],
  })
  const catalogs = buildClassChoiceFeatureCatalogs(data)
  const cls = data.classes.find((row) => row.name === 'Cleric' && row.source === 'XPHB')
  const choice = cls?.normalizedRules?.choices.find((row) => row.label === 'Divine Order')
  if (!choice) throw new Error('The current Divine Order choice is missing')
  const lookup = buildGameDataLookups(data)
  const calculate = (actor: Character, currentCatalogs: ClassChoiceFeatureCatalogs = catalogs) =>
    createCharacterCalculationContext(actor, {
      ...lookup,
      classChoiceClasses: currentCatalogs.classes,
      classChoiceFeatureCatalogs: currentCatalogs,
    })
  const confirm = (actor: Character, branch?: string) => {
    const options = branch ? choice.options.filter((row) => row.name === branch) : []
    const result = applyClassChoiceSelectionWithGrantsCommand(
      actor,
      actor.provenance,
      choice,
      options,
      {
        classes: data.classes,
        catalogs,
        spellContext: calculate(actor).classChoices.spellContext,
      },
    )
    return reopen({ ...actor, ...result.characterPatch, provenance: result.provenanceUpdate })
  }
  const actor = createEmptyCharacter({
    name: 'Divine Order Cleric',
    originSystem: '2024',
    allowedSources: ['XPHB'],
    classProgression: [{ name: 'Cleric', source: 'XPHB', levels: 1 }],
    abilityScores: {
      strength: 10,
      dexterity: 10,
      constitution: 10,
      intelligence: 12,
      wisdom: 16,
      charisma: 10,
    },
  })
  return { actor, catalogs, calculate, confirm }
}

const reopen = (actor: Character) =>
  characterPersistenceSchema.parse(JSON.parse(JSON.stringify(actor)))

function verifyDivineOrder(path: string) {
  const { actor, catalogs, calculate, confirm } = setup(path)
  // An independent manual source for the same training survives a choice change.
  actor.proficiencies.armor = ['heavy']
  const protector = confirm(actor, 'Protector')
  expect(protector.proficiencies.armor).toContain('heavy')
  expect(protector.proficiencies.weapons).toContain('martial')
  const halfOwned = structuredClone(protector)
  delete halfOwned.provenance.proficiencies.weapons.martial
  expect(characterPersistenceSchema.safeParse(halfOwned).success).toBe(false)
  const oldProtector = reopen({ ...actor, classChoiceSelections: protector.classChoiceSelections })
  expect(calculate(oldProtector).character.proficiencies.weapons).toContain('martial')
  const conflictingProtector = {
    ...catalogs,
    classFeatures: catalogs.classFeatures.map((row) =>
      row.name === 'Protector' ? { ...row, entries: ['This is a different rule.'] } : row,
    ),
    classFeatureCandidates: undefined,
  }
  const suspended = calculate(protector, conflictingProtector).character
  expect(suspended.proficiencies.armor).toContain('heavy')
  expect(suspended.proficiencies.weapons).not.toContain('martial')
  const orderWithdrawn = {
    ...catalogs,
    classes: catalogs.classes?.map((row) => ({
      ...row,
      classFeatures: row.classFeatures?.filter(
        (uid): uid is string => typeof uid === 'string' && !uid.startsWith('Divine Order|'),
      ),
      classFeatureRefs: row.classFeatureRefs?.filter((ref) => ref.name !== 'Divine Order'),
      normalizedRules: row.normalizedRules && {
        ...row.normalizedRules,
        choices: row.normalizedRules.choices.filter((choice) => choice.label !== 'Divine Order'),
      },
    })),
  }
  const recovery = getFeatureOptionSelectionStates(
    protector,
    orderWithdrawn.classes ?? [],
    orderWithdrawn,
  ).find((state) => state.divineOrder)
  expect(recovery).toMatchObject({ recovery: true, selection: { label: 'Divine Order' } })
  if (!recovery) throw new Error('Divine Order recovery was not offered')
  const recovered = retainSavedFeatureOptionsCommand(
    protector,
    protector.provenance,
    recovery.selection.choiceId,
    [],
    undefined,
    getOptionalPoolSelectionHandle(recovery.selection),
  )
  const removed = reopen({
    ...protector,
    ...recovered.characterPatch,
    provenance: recovered.provenanceUpdate,
  })
  expect(removed.classChoiceSelections).toEqual([])
  expect(removed.proficiencies.armor).toContain('heavy')
  expect(removed.proficiencies.weapons).not.toContain('martial')
  const thaumaturge = confirm(protector, 'Thaumaturge')
  expect(thaumaturge.proficiencies.armor).toContain('heavy')
  expect(thaumaturge.proficiencies.weapons).not.toContain('martial')
  const calculation = calculate(thaumaturge)
  const skills = (modifiers = calculation.abilityScores.modifiers, map?: Record<string, string>) =>
    deriveAllSkills(
      modifiers,
      [],
      [],
      2,
      map,
      ['arcana', 'religion'],
      calculation.effects.declarations,
    )
  expect(skills().map((row) => row.modifier)).toEqual([4, 4])
  const lowWisdom = calculate({
    ...thaumaturge,
    abilityScores: { ...thaumaturge.abilityScores, wisdom: 8 },
  })
  expect(
    lowWisdom.effects.declarations
      .filter((row) => row.label === 'Thaumaturge')
      .map((row) => row.operation),
  ).toEqual([
    { kind: 'add', value: 1 },
    { kind: 'add', value: 1 },
  ])
  expect(
    skills(undefined, { arcana: 'wisdom', religion: 'intelligence' }).map((row) => row.modifier),
  ).toEqual([3, 4])
  const slots = getSelectedFeatureCantripSlots(thaumaturge, catalogs)
  expect(slots).toHaveLength(1)
  const foreignList = parseSpells({
    spell: [
      {
        name: 'Guidance',
        source: 'XPHB',
        level: 0,
        classes: { fromClassList: [{ name: 'Cleric (Different)', source: 'XPHB' }] },
      },
    ],
  })[0] as Spell5e
  expect(
    getSelectedFeatureCantripPool(thaumaturge, slots[0], {
      ...calculation.classChoices.spellContext,
      spellsByKey: { guidance: foreignList },
    }).spells,
  ).toEqual([])
  expect(
    validateSpells(
      thaumaturge,
      calculation,
      calculation.classChoices.spellContext?.spellsByKey,
    ).some((row) => row.title.includes('Thaumaturge')),
  ).toBe(true)
  const result = setManagedClassSpellChoiceCommand(
    thaumaturge,
    thaumaturge.provenance,
    {
      slot: slots[0],
      expected: null,
      expectedEmptyRevision: 0,
      target: { name: 'Guidance', source: 'XPHB' },
      policy: 'default',
    },
    calculation.classChoices.spellContext,
  )
  const saved = reopen({
    ...thaumaturge,
    ...result.characterPatch,
    provenance: result.provenanceUpdate,
  })
  expect(calculate(saved).managedClassSpellStatuses[0]).toMatchObject({ active: true })
  const withoutLeaf = {
    ...catalogs,
    classFeatures: catalogs.classFeatures.filter((row) => row.name !== 'Thaumaturge'),
    classFeatureCandidates: undefined,
  }
  expect(calculate(saved, withoutLeaf).managedClassSpellStatuses[0]).toMatchObject({
    active: false,
  })
  expect(calculate(saved).managedClassSpellStatuses[0]).toMatchObject({ active: true })
  const cleared = confirm(saved)
  expect(cleared.managedClassSpellChoices).toEqual([])
  expect(calculate(cleared).effects.declarations.some((row) => row.label === 'Thaumaturge')).toBe(
    false,
  )
}

test('bundled Divine Order grants current benefits and preserves independently owned training', () => {
  verifyDivineOrder(bundled)
})

test.runIf(existsSync(`${configured}/class/class-cleric.json`))(
  'configured Divine Order uses the same source-qualified choices and lifecycle',
  () => verifyDivineOrder(configured),
)
