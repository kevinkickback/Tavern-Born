import { describe, expect, test } from 'vitest'
import { getNormalizedClassChoiceId } from '@/lib/5etools/classChoiceId'
import { KENSEI_POOLS, legacyChoiceOwner } from '@/lib/5etools/legacySubclassChoiceIdentity'
import { createEmptyCharacter } from '@/lib/character/createCharacter'
import { addGrant, makeSourceTag } from '@/lib/provenance'
import { isClassProficiencyTag } from '@/lib/schema/classProficiencyValidation'
import type { CharacterClassChoiceSelection } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'

function actor() {
  const character = createEmptyCharacter({
    name: 'Kensei relation',
    originSystem: '2024',
    classProgression: [
      {
        name: 'Monk',
        source: 'XPHB',
        levels: 17,
        subclass: 'Way of the Kensei',
        subclassSource: 'XGE',
      },
    ],
  })
  const owner = legacyChoiceOwner('XPHB', 'kensei'),
    pool = KENSEI_POOLS.melee
  const selection: CharacterClassChoiceSelection = {
    choiceId: getNormalizedClassChoiceId(owner, pool.label, pool.level),
    label: pool.label,
    kind: 'item',
    className: 'Monk',
    classSource: 'XPHB',
    subclassName: owner.subclassName,
    subclassSource: owner.subclassSource,
    classLevel: 3,
    selected: [{ entityType: 'item', name: 'Longsword', source: 'PHB', slotLevel: 3 }],
  }
  character.classChoiceSelections = [selection]
  character.proficiencies.weapons = ['longsword']
  character.provenance = addGrant(character.provenance, 'weapons', 'longsword', {
    ...makeSourceTag('subclass', owner.subclassName!, 'choice', 'XGE'),
    grantVariant: selection.choiceId,
    grantSource: 'PHB',
  })
  return character
}
describe('finite Kensei saved relations without a loaded source catalog', () => {
  test('valid retained intent and matching managed provenance reopen without requiring rules', () => {
    expect(characterPersistenceSchema.safeParse(actor()).success).toBe(true)
  })
  test.each([
    'id',
    'owner',
    'subclass',
    'gain',
    'slot',
    'kind',
    'target-kind',
    'target-source',
    'target-ref',
    'future-slot',
    'duplicate',
  ])('rejects conflicting %s independently', (field) => {
    const a = actor(),
      row = a.classChoiceSelections![0],
      option = row.selected[0]
    if (field === 'id') row.choiceId += '-other'
    if (field === 'owner') row.classSource = 'PHB'
    if (field === 'subclass') row.subclassSource = 'TCE'
    if (field === 'gain') row.classLevel = 6
    if (field === 'slot') option.slotLevel = 6
    if (field === 'kind') row.kind = 'optional-feature'
    if (field === 'target-kind') option.entityType = 'feat'
    if (field === 'target-source') option.source = 'XPHB'
    if (field === 'target-ref') option.ref = 'Longsword|PHB'
    if (field === 'future-slot') a.classProgression[0].levels = 2
    if (field === 'duplicate') a.classChoiceSelections!.push(structuredClone(row))
    expect(characterPersistenceSchema.safeParse(a).success).toBe(false)
  })
  test.each([
    'domain',
    'name',
    'source',
    'owner',
    'variant',
    'missing-variant',
    'kind',
    'missing-intent',
  ])('rejects forged proficiency %s', (field) => {
    const a = actor(),
      tags = a.provenance.proficiencies.weapons.longsword,
      tag = tags[0]
    if (field === 'domain') {
      a.provenance.proficiencies.tools.longsword = tags
      delete a.provenance.proficiencies.weapons.longsword
    }
    if (field === 'name') {
      a.provenance.proficiencies.weapons.rapier = tags
      delete a.provenance.proficiencies.weapons.longsword
    }
    if (field === 'source') tag.grantSource = 'XPHB'
    if (field === 'owner') tag.sourceName = 'Other subclass'
    if (field === 'variant') tag.grantVariant += '-other'
    if (field === 'missing-variant') delete tag.grantVariant
    if (field === 'kind') tag.grantType = 'fixed'
    if (field === 'missing-intent') a.classChoiceSelections = []
    expect(characterPersistenceSchema.safeParse(a).success).toBe(false)
    if (field !== 'kind') expect(isClassProficiencyTag(tag)).toBe(true)
  })
  test('cross-pool duplicate types and duplicate gained slots are invalid', () => {
    const a = actor(),
      extra = structuredClone(a.classChoiceSelections![0]),
      p = KENSEI_POOLS.additional
    extra.choiceId = getNormalizedClassChoiceId(
      legacyChoiceOwner('XPHB', 'kensei'),
      p.label,
      p.level,
    )
    extra.classLevel = 6
    extra.label = p.label
    extra.selected[0].slotLevel = 6
    a.classChoiceSelections!.push(extra)
    expect(characterPersistenceSchema.safeParse(a).success).toBe(false)
    extra.selected = [
      { entityType: 'item', name: 'Whip', source: 'PHB', slotLevel: 6 },
      { entityType: 'item', name: 'Dart', source: 'PHB', slotLevel: 6 },
    ]
    expect(characterPersistenceSchema.safeParse(a).success).toBe(false)
    extra.selected[1].slotLevel = 11
    expect(characterPersistenceSchema.safeParse(a).success).toBe(true)
  })
})
