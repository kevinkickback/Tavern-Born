import { describe, expect, test } from 'vitest'
import { deriveEffectiveAbilityScores } from '@/lib/calculations/characterCalculationContext'
import { applyBackgroundSelectionCommand } from '@/lib/character/commands/backgroundCommands'
import { toggleExpertiseCommand } from '@/lib/character/commands/expertiseCommands'
import { applyCharacterCommandResult } from '@/lib/character/commands/featCommandSupport'
import {
  commitFeatOptionsCommand,
  editFeatOptionsCommand,
} from '@/lib/character/commands/featCommands'
import {
  applyRaceSelectionCommand,
  applySubraceSelectionCommand,
} from '@/lib/character/commands/raceCommands'
import { emptyProvenance } from '@/lib/character/createCharacter'
import { addGrant, makeSourceTag } from '@/lib/provenance'
import type { Background5e, Race5e, Spell5e } from '@/types/5etools'
import type { Character, FeatOptionSelections } from '@/types/character'
import { characterSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

const noChoices = () => []
const parent = { name: 'Parent', source: 'PHB', speed: 30 } as Race5e
const options: FeatOptionSelections = {
  skills: ['Arcana'],
  languages: ['Elvish'],
  tools: ['Flute'],
  abilityScore: 'int',
  expertiseSkill: 'Arcana',
  optionalFeature: 'Training Style',
  spells: ['Spark|PHB', 'Ward|PHB'],
}
const spells = [
  { name: 'Spark', source: 'PHB', level: 0 },
  { name: 'Ward', source: 'PHB', level: 1 },
] as Spell5e[]

function select(child: Race5e, race = parent) {
  const initial = makeCharacterFixture({ race: '', subrace: undefined })
  return applyCharacterCommandResult(
    initial,
    applyRaceSelectionCommand(initial, emptyProvenance(), race, child, 0, noChoices),
  )
}

function configure(
  character: Character,
  source = 'PHB',
  grantVariant?: string,
  selections = options,
) {
  return applyCharacterCommandResult(
    character,
    commitFeatOptionsCommand(
      character,
      character.provenance,
      { name: 'Training', source, grantVariant, fixedGrant: true },
      selections,
      spells,
    ),
  )
}

function replace(character: Character, child?: Race5e, race = parent, previousSubrace?: Race5e) {
  return applyCharacterCommandResult(
    character,
    applySubraceSelectionCommand(character, character.provenance, race, child, noChoices, {
      previousSubrace,
    }),
  )
}

describe('fixed feat setup owner lifecycle', () => {
  test('expired manual expertise cannot revive after proficiency loss, reopen and fixed setup', () => {
    let character = makeCharacterFixture({ race: '', background: '' })
    character = applyCharacterCommandResult(
      character,
      applyRaceSelectionCommand(
        character,
        character.provenance,
        { name: 'Scholar Race', source: 'PHB', skillProficiencies: [{ arcana: true }] } as Race5e,
        undefined,
        0,
        noChoices,
      ),
    )
    character = applyCharacterCommandResult(
      character,
      toggleExpertiseCommand(character, character.provenance, 'Arcana'),
    )
    const grantsFeat = { name: 'Grant', source: 'PHB', feats: [{ 'Training|PHB': true }] } as Race5e
    character = applyCharacterCommandResult(
      character,
      applyRaceSelectionCommand(
        character,
        character.provenance,
        grantsFeat,
        undefined,
        0,
        noChoices,
      ),
    )
    expect(character.proficiencies).toMatchObject({ skills: [], expertise: [] })
    expect(character.provenance.proficiencies.expertise).toEqual({})
    character = characterSchema.parse(JSON.parse(JSON.stringify(character))) as Character
    character = applyCharacterCommandResult(
      character,
      applyBackgroundSelectionCommand(
        character,
        character.provenance,
        { name: 'Scholar', source: 'PHB', skillProficiencies: [{ arcana: true }] } as Background5e,
        [],
        new Map(),
      ),
    )
    expect(character.proficiencies).toMatchObject({ skills: ['arcana'], expertise: [] })
    character = configure(character, 'PHB', undefined, { expertiseSkill: 'Arcana' })
    const removed = applyCharacterCommandResult(
      character,
      applyRaceSelectionCommand(character, character.provenance, parent, undefined, 0, noChoices),
    )
    expect(removed.fixedFeatOptions).toEqual({})
    expect(removed.proficiencies).toMatchObject({ skills: ['arcana'], expertise: [] })
    expect(removed.provenance.proficiencies.expertise).toEqual({})
  })
  test('preserves pre-existing untracked skill, language and tool values', () => {
    const oldChild = { name: 'Old', source: 'PHB', feats: [{ 'Training|PHB': true }] } as Race5e
    const selected = select(oldChild)
    selected.proficiencies = {
      ...selected.proficiencies,
      skills: ['arcana'],
      languages: ['Elvish'],
      tools: ['Flute'],
    }
    const configured = configure(selected, 'PHB', undefined, {
      skills: ['Arcana'],
      languages: ['Elvish'],
      tools: ['Flute'],
    })
    const removed = replace(configured, undefined, parent, oldChild)
    expect(removed.fixedFeatOptions).toEqual({})
    expect(removed.proficiencies).toEqual(selected.proficiencies)
    expect(removed.provenance.proficiencies.skills.arcana).toEqual([
      makeSourceTag('manual', 'User Choice', 'choice'),
    ])
  })

  test('removes a known grant when the previous child metadata is unavailable', () => {
    const oldChild = {
      name: 'Missing',
      source: 'OTHER',
      feats: [{ 'Training|PHB': true }],
    } as Race5e
    const configured = configure(select(oldChild))
    const removed = replace(configured, undefined)
    expect(removed.fixedFeatOptions).toEqual({})
    expect(removed.proficiencies.skills).toEqual([])
    expect(removed.provenance.feats.training).toBeUndefined()
  })

  test('does not guess which qualified options belong to a source-less legacy grant', () => {
    const character = makeCharacterFixture({
      race: parent.name,
      subrace: 'Old',
      fixedFeatOptions: { 'training|phb|': { skills: ['Arcana'] } },
    })
    const legacy = makeSourceTag('subrace', 'Old', 'fixed')
    character.provenance = addGrant(character.provenance, 'feats', 'Training', legacy)
    const removed = replace(character, undefined, parent, { name: 'Old' } as Race5e)
    expect(removed.fixedFeatOptions).toEqual(character.fixedFeatOptions)
    expect(removed.provenance.feats.training).toBeUndefined()
  })

  test('fixed variant casing refresh edits and retracts the same canonical option owner', () => {
    const oldChild = {
      name: 'Old',
      source: 'PHB',
      feats: [{ 'Training; Sage|PHB': true }],
    } as Race5e
    const configured = configure(select(oldChild), 'PHB', 'Sage')
    const edited = applyCharacterCommandResult(
      configured,
      editFeatOptionsCommand(
        configured,
        configured.provenance,
        { name: ' training ', source: ' phb ', grantVariant: 'sage', fixedGrant: true },
        options,
        { skills: ['History'] },
      ),
    )
    expect(edited.proficiencies.skills).toEqual(['history'])
    expect(edited.provenance.abilityBonuses).toEqual([])
    expect(edited.provenance.spells).toEqual({})
    expect(edited.fixedFeatOptions).toEqual({ 'training|phb|sage': { skills: ['History'] } })
    const removed = replace(edited, undefined, parent, oldChild)
    expect(removed.proficiencies.skills).toEqual([])
  })
  test.each([
    false,
    true,
  ])('removes setup atomically on final owner removal, complete version=%s', (version) => {
    const oldChild = {
      name: 'Old',
      source: 'PHB',
      feats: [{ 'Training|PHB': true }],
      _isVersion: version,
    } as Race5e
    const configured = configure(select(oldChild))
    const snapshot = structuredClone(configured)
    const removed = replace(
      configured,
      { name: 'New', source: 'PHB', _isVersion: version } as Race5e,
      parent,
      oldChild,
    )
    expect(removed.provenance.feats.training).toBeUndefined()
    expect(removed.fixedFeatOptions).toEqual({})
    expect(removed.proficiencies).toMatchObject({
      skills: [],
      languages: [],
      tools: [],
      expertise: [],
    })
    expect(removed.provenance.proficiencies.skills.arcana).toBeUndefined()
    expect(removed.provenance.features['training style']).toBeUndefined()
    expect(removed.provenance.abilityBonuses).toEqual([])
    expect(deriveEffectiveAbilityScores(removed).total.intelligence).toBe(10)
    const special = removed.spells.spellProfiles.find((profile) => profile.type === 'special')!
    expect(special.cantrips).toEqual([])
    expect(special.spellsKnown).toEqual([])
    expect(special.fixedSpells).toEqual([])
    expect(removed.provenance.spells).toEqual({})
    expect(configured).toEqual(snapshot)
    const returned = replace(removed, oldChild, parent)
    expect(returned.provenance.feats.training).toHaveLength(1)
    expect(returned.fixedFeatOptions).toEqual({})
    expect(returned.proficiencies.skills).toEqual([])
  })

  test.each([
    false,
    true,
  ])('retains setup when the new child grants the same identity, complete version=%s', (version) => {
    const oldChild = {
      name: 'Old',
      source: 'PHB',
      feats: [{ 'Training|PHB': true }],
      _isVersion: version,
    } as Race5e
    const configured = configure(select(oldChild))
    const nextChild = { ...oldChild, name: 'New' }
    const retained = replace(configured, nextChild, parent, oldChild)
    expect(retained.fixedFeatOptions).toEqual({ 'training|phb|': options })
    expect(retained.proficiencies.skills).toEqual(['arcana'])
    expect(retained.proficiencies.expertise).toEqual(['arcana'])
    expect(retained.provenance.feats.training).toEqual([
      expect.objectContaining({ sourceName: 'New' }),
    ])
    expect(retained.provenance.abilityBonuses).toHaveLength(1)
  })

  test('retains the parent grant while removing only the subrace grant', () => {
    const race = { ...parent, feats: [{ 'Training|PHB': true }] }
    const oldChild = { name: 'Old', source: 'PHB', feats: [{ 'Training|PHB': true }] } as Race5e
    const configured = configure(select(oldChild, race))
    const retained = replace(configured, undefined, race, oldChild)
    expect(retained.fixedFeatOptions).toEqual({ 'training|phb|': options })
    expect(retained.provenance.feats.training).toHaveLength(1)
    expect(retained.provenance.proficiencies.skills.arcana).toHaveLength(1)
    expect(retained.proficiencies.expertise).toEqual(['arcana'])
  })

  test.each([
    'printing',
    'variant',
  ])('retracts only the obsolete %s and retains independent setup', (kind) => {
    const otherRef = kind === 'printing' ? 'Training|OTHER' : 'Training; Other|PHB'
    const race = { ...parent, feats: [{ [otherRef]: true }] }
    const oldChild = { name: 'Old', source: 'PHB', feats: [{ 'Training|PHB': true }] } as Race5e
    let configured = configure(select(oldChild, race))
    configured = configure(
      configured,
      kind === 'printing' ? 'OTHER' : 'PHB',
      kind === 'variant' ? 'Other' : undefined,
    )
    const retained = replace(configured, undefined, race, oldChild)
    const key = kind === 'printing' ? 'training|other|' : 'training|phb|other'
    expect(retained.fixedFeatOptions).toEqual({ [key]: options })
    expect(retained.proficiencies).toMatchObject({
      skills: ['arcana'],
      expertise: ['arcana'],
      languages: ['Elvish'],
      tools: ['Flute'],
    })
    expect(retained.provenance.proficiencies.skills.arcana).toHaveLength(1)
    expect(retained.provenance.abilityBonuses).toHaveLength(1)
    expect(retained.provenance.spells.spark).toHaveLength(1)
    expect(retained.provenance.proficiencies.expertise?.arcana).toHaveLength(1)
  })

  test('preserves manual benefits and other spell profiles after the final fixed owner leaves', () => {
    const oldChild = { name: 'Old', source: 'PHB', feats: [{ 'Training|PHB': true }] } as Race5e
    const character = select(oldChild)
    const manual = makeSourceTag('manual', 'User Choice', 'choice')
    for (const domain of ['skills', 'languages', 'tools', 'expertise'] as const) {
      character.provenance = addGrant(
        character.provenance,
        domain,
        domain === 'languages' ? 'Elvish' : domain === 'tools' ? 'Flute' : 'Arcana',
        manual,
      )
    }
    character.proficiencies = {
      ...character.proficiencies,
      skills: ['arcana'],
      expertise: ['arcana'],
      languages: ['Elvish'],
      tools: ['Flute'],
    }
    character.spells.spellProfiles.push({
      id: 'class:independent',
      type: 'class',
      label: 'Independent',
      cantrips: ['Spark'],
      spellsKnown: ['Ward'],
      preparedSpells: [],
    })
    character.provenance = addGrant(character.provenance, 'spells', 'Spark', manual)
    const configured = configure(character)
    const retained = replace(configured, undefined, parent, oldChild)
    expect(retained.fixedFeatOptions).toEqual({})
    expect(retained.proficiencies).toEqual(character.proficiencies)
    expect(retained.provenance.proficiencies.expertise?.arcana).toEqual([manual])
    const special = retained.spells.spellProfiles.find((profile) => profile.type === 'special')!
    expect(special.cantrips).toEqual(['Spark'])
    expect(special.fixedSpells).toEqual([])
    expect(
      retained.spells.spellProfiles.find((profile) => profile.id === 'class:independent'),
    ).toEqual(character.spells.spellProfiles.find((profile) => profile.id === 'class:independent'))
  })

  test('clears stale setup on whole-race replacement and preserves choices when returning to the same grant', () => {
    const race = { ...parent, feats: [{ 'Training|PHB': true }] }
    const selected = configure(select({ name: 'Child', source: 'PHB' } as Race5e, race))
    const same = applyCharacterCommandResult(
      selected,
      applyRaceSelectionCommand(selected, selected.provenance, race, undefined, 0, noChoices),
    )
    expect(same.fixedFeatOptions).toEqual({ 'training|phb|': options })
    const removed = applyCharacterCommandResult(
      same,
      applyRaceSelectionCommand(
        same,
        same.provenance,
        { name: 'Other', source: 'PHB' } as Race5e,
        undefined,
        0,
        noChoices,
      ),
    )
    expect(removed.fixedFeatOptions).toEqual({})
    expect(removed.proficiencies.skills).toEqual([])
  })

  test('removes obsolete background fixed setup through the same atomic lifecycle', () => {
    const base = makeCharacterFixture({ originSystem: '2024', background: '' })
    const background = {
      name: 'Training Background',
      source: 'XPHB',
      feats: [{ 'Training|PHB': true }],
    } as Background5e
    const selected = applyCharacterCommandResult(
      base,
      applyBackgroundSelectionCommand(base, emptyProvenance(), background, [], new Map()),
    )
    const configured = configure(selected)
    const removed = applyCharacterCommandResult(
      configured,
      applyBackgroundSelectionCommand(
        configured,
        configured.provenance,
        { name: 'Other', source: 'XPHB' } as Background5e,
        [],
        new Map(),
      ),
    )
    expect(removed.fixedFeatOptions).toEqual({})
    expect(removed.proficiencies.skills).toEqual([])
    expect(removed.provenance.proficiencies.skills.arcana).toBeUndefined()
  })

  test('editing expertise does not remove an independently owned proficiency or expertise', () => {
    const oldChild = { name: 'Old', source: 'PHB', feats: [{ 'Training|PHB': true }] } as Race5e
    const selected = select(oldChild)
    selected.proficiencies = {
      ...selected.proficiencies,
      skills: ['arcana'],
      expertise: ['arcana'],
    }
    const configured = configure(selected, 'PHB', undefined, { expertiseSkill: 'Arcana' })
    const edited = applyCharacterCommandResult(
      configured,
      editFeatOptionsCommand(
        configured,
        configured.provenance,
        { name: 'Training', source: 'PHB', fixedGrant: true },
        { expertiseSkill: 'Arcana' },
        { skills: ['History'] },
        spells,
      ),
    )
    expect(edited.proficiencies.skills).toEqual(['arcana', 'history'])
    expect(edited.proficiencies.expertise).toEqual(['arcana'])
    const removed = replace(edited, undefined, parent, oldChild)
    expect(removed.proficiencies.skills).toEqual(['arcana'])
    expect(removed.proficiencies.expertise).toEqual(['arcana'])
  })

  test('normalized fixed identity cleans variant options after save/reopen and preserves old ledgers', () => {
    const oldChild = {
      name: 'Old',
      source: 'PHB',
      feats: [{ 'Training; Sage| PHB ': true }],
    } as Race5e
    const configured = configure(select(oldChild), 'PHB', 'Sage')
    const reopened = characterSchema.parse(JSON.parse(JSON.stringify(configured))) as Character
    expect(reopened.provenance.proficiencies.expertise?.arcana).toHaveLength(1)
    const removed = replace(reopened, undefined, parent, oldChild)
    expect(removed.fixedFeatOptions).toEqual({})
    expect(removed.proficiencies.skills).toEqual([])
    expect(removed.provenance.abilityBonuses).toEqual([])
    const legacy = makeCharacterFixture()
    delete legacy.provenance.proficiencies.expertise
    expect(characterSchema.safeParse(legacy).success).toBe(true)
  })
})
