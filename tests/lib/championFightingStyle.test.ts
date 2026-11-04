import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { buildClassLookup } from '@/lib/5etools/lookups'
import { parseFeats, parseOptionalFeatures } from '@/lib/5etools/parsers/basic'
import { parseClassDocument } from '@/lib/5etools/parsers/classes'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import {
  buildClassChoiceFeatureCatalogs,
  createClassChoiceCatalogs,
  getCharacterClassChoices,
  resolveClassChoiceOptions,
} from '@/lib/character/classChoiceOptions'
import {
  applyClassChoiceSelectionWithGrantsCommand,
  reconcileClassChoiceFeatMirror,
} from '@/lib/character/commands/classChoiceCommands'
import { projectEffectiveClassChoiceFeatures } from '@/lib/character/effectiveClassChoiceFeatures'
import { createOptionalClassFeatureActivity } from '@/lib/character/optionalClassFeatureActivity'
import { validateClassChoices } from '@/lib/readiness/classReadiness'
import type { Class5e, ClassFeature, Feat5e } from '@/types/5etools'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

const read = (file: string) => JSON.parse(readFileSync(`resources/srd/core/data/${file}`, 'utf8'))
const doc = parseClassDocument(read('class/class-fighter.json'), 'bundled-fighter')
const feats = parseFeats(read('feats.json')) as Feat5e[]
const optionalfeatures = parseOptionalFeatures(read('optionalfeatures.json'))

test.each([
  ['PHB', '2014', 10],
  ['XPHB', '2024', 7],
] as const)('bundled %s Champion blocks new duplicate styles and preserves an older duplicate for repair', (source, originSystem, levels) => {
  const fighter = (doc.classes as Class5e[]).find((row) => row.source === source)!
  const champion = fighter.subclasses!.find(
    (row) => row.name === 'Champion' && row.source === source,
  )!
  const catalogs = buildClassChoiceFeatureCatalogs({
    classes: [fighter],
    classFeatures: doc.classFeatures as ClassFeature[],
    feats,
    optionalfeatures,
  })
  let character = makeCharacterFixture({
    originSystem,
    classProgression: [
      { name: 'Fighter', source, levels, subclass: 'Champion', subclassSource: source },
    ],
  })
  const styles = getCharacterClassChoices(
    fighter,
    champion,
    createOptionalClassFeatureActivity(character, catalogs),
    catalogs,
  )
    .filter((choice) => choice.label === 'Fighting Style')
    .sort((a, b) => a.level - b.level)
  expect(styles.map((choice) => choice.level)).toEqual([1, levels])
  const [base, additional] = styles
  const options = (
    choice: typeof base,
    saved = character.classChoiceSelections?.find((row) => row.choiceId === choice.id)?.selected ??
      [],
  ) =>
    resolveClassChoiceOptions(
      choice,
      { ...createClassChoiceCatalogs(catalogs), feats },
      saved,
      levels,
      character,
    )
  const archery = options(base).find(
    (row) => row.reference.name === 'Archery' && row.reference.source === source,
  )!.reference
  const defense = options(base).find(
    (row) => row.reference.name === 'Defense' && row.reference.source === source,
  )!.reference
  if (source === 'XPHB') {
    expect(
      options(additional).find((row) => row.reference.name === 'Two-Weapon Fighting')?.prerequisite,
    ).toBeUndefined()
    const malformed = [null, { level: 20 }] as unknown as Feat5e['prerequisite']
    expect(
      resolveClassChoiceOptions(
        additional,
        {
          ...createClassChoiceCatalogs(catalogs),
          feats: feats.map((feat) =>
            feat.name === 'Two-Weapon Fighting' ? { ...feat, prerequisite: malformed } : feat,
          ),
        },
        [],
        levels,
        character,
      ).find((row) => row.reference.name === 'Two-Weapon Fighting')?.prerequisite,
    ).toEqual(malformed)
  }
  const save = (choice: typeof base, picks: (typeof archery)[]) => {
    const result = applyClassChoiceSelectionWithGrantsCommand(
      character,
      character.provenance,
      choice,
      picks,
      {
        classes: [fighter],
        catalogs,
        feats,
      },
    )
    character = characterPersistenceSchema.parse({
      ...character,
      ...result.characterPatch,
      provenance: result.provenanceUpdate,
    })
  }
  save(base, [archery])
  expect(options(additional).some((row) => row.reference.name === 'Archery')).toBe(false)
  expect(() => save(additional, [archery])).toThrow(RangeError)
  expect(() =>
    applyClassChoiceSelectionWithGrantsCommand(
      character,
      character.provenance,
      additional,
      [archery],
      { classes: [fighter], catalogs: { ...catalogs, classes: undefined }, feats },
    ),
  ).toThrow(RangeError)
  if (source === 'PHB') {
    const lean = applyClassChoiceSelectionWithGrantsCommand(
      character,
      character.provenance,
      additional,
      [defense],
      { classes: [fighter], catalogs: { ...catalogs, classes: undefined }, feats },
    )
    expect(lean.characterPatch.features?.map((feature) => feature.name)).toEqual(
      expect.arrayContaining(['Archery', 'Defense']),
    )
  }
  save(additional, [defense])
  expect(() => save(base, [defense])).toThrow(RangeError)
  const stale = {
    ...character.classChoiceSelections!.find((row) => row.choiceId === additional.id)!,
    selected: [{ ...archery, slotLevel: levels }],
  }
  const mirror = reconcileClassChoiceFeatMirror(character, character.provenance, additional, stale)
  character = characterPersistenceSchema.parse({
    ...character,
    ...mirror.characterPatch,
    provenance: mirror.provenanceUpdate,
    classChoiceSelections: [
      stale,
      ...character.classChoiceSelections!.filter((row) => row.choiceId !== additional.id),
    ],
  })
  expect(options(base).find((row) => row.reference.name === 'Archery')?.availability).toBe(
    'eligible',
  )
  expect(options(additional).find((row) => row.reference.name === 'Archery')?.availability).toBe(
    'retained',
  )
  const calculation = createCharacterCalculationContext(character, {
    classesByKey: buildClassLookup([fighter]),
    classChoiceClasses: [fighter],
    classChoiceFeatureCatalogs: catalogs,
  })
  expect(
    validateClassChoices(character, calculation, {
      ...createClassChoiceCatalogs(catalogs),
      feats,
    })
      .filter((row) => row.title === 'Finish Fighting Style')
      .map((row) => row.id),
  ).toEqual([`class-choice:${additional.id}`])
  const effective = () => projectEffectiveClassChoiceFeatures(character, catalogs)
  if (source === 'XPHB')
    expect(effective().classFeatChoices?.map((row) => row.id)).toEqual([base.id])
  else expect(effective().features.filter((feature) => feature.name === 'Archery')).toHaveLength(1)
  const saved = character
  const conflicting = projectEffectiveClassChoiceFeatures(saved, {
    ...catalogs,
    classes: [{ ...fighter, sourceIdentityConflict: true }],
  })
  if (source === 'XPHB') expect(conflicting.classFeatChoices).toEqual([])
  else expect(conflicting.features.some((feature) => feature.name === 'Archery')).toBe(false)
  character = characterPersistenceSchema.parse({
    ...character,
    classChoiceSelections: character.classChoiceSelections!.map((row) =>
      row.choiceId === base.id
        ? { ...row, selected: row.selected.map((pick) => ({ ...pick, slotLevel: 2 })) }
        : row,
    ),
  })
  expect(options(base).find((row) => row.reference.name === 'Archery')?.availability).toBe(
    'retained',
  )
  if (source === 'XPHB')
    expect(effective().classFeatChoices?.map((row) => row.id)).toEqual([additional.id])
  else expect(effective().features.filter((feature) => feature.name === 'Archery')).toHaveLength(1)
  character = saved
  save(base, [])
  expect(options(additional).find((row) => row.reference.name === 'Archery')?.availability).toBe(
    'eligible',
  )
  if (source === 'XPHB')
    expect(effective().classFeatChoices?.map((row) => row.id)).toEqual([additional.id])
  else expect(effective().features.filter((feature) => feature.name === 'Archery')).toHaveLength(1)
})
