import { existsSync } from 'node:fs'
import { expect, test } from 'vitest'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import {
  characterUsesContentOutsideCatalog,
  createGameDataAvailabilityIndex,
} from '@/lib/character/additionalContentAvailability'
import { getEffectiveClassChoiceSelections } from '@/lib/character/classChoiceActivity'
import {
  getCharacterClassChoices,
  resolveClassChoiceOptions,
} from '@/lib/character/classChoiceOptions'
import {
  applyClassChoiceSelectionWithGrantsCommand,
  reconcileClassChoiceSelections,
  retainSavedFeatureOptionsCommand,
} from '@/lib/character/commands/classChoiceCommands'
import { reconcileOptionalClassFeatureChoicesCommand } from '@/lib/character/commands/classChoiceVariantCommands'
import {
  getFeatureOptionSelectionStates,
  summarizeFeatureOptionSelectionGroups,
} from '@/lib/character/featureOptionSelections'
import {
  getNaturalExplorerSelectionStates,
  scopeNaturalExplorerOptions,
} from '@/lib/character/naturalExplorerSelections'
import { buildRetainedCharacterDetails } from '@/lib/character/retainedCharacterDetails'
import {
  createCharacterSheetViewModel,
  withoutSheetDescriptions,
} from '@/lib/pdf/characterSheetViewModel'
import { validateClassChoices } from '@/lib/readiness/classReadiness'
import { detectSourceConflicts } from '@/lib/sourceConflicts'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import {
  makeNaturalExplorerFixture,
  selectNaturalExplorer,
} from '../fixtures/naturalExplorerFixtures'

type Fixture = ReturnType<typeof makeNaturalExplorerFixture>
const input = (f: Fixture) => ({
  ...f.data.lookups!,
  classChoiceClasses: f.data.classes,
  classChoiceFeatureCatalogs: f.catalogs,
})
const states = (saved: Character, f: Fixture) =>
  getNaturalExplorerSelectionStates(saved, f.data.classes, f.catalogs)
const issues = (saved: Character, f: Fixture) =>
  validateClassChoices(
    saved,
    createCharacterCalculationContext(saved, input(f)),
    f.catalogs,
  ).filter((row) => row.title.includes('Natural Explorer'))
const authority = (f: Fixture) => ({ classes: f.data.classes, catalogs: f.catalogs })
const apply = (f: Fixture, c: Character, gain: number, names: string[]) =>
  applyClassChoiceSelectionWithGrantsCommand(
    c,
    c.provenance!,
    f.choices.find((row) => row.level === gain)!,
    names.map((name) => f.choices[0].options.find((row) => row.name === name)!),
    authority(f),
  )
const configured = 'data/class/class-ranger.json'

test('three independent earned gains strictly reopen and replace/clear one without affecting others or manual state', () => {
  const f = makeNaturalExplorerFixture()
  expect(
    issues(f.character, f).filter((row) => row.title === 'Finish Natural Explorer'),
  ).toHaveLength(3)
  let saved = selectNaturalExplorer(f)
  saved = selectNaturalExplorer(f, 6, 'Coast', saved)
  saved = selectNaturalExplorer(f, 10, 'Arctic', saved)
  const reopened = characterPersistenceSchema.parse(JSON.parse(JSON.stringify(saved)))
  expect(
    reopened.classChoiceSelections!.map((row) => [
      row.classLevel,
      row.selected[0].name,
      row.selected[0].slotLevel,
    ]),
  ).toEqual([
    [1, 'Forest', 1],
    [6, 'Coast', 6],
    [10, 'Arctic', 10],
  ])
  expect(issues(reopened, f)).toEqual([])
  const noop = apply(f, reopened, 6, ['Coast'])
  expect(noop.characterPatch).toEqual({})
  expect(noop.provenanceUpdate).toBe(reopened.provenance)
  const edit = apply(f, reopened, 6, ['Swamp'])
  const edited = { ...reopened, ...edit.characterPatch, provenance: edit.provenanceUpdate }
  expect(
    [...edited.classChoiceSelections!]
      .sort((a, b) => a.classLevel - b.classLevel)
      .map((row) => row.selected[0].name),
  ).toEqual(['Forest', 'Swamp', 'Arctic'])
  const clear = apply(f, edited, 6, [])
  const cleared = { ...edited, ...clear.characterPatch, provenance: clear.provenanceUpdate }
  expect(cleared.classChoiceSelections!.map((row) => row.classLevel)).toEqual([1, 10])
  expect(cleared.features).toEqual(f.character.features)
  expect(cleared.provenance).toEqual(f.character.provenance)
  expect(issues(cleared, f).map((row) => row.title)).toEqual(['Finish Natural Explorer'])
  expect(
    reconcileClassChoiceSelections(reopened.classChoiceSelections, [
      { name: 'Ranger', source: 'PHB', levels: 5 },
    ]).map((row) => row.classLevel),
  ).toEqual([1])
})
test.each([
  0, 1, 5, 6, 9, 10, 20,
])('level %s only earns its independently declared slots', (level) => {
  const f = makeNaturalExplorerFixture(level)
  expect(
    issues(f.character, f).filter((row) => row.title === 'Finish Natural Explorer'),
  ).toHaveLength([1, 6, 10].filter((gain) => gain <= level).length)
  for (const gain of [1, 6, 10].filter((gain) => gain > level))
    expect(() => apply(f, f.character, gain, ['Forest'])).toThrow()
})
test('latest character and dormant intent prevent cross-gain duplicates while current edit remains eligible', () => {
  const f = makeNaturalExplorerFixture(),
    saved = selectNaturalExplorer(f)
  const choice = f.choices[1],
    options = resolveClassChoiceOptions(choice, f.catalogs, [], 10)
  expect(
    scopeNaturalExplorerOptions(choice, options, saved.classChoiceSelections!).find(
      (row) => row.reference.name === 'Forest',
    )?.availability,
  ).toBe('retained')
  expect(() => apply(f, saved, 6, ['Forest'])).toThrow(/different favored terrain/)
  const dormant = {
    ...saved,
    classChoiceSelections: saved.classChoiceSelections!.map((row) => ({ ...row, inactive: true })),
  }
  expect(() => apply(f, dormant, 6, ['Forest'])).toThrow(/different favored terrain/)
  expect(
    states(saved, f)[0].options.find((row) => row.reference.name === 'Forest')?.availability,
  ).toBe('eligible')
})
test.each([
  'pool',
  'gain6',
  'class',
  'catalog',
  'declaration',
])('missing %s retains intent, recovers outside class rows, and exactly restores without writes', (kind) => {
  const f = makeNaturalExplorerFixture()
  let saved = selectNaturalExplorer(f)
  saved = selectNaturalExplorer(f, 6, 'Coast', saved)
  const missing = makeNaturalExplorerFixture(10, (doc) => {
    if (kind === 'pool')
      doc.classFeature = doc.classFeature.filter((row) => row.name !== 'Natural Explorer')
    if (kind === 'gain6') doc.classFeature = doc.classFeature.filter((row) => row.level !== 6)
    if (kind === 'declaration')
      doc.class[0].classFeatures = (doc.class[0].classFeatures as unknown[]).filter(
        (row) => typeof row !== 'string' || !row.startsWith('Natural Explorer|'),
      )
  })
  if (kind === 'class') missing.data.classes = []
  if (kind === 'catalog')
    missing.catalogs = { ...missing.catalogs, classFeatures: [], classFeatureCandidates: new Map() }
  const before = JSON.stringify(saved)
  expect(
    characterUsesContentOutsideCatalog(saved, createGameDataAvailabilityIndex(missing.data)),
  ).toBe(kind === 'catalog' ? false : true)
  const current = states(saved, missing)
  expect(
    current.find((row) => row.selection.classLevel === (kind === 'gain6' ? 6 : 1))!.recovery,
  ).toBe(true)
  if (kind === 'gain6')
    expect(current.find((row) => row.selection.classLevel === 1)!.recovery).toBe(false)
  expect(
    issues(saved, missing).some((row) => row.title === 'Restore or remove Natural Explorer'),
  ).toBe(true)
  expect(states(saved, f).every((row) => !row.recovery)).toBe(true)
  expect(JSON.stringify(saved)).toBe(before)
  const retained = retainSavedFeatureOptionsCommand(
    saved,
    saved.provenance!,
    saved.classChoiceSelections![0].choiceId,
    [],
  )
  expect(retained.characterPatch.classChoiceSelections!.map((row) => row.classLevel)).toEqual([6])
  expect(retained.characterPatch.features).toEqual(f.character.features)
  expect(() =>
    applyClassChoiceSelectionWithGrantsCommand(
      saved,
      saved.provenance!,
      f.choices[kind === 'gain6' ? 1 : 0],
      [f.choices[0].options[0]],
      authority(missing),
    ),
  ).toThrow()
})
test('summaries retain conditional qualifiers once, selected gains and no alternative pool/instructions or permanent mechanical grants', () => {
  const f = makeNaturalExplorerFixture()
  let saved = selectNaturalExplorer(f)
  saved = selectNaturalExplorer(f, 6, 'Coast', saved)
  saved = selectNaturalExplorer(f, 10, 'Arctic', saved)
  const rows = getFeatureOptionSelectionStates(saved, f.data.classes, f.catalogs)
  const summary = summarizeFeatureOptionSelectionGroups(rows)
  expect(summary).toHaveLength(1)
  expect(summary[0].compactText).toBe(
    'Natural Explorer favored terrains: Forest (level 1); Coast (level 6); Arctic (level 10)',
  )
  expect(summary[0].text.match(/When you make an Intelligence or Wisdom check/g)).toHaveLength(1)
  expect(summary[0].text).toContain('an hour or more')
  expect(summary[0].text).toContain('If you are traveling alone')
  expect(summary[0].text).not.toContain('Underdark')
  expect(summary[0].text).not.toContain('Choose')
  const baseline = createCharacterCalculationContext(f.character, input(f)),
    calc = createCharacterCalculationContext(saved, input(f))
  expect(calc.movement).toEqual(baseline.movement)
  expect(calc.effects).toEqual(baseline.effects)
  const vm = createCharacterSheetViewModel(saved, input(f))
  expect(vm.featuresSummary).toContain(summary[0].text)
  expect(withoutSheetDescriptions(vm).featuresSummary).toContain(summary[0].compactText)
  expect(
    buildRetainedCharacterDetails(saved, f.data, f.data).effectiveClassChoiceSelections,
  ).toEqual(saved.classChoiceSelections)
  expect(characterUsesContentOutsideCatalog(saved, createGameDataAvailabilityIndex(f.data))).toBe(
    false,
  )
})
test.skipIf(!existsSync(configured))(
  'exact optional replacement activity follows current source, including inverse stale flags and every downstream view',
  () => {
    const f = makeNaturalExplorerFixture(10, undefined, configured)
    let saved = selectNaturalExplorer(f)
    saved = selectNaturalExplorer(f, 6, 'Coast', saved)
    const optional = {
      ...saved,
      variantRules: { ...saved.variantRules, optionalClassFeatures: true },
    }
    const before = JSON.stringify(optional)
    const dormant = getEffectiveClassChoiceSelections(optional, f.data.classes, f.catalogs)
    expect(dormant.every((row) => row.inactive)).toBe(true)
    const dormantStates = states(optional, f)
    expect(
      dormantStates.every(
        (row) =>
          row.selection.inactive &&
          !row.choice &&
          !row.recovery &&
          row.options.every((option) => option.availability === 'retained') &&
          row.details.every((detail) => !detail.available && !detail.entries.length),
      ),
    ).toBe(true)
    expect(issues(optional, f)).toEqual([])
    const missingGrant = makeNaturalExplorerFixture(
      10,
      (doc) => {
        doc.classFeature = doc.classFeature.filter((row) => row.level !== 6)
      },
      configured,
    )
    expect(
      characterUsesContentOutsideCatalog(
        optional,
        createGameDataAvailabilityIndex(missingGrant.data),
      ),
    ).toBe(false)
    expect(
      characterUsesContentOutsideCatalog(
        { ...optional, variantRules: { optionalClassFeatures: false } },
        createGameDataAvailabilityIndex(missingGrant.data),
      ),
    ).toBe(true)
    const vm = createCharacterSheetViewModel(optional, input(f))
    expect(vm.featuresSummary).toContain('Forest (level 1; Inactive)')
    expect(vm.featuresSummary).not.toContain('When you make an Intelligence or Wisdom check')
    expect(withoutSheetDescriptions(vm).featuresSummary).toContain('Inactive')
    expect(
      buildRetainedCharacterDetails(optional, f.data, f.data).effectiveClassChoiceSelections.every(
        (row) => row.inactive,
      ),
    ).toBe(true)
    expect(detectSourceConflicts(optional, [], dormant).flatMap((row) => row.items)).not.toContain(
      'Forest',
    )
    const toggled = reconcileOptionalClassFeatureChoicesCommand(
      optional,
      optional.provenance!,
      {
        availableClasses: f.data.classes,
        allClasses: f.data.classes,
        classChoiceFeatureCatalogs: f.catalogs,
      },
      true,
    )
    expect(toggled.characterPatch.classChoiceSelections!.every((row) => row.inactive)).toBe(true)
    const stale = {
      ...optional,
      classChoiceSelections: toggled.characterPatch.classChoiceSelections!,
    }
    const missing = makeNaturalExplorerFixture(
      10,
      (doc) => {
        doc.classFeature = doc.classFeature.filter(
          (row) => !(row.name === 'Deft Explorer' && row.source === 'TCE' && row.level === 1),
        )
      },
      configured,
    )
    expect(states(stale, missing).every((row) => !row.selection.inactive && !row.recovery)).toBe(
      true,
    )
    const unchanged = applyClassChoiceSelectionWithGrantsCommand(
      stale,
      stale.provenance!,
      f.choices[0],
      [f.choices[0].options.find((row) => row.name === 'Forest')!],
      authority(missing),
    )
    expect(unchanged.characterPatch).toEqual({})
    expect(unchanged.provenanceUpdate).toBe(stale.provenance)
    const edited = applyClassChoiceSelectionWithGrantsCommand(
      stale,
      stale.provenance!,
      f.choices[0],
      [f.choices[0].options.find((row) => row.name === 'Desert')!],
      authority(missing),
    )
    expect(
      edited.characterPatch.classChoiceSelections!.find((row) => row.classLevel === 1)?.inactive,
    ).not.toBe(true)
    expect(
      issues(stale, missing).filter((row) => row.title === 'Finish Natural Explorer'),
    ).toHaveLength(1)
    expect(createCharacterSheetViewModel(stale, input(missing)).featuresSummary).toContain(
      'When you make an Intelligence or Wisdom check',
    )
    expect(
      detectSourceConflicts(
        stale,
        [],
        getEffectiveClassChoiceSelections(stale, missing.data.classes, missing.catalogs),
      ).flatMap((row) => row.items),
    ).toContain('Forest')
    expect(states(stale, f).every((row) => row.selection.inactive)).toBe(true)
    expect(
      states({ ...stale, variantRules: { optionalClassFeatures: false } }, f).every(
        (row) => !row.selection.inactive,
      ),
    ).toBe(true)
    expect(JSON.stringify(optional)).toBe(before)
  },
)

test('two explicitly declaring owners keep the same pool target but independent choices and removal', () => {
  const f = makeNaturalExplorerFixture(1, (doc) => {
    doc.class.push({ ...doc.class[0], source: 'OTHER' })
  })
  const other = f.data.classes.find((row) => row.source === 'OTHER')!
  const otherChoices = getCharacterClassChoices(other, undefined, false, f.catalogs).filter(
    (row) => row.label === 'Natural Explorer',
  )
  expect(otherChoices[0].id).not.toBe(f.choices[0].id)
  expect(otherChoices[0].options).toEqual(f.choices[0].options)
  let saved = selectNaturalExplorer(f)
  saved = {
    ...saved,
    classProgression: [...saved.classProgression, { name: 'Ranger', source: 'OTHER', levels: 1 }],
  }
  const result = applyClassChoiceSelectionWithGrantsCommand(
    saved,
    saved.provenance!,
    otherChoices[0],
    [otherChoices[0].options.find((row) => row.name === 'Forest')!],
    authority(f),
  )
  const both = characterPersistenceSchema.parse({
    ...saved,
    ...result.characterPatch,
    provenance: result.provenanceUpdate,
  })
  expect(both.classChoiceSelections).toHaveLength(2)
  const removed = apply(f, both, 1, [])
  expect(removed.characterPatch.classChoiceSelections).toMatchObject([
    { classSource: 'OTHER', selected: [{ name: 'Forest' }] },
  ])
  expect(removed.characterPatch.features).toEqual(f.character.features)
})

test.each([
  false,
  true,
])('unavailable terrain warnings keep distinct grant/earned diagnostic identities and routes, enclosing=%s', (enclosing) => {
  const f = makeNaturalExplorerFixture(10, (doc) => {
    if (enclosing) {
      const refs = [
        'Natural Explorer|Ranger|PHB|1|PHB',
        'Favored Enemy and Natural Explorer improvements|Ranger|PHB|6|PHB',
        'Natural Explorer improvement|Ranger|PHB|10|PHB',
      ]
      doc.classFeature.push({
        name: 'Terrain Root',
        className: 'Ranger',
        classSource: 'PHB',
        level: 10,
        source: 'PHB',
        entries: refs.map((classFeature) => ({ type: 'refClassFeature', classFeature })),
      })
      doc.class[0].classFeatures = ['Terrain Root|Ranger|PHB|10|PHB']
    }
    doc.classFeature = doc.classFeature.filter((row) => row.name !== 'Natural Explorer')
  })
  const warnings = issues(f.character, f)
  expect(warnings.map((row) => row.navigationTarget)).toEqual(
    (enclosing ? [10, 10, 10] : [1, 6, 10]).map(
      (level) => '/build/class?class=Ranger%7CPHB&level=' + level,
    ),
  )
  expect(new Set(warnings.map((row) => row.id)).size).toBe(3)
})

test.each([
  0, 1, 3,
])('missing pool has exactly one obligation per gain when %s gains are saved, with restoration inverse', (count) => {
  const f = makeNaturalExplorerFixture()
  let saved = f.character
  for (const [gain, name] of [
    [1, 'Forest'],
    [6, 'Coast'],
    [10, 'Arctic'],
  ] as const) {
    if ((saved.classChoiceSelections?.length ?? 0) >= count) break
    saved = selectNaturalExplorer(f, gain, name, saved)
  }
  const missing = makeNaturalExplorerFixture(10, (doc) => {
    doc.classFeature = doc.classFeature.filter((row) => row.name !== 'Natural Explorer')
  })
  const warnings = issues(saved, missing)
  expect(warnings).toHaveLength(3)
  expect(warnings.filter((row) => row.title === 'Restore or remove Natural Explorer')).toHaveLength(
    count,
  )
  expect(
    warnings.filter((row) => row.title === 'Review unresolved Natural Explorer choice'),
  ).toHaveLength(3 - count)
  expect(new Set(warnings.map((row) => row.id)).size).toBe(3)
  expect(issues(saved, f).filter((row) => row.title === 'Finish Natural Explorer')).toHaveLength(
    3 - count,
  )
})
