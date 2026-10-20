import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { getProficiencyOption } from '@/lib/5etools/classProficiencyIdentity'
import {
  decodeFixedProficiencyId,
  getFixedProficiencyId,
} from '@/lib/5etools/fixedProficiencyIdentity'
import { buildClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import { getEarnedOwnerProficiencyCandidates } from '@/lib/character/classProficiencyAuthority'
import { projectOwnedProficiencies } from '@/lib/character/classProficiencyFoundation'
import { getClassProficiencySelectionStates } from '@/lib/character/classProficiencySelections'
import { getClassProficiencyWorkflow } from '@/lib/character/classProficiencyWorkflow'
import {
  applyClassChoiceSelectionWithGrantsCommand,
  retainSavedFeatureOptionsCommand,
} from '@/lib/character/commands/classChoiceCommands'
import { applyClassProgressionUpdate } from '@/lib/character/commands/classCommands'
import { resolveProficiencyChoiceCommand } from '@/lib/character/commands/featCommands'
import { setHistoricalProficiencySetupCommand } from '@/lib/character/commands/historicalProficiencyCommands'
import { projectProficiencyCommandResult } from '@/lib/character/commands/proficiencyProjection'
import { getSkillExpertiseChoices } from '@/lib/character/skillExpertiseChoices'
import { addGrant, makeSourceTag } from '@/lib/provenance'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeFixedSourceData } from '../fixtures/fixedProficiencyFixtures'

function fixture(name = 'Rogue', source = 'PHB') {
  const { data } = makeFixedSourceData()
  data.skills = JSON.parse(readFileSync('resources/srd/core/data/skills.json', 'utf8')).skill
  const catalogs = buildClassChoiceFeatureCatalogs(data)
  const character = makeCharacterFixture({
    race: '',
    raceSource: '',
    background: '',
    backgroundSource: '',
    originSystem: source === 'XPHB' ? '2024' : '2014',
    classProgression: [
      {
        name,
        source,
        levels: name === 'Fighter' ? 7 : name === 'Artificer' ? 6 : 3,
        ...(name === 'Rogue'
          ? { subclass: 'Scout', subclassSource: 'XGE' }
          : name === 'Fighter'
            ? { subclass: 'Purple Dragon Knight (Banneret)', subclassSource: 'SCAG' }
            : {}),
      },
    ],
  })
  const apply = (
    result: { characterPatch: Partial<Character>; provenanceUpdate: Character['provenance'] },
    before = character,
  ) =>
    characterPersistenceSchema.parse({
      ...before,
      ...result.characterPatch,
      provenance: result.provenanceUpdate,
    })
  return { data, catalogs, character, apply, authority: { classes: data.classes, catalogs } }
}
test.each([
  ['Rogue', 'PHB'],
  ['Rogue', 'XPHB'],
  ['Fighter', 'PHB'],
  ['Fighter', 'XPHB'],
])('actual %s %s fixed source owns proficiency and Expertise without a choice quota', (name, source) => {
  const f = fixture(name, source)
  const original = JSON.stringify(f.character)
  const state = projectOwnedProficiencies(f.character, f.catalogs)
  const names = name === 'Rogue' ? ['nature', 'survival'] : ['persuasion']
  expect(state.effective.proficiencies.skills).toEqual(names)
  expect(state.effective.proficiencies.expertise).toEqual(names)
  expect(state.fixed).toHaveLength(1)
  for (const skill of names)
    for (const domain of ['skills', 'expertise'] as const) {
      const tags = state.effective.provenance.proficiencies[domain]![skill]
      expect(tags).toHaveLength(1)
      expect(tags[0]).toMatchObject({
        sourceType: 'subclass',
        sourceRef: name === 'Rogue' ? 'XGE' : 'SCAG',
        grantType: 'fixed',
        grantVariant: state.fixed[0].id,
      })
      expect(decodeFixedProficiencyId(tags[0].grantVariant!)).toMatchObject({
        owner: [
          name.toLowerCase(),
          source.toLowerCase(),
          f.character.classProgression[0].subclass!.toLowerCase(),
          name === 'Rogue' ? 'xge' : 'scag',
        ],
        level: name === 'Rogue' ? 3 : 7,
      })
    }
  const saved = characterPersistenceSchema.parse(state.effective)
  expect(projectOwnedProficiencies(saved, f.catalogs).effective).toEqual(saved)
  expect(JSON.stringify(f.character)).toBe(original)
  expect(
    getClassProficiencyWorkflow(saved, f.data.classes, f.catalogs).filter(
      (row) => row.domain === 'expertise',
    ),
  ).toHaveLength(name === 'Rogue' ? 1 : 0)
  const lost = projectOwnedProficiencies(saved, { ...f.catalogs, classes: [] }).effective
  expect(lost.proficiencies.expertise).toEqual([])
  expect(lost.proficiencies.skills).toEqual([])
  expect(projectOwnedProficiencies(lost, f.catalogs).effective.proficiencies).toEqual(
    saved.proficiencies,
  )
})
test('command capture preserves genuinely preexisting manual values; source loss never promotes fixed grants', () => {
  const f = fixture()
  const before = {
    ...f.character,
    proficiencies: { ...f.character.proficiencies, skills: ['nature'], expertise: ['nature'] },
  }
  const saved = f.apply(
    projectProficiencyCommandResult(
      before,
      { characterPatch: {}, provenanceUpdate: before.provenance },
      f.catalogs,
    ),
    before,
  )
  const lost = projectOwnedProficiencies(saved, { ...f.catalogs, classes: [] }).effective
  expect(lost.proficiencies.skills).toEqual(['nature'])
  expect(lost.proficiencies.expertise).toEqual(['nature'])
  expect(lost.provenance.proficiencies.skills.nature).toEqual([
    makeSourceTag('manual', 'User Choice', 'choice'),
  ])
  expect(lost.provenance.proficiencies.skills.survival).toBeUndefined()
})
test.each([
  'PHB',
  'XPHB',
])('Royal %s unknown, true/false setup, fallback edits, source recovery and re-earning retain exact history', (source) => {
  const f = fixture('Fighter', source)
  const choice = getEarnedOwnerProficiencyCandidates(
    f.character.classProgression[0],
    false,
    f.catalogs,
  ).find((row) => row.proficiencyDomain === 'skills')!
  expect(choice).toBeDefined()
  const fixed = projectOwnedProficiencies(f.character, f.catalogs).effective
  expect(fixed.classChoiceSelections ?? []).toEqual([])
  expect(() =>
    applyClassChoiceSelectionWithGrantsCommand(
      fixed,
      fixed.provenance,
      choice,
      [getProficiencyOption('skills', 'Insight')],
      f.authority,
    ),
  ).toThrow(/Confirm/)
  const yes = f.apply(
    setHistoricalProficiencySetupCommand(fixed, fixed.provenance, choice, true, f.catalogs),
    fixed,
  )
  expect(yes.classChoiceSelections![0]).toMatchObject({
    proficiencyAtGain: { name: 'persuasion', alreadyProficient: true },
    selected: [],
  })
  const selected = f.apply(
    applyClassChoiceSelectionWithGrantsCommand(
      yes,
      yes.provenance,
      choice,
      [getProficiencyOption('skills', 'Insight')],
      f.authority,
    ),
    yes,
  )
  expect(selected.proficiencies.skills).toEqual(expect.arrayContaining(['persuasion', 'insight']))
  expect(selected.proficiencies.expertise).toEqual(['persuasion'])
  const clear = f.apply(
    retainSavedFeatureOptionsCommand(selected, selected.provenance, choice.id, [], f.authority),
    selected,
  )
  expect(clear.classChoiceSelections![0].selected).toEqual([])
  expect(clear.classChoiceSelections![0].proficiencyAtGain?.alreadyProficient).toBe(true)
  const no = f.apply(
    setHistoricalProficiencySetupCommand(selected, selected.provenance, choice, false, f.catalogs),
    selected,
  )
  expect(no.proficiencies.skills).toEqual(['persuasion'])
  expect(no.classChoiceSelections![0].selected).toEqual([])
  expect(
    getClassProficiencyWorkflow(no, f.data.classes, f.catalogs).find((row) => row.id === choice.id)
      ?.choice?.maximumSelections,
  ).toBe(0)
  expect(
    getClassProficiencySelectionStates(no, f.data.classes, f.catalogs).find(
      (row) => row.selection.choiceId === choice.id,
    )?.recovery,
  ).toBe(false)
  const inactive = projectOwnedProficiencies(selected, { ...f.catalogs, classes: [] }).effective
  expect(inactive.classChoiceSelections).toEqual(selected.classChoiceSelections)
  expect(inactive.proficiencies.skills).toEqual([])
  expect(projectOwnedProficiencies(inactive, f.catalogs).effective.proficiencies).toEqual(
    selected.proficiencies,
  )
  const down = f.apply(
    applyClassProgressionUpdate(
      selected,
      selected.provenance,
      [{ ...selected.classProgression[0], levels: 6 }],
      undefined,
      { classChoiceFeatureCatalogs: f.catalogs },
    ),
    selected,
  )
  expect(down.classChoiceSelections).toEqual([])
  expect(down.proficiencies.skills).toEqual([])
  const up = f.apply(
    applyClassProgressionUpdate(down, down.provenance, selected.classProgression, undefined, {
      classChoiceFeatureCatalogs: f.catalogs,
    }),
    down,
  )
  expect(up.classChoiceSelections).toEqual([])
  expect(up.proficiencies.skills).toEqual(['persuasion'])
})
test('Royal fallback may already be known; explicit correction and source-free clear preserve unrelated owners and setup', () => {
  const f = fixture('Fighter')
  const before = {
    ...f.character,
    proficiencies: { ...f.character.proficiencies, skills: ['insight'] },
    provenance: addGrant(
      f.character.provenance,
      'skills',
      'insight',
      makeSourceTag('background', 'Independent', 'fixed', 'PHB'),
    ),
  }
  const choice = getEarnedOwnerProficiencyCandidates(
    before.classProgression[0],
    false,
    f.catalogs,
  ).find((row) => row.proficiencyDomain === 'skills')!
  const yes = f.apply(
    setHistoricalProficiencySetupCommand(before, before.provenance, choice, true, f.catalogs),
    before,
  )
  const selected = f.apply(
    applyClassChoiceSelectionWithGrantsCommand(
      yes,
      yes.provenance,
      choice,
      [getProficiencyOption('skills', 'Insight')],
      f.authority,
    ),
    yes,
  )
  const clear = f.apply(
    retainSavedFeatureOptionsCommand(selected, selected.provenance, choice.id, []),
    selected,
  )
  expect(clear.classChoiceSelections![0].proficiencyAtGain?.alreadyProficient).toBe(true)
  expect(clear.proficiencies.skills).toContain('insight')
  expect(clear.provenance.proficiencies.skills.insight).toHaveLength(1)
  const removed = f.apply(
    applyClassProgressionUpdate(
      selected,
      selected.provenance,
      [{ ...selected.classProgression[0], subclass: undefined, subclassSource: undefined }],
      undefined,
      { classChoiceFeatureCatalogs: f.catalogs },
    ),
    selected,
  )
  expect(removed.classChoiceSelections).toEqual([])
  expect(removed.proficiencies.skills).toEqual(['insight'])
})
test('Artificer automatically doubles only current concrete proficient tools; no tool grant, quota or item', () => {
  const f = fixture('Artificer', 'TCE')
  const tools = [
    "Alchemist's Supplies",
    'Dice Set',
    'Whistle-Stick',
    "Thieves' Tools",
    'Disguise Kit',
    'Horn',
    'Any Tool',
    'Enchanted Three-Dragon Ante Set',
    'Horn of the Endless Maze',
    'Unknown Tool',
  ]
  const character = { ...f.character, proficiencies: { ...f.character.proficiencies, tools } }
  const projected = projectOwnedProficiencies(character, f.catalogs).effective
  expect(projected.proficiencies.tools).toEqual(tools)
  expect(projected.proficiencies.expertise).toEqual([
    "alchemist's supplies",
    'dice set',
    'whistle-stick',
    "thieves' tools",
    'disguise kit',
    'horn',
  ])
  expect(projected.equipment).toEqual(character.equipment)
  const saved = characterPersistenceSchema.parse(projected)
  const filtered = {
    ...f.catalogs,
    allConcreteTools: f.catalogs.allConcreteTools.filter(
      (row) => row.name !== 'Dice Set' || row.source !== 'PHB',
    ),
  }
  expect(projectOwnedProficiencies(saved, filtered).effective.proficiencies.expertise).toContain(
    'dice set',
  )
  const absent = projectOwnedProficiencies(saved, { ...f.catalogs, allConcreteTools: [] }).effective
  expect(absent.proficiencies.expertise).toEqual([])
  expect(absent.proficiencies.tools).toEqual(tools)
  expect(projectOwnedProficiencies(absent, f.catalogs).effective.proficiencies.expertise).toEqual(
    saved.proficiencies.expertise,
  )
})
test('current mundane tool names outside offline admission remain ordinary and strictly reopen', () => {
  const f = fixture('Artificer', 'TCE')
  const { catalogs } = makeFixedSourceData((document) => {
    document.item.push({ name: 'New Ordinary Tool', source: 'PHB', type: 'T', rarity: 'none' })
  })
  expect(catalogs.allConcreteTools.map((row) => row.name)).toContain('New Ordinary Tool')
  const before = {
    ...f.character,
    proficiencies: { ...f.character.proficiencies, tools: ['New Ordinary Tool', 'Dice Set'] },
  }
  const saved = characterPersistenceSchema.parse(
    projectOwnedProficiencies(before, catalogs).effective,
  )
  expect(saved.proficiencies.tools).toEqual(before.proficiencies.tools)
  expect(saved.proficiencies.expertise).toEqual(['dice set'])
  expect(saved.provenance.proficiencies.expertise!['new ordinary tool']).toBeUndefined()
  for (const allConcreteTools of [[], undefined]) {
    const absent = projectOwnedProficiencies(saved, { ...catalogs, allConcreteTools }).effective
    expect(absent.proficiencies.tools).toEqual(before.proficiencies.tools)
    expect(absent.proficiencies.expertise).toEqual([])
    expect(characterPersistenceSchema.safeParse(absent).success).toBe(true)
    expect(projectOwnedProficiencies(absent, catalogs).effective.proficiencies).toEqual(
      saved.proficiencies,
    )
  }
})
test('ordinary tool choice edits update automatic Expertise in the same command and strict reopen', () => {
  const f = fixture('Artificer', 'TCE')
  const before = {
    ...f.character,
    provenance: {
      ...f.character.provenance,
      choices: [
        {
          id: 'test-tool-choice',
          domain: 'tools' as const,
          sourceTag: makeSourceTag('background', 'Independent', 'choice', 'PHB'),
          chooseCount: 1,
          optionPool: ['Dice Set'],
          selected: [],
          status: 'pending' as const,
        },
      ],
    },
  }
  const picked = f.apply(
    resolveProficiencyChoiceCommand(
      before,
      before.provenance,
      'tools',
      'Dice Set',
      true,
      'test-tool-choice',
      f.catalogs,
    ),
    before,
  )
  expect(picked.proficiencies.expertise).toEqual(['dice set'])
  const cleared = f.apply(
    resolveProficiencyChoiceCommand(
      picked,
      picked.provenance,
      'tools',
      'Dice Set',
      false,
      'test-tool-choice',
      f.catalogs,
    ),
    picked,
  )
  expect(cleared.proficiencies.expertise).toEqual([])
  expect(cleared.proficiencies.tools).toEqual([])
})
test('strict fixed admission rejects malformed namespaces, half pairs, mismatched owners and unrelated domains', () => {
  const f = fixture()
  const saved = characterPersistenceSchema.parse(
    projectOwnedProficiencies(f.character, f.catalogs).effective,
  )
  const id = saved.provenance.proficiencies.skills.nature[0].grantVariant!
  expect(decodeFixedProficiencyId(id)).toBeDefined()
  for (const mode of ['half', 'value', 'owner', 'duplicate', 'namespace', 'unrelated']) {
    const bad = structuredClone(saved)
    const tag = bad.provenance.proficiencies.skills.nature[0]
    if (mode === 'half') delete bad.provenance.proficiencies.expertise!.nature
    if (mode === 'value') bad.proficiencies.expertise = ['survival']
    if (mode === 'owner') tag.sourceRef = 'PHB'
    if (mode === 'duplicate') bad.provenance.proficiencies.skills.nature.push(structuredClone(tag))
    if (mode === 'namespace') tag.grantVariant = 'feature-fixed-proficiencies:garbage'
    if (mode === 'unrelated') bad.provenance.features.nature = [tag]
    expect(characterPersistenceSchema.safeParse(bad).success, mode).toBe(false)
  }
  const relation = decodeFixedProficiencyId(id)!
  expect(
    decodeFixedProficiencyId(
      getFixedProficiencyId({ ...relation, owner: ['rogue', 'phb', 'scout', 'phb'] }),
    ),
  ).toBeUndefined()
})

test('Royal setup strict reopen rejects wrong trigger, branch, owner, slot, duplicate and unrelated setup fields', () => {
  const f = fixture('Fighter')
  const choice = getEarnedOwnerProficiencyCandidates(
    f.character.classProgression[0],
    false,
    f.catalogs,
  ).find((row) => row.proficiencyDomain === 'skills')!
  const saved = f.apply(
    setHistoricalProficiencySetupCommand(
      f.character,
      f.character.provenance,
      choice,
      true,
      f.catalogs,
    ),
  )
  for (const mode of ['trigger', 'branch', 'owner', 'slot', 'duplicate', 'extra', 'wrong family']) {
    const bad = structuredClone(saved)
    const setup = bad.classChoiceSelections![0]
    if (mode === 'trigger') setup.proficiencyAtGain!.name = 'insight'
    if (mode === 'branch') {
      setup.proficiencyAtGain!.alreadyProficient = false
      setup.selected = [{ ...getProficiencyOption('skills', 'Insight'), slotLevel: 7 }]
    }
    if (mode === 'owner') setup.subclassSource = 'PHB'
    if (mode === 'slot') setup.classLevel = 6
    if (mode === 'duplicate') bad.classChoiceSelections!.push(structuredClone(setup))
    if (mode === 'extra') Object.assign(setup.proficiencyAtGain!, { guessed: true })
    if (mode === 'wrong family') {
      setup.choiceId = 'unrelated-choice'
      setup.kind = 'optional-feature'
    }
    expect(characterPersistenceSchema.safeParse(bad).success, mode).toBe(false)
  }
})

test('automatic tool offline relation requires real underlying proficiency and Sources adds no removable fixed owner or quota', () => {
  const f = fixture('Artificer', 'TCE')
  const before = {
    ...f.character,
    proficiencies: { ...f.character.proficiencies, tools: ['Dice Set'] },
  }
  const saved = characterPersistenceSchema.parse(
    projectOwnedProficiencies(before, f.catalogs).effective,
  )
  const model = getSkillExpertiseChoices(saved, { ...f.authority, feats: [] })
  expect(model.remaining).toBe(0)
  expect(model.actions['dice set'] ?? []).toEqual([])
  expect(model.rows).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        category: 'Expertise',
        itemName: 'dice set',
        attribution: 'class',
        isPending: false,
      }),
    ]),
  )
  const lost = getSkillExpertiseChoices(saved, {
    ...f.authority,
    catalogs: { ...f.catalogs, allConcreteTools: [] },
    feats: [],
  })
  expect(lost.rows).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ itemName: 'dice set — retained, inactive', isPending: true }),
    ]),
  )
  const bad = structuredClone(saved)
  bad.proficiencies.tools = []
  expect(characterPersistenceSchema.safeParse(bad).success).toBe(false)
})
