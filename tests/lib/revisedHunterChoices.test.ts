// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { DataFilter } from '@/lib/5etools/filters'
import { buildClassLookup } from '@/lib/5etools/lookups'
import { parseClassDocument } from '@/lib/5etools/parsers/classes'
import { deriveRulesTextActions } from '@/lib/calculations/actions'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import {
  buildClassChoiceFeatureCatalogs,
  createClassChoiceCatalogs,
  getCharacterClassChoices,
  resolveClassChoiceOptions,
} from '@/lib/character/classChoiceOptions'
import { effectiveClassDisplayData } from '@/lib/character/classFeatureActivityView'
import { applyClassChoiceSelectionWithGrantsCommand } from '@/lib/character/commands/classChoiceCommands'
import { applyLevelDown } from '@/lib/character/commands/classCommands'
import { createOptionalClassFeatureActivity } from '@/lib/character/optionalClassFeatureActivity'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import { validateClassChoices } from '@/lib/readiness/classReadiness'
import type { Class5e, ClassFeature } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import type { NormalizedCharacterChoice, NormalizedChoiceOptionReference } from '@/types/classRules'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

const file = 'resources/srd/core/data/class/class-ranger.json'
const document = JSON.parse(readFileSync(file, 'utf8'))
const prey = "Hunter's Prey"
const defense = 'Defensive Tactics'
function load(raw = document, source = 'XPHB') {
  const parsed = parseClassDocument(raw, file)
  const classes = DataFilter.filterClasses(parsed.classes as Class5e[], { sources: [source] })
  const ranger = classes.find((row) => row.name === 'Ranger' && row.source === source)!
  const hunter = ranger.subclasses!.find((row) => row.name === 'Hunter' && row.source === source)!
  const catalogs = buildClassChoiceFeatureCatalogs({
    classes,
    classFeatures: parsed.classFeatures as ClassFeature[],
    classCastingSources: parsed.classCastingSources,
  })
  const lookups = {
    classesByKey: buildClassLookup(classes),
    classChoiceClasses: classes,
    classChoiceFeatureCatalogs: catalogs,
  }
  return { ranger, hunter, catalogs, classes, lookups }
}
type Data = ReturnType<typeof load>
const character = (source = 'XPHB', levels = 7) =>
  makeCharacterFixture({
    originSystem: source === 'XPHB' ? '2024' : '2014',
    allowedSources: [source],
    classProgression: [
      { name: 'Ranger', source, levels, subclass: 'Hunter', subclassSource: source },
    ],
  })
const setup = (actor: Character, data: Data) =>
  getCharacterClassChoices(
    data.ranger,
    data.hunter,
    createOptionalClassFeatureActivity(actor, data.catalogs),
    data.catalogs,
  ).filter((row) => row.owner.type === 'subclass')
const choose = (
  actor: Character,
  data: Data,
  choice: NormalizedCharacterChoice,
  options: NormalizedChoiceOptionReference[],
) => {
  const result = applyClassChoiceSelectionWithGrantsCommand(
    actor,
    actor.provenance,
    choice,
    options,
    { classes: data.classes, catalogs: data.catalogs },
  )
  return characterPersistenceSchema.parse(
    JSON.parse(
      JSON.stringify({
        ...actor,
        ...result.characterPatch,
        provenance: result.provenanceUpdate,
      }),
    ),
  )
}
const readiness = (actor: Character, data: Data) =>
  validateClassChoices(
    actor,
    createCharacterCalculationContext(actor, data.lookups),
    createClassChoiceCatalogs(data.catalogs),
  ).map((row) => row.title)
const summaries = (actor: Character, data: Data) =>
  createCharacterSheetViewModel(actor, data.lookups, data.lookups).featuresSummary

test('filtered revised Hunter choices confirm separately and reopen with only selected rules', () => {
  const data = load()
  const actor = character()
  const [first, second] = setup(actor, data)
  expect([first, second].map((row) => [row.label, row.level, row.minimumSelections])).toEqual([
    [prey, 3, 1],
    [defense, 7, 1],
  ])
  expect(first.options.map((row) => row.name)).toEqual(['Colossus Slayer', 'Horde Breaker'])
  expect(second.options.map((row) => row.name)).toEqual(['Escape the Horde', 'Multiattack Defense'])
  expect(readiness(actor, data)).toEqual(
    expect.arrayContaining([`Finish ${prey}`, `Finish ${defense}`]),
  )
  expect(() => choose(actor, data, first, first.options)).toThrow(RangeError)
  expect(() => choose(actor, data, first, [second.options[0]])).toThrow(RangeError)
  expect(() => choose(actor, data, first, [{ ...first.options[0], source: undefined }])).toThrow(
    RangeError,
  )
  expect(() => choose(character('XPHB', 6), data, second, [second.options[0]])).toThrow(RangeError)
  const saved = choose(choose(actor, data, first, [first.options[1]]), data, second, [
    second.options[1],
  ])
  expect(
    saved.classChoiceSelections?.map((row) => [
      row.classLevel,
      row.selected[0].slotLevel,
      row.selected[0].name,
    ]),
  ).toEqual([
    [3, 3, 'Horde Breaker'],
    [7, 7, 'Multiattack Defense'],
  ])
  expect(readiness(saved, data)).not.toContain(`Finish ${prey}`)
  expect(readiness(saved, data)).not.toContain(`Finish ${defense}`)
  const text = summaries(saved, data)
  expect(text).toContain('Horde Breaker')
  expect(text).toContain('Multiattack Defense')
  expect(text).not.toContain('Colossus Slayer')
  expect(text).not.toContain('Escape the Horde')
  const display = effectiveClassDisplayData(
    data.ranger,
    createOptionalClassFeatureActivity(saved, data.catalogs),
  )
  const rules = JSON.stringify(
    display?.subclasses?.find((row) => row.source === 'XPHB')?.levelFeatures,
  )
  expect(rules).toContain('Horde Breaker')
  expect(rules).not.toContain('Colossus Slayer')
  const actions = deriveRulesTextActions(saved, undefined, {
    classes: data.classes,
    classChoiceFeatureCatalogs: data.catalogs,
  })
  expect(actions.map((row) => row.name)).not.toContain('Horde Breaker')
  const lower = applyLevelDown(
    saved,
    saved.provenance,
    createCharacterCalculationContext(saved, data.lookups),
  )
  expect(lower.characterPatch.classChoiceSelections?.map((row) => row.label)).toEqual([prey])
})

test('source removal suspends the exact option and restoration keeps intent', () => {
  const data = load()
  const actor = character()
  const first = setup(actor, data)[0]
  const saved = choose(actor, data, first, [first.options[1]])
  const copy = structuredClone(document)
  copy.subclassFeature = copy.subclassFeature.filter(
    (row: SubclassFeatureLike) => row.name !== prey || row.source !== 'XPHB',
  )
  const missing = load(copy)
  expect(setup(saved, missing).map((row) => row.label)).not.toContain(prey)
  expect(readiness(actor, missing)).toContain(`Review unresolved ${prey} choice`)
  expect(readiness(saved, missing)).toContain(`Restore or remove ${prey}`)
  expect(readiness(saved, missing)).not.toContain(`Review unresolved ${prey} choice`)
  expect(summaries(saved, missing)).not.toContain("haven't attacked this turn")
  expect(summaries(saved, data)).toContain("haven't attacked this turn")
  expect(saved.classChoiceSelections?.[0].selected[0].name).toBe('Horde Breaker')
  const pool = resolveClassChoiceOptions(
    first,
    createClassChoiceCatalogs(missing.catalogs),
    saved.classChoiceSelections?.[0].selected,
    7,
    saved,
  )
  expect(pool.every((row) => row.availability === 'retained')).toBe(true)
  const legacy = load(document, 'PHB')
  expect(setup(character('PHB', 20), legacy).map((row) => [row.label, row.options.length])).toEqual(
    [
      [prey, 3],
      [defense, 3],
      ['Multiattack', 2],
      ["Superior Hunter's Defense", 3],
    ],
  )
})

type SubclassFeatureLike = { name: string; source: string }

test('optional variants and missing class gains do not grant Hunter choices', () => {
  const variant = structuredClone(document)
  const preyFeature = variant.subclassFeature.find(
    (row: SubclassFeatureLike) => row.name === prey && row.source === 'XPHB',
  )
  preyFeature.isClassFeatureVariant = true
  expect(setup(character(), load(variant)).map((row) => row.label)).toEqual([defense])

  const orphan = structuredClone(document)
  const ranger = orphan.class.find((row: { source: string }) => row.source === 'XPHB')
  const gain = ranger.classFeatures.find(
    (row: { classFeature?: string }) => row.classFeature === 'Subclass Feature|Ranger|XPHB|7',
  )
  delete gain.gainSubclassFeature
  expect(setup(character(), load(orphan)).map((row) => row.label)).toEqual([prey])

  const conflict = structuredClone(document)
  const gainFeature = conflict.classFeature.find(
    (row: ClassFeature) =>
      row.name === 'Subclass Feature' && row.source === 'XPHB' && row.level === 7,
  )
  conflict.classFeature.push({ ...gainFeature, entries: ['Conflicting subclass gain.'] })
  expect(setup(character(), load(conflict)).map((row) => row.label)).toEqual([prey])
})
