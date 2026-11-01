import { expect, test } from 'vitest'
import { getClassSpellProfilePolicy } from '@/lib/5etools/classCastingRules'
import { applyClassProgressionUpdate } from '@/lib/character/commands/classCommands'
import {
  type ManagedClassSpellRequest,
  retainEarnedManagedClassSpells,
  setManagedClassSpellChoiceCommand,
} from '@/lib/character/commands/managedClassSpellCommands'
import { projectManagedClassSpellState } from '@/lib/character/managedClassSpells'
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

test.each([
  {
    name: 'class removal',
    entry: { name: 'Bard', source: 'PHB', levels: 1 },
    next: [],
    domain: 'class-cantrip',
    gain: 1,
    target: 'Light',
  },
  {
    name: 'unfilled level gain',
    entry: { name: 'Sorcerer', source: 'PHB', levels: 3 },
    next: [{ name: 'Sorcerer', source: 'PHB', levels: 2 }],
    domain: 'class-known',
    gain: 3,
    target: 'Misty Step',
  },
  {
    name: 'subclass replacement',
    entry: {
      name: 'Rogue',
      source: 'PHB',
      levels: 3,
      subclass: 'Arcane Trickster',
      subclassSource: 'PHB',
    },
    next: [{ name: 'Rogue', source: 'PHB', levels: 3, subclass: 'Thief', subclassSource: 'PHB' }],
    domain: 'class-cantrip',
    gain: 3,
    target: 'Dancing Lights',
  },
  {
    name: 'class printing replacement',
    entry: { name: 'Bard', source: 'PHB', levels: 1 },
    next: [{ name: 'Bard', source: 'XPHB', levels: 1 }],
    domain: 'class-cantrip',
    gain: 1,
    target: 'Light',
  },
] as const)('$name invalidates an already-open empty slot even with no saved choices', (plan) => {
  const keeper = { name: 'Fighter', source: 'PHB', levels: 1 }
  const original = makeCharacterFixture({ classProgression: [plan.entry, keeper] })
  const rule = getClassSpellProfilePolicy(plan.entry).rule!
  const request: ManagedClassSpellRequest = {
    slot: [rule.declaration.owner, plan.domain, rule.declaration.target, plan.gain, 0],
    expected: null,
    expectedEmptyRevision: original.managedClassSpellRevision ?? 0,
    target: { name: plan.target, source: 'PHB' },
    policy: 'default',
  }
  const retired = progression(original, [...plan.next, keeper])
  const reopened = characterPersistenceSchema.parse(JSON.parse(JSON.stringify(retired)))
  const restored = progression(reopened, [plan.entry, keeper])
  const before = JSON.stringify(restored)
  expect(() =>
    setManagedClassSpellChoiceCommand(restored, restored.provenance, request, fixture.context),
  ).toThrow('changed')
  expect(JSON.stringify(restored)).toBe(before)
  expect(add(restored, plan.entry, plan.domain, plan.gain, `${plan.target}|PHB`)).toHaveProperty(
    'managedClassSpellChoices.0.target.name',
    plan.target,
  )
})

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
  expect(lower.managedClassSpellChoices).toEqual(
    saved.managedClassSpellChoices?.filter((choice) => choice.target.name !== 'Misty Step'),
  )
  expect(lower.provenance.spells).not.toHaveProperty('misty step')
  expect(lower.provenance.spells.light).toEqual(saved.provenance.spells.light)
  expect(lower.managedClassSpellRevision).toBe(4)
  const raised = progression(lower, [sorcerer, bard])
  const readded = add(raised, sorcerer, 'class-known', 3, 'Misty Step|PHB')
  expect(
    readded.managedClassSpellChoices?.find((choice) => choice.target.name === 'Misty Step')
      ?.revision,
  ).toBe(5)
  const removedOwner = progression(readded, [bard])
  expect(removedOwner.managedClassSpellChoices?.map((choice) => choice.target.name)).toEqual([
    'Light',
  ])
  expect(
    removedOwner.spells.spellProfiles.some((profile) => profile.className === 'Sorcerer'),
  ).toBe(false)
  expect(removedOwner.managedClassSpellRevision).toBe(6)
  expect(progression(removedOwner, []).managedClassSpellRevision).toBe(7)
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
  expect(changed.managedClassSpellRevision).toBe(3)
  const restored = add(
    progression(changed, [rogue, bard]),
    rogue,
    'class-cantrip',
    3,
    'Dancing Lights|PHB',
  )
  expect(
    restored.managedClassSpellChoices?.find((choice) => choice.slot[0][0] === 'subclass')?.revision,
  ).toBe(4)
})

test('retirement rejects stale empty and occupied requests while an independent occupied edit stays scoped', () => {
  const bard = { name: 'Bard', source: 'PHB', levels: 1 }
  const sorcerer = { name: 'Sorcerer', source: 'PHB', levels: 1 }
  const original = add(
    add(
      makeCharacterFixture({ classProgression: [bard, sorcerer] }),
      bard,
      'class-cantrip',
      1,
      'Light|PHB',
    ),
    sorcerer,
    'class-known',
    1,
    'Shield|PHB',
  )
  const bardChoice = original.managedClassSpellChoices![0]
  const independent = original.managedClassSpellChoices![1]
  const empty: ManagedClassSpellRequest = {
    slot: [...bardChoice.slot.slice(0, 4), 1] as ManagedClassSpellRequest['slot'],
    expected: null,
    expectedEmptyRevision: original.managedClassSpellRevision,
    target: { name: 'Message', source: 'PHB' },
    policy: 'default',
  }
  const restored = progression(progression(original, [sorcerer]), [bard, sorcerer])
  expect(restored.managedClassSpellChoices).toEqual([independent])
  for (const request of [empty, { ...empty, slot: bardChoice.slot, expected: bardChoice }])
    expect(() =>
      setManagedClassSpellChoiceCommand(restored, restored.provenance, request, fixture.context),
    ).toThrow('changed')
  const result = setManagedClassSpellChoiceCommand(
    restored,
    restored.provenance,
    {
      slot: independent.slot,
      expected: independent,
      target: { name: 'Magic Missile', source: 'PHB' },
      policy: 'default',
    },
    fixture.context,
  )
  expect(
    characterPersistenceSchema.parse({
      ...restored,
      ...result.characterPatch,
      provenance: result.provenanceUpdate,
    }).managedClassSpellChoices?.[0].target.name,
  ).toBe('Magic Missile')
})

test('stable identities, source suspension and progression without slot loss retain the lifetime', () => {
  const bard = { name: 'Bard', source: 'PHB', levels: 1 }
  const fighter = { name: 'Fighter', source: 'PHB', levels: 2 }
  const original = {
    ...makeCharacterFixture({ classProgression: [bard, fighter] }),
    managedClassSpellRevision: 12,
  }
  for (const next of [
    [bard, fighter],
    [fighter, bard],
    [bard, { ...fighter, levels: 1 }],
    [{ ...bard, levels: 2 }, fighter],
    [{ ...bard, name: ' BARD ', source: ' phb ' }, fighter],
  ])
    expect(retainEarnedManagedClassSpells(original, next).managedClassSpellRevision).toBe(12)
  const selected = add(original, bard, 'class-cantrip', 1, 'Light|PHB')
  const suspended = projectManagedClassSpellState(selected).character
  const restored = projectManagedClassSpellState(suspended, fixture.context).character
  expect(suspended.managedClassSpellChoices).toEqual(selected.managedClassSpellChoices)
  expect(progression(suspended, suspended.classProgression).managedClassSpellRevision).toBe(13)
  expect(restored.managedClassSpellRevision).toBe(13)
})

test.each([
  { owner: 'parent', occupied: false },
  { owner: 'parent', occupied: true },
  { owner: 'subclass', occupied: false },
  { owner: 'subclass', occupied: true },
])('ambiguous $owner ownership retires empty lifetimes and saved choices, occupied=$occupied', (plan) => {
  const entry =
    plan.owner === 'parent'
      ? { name: 'Bard', source: 'PHB', levels: 1 }
      : {
          name: 'Rogue',
          source: 'PHB',
          levels: 3,
          subclass: 'Arcane Trickster',
          subclassSource: 'PHB',
        }
  const keeper = { name: 'Fighter', source: 'PHB', levels: 1 }
  const target = plan.owner === 'parent' ? 'Light' : 'Dancing Lights'
  const gain = plan.owner === 'parent' ? 1 : 3
  let original = makeCharacterFixture({ classProgression: [entry, keeper] })
  if (plan.occupied) original = add(original, entry, 'class-cantrip', gain, `${target}|PHB`)
  const rule = getClassSpellProfilePolicy(entry).rule!
  const request: ManagedClassSpellRequest = {
    slot: [
      rule.declaration.owner,
      'class-cantrip',
      rule.declaration.target,
      gain,
      plan.occupied ? 1 : 0,
    ],
    expected: null,
    expectedEmptyRevision: original.managedClassSpellRevision ?? 0,
    target: { name: 'Message', source: 'PHB' },
    policy: 'default',
  }
  const ambiguous = retainEarnedManagedClassSpells(original, [
    entry,
    { ...entry, name: ` ${entry.name.toUpperCase()} `, source: ' phb ' },
    keeper,
  ])
  expect(ambiguous.managedClassSpellChoices ?? []).toEqual([])
  expect(ambiguous.provenance.spells).toEqual(
    plan.owner === 'subclass' && plan.occupied
      ? { 'mage hand': original.provenance.spells['mage hand'] }
      : {},
  )
  expect(ambiguous.managedClassSpellRevision).toBe((original.managedClassSpellRevision ?? 0) + 1)
  const restored = retainEarnedManagedClassSpells(ambiguous, [entry, keeper])
  expect(() =>
    setManagedClassSpellChoiceCommand(restored, restored.provenance, request, fixture.context),
  ).toThrow('changed')
  expect(
    add(restored, entry, 'class-cantrip', gain, `${target}|PHB`).managedClassSpellChoices?.[0]
      .target.name,
  ).toBe(target)
})

test('a distinct class printing or one true subclass owner does not retire the selected lifetime', () => {
  const bard = { name: 'Bard', source: 'PHB', levels: 1 }
  const rogue = {
    name: 'Rogue',
    source: 'PHB',
    levels: 3,
    subclass: 'Arcane Trickster',
    subclassSource: 'PHB',
  }
  const original = add(
    add(
      makeCharacterFixture({ classProgression: [bard, rogue] }),
      bard,
      'class-cantrip',
      1,
      'Light|PHB',
    ),
    rogue,
    'class-cantrip',
    3,
    'Dancing Lights|PHB',
  )
  const retained = retainEarnedManagedClassSpells(original, [
    bard,
    { ...bard, source: 'XPHB' },
    rogue,
    { ...rogue, subclass: 'Thief' },
  ])
  expect(retained.managedClassSpellChoices).toEqual(original.managedClassSpellChoices)
  expect(retained.provenance).toEqual(original.provenance)
  expect(retained.managedClassSpellRevision).toBe(original.managedClassSpellRevision)
})

test('retirement saturates the revision while removal, Clear and strict reopen remain possible', () => {
  const bard = { name: 'Bard', source: 'PHB', levels: 1 }
  const sorcerer = { name: 'Sorcerer', source: 'PHB', levels: 1 }
  const selected = add(
    makeCharacterFixture({ classProgression: [bard, sorcerer] }),
    bard,
    'class-cantrip',
    1,
    'Light|PHB',
  )
  const original = { ...selected, managedClassSpellRevision: Number.MAX_SAFE_INTEGER - 1 }
  const retired = progression(original, [bard])
  expect(retired.managedClassSpellRevision).toBe(Number.MAX_SAFE_INTEGER)
  expect(retired.managedClassSpellChoices).toEqual(selected.managedClassSpellChoices)
  const old = retired.managedClassSpellChoices![0]
  const clear = setManagedClassSpellChoiceCommand(retired, retired.provenance, {
    slot: old.slot,
    expected: old,
  })
  const cleared = characterPersistenceSchema.parse({
    ...retired,
    ...clear.characterPatch,
    provenance: clear.provenanceUpdate,
  })
  expect(cleared.managedClassSpellChoices).toEqual([])
  const reopened = characterPersistenceSchema.parse(
    JSON.parse(JSON.stringify(progression(cleared, []))),
  )
  const restored = progression(reopened, [bard])
  expect(restored.managedClassSpellRevision).toBe(Number.MAX_SAFE_INTEGER)
  const before = JSON.stringify(restored)
  expect(() => add(restored, bard, 'class-cantrip', 1, 'Light|PHB')).toThrow('revision limit')
  expect(JSON.stringify(restored)).toBe(before)
})
