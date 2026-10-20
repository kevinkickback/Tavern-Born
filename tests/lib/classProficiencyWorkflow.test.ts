import { expect, test } from 'vitest'
import { getCurrentClassProficiencyChoices } from '@/lib/5etools/classProficiencyChoices'
import {
  decodeProficiencyOption,
  getProficiencyOption,
} from '@/lib/5etools/classProficiencyIdentity'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { parseClassDocument } from '@/lib/5etools/parsers/classes'
import { getExpertiseSlotsFromClasses, reconcileSkillExpertise } from '@/lib/calculations/skills'
import { getClassChoiceCandidates } from '@/lib/character/classChoiceOptions'
import { resolveClassProficiencyOptions } from '@/lib/character/classProficiencyOptions'
import { refreshClassProficiencyState } from '@/lib/character/classProficiencySelections'
import { getClassProficiencyWorkflow } from '@/lib/character/classProficiencyWorkflow'
import { reconcileClassChoiceSelections } from '@/lib/character/commands/classChoiceCommands'
import { applyManualProficiencyCommand } from '@/lib/character/commands/equipmentCommands'
import type { Class5e } from '@/types/5etools'
import { characterPersistenceSchema } from '@/types/characterSchema'
import {
  applyProficiency,
  expertiseOption,
  makeClassProficiencyFixture,
  proficiencySources,
} from '../fixtures/classProficiencyFixtures'

test('empty and partial pools remain pending; adapted targets retire pooled additions without assigning manual values', () => {
  const f = makeClassProficiencyFixture()
  const pending = {
    ...f.character,
    proficiencies: { ...f.character.proficiencies, skills: [], tools: [] },
  }
  expect(resolveClassProficiencyOptions(f.choices[0], f.catalogs, [], pending)).toEqual([])
  expect(applyProficiency(f, f.choices[0], [], pending)).toEqual(pending)
  const partial = applyProficiency(f, f.choices[0], [expertiseOption('Stealth')])
  expect(partial.classChoiceSelections![0].selected).toHaveLength(1)
  const bard = {
    ...f.cls,
    name: 'Bard',
    classFeatureRefs: [
      { name: 'Expertise', className: 'Bard', ref: 'Expertise|Bard|PHB|3|PHB', level: 3 },
    ],
  }
  const classes = { 'rogue|phb': f.cls, 'bard|phb': bard }
  expect(getExpertiseSlotsFromClasses(f.character.classProgression, classes)).toBe(0)
  expect(
    getExpertiseSlotsFromClasses(
      [...f.character.classProgression, { name: 'Bard', source: 'PHB', levels: 3 }],
      classes,
    ),
  ).toBe(0)
  const legacy = {
    ...f.character,
    proficiencies: { ...f.character.proficiencies, expertise: ['stealth'] },
  }
  expect(characterPersistenceSchema.parse(legacy).proficiencies.expertise).toEqual(['stealth'])
  expect(legacy.classChoiceSelections ?? []).toEqual([])
})

test('actual class source inventory exposes fourteen distinct targets and sixteen domains', () => {
  const f = makeClassProficiencyFixture()
  expect(proficiencySources).toHaveLength(14)
  const all = f.data.classes.flatMap((cls) =>
    getCurrentClassProficiencyChoices(cls, true, f.catalogs),
  )
  expect(all).toHaveLength(16)
  expect(new Set(all.map((row) => row.id)).size).toBe(16)
  expect(
    getCurrentClassProficiencyChoices(
      f.data.classes.find((row) => row.name === 'Ranger' && row.source === 'PHB')!,
      false,
      f.catalogs,
    ),
  ).toEqual([])
  expect(f.choices.map((row) => [row.level, row.maximumSelections])).toEqual([
    [1, 2],
    [6, 2],
  ])
})

test('PHB Rogue chooses one skill and proficient thieves tools within one quota, with strict tool identity and no underlying grant', () => {
  const f = makeClassProficiencyFixture()
  const tool = getProficiencyOption('expertise', "Thieves' Tools", 'tool')
  expect(decodeProficiencyOption(tool)?.proficiencyType).toBe('tool')
  const saved = applyProficiency(f, f.choices[0], [expertiseOption('Stealth'), tool])
  expect(saved.proficiencies.expertise).toEqual(['stealth', "thieves' tools"])
  expect(saved.proficiencies.skills).toEqual(f.character.proficiencies.skills)
  expect(saved.proficiencies.tools).toEqual(f.character.proficiencies.tools)
  expect(reconcileSkillExpertise(saved.proficiencies).expertise).toEqual(
    saved.proficiencies.expertise,
  )
  expect(characterPersistenceSchema.parse(JSON.parse(JSON.stringify(saved)))).toEqual(saved)
  expect(() =>
    applyProficiency(f, f.choices[0], [
      expertiseOption('Stealth'),
      tool,
      expertiseOption('Nature'),
    ]),
  ).toThrow(/allows 2/)
  expect(() =>
    applyProficiency(f, f.choices[0], [getProficiencyOption('expertise', 'Hammer', 'tool')]),
  ).toThrow()
})

test.each([
  ['Rogue', 'PHB', 6],
  ['Bard', 'PHB', 10],
  ['Expert Sidekick', 'TCE', 15],
] as const)('%s %s later gain cannot reuse its own earlier expertise and has a separate allowance', (name, source, level) => {
  const f = makeClassProficiencyFixture(name, source, level)
  const saved = applyProficiency(f, f.choices[0], [
    expertiseOption('Stealth'),
    expertiseOption('Perception'),
  ])
  expect(() => applyProficiency(f, f.choices[1], [expertiseOption('Stealth')], saved)).toThrow(
    /eligibility/,
  )
  const next = applyProficiency(
    f,
    f.choices[1],
    [expertiseOption('Nature'), expertiseOption('Survival')],
    saved,
  )
  expect(next.classChoiceSelections?.map((row) => row.selected.length)).toEqual([2, 2])
})

test.each([
  ['Rogue', 6],
  ['Bard', 9],
  ['Ranger', 9],
] as const)('revised %s rejects existing expertise, including other grants, but reopens its own selection', (name, level) => {
  const f = makeClassProficiencyFixture(name, 'XPHB', level)
  const first = f.choices.find((row) => row.proficiencyDomain === 'expertise')!
  const saved = applyProficiency(f, first, [expertiseOption('Stealth')])
  expect(applyProficiency(f, first, [expertiseOption('Stealth')], saved)).toEqual(saved)
  const later = f.choices.filter((row) => row.proficiencyDomain === 'expertise')[1]!
  expect(() => applyProficiency(f, later, [expertiseOption('Stealth')], saved)).toThrow(
    /eligibility/,
  )
  expect(() =>
    applyProficiency(f, first, [getProficiencyOption('expertise', "thieves' tools", 'tool')]),
  ).toThrow()
  const manual = {
    ...f.character,
    proficiencies: { ...f.character.proficiencies, expertise: ['stealth'] },
  }
  expect(() => applyProficiency(f, first, [expertiseOption('Stealth')], manual)).toThrow(
    /eligibility/,
  )
})

test('tool proficiency loss suspends only dependent expertise, restores from retained intent, and does not invent manual ownership', () => {
  const f = makeClassProficiencyFixture()
  const saved = applyProficiency(f, f.choices[0], [
    expertiseOption('Stealth'),
    getProficiencyOption('expertise', "thieves' tools", 'tool'),
  ])
  const result = applyManualProficiencyCommand(
    saved,
    saved.provenance!,
    'tools',
    "thieves' tools",
    false,
  )
  const removed = { ...saved, ...result.characterPatch, provenance: result.provenanceUpdate }
  expect(removed.proficiencies.expertise).toEqual(['stealth'])
  expect(removed.classChoiceSelections).toEqual(saved.classChoiceSelections)
  const restored = refreshClassProficiencyState(
    { ...removed, proficiencies: { ...removed.proficiencies, tools: ["thieves' tools"] } },
    f.data.classes,
    f.catalogs,
  )
  expect(restored.proficiencies.expertise).toEqual(['stealth', "thieves' tools"])
  expect(restored.provenance?.proficiencies.expertise?.["thieves' tools"]).toHaveLength(1)
})

test('source absence and optional-off do not deactivate ordinary expertise; invalid source and explicit empty catalog fail closed', () => {
  const f = makeClassProficiencyFixture()
  const saved = applyProficiency(f, f.choices[0], [expertiseOption('Stealth')])
  expect(
    refreshClassProficiencyState(saved, f.data.classes, f.catalogs).proficiencies.expertise,
  ).toEqual(['stealth'])
  const absent = { ...f.catalogs, classFeatureCandidates: new Map(), classFeatures: [] }
  const projected = refreshClassProficiencyState(saved, f.data.classes, absent)
  expect(projected.proficiencies.expertise).toEqual([])
  expect(projected.classChoiceSelections).toEqual(saved.classChoiceSelections)
  expect(
    refreshClassProficiencyState(projected, f.data.classes, f.catalogs).proficiencies.expertise,
  ).toEqual(['stealth'])
  const changed = makeClassProficiencyFixture('Rogue', 'PHB', 6, (rows) => {
    rows.find(
      (row) => row.className === 'Rogue' && row.source === 'PHB' && row.level === 1,
    )!.entries = ['changed rules']
  })
  expect(changed.choices.some((row) => row.level === 1)).toBe(false)
})

test('workflow and deep links retain exact owner/gain, while strict admission rejects a forged tool family', () => {
  const f = makeClassProficiencyFixture()
  const rows = getClassProficiencyWorkflow(f.character, f.data.classes, f.catalogs)
  expect(rows.map((row) => row.level)).toEqual([1, 6])
  const saved = applyProficiency(f, f.choices[0], [
    getProficiencyOption('expertise', "thieves' tools", 'tool'),
  ])
  const forged = structuredClone(saved)
  forged.classChoiceSelections![0].selected[0].ref = JSON.stringify([
    'proficiency',
    'expertise',
    'tool',
    'hammer',
  ])
  forged.classChoiceSelections![0].selected[0].name = 'hammer'
  expect(characterPersistenceSchema.safeParse(forged).success).toBe(false)
})

test('revised retained earlier intent stays effective while a conflicting later gain stays pending and can be cleared', () => {
  const revised = makeClassProficiencyFixture('Rogue', 'XPHB', 6)
  const one = applyProficiency(revised, revised.choices[0], [expertiseOption('Stealth')])
  const two = applyProficiency(revised, revised.choices[1], [expertiseOption('Stealth')])
  const conflict = {
    ...one,
    classChoiceSelections: [...one.classChoiceSelections!, ...two.classChoiceSelections!],
    provenance: {
      ...one.provenance!,
      proficiencies: {
        ...one.provenance!.proficiencies,
        expertise: {
          stealth: [
            ...one.provenance!.proficiencies.expertise!.stealth,
            ...two.provenance!.proficiencies.expertise!.stealth,
          ],
        },
      },
    },
  }
  expect(characterPersistenceSchema.safeParse(conflict).success).toBe(true)
  const inactive = refreshClassProficiencyState(conflict, revised.data.classes, revised.catalogs)
  expect(inactive.proficiencies.expertise).toEqual(['stealth'])
  expect(inactive.provenance.proficiencies.expertise!.stealth).toHaveLength(1)
  expect(inactive.provenance.proficiencies.expertise!.stealth[0].grantVariant).toBe(
    revised.choices[0].id,
  )
  expect(inactive.classChoiceSelections).toEqual(conflict.classChoiceSelections)
  expect(refreshClassProficiencyState(inactive, revised.data.classes, revised.catalogs)).toBe(
    inactive,
  )
  const repaired = applyProficiency(revised, revised.choices[1], [], inactive)
  expect(repaired.proficiencies.expertise).toEqual(['stealth'])
})

test('copied declarations retain the actual owner and intentional removal retires only removed gains; duplicates cannot establish authority', () => {
  const f = makeClassProficiencyFixture()
  const copied = parseClassDocument({
    class: [
      {
        name: 'Scoundrel',
        source: 'PHB',
        classFeatures: ['Expertise|Rogue|PHB|1|PHB', 'Expertise|Rogue|PHB|6|PHB'],
      },
    ],
    classFeature: structuredClone(proficiencySources),
  }).classes[0] as Class5e
  f.data.classes = [...f.data.classes, copied]
  f.data.lookups = buildGameDataLookups(f.data)
  f.catalogs = { ...f.catalogs, classes: f.data.classes }
  const choices = getClassChoiceCandidates(copied, undefined, f.catalogs).filter(
    (row) => row.kind === 'proficiency',
  )
  const multi = {
    ...f.character,
    classProgression: [
      ...f.character.classProgression,
      { name: 'Scoundrel', source: 'PHB', levels: 6 },
    ],
  }
  const first = applyProficiency(f, f.choices[0], [expertiseOption('Stealth')], multi)
  const overlap = applyProficiency(f, choices[0], [expertiseOption('Stealth')], first)
  expect(overlap.provenance!.proficiencies.expertise!.stealth).toHaveLength(2)
  const cleared = applyProficiency(f, choices[0], [], overlap)
  expect(cleared.proficiencies.expertise).toEqual(['stealth'])
  const later = applyProficiency(f, f.choices[1], [expertiseOption('Nature')], overlap)
  const reduced = reconcileClassChoiceSelections(later.classChoiceSelections, [
    { name: 'Rogue', source: 'PHB', levels: 1 },
    { name: 'Scoundrel', source: 'PHB', levels: 6 },
  ])
  expect(reduced.map((row) => [row.className, row.classLevel])).toEqual([
    ['Rogue', 1],
    ['Scoundrel', 1],
  ])
  expect(
    reconcileClassChoiceSelections(reduced, [{ name: 'Scoundrel', source: 'PHB', levels: 6 }]).map(
      (row) => row.className,
    ),
  ).toEqual(['Scoundrel'])
  const duplicate = {
    ...f.catalogs,
    classFeatureCandidates: new Map(f.catalogs.classFeatureCandidates),
  }
  const target = 'class-feature|expertise|rogue|phb|1|phb'
  const producer = duplicate.classFeatureCandidates.get(target)![0]
  duplicate.classFeatureCandidates.set(target, [producer, structuredClone(producer)])
  expect(
    getCurrentClassProficiencyChoices(f.cls, false, duplicate).map((row) => row.level),
  ).toEqual([6])
  expect(
    getCurrentClassProficiencyChoices(f.cls, false, f.catalogs).map((row) => row.level),
  ).toEqual([1, 6])
})

test('strict Rogue reopen rejects orphan tags, wrong targets/domains/slots and tool-as-skill identity', () => {
  const f = makeClassProficiencyFixture()
  const saved = applyProficiency(f, f.choices[0], [
    getProficiencyOption('expertise', "thieves' tools", 'tool'),
  ])
  const changes = [
    (value: typeof saved) => {
      value.classChoiceSelections = []
    },
    (value: typeof saved) => {
      value.classChoiceSelections![0].selected[0].slotLevel = 6
    },
    (value: typeof saved) => {
      value.classChoiceSelections![0].selected[0].ref = JSON.stringify([
        'proficiency',
        'expertise',
        "thieves' tools",
      ])
    },
    (value: typeof saved) => {
      value.provenance!.proficiencies.expertise!["thieves' tools"][0].sourceName = 'Other'
    },
    (value: typeof saved) => {
      value.proficiencies.expertise = []
    },
  ]
  for (const change of changes) {
    const invalid = structuredClone(saved)
    change(invalid)
    expect(characterPersistenceSchema.safeParse(invalid).success).toBe(false)
  }
  const retained = {
    ...saved,
    proficiencies: { ...saved.proficiencies, expertise: [] },
    provenance: {
      ...saved.provenance!,
      proficiencies: { ...saved.provenance!.proficiencies, expertise: {} },
    },
  }
  expect(characterPersistenceSchema.safeParse(retained).success).toBe(true)
})

test.each([
  ['name', 'Different'],
  ['className', 'Bard'],
  ['classSource', 'XPHB'],
  ['source', 'XPHB'],
  ['level', 2],
] as const)('explicit declaration conflict in %s cannot verify the otherwise unique feature', (field, value) => {
  const f = makeClassProficiencyFixture()
  const cls = {
    ...f.cls,
    classFeatureRefs: f.cls.classFeatureRefs!.map((row) =>
      row.level === 1 ? { ...row, [field]: value } : row,
    ),
  }
  expect(
    getCurrentClassProficiencyChoices(cls, false, f.catalogs).some((row) => row.level === 1),
  ).toBe(false)
  expect(
    getCurrentClassProficiencyChoices(f.cls, false, f.catalogs).some((row) => row.level === 1),
  ).toBe(true)
})

test('a stale or forged descriptor cannot expand a current allowance, and canonical owner casing keeps later gains distinct', () => {
  const f = makeClassProficiencyFixture()
  expect(() =>
    applyProficiency(f, { ...f.choices[0], maximumSelections: 3 }, [
      expertiseOption('Stealth'),
      expertiseOption('Nature'),
      expertiseOption('Survival'),
    ]),
  ).toThrow()
  const first = {
    ...f.choices[0],
    owner: { ...f.choices[0].owner, name: ' rogue ', source: ' phb ' },
  }
  const saved = applyProficiency(f, first, [expertiseOption('Stealth')])
  expect(() => applyProficiency(f, f.choices[1], [expertiseOption('Stealth')], saved)).toThrow(
    /eligibility/,
  )
  const lost = refreshClassProficiencyState(
    {
      ...saved,
      proficiencies: {
        ...saved.proficiencies,
        skills: saved.proficiencies.skills.filter((name) => name !== 'stealth'),
      },
    },
    f.data.classes,
    f.catalogs,
  )
  expect(lost.proficiencies.expertise).toEqual([])
  expect(lost.classChoiceSelections).toEqual(saved.classChoiceSelections)
})
