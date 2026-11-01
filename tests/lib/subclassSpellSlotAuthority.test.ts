import { expect, test } from 'vitest'
import {
  CLASS_CASTING_PRODUCERS,
  getClassCastingLevelAccess,
} from '@/lib/5etools/classCastingSource'
import { getEffectiveSpellcastingClassData } from '@/lib/5etools/classData'
import { buildClassLookup } from '@/lib/5etools/lookups'
import { deriveCharacterActions } from '@/lib/calculations/actions'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import {
  buildSpellcastingClassDetails,
  calculateCharacterSpellSlots,
} from '@/lib/calculations/spellProfiles'
import { scopeClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import { getFeatureOwnerKey } from '@/lib/character/classChoiceIdentity'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import {
  authorManagedClassSpellFixture,
  makeManagedClassSpellFixtures,
} from '../fixtures/managedClassSpellFixtures'

const fixture = makeManagedClassSpellFixtures()
const classMap = new Map(Object.entries(fixture.lookups.classesByKey))
const rogue = {
  name: 'Rogue',
  source: 'PHB',
  subclass: 'Arcane Trickster',
  subclassSource: 'PHB',
  levels: 7,
}

test.each(
  CLASS_CASTING_PRODUCERS.filter((row) => row.declaration.owner[0] === 'subclass'),
)('native and copied own tables supply real access for $declaration.owner', (producer) => {
  const { owner, target, level } = producer.declaration
  const catalogs = scopeClassChoiceFeatureCatalogs(
    fixture.context.catalogs,
    getFeatureOwnerKey(...(owner.slice(1) as [string, string, string, string])),
  )
  const parent = fixture.data.classes.find(
    (row) => row.name.toLowerCase() === owner[1] && row.source.toLowerCase() === owner[2],
  )!
  const child = parent.subclasses!.find(
    (row) => row.name.toLowerCase() === owner[3] && row.source.toLowerCase() === owner[4],
  )!
  const before = JSON.stringify([parent, child])
  for (const [gain, expected] of [
    [6, 1],
    [7, 2],
    [12, 2],
    [13, 3],
    [18, 3],
    [19, 4],
  ]) {
    const access = getClassCastingLevelAccess(catalogs, owner, target, level, gain)
    expect(access?.maxSpellLevel).toBe(expected)
    expect(access?.provider).toBeUndefined()
  }
  const effective = getEffectiveSpellcastingClassData(parent, child)!
  expect([7, 13, 19].map((level) => effective.spellSlotProgression?.[level - 1])).toEqual([
    [4, 2, 0, 0],
    [4, 3, 2, 0],
    [4, 3, 3, 1],
  ])
  expect(JSON.stringify([parent, child])).toBe(before)
})

test('one earned caster uses own slots without a foreign table, including noncaster and unearned Ranger neighbors', () => {
  const classes = fixture.data.classes.filter(
    (row) => ['Rogue', 'Fighter', 'Ranger', 'Warlock'].includes(row.name) && row.source === 'PHB',
  )
  const lookup = new Map(Object.entries(buildClassLookup(classes)))
  for (const extra of [
    [],
    [{ name: 'Fighter', source: 'PHB', levels: 1 }],
    [{ name: 'Ranger', source: 'PHB', levels: 1 }],
    [{ name: 'Warlock', source: 'PHB', levels: 2 }],
  ]) {
    const character = makeCharacterFixture({ classProgression: [rogue, ...extra] })
    const slots = calculateCharacterSpellSlots(character, lookup)
    expect(slots.shared).toEqual({ 1: { max: 4, used: 0 }, 2: { max: 2, used: 0 } })
    expect(slots.pact).toEqual(
      extra[0]?.name === 'Warlock' ? { 1: { max: 2, used: 0, isPactMagic: true } } : {},
    )
  }
  // Ranger2 has earned Spellcasting: a combined pool now needs an available standard provider.
  const multiclass = makeCharacterFixture({
    classProgression: [rogue, { name: 'Ranger', source: 'PHB', levels: 2 }],
  })
  expect(calculateCharacterSpellSlots(multiclass, lookup).shared).toEqual({})
  expect(calculateCharacterSpellSlots(multiclass, classMap).shared).toEqual({
    1: { max: 4, used: 0 },
    2: { max: 2, used: 0 },
  })
  const larger = makeCharacterFixture({
    classProgression: [rogue, { name: 'Wizard', source: 'PHB', levels: 5 }],
  })
  expect(calculateCharacterSpellSlots(larger, classMap).shared[4]?.max).toBe(1)
  expect(
    buildSpellcastingClassDetails(larger, classMap, larger.abilityScores).find(
      (row) => row.className === 'Rogue',
    )?.maxSpellLevel,
  ).toBe(2)
})

test('a legal third-level subclass gain reaches current calculation, Actions and PDF, suspends and exactly restores', () => {
  const entry = { ...rogue, levels: 13 }
  const saved = authorManagedClassSpellFixture(
    makeCharacterFixture({ classProgression: [entry] }),
    fixture,
    [
      {
        owner: entry,
        domain: 'class-known',
        gain: 13,
        targets: [{ name: 'Hypnotic Pattern', source: 'PHB' }],
      },
    ],
  )
  const before = JSON.stringify(saved)
  for (const available of [true, false, true]) {
    const primary = {
      ...fixture.lookups,
      classChoiceFeatureCatalogs: {
        ...fixture.context.catalogs,
        classCastingSources: available ? fixture.context.catalogs.classCastingSources : [],
      },
    }
    const calculation = createCharacterCalculationContext(saved, primary, fixture.lookups)
    expect(calculation.managedClassSpellStatuses[0].active).toBe(available)
    expect(calculation.character.managedClassSpellChoices).toEqual(saved.managedClassSpellChoices)
    expect(calculation.character.managedClassSpellRevision).toBe(saved.managedClassSpellRevision)
    expect(characterPersistenceSchema.safeParse(calculation.character).success).toBe(true)
    const actions = deriveCharacterActions(calculation.character, {
      abilityModifiers: calculation.abilityScores.modifiers,
      proficiencyBonus: 5,
      spellsByKey: fixture.lookups.spellsByKey,
      effectiveSpellProfiles: calculation.character.spells.spellProfiles,
      classChoiceFeatureCatalogs: primary.classChoiceFeatureCatalogs,
    })
    expect(actions.some((row) => row.name === 'Hypnotic Pattern')).toBe(available)
    const pdf = createCharacterSheetViewModel(saved, fixture.lookups, primary)
    expect(pdf.spellRows.some((row) => row.name === 'Hypnotic Pattern')).toBe(available)
    if (available) {
      expect(pdf.spellSlots.shared[3]?.max).toBe(2)
      expect(pdf.spellcastingDetails[0].maxSpellLevel).toBe(3)
    }
  }
  expect(JSON.stringify(saved)).toBe(before)
})

test('changed or missing raw subclass tables reject despite retained proof, and exact restoration recovers', () => {
  const producer = CLASS_CASTING_PRODUCERS.find(
    (row) =>
      JSON.stringify(row.declaration.owner) ===
      JSON.stringify(['subclass', 'rogue', 'phb', 'arcane trickster', 'phb']),
  )!
  const { owner, target, level } = producer.declaration
  for (const malformed of [
    [],
    null,
    [{ rowsSpellProgression: Array.from({ length: 20 }, () => [99]) }],
  ]) {
    const classes = fixture.data.classes.map((row) =>
      row.name === 'Rogue' && row.source === 'PHB'
        ? {
            ...row,
            subclasses: row.subclasses!.map((child) =>
              child.name === 'Arcane Trickster' && child.source === 'PHB'
                ? { ...child, subclassTableGroups: malformed }
                : child,
            ),
          }
        : row,
    )
    const catalogs = scopeClassChoiceFeatureCatalogs(
      { ...fixture.context.catalogs, classes },
      getFeatureOwnerKey('Rogue', 'PHB', 'Arcane Trickster', 'PHB'),
    )
    expect(getClassCastingLevelAccess(catalogs, owner, target, level, 13)).toBeUndefined()
  }
  const restored = scopeClassChoiceFeatureCatalogs(
    fixture.context.catalogs,
    getFeatureOwnerKey('Rogue', 'PHB', 'Arcane Trickster', 'PHB'),
  )
  expect(getClassCastingLevelAccess(restored, owner, target, level, 13)?.maxSpellLevel).toBe(3)
})
