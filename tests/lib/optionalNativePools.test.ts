import { expect, test } from 'vitest'
import { getSelectedSubclassData } from '@/lib/5etools/classData'
import { findClassReference } from '@/lib/5etools/classReference'
import { OPTIONAL_NATIVE_POOLS } from '@/lib/5etools/optionalClassNativeRules'
import { buildClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import {
  createClassChoiceCatalogs,
  getClassChoiceCandidates,
  resolveClassChoiceOptions,
} from '@/lib/character/classChoiceOptions'
import { applyClassChoiceSelectionWithGrantsCommand } from '@/lib/character/commands/classChoiceCommands'
import { projectEffectiveClassChoiceFeatures } from '@/lib/character/effectiveClassChoiceFeatures'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeOptionalDeclarationCatalog } from '../fixtures/optionalClassDeclarationFixtures'

test.each(
  OPTIONAL_NATIVE_POOLS,
)('actual native pool $choiceId extends only its source-owned progression', (pool) => {
  const { data } = makeOptionalDeclarationCatalog(
    pool.owner[1] === 'sorcerer' ? 'class/class-sorcerer.json' : 'class/class-fighter.json',
    pool.owner,
  )
  const catalogs = buildClassChoiceFeatureCatalogs(data)
  const selectedClass = findClassReference(
    { name: pool.owner[1], source: pool.owner[2] },
    data.classes,
  )!
  const selectedSubclass =
    pool.owner[0] === 'subclass'
      ? selectedClass.subclasses!.find(
          (row) =>
            row.name.toLowerCase() === pool.owner[3] && row.source.toLowerCase() === pool.owner[4],
        )
      : undefined
  const character = makeCharacterFixture({
    originSystem: pool.owner[2] === 'xphb' ? '2024' : '2014',
    allowedSources: ['PHB', 'XPHB', 'TCE'],
    classProgression: [
      {
        name: selectedClass.name,
        source: selectedClass.source,
        levels: 3,
        ...(selectedSubclass
          ? { subclass: selectedSubclass.name, subclassSource: selectedSubclass.source }
          : {}),
      },
    ],
    variantRules: { optionalClassFeatures: true },
  })
  const cls = findClassReference(character.classProgression[0], data.classes)!
  const choice = getClassChoiceCandidates(
    cls,
    getSelectedSubclassData(cls, character.classProgression[0]),
    catalogs,
  ).find((row) => row.id === pool.choiceId)!
  expect(choice).toBeDefined()
  const adopted = {
    ...character,
    optionalClassFeatureAdoptions: [
      { owner: pool.owner, target: pool.target, earnedLevel: pool.level },
    ],
  }
  const available = (actor = character) =>
    resolveClassChoiceOptions(choice, createClassChoiceCatalogs(catalogs), [], 3, actor).filter(
      (row) => row.availability === 'eligible',
    )
  expect(available().some((row) => row.reference.source === 'PHB')).toBe(true)
  expect(available().some((row) => row.reference.source === 'TCE')).toBe(false)
  const expanded = available(adopted)
  expect(
    expanded
      .filter((row) => row.reference.source === 'TCE')
      .map((row) => row.reference.name)
      .sort(),
  ).toEqual(pool.members.map((row) => row.name).sort())
  expect(choice.selectionCountByLevel[2]).toBe(pool.owner[1] === 'sorcerer' ? 2 : 3)
  expect(choice.selectionCountByLevel[9]).toBe(pool.owner[1] === 'sorcerer' ? 3 : 7)
  const pick = pool.members[0]
  expect(() =>
    applyClassChoiceSelectionWithGrantsCommand(character, character.provenance, choice, [pick], {
      classes: data.classes,
      catalogs,
    }),
  ).toThrow()
  const result = applyClassChoiceSelectionWithGrantsCommand(
    adopted,
    adopted.provenance,
    choice,
    [pick],
    { classes: data.classes, catalogs },
  )
  const saved = characterPersistenceSchema.parse({
    ...adopted,
    ...result.characterPatch,
    provenance: result.provenanceUpdate,
  })
  expect(saved.features.some((row) => row.name === pick.name)).toBe(true)
  expect(
    projectEffectiveClassChoiceFeatures(
      { ...saved, variantRules: { optionalClassFeatures: false } },
      catalogs,
    ).features.some((row) => row.name === pick.name),
  ).toBe(false)
  expect(
    projectEffectiveClassChoiceFeatures(saved, {
      ...catalogs,
      optionalClassFeatureSources: [],
    }).features.some((row) => row.name === pick.name),
  ).toBe(false)
  expect(
    projectEffectiveClassChoiceFeatures(saved, catalogs).features.some(
      (row) => row.name === pick.name,
    ),
  ).toBe(true)
})
