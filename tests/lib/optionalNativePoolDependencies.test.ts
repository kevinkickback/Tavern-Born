import { expect, test } from 'vitest'
import { getSelectedSubclassData } from '@/lib/5etools/classData'
import {
  getClassFeatureIdentity,
  getSubclassFeatureIdentity,
} from '@/lib/5etools/classFeatureIdentity'
import { findClassReference } from '@/lib/5etools/classReference'
import { getCurrentOptionalDeclaration } from '@/lib/5etools/optionalClassDeclarationSource'
import { optionalDeclarationKey } from '@/lib/5etools/optionalClassDeclarationStructure'
import { OPTIONAL_CLASS_FEATURE_RULES } from '@/lib/5etools/optionalClassFeatureRules'
import {
  OPTIONAL_NATIVE_POOLS,
  OPTIONAL_NATIVE_ROOTS,
} from '@/lib/5etools/optionalClassNativeRules'
import { getClassChoiceCandidates } from '@/lib/character/classChoiceOptions'
import { applyClassChoiceSelectionWithGrantsCommand } from '@/lib/character/commands/classChoiceCommands'
import { projectEffectiveClassChoiceFeatures } from '@/lib/character/effectiveClassChoiceFeatures'
import { createOptionalClassFeatureActivity } from '@/lib/character/optionalClassFeatureActivity'
import type { ClassFeature, SubclassFeature } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import {
  makeOptionalDeclarationCatalog,
  type OptionalDeclarationDocument,
} from '../fixtures/optionalClassDeclarationFixtures'

type Pool = (typeof OPTIONAL_NATIVE_POOLS)[number]
function setup(pool: Pool, change?: (document: OptionalDeclarationDocument) => void) {
  const { data, catalogs } = makeOptionalDeclarationCatalog(
    pool.owner[1] === 'sorcerer' ? 'class/class-sorcerer.json' : 'class/class-fighter.json',
    pool.owner,
    change,
  )
  const cls = findClassReference({ name: pool.owner[1], source: pool.owner[2] }, data.classes)!
  const sub =
    pool.owner[0] === 'subclass'
      ? cls.subclasses!.find(
          (row) =>
            row.name.toLowerCase() === pool.owner[3] && row.source.toLowerCase() === pool.owner[4],
        )
      : undefined
  const character = makeCharacterFixture({
    originSystem: pool.owner[2] === 'xphb' ? '2024' : '2014',
    allowedSources: ['PHB', 'XPHB', 'TCE'],
    classProgression: [
      {
        name: cls.name,
        source: cls.source,
        levels: 3,
        ...(sub ? { subclass: sub.name, subclassSource: sub.source } : {}),
      },
    ],
    variantRules: { optionalClassFeatures: true },
    optionalClassFeatureAdoptions: [
      { owner: pool.owner, target: pool.target, earnedLevel: pool.level },
    ],
  })
  const choice = getClassChoiceCandidates(
    cls,
    getSelectedSubclassData(cls, character.classProgression[0]),
    catalogs,
  ).find((row) => row.id === pool.choiceId)!
  return { data, catalogs, character, choice }
}
function rawTarget(row: Record<string, unknown>, pool: Pool) {
  return pool.owner[0] === 'class'
    ? getClassFeatureIdentity(row as unknown as ClassFeature)
    : getSubclassFeatureIdentity(row as unknown as SubclassFeature)
}
test('standard pool dependencies never become optional targets or adoptable records', () => {
  expect(OPTIONAL_NATIVE_ROOTS).toHaveLength(51)
  expect(OPTIONAL_CLASS_FEATURE_RULES.knownOptionalTargets).toHaveLength(50)
  for (const pool of OPTIONAL_NATIVE_POOLS) {
    const { character, catalogs } = setup(pool)
    const request = {
      owner: pool.dependency.owner,
      target: pool.dependency.target,
      earnedLevel: pool.dependency.level,
    }
    expect(
      characterPersistenceSchema.safeParse({
        ...character,
        optionalClassFeatureAdoptions: [request],
      }).success,
    ).toBe(false)
    for (const enabled of [false, true])
      expect(
        createOptionalClassFeatureActivity(
          {
            ...character,
            optionalClassFeatureAdoptions: [],
            variantRules: { optionalClassFeatures: enabled },
          },
          catalogs,
        ).declared(pool.dependency.owner, pool.dependency.target, pool.dependency.level),
      ).toBe(true)
  }
})
test.each(
  OPTIONAL_NATIVE_POOLS,
)('ordinary dependency $choiceId is distinct from its current optional root', (pool) => {
  const intact = setup(pool)
  const pick = pool.members[0]
  const key = optionalDeclarationKey(
    pool.dependency.owner,
    pool.dependency.target,
    pool.dependency.level,
  )
  expect(
    getCurrentOptionalDeclaration(
      intact.catalogs,
      pool.dependency.owner,
      pool.dependency.target,
      pool.dependency.level,
    ),
  ).toBeDefined()
  const missingProof = {
    ...intact.catalogs,
    optionalClassFeatureSources: intact.catalogs.optionalClassFeatureSources?.filter(
      (row) => row.target !== key,
    ),
  }
  const activity = createOptionalClassFeatureActivity(intact.character, missingProof)
  expect(activity.declared(pool.owner, pool.target, pool.level)).toBe(true)
  expect(activity.option(intact.choice, pick)).toBe(false)
  const empty =
    pool.owner[0] === 'class'
      ? { ...intact.catalogs, classFeatureCandidates: new Map() }
      : { ...intact.catalogs, subclassFeatureCandidates: new Map() }
  expect(
    createOptionalClassFeatureActivity(intact.character, empty).option(intact.choice, pick),
  ).toBe(false)
  expect(
    createOptionalClassFeatureActivity(intact.character, intact.catalogs).option(
      intact.choice,
      pick,
    ),
  ).toBe(true)
  const stale = {
    ...intact.choice,
    selectionCountByLevel: intact.choice.selectionCountByLevel.map((count) => count + 1),
  }
  expect(
    createOptionalClassFeatureActivity(intact.character, intact.catalogs).option(stale, pick),
  ).toBe(false)
})
test.each(
  OPTIONAL_NATIVE_POOLS,
)('raw ordinary grant loss/conflicts cannot borrow the current $choiceId progression', (pool) => {
  const intact = setup(pool),
    pick = pool.members[0]
  for (const mode of [
    'missing body',
    'duplicate body',
    'changed body',
    'conflicting field',
  ] as const) {
    const broken = setup(pool, (document) => {
      const field = pool.owner[0] === 'class' ? 'classFeature' : 'subclassFeature'
      const body = document[field].find((row) => rawTarget(row, pool) === pool.dependency.target)!
      expect(body).toBeDefined()
      if (mode === 'missing body') document[field] = document[field].filter((row) => row !== body)
      else if (mode === 'duplicate body') document[field].push(structuredClone(body))
      else if (mode === 'changed body')
        body.entries = [...(body.entries as unknown[]), 'Changed ordinary granting rules']
      else body.classSource = 'OTHER'
    })
    // The standard progression still normalizes; it cannot substitute for its granting declaration.
    expect(broken.choice).toBeDefined()
    const active = createOptionalClassFeatureActivity(intact.character, broken.catalogs)
    expect(active.declared(pool.owner, pool.target, pool.level), mode).toBe(true)
    expect(active.option(broken.choice, pick), mode).toBe(false)
    expect(
      () =>
        applyClassChoiceSelectionWithGrantsCommand(
          intact.character,
          intact.character.provenance,
          intact.choice,
          [pick],
          { classes: broken.data.classes, catalogs: broken.catalogs },
        ),
      mode,
    ).toThrow()
  }
  expect(
    createOptionalClassFeatureActivity(intact.character, intact.catalogs).option(
      intact.choice,
      pick,
    ),
  ).toBe(true)
})
test.each(
  OPTIONAL_NATIVE_POOLS,
)('dependency loss preserves intent and inverse/restoration for $choiceId', (pool) => {
  const { data, catalogs, character, choice } = setup(pool),
    pick = pool.members[0]
  const result = applyClassChoiceSelectionWithGrantsCommand(
    character,
    character.provenance,
    choice,
    [pick],
    { classes: data.classes, catalogs },
  )
  const saved = characterPersistenceSchema.parse({
    ...character,
    ...result.characterPatch,
    provenance: result.provenanceUpdate,
  })
  const key = optionalDeclarationKey(
    pool.dependency.owner,
    pool.dependency.target,
    pool.dependency.level,
  )
  const absent = {
    ...catalogs,
    optionalClassFeatureSources: catalogs.optionalClassFeatureSources?.filter(
      (row) => row.target !== key,
    ),
  }
  expect(
    projectEffectiveClassChoiceFeatures(saved, absent).features.some(
      (row) => row.name === pick.name,
    ),
  ).toBe(false)
  expect(saved.optionalClassFeatureAdoptions).toEqual(character.optionalClassFeatureAdoptions)
  expect(saved.classChoiceSelections?.[0].selected[0].name).toBe(pick.name)
  const cleared = applyClassChoiceSelectionWithGrantsCommand(saved, saved.provenance, choice, [], {
    classes: data.classes,
    catalogs: absent,
  })
  const next = characterPersistenceSchema.parse({
    ...saved,
    ...cleared.characterPatch,
    provenance: cleared.provenanceUpdate,
  })
  expect(next.optionalClassFeatureAdoptions).toEqual(character.optionalClassFeatureAdoptions)
  expect(
    projectEffectiveClassChoiceFeatures(next, catalogs).features.some(
      (row) => row.name === pick.name,
    ),
  ).toBe(false)
  // An independent provider with its own ID survives the managed route's suspension.
  const independent: Character = {
    ...saved,
    features: [
      ...saved.features,
      { ...saved.features.find((row) => row.name === pick.name)!, id: 'independent-provider' },
    ],
  }
  expect(
    projectEffectiveClassChoiceFeatures(independent, absent).features.some(
      (row) => row.id === 'independent-provider',
    ),
  ).toBe(true)
  expect(
    projectEffectiveClassChoiceFeatures(saved, catalogs).features.filter(
      (row) => row.name === pick.name,
    ),
  ).toHaveLength(1)
  const withoutMirrors = {
    ...saved,
    features: [],
    provenance: { ...saved.provenance, features: {} },
  }
  expect(
    projectEffectiveClassChoiceFeatures(withoutMirrors, catalogs).features.filter(
      (row) => row.name === pick.name,
    ),
  ).toHaveLength(1)
})
test.each(
  OPTIONAL_NATIVE_POOLS,
)('later unrelated grants do not poison initial $choiceId expansion', (pool) => {
  const current = setup(pool, (document) => {
    const field = pool.owner[0] === 'class' ? 'classFeature' : 'subclassFeature'
    document[field] = document[field].filter(
      (row) =>
        !(
          Number(row.level) > 3 &&
          (row.name === 'Metamagic' || row.name === 'Additional Maneuvers')
        ),
    )
  })
  const activity = createOptionalClassFeatureActivity(current.character, current.catalogs)
  expect(activity.option(current.choice, pool.members[0])).toBe(true)
})
