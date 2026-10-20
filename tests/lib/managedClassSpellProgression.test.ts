import { expect, test } from 'vitest'
import { getClassSpellProfilePolicy } from '@/lib/5etools/classCastingRules'
import { applyClassProgressionUpdate } from '@/lib/character/commands/classCommands'
import { setManagedClassSpellChoiceCommand } from '@/lib/character/commands/managedClassSpellCommands'
import type { Character, CharacterClassEntry } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import type { ManagedClassSpellDomain } from '@/types/classCasting'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeManagedClassSpellFixtures } from '../fixtures/managedClassSpellFixtures'

const fixture = makeManagedClassSpellFixtures()
function add(
  character: Character,
  entry: CharacterClassEntry,
  domain: ManagedClassSpellDomain,
  gain: number,
  reference: string,
) {
  const rule = getClassSpellProfilePolicy(entry).rule!
  const [name, source] = reference.split('|')
  const result = setManagedClassSpellChoiceCommand(
    character,
    character.provenance,
    {
      slot: [rule.declaration.owner, domain, rule.declaration.target, gain, 0],
      expected: null,
      expectedEmptyRevision: character.managedClassSpellRevision ?? 0,
      target: { name, source },
      policy: 'default',
    },
    fixture.context,
  )
  return characterPersistenceSchema.parse({
    ...character,
    ...result.characterPatch,
    provenance: result.provenanceUpdate,
  })
}
function progression(character: Character, next: CharacterClassEntry[]) {
  const result = applyClassProgressionUpdate(character, character.provenance, next)
  return characterPersistenceSchema.parse({
    ...character,
    ...result.characterPatch,
    provenance: result.provenanceUpdate,
  })
}

test('actual progression removal retracts only unearned gains and re-add uses a fresh allocator lifetime', () => {
  const sorcerer = { name: 'Sorcerer', source: 'PHB', levels: 3 }
  const bard = { name: 'Bard', source: 'PHB', levels: 1 }
  let saved = makeCharacterFixture({ classProgression: [sorcerer, bard] })
  saved = add(saved, sorcerer, 'class-known', 1, 'Shield|PHB')
  saved = add(saved, sorcerer, 'class-known', 3, 'Misty Step|PHB')
  saved = add(saved, bard, 'class-cantrip', 1, 'Light|PHB')
  const original = JSON.stringify(saved)
  const lower = progression(saved, [{ ...sorcerer, levels: 2 }, bard])
  expect(lower.managedClassSpellChoices?.map((choice) => choice.target.name)).toEqual([
    'Shield',
    'Light',
  ])
  expect(lower.provenance.spells).not.toHaveProperty('misty step')
  expect(lower.provenance.spells.light).toEqual(saved.provenance.spells.light)
  expect(lower.managedClassSpellRevision).toBe(3)
  const raised = progression(lower, [sorcerer, bard])
  const readded = add(raised, sorcerer, 'class-known', 3, 'Misty Step|PHB')
  expect(
    readded.managedClassSpellChoices?.find((choice) => choice.target.name === 'Misty Step')
      ?.revision,
  ).toBe(4)
  const removedOwner = progression(readded, [bard])
  expect(removedOwner.managedClassSpellChoices?.map((choice) => choice.target.name)).toEqual([
    'Light',
  ])
  expect(
    removedOwner.spells.spellProfiles.some((profile) => profile.className === 'Sorcerer'),
  ).toBe(false)
  expect(removedOwner.managedClassSpellRevision).toBe(4)
  expect(progression(removedOwner, []).managedClassSpellRevision).toBe(4)
  expect(JSON.stringify(saved)).toBe(original)
})

test('intentional subclass removal clears its numeric owner while stable progression/source suspension retains intent', () => {
  const rogue = {
    name: 'Rogue',
    source: 'PHB',
    levels: 3,
    subclass: 'Arcane Trickster',
    subclassSource: 'PHB',
  }
  const bard = { name: 'Bard', source: 'PHB', levels: 1 }
  let saved = makeCharacterFixture({ classProgression: [rogue, bard] })
  saved = add(saved, rogue, 'class-cantrip', 3, 'Dancing Lights|PHB')
  saved = add(saved, bard, 'class-cantrip', 1, 'Light|PHB')
  const stable = progression(saved, [rogue, bard])
  expect(stable.managedClassSpellChoices).toEqual(saved.managedClassSpellChoices)
  expect(stable.managedClassSpellRevision).toBe(2)
  const changed = progression(saved, [{ ...rogue, subclass: 'Thief' }, bard])
  expect(changed.managedClassSpellChoices?.map((choice) => choice.target.name)).toEqual(['Light'])
  expect(changed.provenance.spells).not.toHaveProperty('dancing lights')
  expect(changed.managedClassSpellRevision).toBe(2)
  const restored = add(
    progression(changed, [rogue, bard]),
    rogue,
    'class-cantrip',
    3,
    'Dancing Lights|PHB',
  )
  expect(
    restored.managedClassSpellChoices?.find((choice) => choice.slot[0][0] === 'subclass')?.revision,
  ).toBe(3)
})
