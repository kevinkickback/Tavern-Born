import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { getSubclassFeatureGroups } from '@/lib/5etools/classData'
import {
  isHiddenFeatureSelection,
  visibleClassData,
  visibleClassFeatureEntries,
} from '@/lib/5etools/classFeatureVariants'
import { buildClassLookup, buildGameDataLookups } from '@/lib/5etools/lookups'
import { parseClassDocument } from '@/lib/5etools/parsers/classes'
import { deriveRulesTextActions } from '@/lib/calculations/actions'
import {
  buildClassChoiceFeatureCatalogs,
  createClassChoiceCatalogs,
  getClassChoiceCandidates,
} from '@/lib/character/classChoiceOptions'
import { upsertManualActionCommand } from '@/lib/character/commands/actionCommands'
import { applyClassChoiceSelectionWithGrantsCommand } from '@/lib/character/commands/classChoiceCommands'
import { setOptionalClassAdoptionCommand } from '@/lib/character/commands/optionalClassFeatureCommands'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import type { Class5e, ClassFeature, SubclassFeature } from '@/types/5etools'
import { characterPersistenceSchema } from '@/types/characterSchema'
import type { NormalizedCharacterChoice } from '@/types/classRules'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeOptionalClassSectionData } from '../fixtures/optionalClassSectionFixtures'

const source = JSON.parse(readFileSync('tests/fixtures/optionalClassSources.json', 'utf8'))
function fighter() {
  return parseClassDocument({
    ...source,
    class: [
      { name: 'Fighter', source: 'PHB', classFeatures: ['Martial Archetype|Fighter|PHB|3|PHB'] },
    ],
  }).classes[0] as Class5e
}

test('actual Battle Master wrapper excludes flagged nested Maneuver Options while preserving base sibling features and raw source', () => {
  const cls = fighter(),
    before = JSON.stringify(cls)
  const current = visibleClassData(cls, false)!
  const groups = getSubclassFeatureGroups(
    current.subclasses!.find((row) => row.name === 'Battle Master')!,
  )
  const text = JSON.stringify(groups)
  expect(text).not.toContain('Maneuver Options')
  expect(text).toContain(
    source.subclassFeature.find((row: ClassFeature) => row.name === 'Combat Superiority')
      .entries[0],
  )
  expect(text).toContain(
    source.subclassFeature.find((row: ClassFeature) => row.name === 'Student of War').entries[0],
  )
  expect(JSON.stringify(visibleClassData(cls, true))).toContain('Maneuver Options')
  expect(isHiddenFeatureSelection(cls, 'Maneuver Options', 'TCE')).toBe(true)
  expect(JSON.stringify(cls)).toBe(before)
  expect(
    visibleClassFeatureEntries(
      [
        { name: 'Optional Rule: Firearms', entries: ['example'] },
        { name: 'Base', entries: ['keep'] },
      ],
      false,
    ),
  ).toEqual([{ name: 'Base', entries: ['keep'] }])
})

test('actual optional Steady Aim loses its active action while base Cunning Action and source catalog survive OFF/ON', () => {
  const rows = source.classFeature.filter(
    (row: ClassFeature) => row.className === 'Rogue',
  ) as ClassFeature[]
  const parsed = parseClassDocument({
    class: [
      {
        name: 'Rogue',
        source: 'PHB',
        classFeatures: rows.map((row) => `${row.name}|Rogue|PHB|${row.level}|${row.source}`),
      },
    ],
    classFeature: rows,
  })
  const classes = parsed.classes as Class5e[]
  const character = makeCharacterFixture({
    classProgression: [{ name: 'Rogue', source: 'PHB', levels: 3 }],
  })
  const off = deriveRulesTextActions(character, undefined, { classes })
  expect(off.some((row) => row.name === 'Steady Aim')).toBe(false)
  expect(off.some((row) => row.name === 'Cunning Action')).toBe(true)
  const on = deriveRulesTextActions(
    { ...character, variantRules: { optionalClassFeatures: true } },
    undefined,
    { classes },
  )
  expect(on.some((row) => row.name === 'Steady Aim')).toBe(false)
  expect(on.find((row) => row.name === 'Cunning Action')?.id).toBe(
    off.find((row) => row.name === 'Cunning Action')?.id,
  )
  expect(classes[0].classFeatureRefs?.some((row) => row.name === 'Steady Aim')).toBe(true)
})

test('actual selected Interception follows ON/OFF/ON in Actions and PDF while Protection, intent and manual overrides survive', () => {
  const { data, catalogs: sourceCatalogs } = makeOptionalClassSectionData()
  const classes = data.classes
  data.lookups = buildGameDataLookups(data)
  const catalogs = {
    ...createClassChoiceCatalogs(sourceCatalogs),
  }
  const descriptor = getClassChoiceCandidates(
    classes.find((row) => row.name === 'Fighter' && row.source === 'PHB')!,
    undefined,
    catalogs,
  ).find((row) => row.level === 1 && row.kind === 'optional-feature')!
  for (const [name, printing, optional] of [
    ['Interception', 'TCE', true],
    ['Protection', 'PHB', false],
  ] as const) {
    const baseCharacter = makeCharacterFixture({
      classProgression: [{ name: 'Fighter', source: 'PHB', levels: 1 }],
      variantRules: { optionalClassFeatures: true },
      allowedSources: ['PHB', 'TCE'],
    })
    const adopted = optional
      ? setOptionalClassAdoptionCommand(
          baseCharacter,
          baseCharacter.provenance,
          catalogs,
          { owner: ['class', 'fighter', 'phb'], target: 'book-section|tce|0dc', earnedLevel: 1 },
          true,
          [],
        )
      : undefined
    const character = adopted
      ? characterPersistenceSchema.parse({
          ...baseCharacter,
          ...adopted.characterPatch,
          provenance: adopted.provenanceUpdate,
        })
      : baseCharacter
    const result = applyClassChoiceSelectionWithGrantsCommand(
      character,
      character.provenance!,
      descriptor,
      [{ entityType: 'optionalFeature', name, source: printing }],
      { classes, catalogs },
    )
    const saved = characterPersistenceSchema.parse({
      ...character,
      ...result.characterPatch,
      provenance: result.provenanceUpdate,
    })
    const before = JSON.stringify({ saved, data })
    const context = {
      classes,
      optionalFeaturesByKey: data.lookups.optionalFeaturesByKey,
      classChoiceFeatureCatalogs: catalogs,
    }
    const [action] = deriveRulesTextActions(saved, undefined, context).filter(
      (row) => row.name === name,
    )
    expect(action?.kind).toBe('reaction')
    const off = { ...saved, variantRules: { optionalClassFeatures: false } }
    expect(deriveRulesTextActions(off, undefined, context).some((row) => row.name === name)).toBe(
      !optional,
    )
    const input = {
      ...data.lookups,
      classesByKey: buildClassLookup(classes),
      classChoiceClasses: classes,
      classChoiceFeatureCatalogs: catalogs,
    }
    expect(createCharacterSheetViewModel(off, input).actions.some((row) => row.name === name)).toBe(
      !optional,
    )
    expect(
      deriveRulesTextActions(
        { ...off, variantRules: { optionalClassFeatures: true } },
        undefined,
        context,
      ).find((row) => row.name === name)?.id,
    ).toBe(action.id)
    const configured = {
      ...off,
      ...upsertManualActionCommand(off, {
        ...action,
        name: 'Player configuration',
        description: 'Explicit player note.',
        active: false,
      }),
    }
    expect(
      createCharacterSheetViewModel(configured, input).actions.find((row) => row.id === action.id),
    ).toMatchObject({ name: 'Player configuration', active: false })
    expect(
      createCharacterSheetViewModel(
        { ...configured, variantRules: { optionalClassFeatures: true } },
        input,
      ).actions.find((row) => row.id === action.id),
    ).toMatchObject({ name: 'Player configuration', active: false })
    expect(
      createCharacterSheetViewModel(configured, {
        ...input,
        optionalFeaturesByKey: {},
      }).actions.find((row) => row.id === action.id),
    ).toMatchObject({ name: 'Player configuration', active: false })
    expect(
      deriveRulesTextActions(saved, undefined, { ...context, optionalFeaturesByKey: {} }).some(
        (row) => row.name === name,
      ),
    ).toBe(false)
    expect(JSON.stringify({ saved, data })).toBe(before)
  }
})

test.each([
  'class',
  'subclass',
] as const)('selected %s feature roots and nested variants share filtering while base action IDs and overrides stay stable', (kind) => {
  const feature: SubclassFeature = {
    name: 'Beacon',
    source: 'PHB',
    className: 'Wizard',
    classSource: 'PHB',
    level: 1,
    subclassShortName: 'School',
    subclassSource: 'PHB',
    entries: [
      'As an action, light a beacon.',
      {
        type: 'entries',
        name: 'Optional illumination',
        isClassFeatureVariant: true,
        entries: ['As a bonus action, change its color.'],
      },
    ],
  }
  const uid = kind === 'class' ? 'Beacon|Wizard|PHB|1|PHB' : 'Beacon|Wizard|PHB|School|PHB|1|PHB'
  const reference = {
    ...feature,
    ref: uid,
    feature,
    className: 'Wizard',
    classSource: 'PHB',
    subclassShortName: 'School',
    subclassSource: 'PHB',
  }
  const subclass = {
    name: 'School',
    shortName: 'School',
    source: 'PHB',
    className: 'Wizard',
    classSource: 'PHB',
    subclassFeatureRefs: [reference],
  }
  const cls: Class5e = {
    name: 'Wizard',
    source: 'PHB',
    classFeatureRefs: kind === 'class' ? [reference] : [],
    subclasses: kind === 'subclass' ? [subclass] : [],
  }
  const option = {
    entityType: kind === 'class' ? ('classFeature' as const) : ('subclassFeature' as const),
    name: 'Beacon',
    source: 'PHB',
    ref: uid,
  }
  const choice: NormalizedCharacterChoice = {
    id: `choice:${kind}`,
    label: 'Beacon',
    kind: kind === 'class' ? 'class-feature' : 'subclass-feature',
    owner: {
      type: kind,
      name: 'Wizard',
      source: 'PHB',
      ...(kind === 'subclass' ? { subclassName: 'School', subclassSource: 'PHB' } : {}),
    },
    level: 1,
    minimumSelections: 1,
    maximumSelections: 1,
    selectionCountByLevel: Array(20).fill(1),
    options: [option],
    repeatable: false,
    replacement: { cadence: 'never' },
    source: { kind: 'class-feature-options', field: 'test' },
  }
  const character = makeCharacterFixture({
    classProgression: [
      {
        name: 'Wizard',
        source: 'PHB',
        levels: 1,
        ...(kind === 'subclass' ? { subclass: 'School', subclassSource: 'PHB' } : {}),
      },
    ],
    variantRules: { optionalClassFeatures: true },
  })
  const result = applyClassChoiceSelectionWithGrantsCommand(
    character,
    character.provenance!,
    choice,
    [option],
  )
  const saved = characterPersistenceSchema.parse({
    ...character,
    ...result.characterPatch,
    provenance: result.provenanceUpdate,
  })
  const catalogs = buildClassChoiceFeatureCatalogs({
    classes: [cls],
    classFeatures: kind === 'class' ? [feature] : [],
  })
  const context = { classes: [cls], classChoiceFeatureCatalogs: catalogs }
  const [on] = deriveRulesTextActions(saved, undefined, context)
  const [off] = deriveRulesTextActions(
    { ...saved, variantRules: { optionalClassFeatures: false } },
    undefined,
    context,
  )
  expect(on.description).not.toContain('Optional illumination')
  expect(on.description).toContain('light a beacon')
  expect(off.description).not.toContain('Optional illumination')
  expect(off.description).toContain('light a beacon')
  expect(off.id).toBe(on.id)
  const flagged = { ...feature, isClassFeatureVariant: true }
  const hiddenCls: Class5e = {
    ...cls,
    classFeatureRefs: [],
    subclasses:
      kind === 'subclass'
        ? [{ ...subclass, subclassFeatureRefs: [{ ...reference, feature: flagged }] }]
        : [],
  }
  const hiddenCatalogs = buildClassChoiceFeatureCatalogs({
    classes: [hiddenCls],
    classFeatures: kind === 'class' ? [flagged] : [],
  })
  expect(
    deriveRulesTextActions(
      { ...saved, variantRules: { optionalClassFeatures: false } },
      undefined,
      { classes: [hiddenCls], classChoiceFeatureCatalogs: hiddenCatalogs },
    ),
  ).toEqual([])
  expect(
    deriveRulesTextActions(saved, undefined, {
      classes: [hiddenCls],
      classChoiceFeatureCatalogs: hiddenCatalogs,
    }),
  ).toEqual([])
  const childOnly = { ...feature, entries: ['The beacon has a blue lens.', feature.entries![1]] }
  const childCls: Class5e = {
    ...cls,
    classFeatureRefs: [],
    subclasses:
      kind === 'subclass'
        ? [{ ...subclass, subclassFeatureRefs: [{ ...reference, feature: childOnly }] }]
        : [],
  }
  const childCatalogs = buildClassChoiceFeatureCatalogs({
    classes: [childCls],
    classFeatures: kind === 'class' ? [childOnly] : [],
  })
  const childContext = { classes: [childCls], classChoiceFeatureCatalogs: childCatalogs }
  expect(deriveRulesTextActions(saved, undefined, childContext)).toEqual([])
  expect(
    deriveRulesTextActions(
      { ...saved, variantRules: { optionalClassFeatures: false } },
      undefined,
      childContext,
    ),
  ).toEqual([])
})
