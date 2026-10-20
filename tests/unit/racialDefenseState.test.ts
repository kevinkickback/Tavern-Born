import { expect, test } from 'vitest'
import { buildFeatLookup, buildRaceLookup } from '@/lib/5etools/lookups'
import { parseRaces } from '@/lib/5etools/parsers/races'
import { buildItemLookup } from '@/lib/5etools/startingEquipment'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { getEffectiveDefensiveTraits } from '@/lib/calculations/defensiveTraits'
import { resolveGrantedTrait } from '@/lib/calculations/effects'
import { mergeRaceWithSubrace } from '@/lib/calculations/raceUtils'
import {
  removeManualEffectCommand,
  setEffectSuppressedCommand,
  upsertManualEffectCommand,
} from '@/lib/character/commands/effectCommands'
import { buildInitialCharacter } from '@/lib/character/commands/originSelectionCommand'
import {
  applyRaceSelectionCommand,
  applySubraceSelectionCommand,
} from '@/lib/character/commands/raceCommands'
import { refreshRacialDefenseState } from '@/lib/character/racialDefenseState'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import type { Race5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { defenseSelection, manualFire } from '../fixtures/racialDefenseCharacter'

const reopen = (character: Character) =>
  characterPersistenceSchema.parse(JSON.parse(JSON.stringify(character)))
const effective = (character: Character, lookups = {}) => {
  const context = createCharacterCalculationContext(character, lookups)
  return getEffectiveDefensiveTraits(
    context.effects.declarations,
    context.effects.resolutionContext,
  )
}
const matrix = [
  { mode: 'absent', fields: {}, expected: [['fire'], ['acid'], ['poisoned']], owner: 'race' },
  {
    mode: 'null',
    fields: { resist: null, immune: null, conditionImmune: null },
    expected: [[], [], []],
    owner: 'subrace',
  },
  {
    mode: 'empty',
    fields: { resist: [], immune: [], conditionImmune: [] },
    expected: [[], [], []],
    owner: 'subrace',
  },
  {
    mode: 'replacement',
    fields: { resist: ['cold'], immune: ['lightning'], conditionImmune: ['charmed'] },
    expected: [['cold'], ['lightning'], ['charmed']],
    owner: 'subrace',
  },
]

test('strictly admitted target casing resolves canonically offline and after equal-rule refresh', () => {
  const { race, child, character } = defenseSelection()
  const state = character.racialDefenses!
  const saved = reopen({
    ...character,
    racialDefenses: {
      ...state,
      resist: { ...state.resist, values: ['Fire'] },
      immune: { ...state.immune, values: ['Acid'] },
      conditionImmune: { ...state.conditionImmune, values: ['Poisoned'] },
    },
  })
  expect(refreshRacialDefenseState(saved, race, child)).toBe(saved)
  for (const lookup of [{}, { racesByKey: buildRaceLookup([race]) }]) {
    const context = createCharacterCalculationContext(saved, lookup)
    for (const target of [
      { kind: 'damage-resistance', damageType: 'fire' },
      { kind: 'damage-immunity', damageType: 'acid' },
      { kind: 'condition-immunity', condition: 'poisoned' },
    ] as const)
      expect(
        resolveGrantedTrait(target, context.effects.declarations, context.effects.resolutionContext)
          .granted,
      ).toBe(true)
  }
})

test.each(
  matrix.flatMap((row) => (['2014', '2024'] as const).map((edition) => ({ ...row, edition }))),
)('$mode ordinary fields follow pinned overwrite semantics through Finish/reopen/effects/PDF ($edition)', ({
  fields,
  expected,
  owner,
  mode,
  edition,
}) => {
  const { race, child, character } = defenseSelection(fields, edition)
  const before = JSON.stringify([race, child])
  const merged = mergeRaceWithSubrace(race, child)
  const saved = reopen(character)
  const lookups = { racesByKey: buildRaceLookup([race]) }
  const context = createCharacterCalculationContext(saved, lookups)
  for (const [index, field] of (['resist', 'immune', 'conditionImmune'] as const).entries()) {
    expect(merged[field]).toEqual(mode === 'null' ? undefined : expected[index])
    expect(saved.racialDefenses![field]).toEqual({ ownerType: owner, values: expected[index] })
  }
  expect(Object.values(effective(saved, lookups))).toEqual(expected)
  expect(Object.values(effective(saved))).toEqual(expected)
  expect(
    context.effects.sourceDeclarations
      .filter((effect) => effect.operation.kind === 'grant')
      .every((effect) => effect.source.name === (owner === 'race' ? race.name : child.name)),
  ).toBe(true)
  expect(createCharacterSheetViewModel(saved, lookups).defensiveTraits).toEqual([
    ...expected[0].map((value) => `${value} resistance`),
    ...expected[1].map((value) => `${value} immunity`),
    ...expected[2].map((value) => `${value} condition immunity`),
  ])
  expect(JSON.stringify([race, child])).toBe(before)
})

test('Goblin PSZ / Ixalan PSX null removes fixed parent fire and psychic; complete versions never restore absent fields', () => {
  // Exact mechanical excerpt of the pinned bundled race/subrace declarations.
  const race = parseRaces({
    race: [
      {
        name: 'Goblin',
        source: 'PSZ',
        resist: ['fire', 'psychic'],
        _versions: [{ name: 'Goblin; Version', source: 'HB', resist: null }],
      },
    ],
    subrace: [
      { name: 'Ixalan', source: 'PSX', raceName: 'Goblin', raceSource: 'PSZ', resist: null },
    ],
  })[0] as Race5e
  for (const child of race.subraces!) {
    const character = buildInitialCharacter(
      { initial: { name: 'Goblin control' }, race, subrace: child },
      new Map(),
      () => [],
    )
    expect(effective(reopen(character)).damageResistances).toEqual([])
    expect(mergeRaceWithSubrace(race, child).resist).toBeUndefined()
    if (child._isVersion) expect(mergeRaceWithSubrace(race, child)).toBe(child)
  }
})

test('refresh is exact, missing context freezes the whole snapshot, restoration and Clear use current rules', () => {
  const { race, child, character } = defenseSelection({ resist: ['cold'] })
  const original = reopen(manualFire(character))
  for (const [parent, selectedChild] of [
    [undefined, child],
    [race, undefined],
    [{ ...race, source: 'OTHER' }, child],
    [race, { ...child, source: 'OTHER' }],
    [race, { ...child, raceSource: 'OTHER' }],
    [race, { ...child, raceName: 'OTHER' }],
  ] as const) {
    expect(refreshRacialDefenseState(original, parent, selectedChild)).toBe(original)
  }
  const corrected = reopen(refreshRacialDefenseState(original, race, { ...child, resist: [] }))
  expect(corrected.racialDefenses?.resist.values).toEqual([])
  expect(effective(corrected).damageResistances).toEqual(['fire'])
  expect(refreshRacialDefenseState(corrected, race, undefined)).toBe(corrected)
  expect(refreshRacialDefenseState(corrected, race, { ...child, resist: [] })).toBe(corrected)
  const clear = applySubraceSelectionCommand(
    corrected,
    corrected.provenance,
    { ...race, subraces: [] },
    undefined,
    () => [],
  )
  const cleared = reopen({
    ...corrected,
    ...clear.characterPatch,
    provenance: clear.provenanceUpdate,
  })
  expect(cleared.racialDefenses?.resist).toEqual({ ownerType: 'race', values: ['fire'] })
  const replacement = applyRaceSelectionCommand(
    cleared,
    cleared.provenance,
    { name: 'New race', source: 'OTHER' },
    undefined,
    0,
    () => [],
  )
  const replaced = reopen({
    ...cleared,
    ...replacement.characterPatch,
    provenance: replacement.provenanceUpdate,
  })
  expect(effective(replaced).damageResistances).toEqual(['fire'])
  expect(replaced.manualEffects).toEqual(original.manualEffects)
})

test('independent manual, feat and item owners survive racial removal and respect source suppression/activation', () => {
  const { race, child, character } = defenseSelection()
  let saved: Character = reopen(manualFire(character))
  const feat = { name: 'Independent feat', source: 'HB', resist: ['fire'] }
  const item = {
    name: 'Independent ring',
    source: 'HB',
    type: 'G',
    reqAttune: true,
    resist: ['fire'],
  }
  const lookups = {
    racesByKey: buildRaceLookup([race]),
    featsByKey: buildFeatLookup([feat]),
    itemLookup: buildItemLookup([item]),
  }
  saved = {
    ...saved,
    feats: [{ id: 'independent-feat', description: '', name: feat.name, source: feat.source }],
    equipment: [{ id: 'ring', ...item, quantity: 1, equipped: true, attuned: true }],
  }
  const declarations = createCharacterCalculationContext(saved, lookups).effects.sourceDeclarations
  const parentDefense = declarations.find(
    (effect) => effect.source.kind === 'race' && effect.target.kind === 'damage-resistance',
  )!
  saved = { ...saved, ...setEffectSuppressedCommand(saved, parentDefense.id, true) }
  expect(effective(saved, lookups).damageResistances).toEqual(['fire'])
  saved = { ...saved, ...removeManualEffectCommand(saved, 'manual-fire'), feats: [] }
  expect(effective(saved, lookups).damageResistances).toEqual(['fire'])
  saved = { ...saved, equipment: saved.equipment.map((entry) => ({ ...entry, attuned: false })) }
  expect(effective(saved, lookups).damageResistances).toEqual([])
  const removed = refreshRacialDefenseState(saved, race, { ...child, resist: [] })
  expect(effective(removed).damageResistances).toEqual([])
  expect(createCharacterSheetViewModel(saved, lookups).defensiveTraits).not.toContain(
    'fire resistance',
  )
})

test('strict current admission rejects ambiguous/foreign state and protected/duplicate manual IDs', () => {
  const { character } = defenseSelection()
  const saved = reopen(manualFire(character))
  const before = JSON.stringify(saved)
  const invalid = [
    { ...saved, schemaVersion: 10 },
    { ...saved, racialDefenses: undefined },
    { ...saved, damageResistances: ['fire'] },
    { ...saved, racialDefenses: { ...saved.racialDefenses, extra: true } },
    {
      ...saved,
      racialDefenses: {
        ...saved.racialDefenses,
        context: {
          parent: { name: saved.race, source: 'OTHER' },
          child: saved.racialDefenses!.context.child,
        },
      },
    },
    {
      ...saved,
      racialDefenses: {
        ...saved.racialDefenses,
        resist: { ownerType: 'race', values: ['fire', 'FIRE'] },
      },
    },
    { ...saved, race: '', raceSource: undefined, subrace: undefined, subraceSource: undefined },
    { ...saved, manualEffects: [...saved.manualEffects!, ...saved.manualEffects!] },
    { ...saved, manualEffects: [{ ...saved.manualEffects![0], id: 'racial-defense:foreign' }] },
  ]
  for (const candidate of invalid)
    expect(characterPersistenceSchema.safeParse(candidate).success).toBe(false)
  expect(() =>
    upsertManualEffectCommand(saved, { ...saved.manualEffects![0], id: ' racial-defense:foreign' }),
  ).toThrow(/reserved/)
  expect(JSON.stringify(saved)).toBe(before)
})
