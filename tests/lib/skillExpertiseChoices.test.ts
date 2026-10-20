import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { getProficiencyOption } from '@/lib/5etools/classProficiencyIdentity'
import { buildFeatLookup } from '@/lib/5etools/lookups'
import { buildClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceOptions'
import { getFeatOptionSourceTag } from '@/lib/character/commands/featCommandIdentity'
import {
  commitFeatOptionsCommand,
  editFeatOptionsCommand,
  replaceBonusFeatSelectionsCommand,
  replaceFeatSelectionsCommand,
  resolveProficiencyChoiceCommand,
} from '@/lib/character/commands/featCommands'
import { applyRaceSelectionCommand } from '@/lib/character/commands/raceCommands'
import { applySkillExpertiseActionCommand } from '@/lib/character/commands/skillExpertiseCommands'
import {
  canChangeFeatExpertise,
  getFeatExpertiseSkillPool,
} from '@/lib/character/featExpertiseSelections'
import { getFeatSetupStatus, isFeatSetupComplete } from '@/lib/character/featSetupProgress'
import { getSkillExpertiseChoices } from '@/lib/character/skillExpertiseChoices'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import { addGrant } from '@/lib/provenance'
import { applyClassGrants } from '@/lib/provenance/applyClassGrants'
import { validateFeatSetup } from '@/lib/readiness/coreReadiness'
import type { Feat5e, Race5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { applyProficiency, makeClassProficiencyFixture } from '../fixtures/classProficiencyFixtures'

const sources = JSON.parse(
  readFileSync('tests/fixtures/expertiseFeatSources.json', 'utf8'),
) as Feat5e[]
const feat = sources.find((row) => row.name === 'Skill Expert' && row.source === 'TCE')!
function fixture(source = 'PHB', level = 1) {
  const f = makeClassProficiencyFixture('Rogue', source, level)
  f.data.feats = sources
  for (const command of [replaceFeatSelectionsCommand, replaceBonusFeatSelectionsCommand]) {
    const result = command(f.character, f.character.provenance, [
      { name: feat.name, source: feat.source },
    ])
    f.character = { ...f.character, ...result.characterPatch, provenance: result.provenanceUpdate }
  }
  return f
}
type Fixture = ReturnType<typeof fixture>
const authority = (f: Fixture) => ({
  classes: f.data.classes,
  feats: f.data.feats,
  catalogs: buildClassChoiceFeatureCatalogs(f.data),
})
const model = (f: Fixture, character = f.character) =>
  getSkillExpertiseChoices(character, authority(f))
function choose(f: Fixture, character: Character, skill: string, owner: string, adding: boolean) {
  const action = model(f, character).actions[skill]?.find(
    (row) => row.ownerId === owner && row.adding === adding,
  )
  expect(action, `${adding ? 'add' : 'remove'} ${skill} for ${owner}`).toBeDefined()
  const result = applySkillExpertiseActionCommand(character, skill, action!.id, authority(f))
  return characterPersistenceSchema.parse({
    ...character,
    ...result.characterPatch,
    provenance: result.provenanceUpdate,
  })
}

test('Rogue gain quotas include tools, inline edits preserve siblings and exact gains, stale actions do not write', () => {
  const f = fixture('PHB', 6)
  f.character.feats = []
  f.character.specialFeats = []
  f.character.provenance.feats = {}
  const first = f.choices.find((row) => row.level === 1)!,
    later = f.choices.find((row) => row.level === 6)!
  let current = applyProficiency(f, first, [
    getProficiencyOption('expertise', "thieves' tools", 'tool'),
  ])
  expect(model(f, current).remaining).toBe(3)
  current = choose(f, current, 'stealth', first.id, true)
  current = choose(f, current, 'nature', later.id, true)
  expect(
    current.classChoiceSelections
      ?.find((row) => row.choiceId === first.id)
      ?.selected.map((row) => row.name),
  ).toEqual(["thieves' tools", 'Stealth'])
  expect(model(f, current).remaining).toBe(1)
  current = choose(f, current, 'stealth', first.id, false)
  expect(current.proficiencies.expertise.sort()).toEqual(['nature', "thieves' tools"].sort())
  const before = JSON.stringify(current)
  const result = applySkillExpertiseActionCommand(
    current,
    'stealth',
    'class:add:missing',
    authority(f),
  )
  expect(result.characterPatch).toEqual({})
  expect(JSON.stringify(current)).toBe(before)
})

test.each([
  'feat-first',
  'class-first',
])('exact feat and PHB contributors remove independently in %s order without stacking or losing proficiency', (order) => {
  const f = fixture()
  const bonus = model(f).featOwners.find((row) => row.target.selectionKind === 'bonus')!
  let current = choose(f, f.character, 'stealth', bonus.id, true)
  expect(current.specialFeats![0].options).toEqual({ expertiseSkill: 'stealth' })
  expect(current.feats[0].options).toBeUndefined()
  expect(current.provenance.proficiencies.skills.stealth).toBeUndefined()
  expect(isFeatSetupComplete(feat, current.specialFeats![0].options)).toBe(false)
  current = choose(f, current, 'stealth', f.choices[0].id, true)
  expect(current.provenance.proficiencies.expertise!.stealth).toHaveLength(2)
  const first = order === 'feat-first' ? bonus.id : f.choices[0].id
  const second = order === 'feat-first' ? f.choices[0].id : bonus.id
  current = choose(f, current, 'stealth', first, false)
  expect(model(f, current).effective.proficiencies.expertise).toEqual(['stealth'])
  current = choose(f, current, 'stealth', second, false)
  expect(model(f, current).effective.proficiencies.expertise).toEqual([])
  expect(current.proficiencies.skills).toContain('stealth')
})

test('feat inline clear preserves ability, separately granted skills and other owner setup; full Finish preserves Expertise-only semantics', () => {
  const f = fixture()
  const target = { ...feat, selectionKind: 'bonus' as const }
  const result = commitFeatOptionsCommand(f.character, f.character.provenance, target, {
    abilityScore: 'dex',
    skills: ['nature'],
    expertiseSkill: 'stealth',
  })
  let current = characterPersistenceSchema.parse({
    ...f.character,
    ...result.characterPatch,
    provenance: result.provenanceUpdate,
  })
  const bonus = model(f, current).featOwners.find((row) => row.target.selectionKind === 'bonus')!
  expect(isFeatSetupComplete(feat, current.specialFeats![0].options)).toBe(true)
  expect(current.provenance.proficiencies.skills.stealth).toBeUndefined()
  current = choose(f, current, 'stealth', bonus.id, false)
  expect(current.specialFeats![0].options).toEqual({ abilityScore: 'dex', skills: ['nature'] })
  expect(current.proficiencies.skills).toContain('stealth')
  expect(current.provenance.abilityBonuses).toHaveLength(1)
  expect(current.provenance.proficiencies.skills.nature).toHaveLength(2)
  expect(isFeatSetupComplete(feat, current.specialFeats![0].options)).toBe(false)
})

test('underlying proficiency and source suspension retain exact feat intent and recover without a new free choice', () => {
  const f = fixture()
  f.character.proficiencies.skills = []
  f.character.provenance = applyClassGrants(
    {
      name: 'Rogue',
      source: 'PHB',
      startingProficiencies: { skills: [{ choose: { from: ['stealth'], count: 1 } }] },
    },
    undefined,
    f.character.provenance,
  )
  const proficiency = (character: Character, adding: boolean) => {
    const result = resolveProficiencyChoiceCommand(
      character,
      character.provenance,
      'skills',
      'stealth',
      adding,
    )
    return characterPersistenceSchema.parse({
      ...character,
      ...result.characterPatch,
      provenance: result.provenanceUpdate,
    })
  }
  let current = proficiency(f.character, true)
  const bonus = model(f, current).featOwners.find((row) => row.target.selectionKind === 'bonus')!
  current = choose(f, current, 'stealth', bonus.id, true)
  current = proficiency(current, false)
  expect(current.specialFeats![0].options?.expertiseSkill).toBe('stealth')
  expect(model(f, current).effective.proficiencies.expertise).toEqual([])
  expect(model(f, current).remaining).toBe(3)
  current = proficiency(current, true)
  expect(model(f, current).effective.proficiencies.expertise).toEqual(['stealth'])
  const off = getSkillExpertiseChoices(current, { ...authority(f), feats: [] })
  expect(off.effective.proficiencies.expertise).toEqual([])
  expect(off.actions.stealth.some((row) => row.ownerId === bonus.id && !row.adding)).toBe(true)
  expect(model(f, current).effective.proficiencies.expertise).toEqual(['stealth'])
})

test('duplicate or changed feat source fails closed and revised new picks cannot duplicate existing Expertise', () => {
  const f = fixture('XPHB')
  const bonus = model(f).featOwners.find((row) => row.target.selectionKind === 'bonus')!
  const current = choose(f, f.character, 'stealth', bonus.id, true)
  expect(model(f, current).actions.stealth.some((row) => row.kind === 'class' && row.adding)).toBe(
    false,
  )
  const duplicate = getSkillExpertiseChoices(f.character, { ...authority(f), feats: [feat, feat] })
  expect(duplicate.actions.stealth?.some((row) => row.kind === 'feat' && row.adding) ?? false).toBe(
    false,
  )
  const changed = structuredClone(feat)
  changed.entries = ['Changed rules']
  expect(
    getSkillExpertiseChoices(f.character, { ...authority(f), feats: [changed] }).featOwners,
  ).toEqual([])
})

test('revised Rogue can use a suspended feat skill without losing retained intent on restore or clear', () => {
  const f = fixture('XPHB')
  const bonus = model(f).featOwners.find((row) => row.target.selectionKind === 'bonus')!
  let current = choose(f, f.character, 'stealth', bonus.id, true)
  const suspended = { ...authority(f), feats: [] }
  const action = getSkillExpertiseChoices(current, suspended).actions.stealth.find(
    (row) => row.kind === 'class' && row.adding,
  )!
  expect(action).toBeDefined()
  const result = applySkillExpertiseActionCommand(current, 'stealth', action.id, suspended)
  current = characterPersistenceSchema.parse({
    ...current,
    ...result.characterPatch,
    provenance: result.provenanceUpdate,
  })
  expect(current.specialFeats![0].options?.expertiseSkill).toBe('stealth')
  expect(getSkillExpertiseChoices(current, suspended).effective.proficiencies.expertise).toEqual([
    'stealth',
  ])
  expect(model(f, current).effective.provenance.proficiencies.expertise!.stealth).toHaveLength(2)
  current = choose(f, current, 'stealth', f.choices[0].id, false)
  expect(model(f, current).effective.proficiencies.expertise).toEqual(['stealth'])
  current = choose(f, current, 'stealth', bonus.id, false)
  expect(model(f, current).effective.proficiencies.expertise).toEqual([])
  expect(current.proficiencies.skills).toContain('stealth')
})

test('legacy coupled self-grant cannot authorize itself, remains admissible and clears without invented manual proficiency', () => {
  const f = fixture()
  const owner = { name: feat.name, source: feat.source, selectionKind: 'bonus' as const }
  f.character.specialFeats![0].options = { expertiseSkill: 'stealth' }
  f.character.proficiencies.expertise = ['stealth']
  f.character.provenance = addGrant(
    addGrant(f.character.provenance, 'skills', 'stealth', getFeatOptionSourceTag(owner)),
    'expertise',
    'stealth',
    getFeatOptionSourceTag(owner),
  )
  expect(characterPersistenceSchema.safeParse(f.character).success).toBe(true)
  const currentModel = model(f)
  expect(currentModel.effective.proficiencies.skills).not.toContain('stealth')
  expect(currentModel.effective.proficiencies.expertise).toEqual([])
  const bonus = currentModel.featOwners.find((row) => row.target.selectionKind === 'bonus')!
  const cleared = choose(f, f.character, 'stealth', bonus.id, false)
  expect(cleared.proficiencies.skills).not.toContain('stealth')
  expect(cleared.provenance.proficiencies.skills.stealth).toBeUndefined()
})

test('fixed providers share one actual feat option allowance and retain it when one provider is removed', () => {
  const f = fixture()
  f.character.feats = []
  f.character.specialFeats = []
  f.character.provenance.feats = {}
  const human = (
    JSON.parse(readFileSync('resources/srd/core/data/races.json', 'utf8')).race as Race5e[]
  ).find((race) => race.name === 'Human' && race.source === 'PHB')!
  const raceResult = applyRaceSelectionCommand(
    f.character,
    f.character.provenance,
    human,
    undefined,
    0,
    () => [],
  )
  f.character = {
    ...f.character,
    ...raceResult.characterPatch,
    provenance: raceResult.provenanceUpdate,
  }
  f.character.background = 'Scholar'
  f.character.backgroundSource = 'PHB'
  f.character.provenance.feats['skill expert'] = ['Human', 'Scholar'].map((name, index) => ({
    sourceType: index ? ('background' as const) : ('race' as const),
    sourceName: name,
    sourceRef: 'PHB',
    grantType: 'fixed' as const,
    grantSource: 'TCE',
    label: name,
  }))
  const before = model(f)
  expect(before.featOwners).toHaveLength(1)
  expect(before.remaining).toBe(3)
  let current = choose(f, f.character, 'stealth', before.featOwners[0].id, true)
  expect(Object.values(current.fixedFeatOptions!)).toEqual([{ expertiseSkill: 'stealth' }])
  current = {
    ...current,
    provenance: {
      ...current.provenance,
      feats: { 'skill expert': current.provenance.feats['skill expert'].slice(1) },
    },
  }
  expect(model(f, current).effective.proficiencies.expertise).toEqual(['stealth'])
  expect(model(f, current).featOwners).toHaveLength(1)
})

test('full feat Finish uses the post-edit skill pool, validates new choices and preserves independent proficiency', () => {
  const f = fixture()
  f.character.proficiencies.skills = ['nature']
  const target = { ...feat, selectionKind: 'bonus' as const }
  const result = commitFeatOptionsCommand(f.character, f.character.provenance, target, {
    abilityScore: 'dex',
    skills: ['stealth'],
    expertiseSkill: 'nature',
  })
  const current = characterPersistenceSchema.parse({
    ...f.character,
    ...result.characterPatch,
    provenance: result.provenanceUpdate,
  })
  const effective = model(f, current).effective
  const invalid = { abilityScore: 'dex', skills: ['arcana'], expertiseSkill: 'stealth' }
  expect(canChangeFeatExpertise(current, effective, target, invalid, sources)).toBe(false)
  expect(getFeatExpertiseSkillPool(current, effective, target, invalid, sources)).not.toContain(
    'stealth',
  )
  expect(
    canChangeFeatExpertise(
      current,
      effective,
      target,
      { ...invalid, expertiseSkill: 'arcana' },
      sources,
    ),
  ).toBe(true)
  expect(
    canChangeFeatExpertise(
      current,
      effective,
      target,
      { ...invalid, skills: ['stealth'] },
      sources,
    ),
  ).toBe(true)
  expect(
    canChangeFeatExpertise(
      current,
      effective,
      target,
      { ...invalid, skills: ['arcana', 'arcana'] },
      sources,
    ),
  ).toBe(false)
  expect(
    canChangeFeatExpertise(
      current,
      effective,
      target,
      { ...invalid, skills: ['invented'] },
      sources,
    ),
  ).toBe(false)
  const manual = addGrant(current.provenance, 'skills', 'stealth', {
    sourceType: 'manual',
    sourceName: 'User Choice',
    grantType: 'choice',
    label: 'User Choice',
  })
  const independent = { ...current, provenance: manual }
  expect(
    canChangeFeatExpertise(independent, model(f, independent).effective, target, invalid, sources),
  ).toBe(true)
  const finish = editFeatOptionsCommand(
    independent,
    independent.provenance,
    target,
    independent.specialFeats![0].options!,
    invalid,
  )
  const saved = characterPersistenceSchema.parse({
    ...independent,
    ...finish.characterPatch,
    provenance: finish.provenanceUpdate,
  })
  expect(saved.proficiencies.skills).toContain('stealth')
  expect(saved.provenance.proficiencies.skills.stealth.map((tag) => tag.sourceType)).toEqual([
    'manual',
  ])
  expect(model(f, saved).effective.proficiencies.expertise).toEqual(['stealth'])
})

test('exact supported setup status follows applied, suspended and restored intent and distinguishes equal ordinary/bonus setup', () => {
  const f = fixture()
  f.character.proficiencies.skills = []
  f.character.provenance = applyClassGrants(
    {
      name: 'Rogue',
      source: 'PHB',
      startingProficiencies: { skills: [{ choose: { from: ['nature'], count: 1 } }] },
    },
    undefined,
    f.character.provenance,
  )
  const prof = resolveProficiencyChoiceCommand(
    f.character,
    f.character.provenance,
    'skills',
    'nature',
    true,
  )
  let current = { ...f.character, ...prof.characterPatch, provenance: prof.provenanceUpdate }
  const bonus = { ...feat, selectionKind: 'bonus' as const },
    ordinary = { ...feat, selectionKind: 'ordinary' as const }
  const options = { abilityScore: 'dex', skills: ['stealth'], expertiseSkill: 'nature' }
  for (const target of [bonus, ordinary]) {
    const result = commitFeatOptionsCommand(current, current.provenance, target, options)
    current = characterPersistenceSchema.parse({
      ...current,
      ...result.characterPatch,
      provenance: result.provenanceUpdate,
    })
  }
  const status = (target: typeof bonus | typeof ordinary, feats = sources) => {
    const effective = getSkillExpertiseChoices(current, { ...authority(f), feats }).effective
    return getFeatSetupStatus(current, effective, target, feats)
  }
  expect(status(bonus).complete).toBe(true)
  expect(status(ordinary).complete).toBe(true)
  const loss = resolveProficiencyChoiceCommand(
    current,
    current.provenance,
    'skills',
    'nature',
    false,
  )
  current = characterPersistenceSchema.parse({
    ...current,
    ...loss.characterPatch,
    provenance: loss.provenanceUpdate,
  })
  expect(status(bonus).applied).toBe(false)
  expect(status(bonus).saved).toBe(true)
  expect(status(bonus).complete).toBe(false)
  expect(
    validateFeatSetup(model(f, current).effective, buildFeatLookup(sources)).filter((row) =>
      row.title.includes('Skill Expert'),
    ),
  ).toHaveLength(2)
  const restore = resolveProficiencyChoiceCommand(
    current,
    current.provenance,
    'skills',
    'nature',
    true,
  )
  current = characterPersistenceSchema.parse({
    ...current,
    ...restore.characterPatch,
    provenance: restore.provenanceUpdate,
  })
  expect(status(bonus).complete).toBe(true)
  expect(status(bonus, []).complete).toBe(false)
  expect(status(bonus, [feat, feat]).complete).toBe(false)
  expect(status(bonus).complete).toBe(true)
  const remove = replaceBonusFeatSelectionsCommand(current, current.provenance, [])
  current = characterPersistenceSchema.parse({
    ...current,
    ...remove.characterPatch,
    provenance: remove.provenanceUpdate,
  })
  expect(status(bonus).complete).toBe(false)
  expect(status(ordinary).complete).toBe(true)
})

test('held nonadapted feat Expertise stays effective and informational without new owned controls', () => {
  const f = fixture()
  const literal = sources.find((row) => row.name === 'Aberrant Anatomy')!
  const select = replaceBonusFeatSelectionsCommand(f.character, f.character.provenance, [literal])
  let current = { ...f.character, ...select.characterPatch, provenance: select.provenanceUpdate }
  const commit = commitFeatOptionsCommand(
    current,
    current.provenance,
    { ...literal, selectionKind: 'bonus' },
    { expertiseSkill: 'nature' },
  )
  current = characterPersistenceSchema.parse({
    ...current,
    ...commit.characterPatch,
    provenance: commit.provenanceUpdate,
  })
  const choices = model(f, current)
  expect(choices.effective.proficiencies.expertise).toEqual(['nature'])
  expect(choices.featOwners.some((row) => row.target.name === 'Aberrant Anatomy')).toBe(false)
  expect(choices.actions.nature?.some((row) => row.kind === 'feat' && !row.adding) ?? false).toBe(
    false,
  )
  expect(
    choices.rows.some(
      (row) =>
        row.category === 'Expertise' && row.attribution === 'feat' && row.itemName === 'nature',
    ),
  ).toBe(true)
})

test('normal PDF projections use the same exact feat source suspension and restored modifier without modifying saved intent', () => {
  const f = fixture()
  const owner = model(f).featOwners.find((row) => row.target.selectionKind === 'bonus')!
  const current = choose(f, f.character, 'stealth', owner.id, true)
  const input = {
    ...f.data.lookups!,
    featsByKey: buildFeatLookup(sources),
    featExpertiseFeats: sources,
    classChoiceClasses: f.data.classes,
    classChoiceFeatureCatalogs: f.catalogs,
  }
  const before = JSON.stringify(current)
  const on = createCharacterSheetViewModel(current, input)
  const off = createCharacterSheetViewModel(current, { ...input, featExpertiseFeats: [] })
  const restored = createCharacterSheetViewModel(current, input)
  expect(on.skillByName.get('stealth')).toMatchObject({ proficient: true, expertise: true })
  expect(off.skillByName.get('stealth')).toMatchObject({ proficient: true, expertise: false })
  expect(on.skillByName.get('stealth')!.modifier - off.skillByName.get('stealth')!.modifier).toBe(
    on.proficiencyBonus,
  )
  expect(restored.skillByName.get('stealth')).toEqual(on.skillByName.get('stealth'))
  expect(JSON.stringify(current)).toBe(before)
})
