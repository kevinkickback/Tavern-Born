import { expect, test } from 'vitest'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { getProficiencyCheckNoteRows } from '@/lib/calculations/proficiencyCheckNotes'
import { buildClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import { upsertManualActionCommand } from '@/lib/character/commands/actionCommands'
import { reconcileClassChoiceSelections } from '@/lib/character/commands/classChoiceCommands'
import {
  setEffectSuppressedCommand,
  upsertManualEffectCommand,
} from '@/lib/character/commands/effectCommands'
import { deriveConditionalProficiencyNotes } from '@/lib/character/conditionalProficiencyNotes'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import {
  makeConditionalCharacterFixture,
  makeConditionalSourceData,
} from '../fixtures/conditionalProficiencyFixtures'

test.each([
  'PHB',
  'XPHB',
])('actual %s native partial Runes selection reopens, clears/replaces, and keeps Actions unchanged', (source) => {
  const f = makeConditionalCharacterFixture('Fighter', source)
  expect(f.choice!.id).toBe(
    `class:fighter|${source.toLowerCase()}|subclass:rune-knight|tce|choice:runes|3`,
  )
  expect(deriveConditionalProficiencyNotes(f.character, f.catalogs)).toEqual([])
  const selected = f.select(['Fire Rune'])
  expect(selected.classChoiceSelections![0].selected).toEqual([
    { entityType: 'optionalFeature', name: 'Fire Rune', source: 'TCE', slotLevel: 3 },
  ])
  const before = JSON.stringify(selected)
  const notes = deriveConditionalProficiencyNotes(selected, f.catalogs)
  expect(notes).toHaveLength(1)
  expect(notes[0]).toMatchObject({
    target: { kind: 'proficiency-check-note', proficiencyType: 'tool' },
    operation: {
      kind: 'conditional-note',
      note: 'While wearing or carrying an object inscribed with this rune, your proficiency bonus is doubled for any ability check you make that uses your proficiency with a tool.',
    },
    source: {
      kind: 'subclass',
      entityId: 'subclass-feature|rune carver|fighter|phb|rune knight|tce|3|tce',
    },
  })
  expect(
    deriveConditionalProficiencyNotes(
      characterPersistenceSchema.parse(JSON.parse(before)) as Character,
      f.catalogs,
    ),
  ).toEqual(notes)
  expect(JSON.stringify(selected)).toBe(before)
  expect(deriveConditionalProficiencyNotes(f.select(['Cloud Rune'], selected), f.catalogs)).toEqual(
    [],
  )
  expect(deriveConditionalProficiencyNotes(f.select([], selected), f.catalogs)).toEqual([])
  expect(deriveConditionalProficiencyNotes(f.select(['Fire Rune'], selected), f.catalogs)).toEqual(
    notes,
  )
  const vm = createCharacterSheetViewModel(selected, f.input)
  const withoutAuthority = createCharacterSheetViewModel(selected, {
    ...f.input,
    classChoiceFeatureCatalogs: { ...f.catalogs, optionalFeatureCandidates: new Map() },
  })
  expect(vm.character.proficiencies).toEqual(withoutAuthority.character.proficiencies)
  expect(vm.character.provenance!.proficiencies).toEqual(
    withoutAuthority.character.provenance!.proficiencies,
  )
  expect(vm.skillByName).toEqual(withoutAuthority.skillByName)
  expect(vm.actions).toEqual(withoutAuthority.actions)
  expect(
    vm.actions.some(
      (action) => action.name === 'Fire Rune' && action.description?.includes('shackles'),
    ),
  ).toBe(false)
})

test.each([
  'duplicate option',
  'duplicate selection',
  'wrong owner',
  'wrong kind',
  'wrong gain',
  'future slot',
  'extra slot3',
  'over capacity',
  'unknown printing',
  'explicit ref',
  'inactive',
])('Fire note rejects corrupt relation: %s', (mode) => {
  const f = makeConditionalCharacterFixture('Fighter', 'PHB', 7)
  const c = f.select(['Fire Rune', 'Cloud Rune', 'Frost Rune'])
  const row = c.classChoiceSelections![0]
  if (mode === 'duplicate option') row.selected[1] = { ...row.selected[0] }
  if (mode === 'duplicate selection') c.classChoiceSelections!.push(structuredClone(row))
  if (mode === 'wrong owner') row.subclassSource = 'XPHB'
  if (mode === 'wrong kind') row.kind = 'feat'
  if (mode === 'wrong gain') row.classLevel = 4
  if (mode === 'future slot') row.selected[0].slotLevel = 15
  if (mode === 'extra slot3')
    row.selected.forEach((option) => {
      option.slotLevel = 3
    })
  if (mode === 'over capacity') row.selected.push({ ...row.selected[0], name: 'Stone Rune' })
  if (mode === 'unknown printing') row.selected[0].source = 'PHB'
  if (mode === 'explicit ref') row.selected[0].ref = 'Fire Rune|TCE'
  if (mode === 'inactive') row.inactive = true
  expect(deriveConditionalProficiencyNotes(c, f.catalogs)).toEqual([])
})

test('Fire current source/path loss retains intent and exact restore identity; level/subclass removal retracts notes', () => {
  const f = makeConditionalCharacterFixture()
  const c = f.select(['Fire Rune'])
  const before = JSON.stringify(c)
  const original = deriveConditionalProficiencyNotes(c, f.catalogs)
  for (const catalogs of [
    { ...f.catalogs, optionalFeatures: [] },
    { ...f.catalogs, optionalFeatureCandidates: new Map() },
    { ...f.catalogs, classes: [] },
    {
      ...f.catalogs,
      subclassTargets: { ...f.catalogs.subclassTargets!, candidatesByOwner: new Map() },
    },
    makeConditionalSourceData((doc) => {
      doc.subclassFeature.find((row) => row.name === 'Rune Carver')!.entries = ['Only at night.']
    }).catalogs,
  ])
    expect(deriveConditionalProficiencyNotes(c, catalogs)).toEqual([])
  expect(JSON.stringify(c)).toBe(before)
  expect(deriveConditionalProficiencyNotes(c, f.catalogs)).toEqual(original)
  for (const progression of [
    [],
    [{ ...c.classProgression[0], levels: 2 }],
    [{ ...c.classProgression[0], subclass: 'Champion' }],
  ]) {
    const changed = {
      ...c,
      classProgression: progression,
      classChoiceSelections: reconcileClassChoiceSelections(c.classChoiceSelections, progression),
    }
    expect(deriveConditionalProficiencyNotes(changed, f.catalogs)).toEqual([])
  }
})

test.each([
  'PHB',
  'XPHB',
])('current %s Rune prerequisites reject early Storm/Hill and re-evaluate level changes without inferring history', (source) => {
  const f = makeConditionalCharacterFixture('Fighter', source, 3)
  for (const rune of ['Storm Rune', 'Hill Rune']) {
    const low = f.select(['Fire Rune', rune])
    expect(deriveConditionalProficiencyNotes(low, f.catalogs)).toEqual([])
    const multi = {
      ...low,
      classProgression: [...low.classProgression, { name: 'Rogue', source: 'PHB', levels: 5 }],
    }
    expect(deriveConditionalProficiencyNotes(multi, f.catalogs)).toEqual([])
    const high = { ...low, classProgression: [{ ...low.classProgression[0], levels: 7 }] }
    const qualified = deriveConditionalProficiencyNotes(high, f.catalogs)
    expect(qualified).toHaveLength(1)
    expect(deriveConditionalProficiencyNotes(low, f.catalogs)).toEqual([])
    expect(deriveConditionalProficiencyNotes(high, f.catalogs)).toEqual(qualified)
  }
  expect(deriveConditionalProficiencyNotes(f.select(['Fire Rune']), f.catalogs)).toHaveLength(1)
})

test('selected sibling prerequisites use the shared effective snapshot and unknown requirements fail closed', () => {
  const f = makeConditionalCharacterFixture()
  const selected = f.select(['Fire Rune', 'Cloud Rune'])
  const changed = makeConditionalSourceData((doc) => {
    doc.optionalfeature.find((row) => row.name === 'Cloud Rune')!.prerequisite = [
      { ability: [{ wis: 13 }] },
    ]
  })
  expect(deriveConditionalProficiencyNotes(selected, changed.catalogs)).toEqual([])
  const input = {
    ...changed.data.lookups!,
    classChoiceClasses: changed.data.classes,
    classChoiceFeatureCatalogs: changed.catalogs,
  }
  expect(
    createCharacterCalculationContext(selected, input).effects.sourceDeclarations.filter(
      (effect) => effect.target.kind === 'proficiency-check-note',
    ),
  ).toEqual([])
  const boosted = {
    ...selected,
    ...upsertManualEffectCommand(selected, {
      id: 'manual:wisdom',
      label: 'Wisdom bonus',
      source: { kind: 'manual', name: 'Wisdom bonus' },
      target: { kind: 'ability-score', ability: 'wisdom' },
      operation: { kind: 'add', value: 3 },
    }),
  }
  const calculation = createCharacterCalculationContext(boosted, input)
  expect(calculation.abilityScores.total.wisdom).toBe(13)
  expect(
    calculation.effects.sourceDeclarations.filter(
      (effect) => effect.target.kind === 'proficiency-check-note',
    ),
  ).toHaveLength(1)
  expect(
    deriveConditionalProficiencyNotes(boosted, changed.catalogs, calculation.abilityScores.total),
  ).toHaveLength(1)
  const unknown = makeConditionalSourceData((doc) => {
    doc.optionalfeature.find((row) => row.name === 'Cloud Rune')!.prerequisite = [
      { other: 'Only when a hidden condition is satisfied' },
    ]
  })
  expect(
    deriveConditionalProficiencyNotes(boosted, unknown.catalogs, calculation.abilityScores.total),
  ).toEqual([])
  expect(deriveConditionalProficiencyNotes(selected, f.catalogs)).toHaveLength(1)
})

test.each([
  ['PHB', 1],
  ['XPHB', 3],
] as const)('legacy Dragon %s note is earned at enclosing %s independently of ancestry setup', (source, level) => {
  const f = makeConditionalCharacterFixture('Sorcerer', source, level)
  const notes = deriveConditionalProficiencyNotes(f.character, f.catalogs)
  expect(notes).toHaveLength(1)
  expect(notes[0]).toMatchObject({
    target: { kind: 'proficiency-check-note', proficiencyType: 'any', abilities: ['charisma'] },
    operation: {
      note: 'Whenever you make a Charisma check when interacting with dragons, your proficiency bonus is doubled if it applies to the check.',
    },
    source: { entityId: 'subclass-feature|dragon ancestor|sorcerer|phb|draconic|phb|1|phb' },
  })
  expect(f.character.classChoiceSelections ?? []).toEqual([])
  expect(
    deriveConditionalProficiencyNotes(
      {
        ...f.character,
        classProgression: [{ ...f.character.classProgression[0], levels: level - 1 }],
      },
      f.catalogs,
    ),
  ).toEqual([])
  expect(
    deriveConditionalProficiencyNotes(
      {
        ...f.character,
        classProgression: [
          {
            ...f.character.classProgression[0],
            subclass: 'Draconic Sorcery',
            subclassSource: 'XPHB',
          },
        ],
      },
      f.catalogs,
    ),
  ).toEqual([])
  expect(
    deriveConditionalProficiencyNotes(f.character, {
      ...f.catalogs,
      subclassTargets: { ...f.catalogs.subclassTargets!, candidatesByOwner: new Map() },
    }),
  ).toEqual([])
  expect(deriveConditionalProficiencyNotes(f.character, f.catalogs)).toEqual(notes)
})

test('terrain aggregates only active available earned gains with stable suppression identity and no travel qualifier', () => {
  const f = makeConditionalCharacterFixture('Ranger', 'PHB', 10)
  const first = f.selectTerrain(1, 'Forest')
  const second = f.selectTerrain(6, 'Coast', first)
  const third = f.selectTerrain(10, 'Arctic', second)
  const one = deriveConditionalProficiencyNotes(first, f.catalogs)[0]
  const full = deriveConditionalProficiencyNotes(third, f.catalogs)[0]
  expect(full.id).toBe(one.id)
  expect(full.label).toBe('Natural Explorer — Forest, Coast, Arctic')
  expect(full).toMatchObject({
    target: {
      kind: 'proficiency-check-note',
      proficiencyType: 'skill',
      abilities: ['intelligence', 'wisdom'],
    },
  })
  expect(full.operation).toEqual({
    kind: 'conditional-note',
    note: "When you make an Intelligence or Wisdom check related to your favored terrain, your proficiency bonus is doubled if you are using a skill that you're proficient in.",
  })
  expect(
    JSON.parse(full.source.provenance!.grantVariant!).map((row: { gain: number }) => row.gain),
  ).toEqual([1, 6, 10])
  const missingSix = makeConditionalSourceData((doc) => {
    doc.classFeature = doc.classFeature.filter((row) => row.level !== 6)
  }).catalogs
  const remaining = deriveConditionalProficiencyNotes(third, missingSix)[0]
  expect(remaining.id).toBe(full.id)
  expect(remaining.label).toBe('Natural Explorer — Forest, Arctic')
  expect(
    deriveConditionalProficiencyNotes(third, {
      ...f.catalogs,
      classFeatures: [],
      classFeatureCandidates: new Map(),
    }),
  ).toEqual([])
  expect(deriveConditionalProficiencyNotes(third, f.catalogs)[0]).toEqual(full)
  const suppressed = { ...third, ...setEffectSuppressedCommand(third, full.id, true) }
  expect(
    getProficiencyCheckNoteRows(deriveConditionalProficiencyNotes(suppressed, f.catalogs), {
      suppressedEffectIds: suppressed.suppressedEffectIds,
    }),
  ).toEqual([])
  const permissionOnly = {
    ...third,
    variantRules: { ...third.variantRules, optionalClassFeatures: true },
  }
  expect(deriveConditionalProficiencyNotes(permissionOnly, f.catalogs)[0]).toEqual(full)
  // Retained explicit intent reserves its family even while its optional source is unavailable.
  const dormant: Character = {
    ...permissionOnly,
    optionalClassFeatureAdoptions: [
      {
        owner: ['class', 'ranger', 'phb'],
        target: 'class-feature|deft explorer|ranger|phb|1|tce',
        earnedLevel: 1,
      },
    ],
  }
  expect(deriveConditionalProficiencyNotes(dormant, f.catalogs)).toEqual([])
  const restored = {
    ...dormant,
    variantRules: { ...dormant.variantRules, optionalClassFeatures: false },
  }
  expect(deriveConditionalProficiencyNotes(restored, f.catalogs)[0].id).toBe(full.id)
})

test.each([
  'name',
  'source',
  'className',
  'classSource',
  'subclassShortName',
  'subclassSource',
  'level',
])('a unique current Dragon intro cannot erase an explicit %s conflict', (field) => {
  const f = makeConditionalCharacterFixture('Sorcerer', 'PHB', 1)
  const data = structuredClone(f.data)
  const cls = data.classes.find((row) => row.name === 'Sorcerer' && row.source === 'PHB')!
  const ref = cls.subclasses!.find((row) => row.name === 'Draconic Bloodline')!
    .subclassFeatureRefs![0]
  Object.assign(ref, { [field]: field === 'level' ? 3 : 'Other' })
  expect(
    deriveConditionalProficiencyNotes(f.character, buildClassChoiceFeatureCatalogs(data)),
  ).toEqual([])
  expect(deriveConditionalProficiencyNotes(f.character, f.catalogs)).toHaveLength(1)
})

test('conditional projection preserves an independently saved invocation, ID, usage and recharge', () => {
  const f = makeConditionalCharacterFixture()
  const selected = f.select(['Fire Rune'])
  const manual = {
    id: 'manual:fire-trigger',
    name: 'Invoke Fire Rune',
    kind: 'special' as const,
    description: 'Use the complete Fire Rune shackles rule when a weapon attack hits.',
    source: { kind: 'manual' as const, name: 'Invoke Fire Rune' },
    active: true,
    resourceCost: { resourceId: 'manual:fire-rune', amount: 1 },
    recharge: { rest: 'short' as const, note: 'Short or long rest.' },
  }
  const saved = characterPersistenceSchema.parse({
    ...selected,
    ...upsertManualActionCommand(selected, manual),
    classResources: { 'manual:fire-rune': 1 },
  }) as Character
  const before = JSON.stringify(saved)
  const vm = createCharacterSheetViewModel(saved, f.input)
  expect(vm.actions).toContainEqual(saved.manualActions![0])
  expect(vm.character.classResources).toEqual(saved.classResources)
  expect(deriveConditionalProficiencyNotes(saved, f.catalogs)).toHaveLength(1)
  expect(JSON.stringify(saved)).toBe(before)
})

test('manual command and strict reopen reject derived target/reserved ID, while suppression persists across current-source absence', () => {
  const f = makeConditionalCharacterFixture('Sorcerer', 'PHB', 1)
  const note = deriveConditionalProficiencyNotes(f.character, f.catalogs)[0]
  for (const effect of [
    note,
    { ...note, id: 'manual:forged' },
    {
      ...note,
      target: { kind: 'initiative' as const },
      operation: { kind: 'add' as const, value: 1 },
    },
  ]) {
    expect(() => upsertManualEffectCommand(f.character, effect)).toThrow()
    expect(
      characterPersistenceSchema.safeParse({ ...f.character, manualEffects: [effect] }).success,
    ).toBe(false)
  }
  const saved = characterPersistenceSchema.parse({
    ...f.character,
    ...setEffectSuppressedCommand(f.character, note.id, true),
  }) as Character
  expect(deriveConditionalProficiencyNotes(saved, { ...f.catalogs, classes: [] })).toEqual([])
  const context = createCharacterCalculationContext(saved, f.input)
  expect(context.effects.sourceDeclarations).toContainEqual(note)
  expect(
    getProficiencyCheckNoteRows(
      context.effects.sourceDeclarations,
      context.effects.resolutionContext,
    ),
  ).toEqual([])
  expect(createCharacterSheetViewModel(saved, f.input).proficiencyCheckNotes).toEqual([])
})
