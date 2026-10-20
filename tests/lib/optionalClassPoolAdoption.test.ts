import { expect, test } from 'vitest'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { deriveRulesTextActions } from '@/lib/calculations/actions'
import { buildPrerequisiteSnapshot } from '@/lib/calculations/prerequisites'
import { getClassChoiceOptionKey } from '@/lib/character/classChoiceIdentity'
import {
  createClassChoiceCatalogs,
  getClassChoiceCandidates,
  resolveClassChoiceOptions,
} from '@/lib/character/classChoiceOptions'
import { resolveActiveClassChoiceDetail } from '@/lib/character/classFeatureActivityView'
import { applyClassChoiceSelectionWithGrantsCommand } from '@/lib/character/commands/classChoiceCommands'
import { reconcileOptionalClassFeatureChoicesCommand } from '@/lib/character/commands/classChoiceVariantCommands'
import { applyClassProgressionUpdate } from '@/lib/character/commands/classCommands'
import type { CharacterCommandResult } from '@/lib/character/commands/commandResult'
import {
  getOptionalClassFamilyKeys,
  setOptionalClassAdoptionCommand,
} from '@/lib/character/commands/optionalClassFeatureCommands'
import { projectEffectiveClassChoiceFeatures } from '@/lib/character/effectiveClassChoiceFeatures'
import {
  createOptionalClassFeatureActivity,
  getActiveOptionalClassFeatureDeclarations,
} from '@/lib/character/optionalClassFeatureActivity'
import { buildRetainedCharacterDetails } from '@/lib/character/retainedCharacterDetails'
import {
  createCharacterSheetViewModel,
  withoutSheetDescriptions,
} from '@/lib/pdf/characterSheetViewModel'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeOptionalClassSectionData } from '../fixtures/optionalClassSectionFixtures'

const apply = (character: Character, result: CharacterCommandResult) =>
  characterPersistenceSchema.parse({
    ...character,
    ...result.characterPatch,
    provenance: result.provenanceUpdate,
  })
const rows = [
  ['Fighter', 1, '0dc', 'Fighting Style', 'Interception'],
  ['Paladin', 2, '131', 'Fighting Style', 'Blind Fighting'],
  ['Ranger', 2, '159', 'Fighting Style', 'Blind Fighting'],
  ['Warlock', 3, '1a1', 'Pact Boon', 'Pact of the Talisman'],
  ['Warlock', 2, '1a4', 'Eldritch Invocations', 'Eldritch Mind'],
] as const
function setup([name, level, id, label, member]: readonly [
  string,
  number,
  string,
  string,
  string,
]) {
  const { data, catalogs } = makeOptionalClassSectionData()
  const character = makeCharacterFixture({
    allowedSources: ['PHB', 'TCE'],
    classProgression: [{ name, source: 'PHB', levels: level }],
    variantRules: { optionalClassFeatures: true },
  })
  const cls = data.classes.find((row) => row.name === name && row.source === 'PHB')!
  const choice = getClassChoiceCandidates(cls, undefined, catalogs).find(
    (row) => row.label === label && row.level === level,
  )!
  const adoption = {
    owner: ['class', name.toLowerCase(), 'phb'] as ['class', string, string],
    target: 'book-section|tce|' + id,
    earnedLevel: level,
  }
  const adopted = apply(
    character,
    setOptionalClassAdoptionCommand(character, character.provenance, catalogs, adoption, true, []),
  )
  const select = (actor: Character, current = catalogs) =>
    apply(
      actor,
      applyClassChoiceSelectionWithGrantsCommand(
        actor,
        actor.provenance,
        choice,
        [{ entityType: 'optionalFeature', name: member, source: 'TCE' }],
        { classes: data.classes, catalogs: current },
      ),
    )
  const available = (actor: Character, current = catalogs) =>
    resolveClassChoiceOptions(
      choice,
      createClassChoiceCatalogs(current),
      actor.classChoiceSelections?.find((row) => row.choiceId === choice.id)?.selected ?? [],
      level,
      actor,
    )
  return { data, catalogs, character, adopted, adoption, choice, select, available, member }
}

test.each(
  rows,
)('%s gain%s adopts exact section%s to extend %s without increasing its quota (%s)', (...row) => {
  const f = setup(row)
  const before = JSON.stringify({ character: f.character, data: f.data })
  expect(
    f
      .available(f.character)
      .some((view) => view.reference.name === f.member && view.availability === 'eligible'),
  ).toBe(false)
  expect(() => f.select(f.character)).toThrow(/availability changed/)
  expect(
    f
      .available(f.adopted)
      .some((view) => view.reference.name === f.member && view.availability === 'eligible'),
  ).toBe(true)
  const saved = f.select(f.adopted)
  expect(saved.classChoiceSelections?.[0].selected).toMatchObject([
    { name: f.member, source: 'TCE', slotLevel: row[1] },
  ])
  expect(saved.features.some((feature) => feature.name === f.member)).toBe(true)
  expect(f.choice.selectionCountByLevel[row[1] - 1]).toBe(row[3] === 'Eldritch Invocations' ? 2 : 1)
  const off = { ...saved, variantRules: { optionalClassFeatures: false } }
  expect(
    projectEffectiveClassChoiceFeatures(off, f.catalogs).features.some(
      (feature) => feature.name === f.member,
    ),
  ).toBe(false)
  expect(f.available(off).find((view) => view.reference.name === f.member)?.availability).toBe(
    'retained',
  )
  const reconciled = apply(
    saved,
    reconcileOptionalClassFeatureChoicesCommand(
      saved,
      saved.provenance,
      {
        availableClasses: f.data.classes,
        allClasses: f.data.classes,
        classChoiceFeatureCatalogs: f.catalogs,
      },
      false,
    ),
  )
  expect(reconciled.features.some((feature) => feature.name === f.member)).toBe(false)
  expect(reconciled.provenance.features[f.member.toLowerCase()]).toBeUndefined()
  expect(reconciled.classChoiceSelections).toEqual(saved.classChoiceSelections)
  expect(reconciled.optionalClassFeatureAdoptions).toEqual(saved.optionalClassFeatureAdoptions)
  const restored = apply(
    reconciled,
    reconcileOptionalClassFeatureChoicesCommand(
      reconciled,
      reconciled.provenance,
      {
        availableClasses: f.data.classes,
        allClasses: f.data.classes,
        classChoiceFeatureCatalogs: f.catalogs,
      },
      true,
    ),
  )
  expect(restored.features.some((feature) => feature.name === f.member)).toBe(true)
  const noSource = { ...f.catalogs, optionalClassSections: [] }
  expect(
    projectEffectiveClassChoiceFeatures(saved, noSource).features.some(
      (feature) => feature.name === f.member,
    ),
  ).toBe(false)
  expect(
    createOptionalClassFeatureActivity(saved, noSource).states.find(
      (state) => state.root.target === f.adoption.target,
    )?.state,
  ).toBe('unavailable')
  const cleared = apply(
    saved,
    setOptionalClassAdoptionCommand(
      saved,
      saved.provenance,
      undefined,
      f.adoption,
      false,
      getOptionalClassFamilyKeys(saved, f.adoption),
    ),
  )
  expect(cleared.optionalClassFeatureAdoptions).toEqual([])
  expect(cleared.classChoiceSelections).toEqual(saved.classChoiceSelections)
  expect(cleared.features.some((feature) => feature.name === f.member)).toBe(false)
  expect(
    projectEffectiveClassChoiceFeatures(
      { ...saved, allowedSources: ['PHB'] },
      f.catalogs,
    ).features.some((feature) => feature.name === f.member),
  ).toBe(false)
  expect(JSON.stringify({ character: f.character, data: f.data })).toBe(before)
})

test('exact member/index loss suspends only its route; duplicates and stale choices cannot create new selections', () => {
  const f = setup(rows[0]),
    saved = f.select(f.adopted)
  const changed = makeOptionalClassSectionData(
    (source) =>
      (source.optionalfeature = source.optionalfeature.filter(
        (row: { name: string }) => row.name !== 'Interception',
      )),
  )
  expect(
    projectEffectiveClassChoiceFeatures(saved, changed.catalogs).features.some(
      (row) => row.name === 'Interception',
    ),
  ).toBe(false)
  expect(
    createOptionalClassFeatureActivity(saved, changed.catalogs).states.find(
      (row) => row.root.target === f.adoption.target,
    )?.state,
  ).toBe('active')
  expect(
    f.available(saved, changed.catalogs).find((row) => row.reference.name === 'Interception')
      ?.availability,
  ).toBe('retained')
  expect(
    projectEffectiveClassChoiceFeatures(saved, f.catalogs).features.some(
      (row) => row.name === 'Interception',
    ),
  ).toBe(true)
  const duplicate = makeOptionalClassSectionData((source) =>
    source.optionalfeature.push(
      structuredClone(
        source.optionalfeature.find((row: { name: string }) => row.name === 'Interception'),
      ),
    ),
  )
  expect(() => f.select(f.adopted, duplicate.catalogs)).toThrow(/availability changed/)
  expect(() =>
    f.select(f.adopted, { ...f.catalogs, optionalFeatureCandidates: new Map() }),
  ).toThrow(/availability changed/)
  expect(() =>
    applyClassChoiceSelectionWithGrantsCommand(
      f.character,
      f.character.provenance,
      { ...f.choice, label: 'Independent display label', kind: 'class-feature' },
      [{ entityType: 'optionalFeature', name: 'Interception', source: 'TCE' }],
      { classes: f.data.classes, catalogs: f.catalogs },
    ),
  ).toThrow(/availability changed/)
  const relabeled = {
    ...saved,
    classChoiceSelections: saved.classChoiceSelections?.map((row) => ({
      ...row,
      label: 'Player display label',
    })),
  }
  expect(
    projectEffectiveClassChoiceFeatures(relabeled, f.catalogs).features.some(
      (row) => row.name === 'Interception',
    ),
  ).toBe(true)
  const cleared = apply(
    relabeled,
    setOptionalClassAdoptionCommand(
      relabeled,
      relabeled.provenance,
      undefined,
      f.adoption,
      false,
      getOptionalClassFamilyKeys(relabeled, f.adoption),
    ),
  )
  expect(cleared.features.some((row) => row.name === 'Interception')).toBe(false)
  const forged = {
    ...f.choice,
    optionFilter: { entityType: 'optionalFeature' as const, featureTypes: ['PB'] },
  }
  expect(() =>
    applyClassChoiceSelectionWithGrantsCommand(
      f.adopted,
      f.adopted.provenance,
      forged,
      [{ entityType: 'optionalFeature', name: 'Pact of the Talisman', source: 'TCE' }],
      { classes: f.data.classes, catalogs: f.catalogs },
    ),
  ).toThrow(/availability changed/)
  const wrongOwner = {
    ...f.character,
    classProgression: [{ name: 'Fighter', source: 'XPHB', levels: 1 }],
  }
  expect(() =>
    setOptionalClassAdoptionCommand(
      wrongOwner,
      wrongOwner.provenance,
      f.catalogs,
      f.adoption,
      true,
      [],
    ),
  ).toThrow(/current owner/)
  expect(() =>
    setOptionalClassAdoptionCommand(
      f.character,
      f.character.provenance,
      { ...f.catalogs, optionalClassSections: [] },
      f.adoption,
      true,
      [],
    ),
  ).toThrow(/current owner/)
})

test('book sections reach derived Review/PDF descriptions without fake class UIDs or saved feature mirrors', () => {
  const f = setup(rows[0]),
    actor = f.adopted
  const declarations = getActiveOptionalClassFeatureDeclarations(
    createOptionalClassFeatureActivity(actor, f.catalogs),
  )
  expect(declarations).toMatchObject([
    {
      target: 'book-section|tce|0dc',
      owner: ['class', 'fighter', 'phb'],
      level: 1,
      feature: { name: 'Fighting Style Options' },
    },
  ])
  expect(actor.features).toEqual(f.character.features)
  const input = {
    ...buildGameDataLookups(f.data),
    classChoiceClasses: f.data.classes,
    classChoiceFeatureCatalogs: f.catalogs,
  }
  const vm = createCharacterSheetViewModel(actor, input)
  expect(vm.featuresSummary).toContain('Fighting Style Options')
  expect(vm.featuresSummary).toContain('Interception')
  expect(withoutSheetDescriptions(vm).featuresSummary).toContain('Fighting Style Options')
  expect(
    createCharacterSheetViewModel(
      { ...actor, variantRules: { optionalClassFeatures: false } },
      input,
    ).featuresSummary,
  ).not.toContain('Fighting Style Options')
  const standard = apply(
    f.character,
    applyClassChoiceSelectionWithGrantsCommand(
      f.character,
      f.character.provenance,
      f.choice,
      [{ entityType: 'optionalFeature', name: 'Protection', source: 'PHB' }],
      { classes: f.data.classes, catalogs: f.catalogs },
    ),
  )
  expect(
    projectEffectiveClassChoiceFeatures(standard, f.catalogs).features.some(
      (row) => row.name === 'Protection',
    ),
  ).toBe(true)
  const independent = {
    ...f.select(f.adopted),
    features: [
      ...f.select(f.adopted).features,
      {
        id: 'manual:independent-interception',
        name: 'Interception',
        source: 'TCE',
        description: 'Independent ownership',
      },
    ],
  }
  expect(
    projectEffectiveClassChoiceFeatures(
      { ...independent, variantRules: { optionalClassFeatures: false } },
      f.catalogs,
    ).features.filter((row) => row.name === 'Interception'),
  ).toMatchObject([{ id: 'manual:independent-interception' }])
})

test('intentional level/owner removal clears the exact section and unearned pool selection together', () => {
  const f = setup(rows[2]),
    saved = f.select(f.adopted)
  for (const progression of [
    [{ name: 'Ranger', source: 'PHB', levels: 1 }],
    [{ name: 'Fighter', source: 'PHB', levels: 2 }],
  ]) {
    const removed = apply(
      saved,
      applyClassProgressionUpdate(saved, saved.provenance, progression, undefined, {
        classChoiceFeatureCatalogs: f.catalogs,
      }),
    )
    expect(removed.optionalClassFeatureAdoptions).toEqual([])
    expect(removed.classChoiceSelections).toEqual([])
    expect(removed.features.some((row) => row.name === 'Blind Fighting')).toBe(false)
  }
})

test('new invocation commands require current level and closed Pact prerequisites, with dormant intent on Clear/OFF/source loss and restoration', () => {
  const f = setup(rows[4])
  const choose = (actor: Character, name: string) =>
    apply(
      actor,
      applyClassChoiceSelectionWithGrantsCommand(
        actor,
        actor.provenance,
        f.choice,
        [{ entityType: 'optionalFeature', name, source: 'TCE' }],
        { classes: f.data.classes, catalogs: f.catalogs },
      ),
    )
  expect(() => choose(f.adopted, 'Undying Servitude')).toThrow(/prerequisites/)
  expect(() => choose(f.adopted, 'Rebuke of the Talisman')).toThrow(/prerequisites/)
  const higher = { ...f.adopted, classProgression: [{ name: 'Warlock', source: 'PHB', levels: 5 }] }
  expect(
    choose(higher, 'Undying Servitude').features.some((row) => row.name === 'Undying Servitude'),
  ).toBe(true)
  const pact = setup(rows[3])
  let actor = pact.select(pact.adopted)
  actor = apply(
    actor,
    setOptionalClassAdoptionCommand(actor, actor.provenance, f.catalogs, f.adoption, true, []),
  )
  const saved = choose(actor, 'Rebuke of the Talisman')
  const before = JSON.stringify(saved)
  const cleared = apply(
    saved,
    setOptionalClassAdoptionCommand(
      saved,
      saved.provenance,
      f.catalogs,
      pact.adoption,
      false,
      getOptionalClassFamilyKeys(saved, pact.adoption),
    ),
  )
  const missingPact = {
    ...f.catalogs,
    optionalClassSections: f.catalogs.optionalClassSections.filter(
      (row) => row.target !== pact.adoption.target,
    ),
  }
  for (const [current, catalogs] of [
    [cleared, f.catalogs],
    [{ ...saved, variantRules: { optionalClassFeatures: false } }, f.catalogs],
    [saved, missingPact],
  ] as const) {
    expect(
      projectEffectiveClassChoiceFeatures(current, catalogs).features.some(
        (row) => row.name === 'Rebuke of the Talisman',
      ),
    ).toBe(false)
    expect(
      buildPrerequisiteSnapshot({
        character: current,
        classChoiceFeatureCatalogs: catalogs,
      }).features?.some((row) => row.name === 'Rebuke of the Talisman'),
    ).toBe(false)
    const selection = current.classChoiceSelections!.find((row) => row.choiceId === f.choice.id)!
    expect(
      resolveActiveClassChoiceDetail(current, catalogs, {
        kind: 'choice',
        owner: ['class', 'warlock', 'phb'],
        choiceId: f.choice.id,
        earnedLevel: 2,
        optionKey: getClassChoiceOptionKey(selection.selected[0]),
      }),
    ).toBeUndefined()
    const input = {
      ...buildGameDataLookups(f.data),
      classChoiceClasses: f.data.classes,
      classChoiceFeatureCatalogs: catalogs,
    }
    const vm = createCharacterSheetViewModel(current, input)
    expect(vm.featuresSummary).not.toContain('Rebuke of the Talisman:')
    expect(withoutSheetDescriptions(vm).featuresSummary).not.toContain('Rebuke of the Talisman')
    expect(
      deriveRulesTextActions(current, undefined, {
        classes: f.data.classes,
        optionalFeaturesByKey: input.optionalFeaturesByKey,
        classChoiceFeatureCatalogs: catalogs,
      }).some((row) => row.name === 'Rebuke of the Talisman'),
    ).toBe(false)
  }
  expect(cleared.classChoiceSelections).toEqual(saved.classChoiceSelections)
  expect(cleared.provenance.features['rebuke of the talisman']).toBeUndefined()
  const details = buildRetainedCharacterDetails(cleared, f.data, f.data).choiceDetailsById.get(
    f.choice.id,
  )
  expect(details?.[0].availability).toBe('inactive')
  const restored = apply(
    cleared,
    setOptionalClassAdoptionCommand(
      cleared,
      cleared.provenance,
      f.catalogs,
      pact.adoption,
      true,
      [],
    ),
  )
  expect(restored.features.some((row) => row.name === 'Rebuke of the Talisman')).toBe(true)
  const independent = {
    ...cleared,
    features: [
      ...cleared.features,
      {
        id: 'manual:pact',
        name: 'Pact of the Talisman',
        source: 'TCE',
        description: 'Independent provider',
      },
    ],
  }
  expect(
    projectEffectiveClassChoiceFeatures(independent, f.catalogs).features.some(
      (row) => row.name === 'Rebuke of the Talisman',
    ),
  ).toBe(true)
  expect(
    projectEffectiveClassChoiceFeatures(independent, f.catalogs).provenance.features[
      'rebuke of the talisman'
    ],
  ).toHaveLength(1)
  expect(JSON.stringify(saved)).toBe(before)
})

test('an intervening Clear during source loss preserves intent for pure exact restoration, row metadata and owned tags', () => {
  const pact = setup(rows[3]),
    invocation = setup(rows[4])
  let actor = pact.select(pact.adopted)
  actor = apply(
    actor,
    setOptionalClassAdoptionCommand(
      actor,
      actor.provenance,
      pact.catalogs,
      invocation.adoption,
      true,
      [],
    ),
  )
  actor = invocation.select(actor)
  const missing = {
    ...pact.catalogs,
    optionalClassSections: pact.catalogs.optionalClassSections.filter(
      (row) => row.target !== invocation.adoption.target,
    ),
  }
  const cleared = apply(
    actor,
    setOptionalClassAdoptionCommand(
      actor,
      actor.provenance,
      missing,
      pact.adoption,
      false,
      getOptionalClassFamilyKeys(actor, pact.adoption),
    ),
  )
  expect(cleared.features).toEqual([])
  const before = JSON.stringify(cleared)
  const restored = projectEffectiveClassChoiceFeatures(cleared, pact.catalogs)
  expect(restored.features).toMatchObject([{ name: 'Eldritch Mind', source: 'TCE', level: 2 }])
  expect(restored.provenance.features['eldritch mind']).toMatchObject([
    {
      sourceType: 'class',
      sourceName: 'Warlock',
      sourceRef: 'PHB',
      grantVariant: invocation.choice.id,
    },
  ])
  expect(restored.classChoiceSelections).toEqual(actor.classChoiceSelections)
  const row = { ...restored.features[0], description: 'Player detail' }
  const withRow = { ...cleared, features: [row] }
  expect(projectEffectiveClassChoiceFeatures(withRow, pact.catalogs).features[0]).toBe(row)
  expect(JSON.stringify(cleared)).toBe(before)
})

test.each([
  'self',
  'cycle',
  'unknown',
  'unqualified ability',
])('synthetic %s prerequisite cannot bootstrap from saved managed rows or tags', (mode) => {
  const pact = setup(rows[3]),
    invocation = setup(rows[4])
  let actor = pact.select(pact.adopted)
  actor = apply(
    actor,
    setOptionalClassAdoptionCommand(
      actor,
      actor.provenance,
      pact.catalogs,
      invocation.adoption,
      true,
      [],
    ),
  )
  actor = apply(
    actor,
    applyClassChoiceSelectionWithGrantsCommand(
      actor,
      actor.provenance,
      invocation.choice,
      [{ entityType: 'optionalFeature', name: 'Rebuke of the Talisman', source: 'TCE' }],
      { classes: pact.data.classes, catalogs: pact.catalogs },
    ),
  )
  const changed = makeOptionalClassSectionData((source) => {
    const row = source.optionalfeature.find(
      (row: { name: string }) => row.name === 'Pact of the Talisman',
    )
    row.prerequisite =
      mode === 'self'
        ? [{ pact: 'Talisman' }]
        : mode === 'cycle'
          ? [{ pact: 'Rebuke of the Talisman' }]
          : mode === 'unknown'
            ? [{ unsupportedPredicate: true }]
            : [{ ability: [{ strength: 1 }] }]
  })
  const effective = projectEffectiveClassChoiceFeatures(actor, changed.catalogs)
  expect(effective.features).toEqual([])
  expect(effective.provenance.features['pact of the talisman']).toBeUndefined()
  expect(effective.provenance.features['rebuke of the talisman']).toBeUndefined()
  if (mode === 'self' || mode === 'cycle') {
    const independent = {
      ...actor,
      features: [
        ...actor.features,
        {
          id: 'manual:pact',
          name: 'Pact of the Talisman',
          source: 'TCE',
          description: 'Independent provider',
        },
      ],
    }
    expect(
      projectEffectiveClassChoiceFeatures(independent, changed.catalogs).features.some(
        (row) => row.name === 'Rebuke of the Talisman',
      ),
    ).toBe(true)
  }
})
