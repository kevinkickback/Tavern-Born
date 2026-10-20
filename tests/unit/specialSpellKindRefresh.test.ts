import { expect, test } from 'vitest'
import { buildSpellLookup } from '@/lib/5etools/lookups'
import { deriveSpellActions } from '@/lib/calculations/actions'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import type { CharacterCommandResult } from '@/lib/character/commands/commandResult'
import type { FeatOptionTarget } from '@/lib/character/commands/featCommandIdentity'
import {
  commitFeatOptionsCommand,
  editFeatOptionsCommand,
  replaceBonusFeatSelectionsCommand,
  replaceClassFeatSelectionsCommand,
  replaceFeatSelectionsCommand,
} from '@/lib/character/commands/featCommands'
import {
  addSpellToCharacter,
  removeSpellFromCharacter,
  setProfileSpells,
} from '@/lib/character/commands/spellCommands'
import { refreshSpecialSpellKinds } from '@/lib/character/specialSpellState'
import { getSpellRows } from '@/lib/provenance'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeSpellFixture } from '../fixtures/gameDataFixtures'
import { makeNonracialSourceCharacter } from '../fixtures/nonracialSourceCharacter'
import { createCurrentCharacterSheetViewModel } from '../fixtures/pdfTemplates'

const reference = 'Toll the Dead|XPHB'
const profileId = 'special:unrestricted'
const feat = { name: 'Magic Initiate', source: 'XPHB', fixedGrant: true, grantVariant: 'cleric' }
const options = { spells: [reference] }
const special = (character: Character) =>
  character.spells.spellProfiles.find((profile) => profile.id === profileId)!
const apply = (character: Character, result: CharacterCommandResult): Character =>
  characterPersistenceSchema.parse({
    ...character,
    ...result.characterPatch,
    provenance: result.provenanceUpdate,
  })
const metadata = (level: number, source = 'XPHB') =>
  makeSpellFixture({ name: 'Toll the Dead', source, level })

function manual(level = 0): Character {
  let character: Character = characterPersistenceSchema.parse(makeNonracialSourceCharacter())
  if (level > 0)
    character = apply(
      character,
      setProfileSpells(character, character.provenance, profileId, [], [reference]),
    )
  return character
}

test.each([
  0, 1,
])('opposite current kind %s survives offline edits and independent owner removal in either order', (level) => {
  let character = manual(level === 0 ? 1 : 0)
  character = apply(
    character,
    addSpellToCharacter(character, character.provenance, 'Toll the Dead|HB', 'cantrip', profileId),
  )
  const original = structuredClone(character)
  const other = { name: 'Magic Initiate', source: 'PHB', selectionKind: 'bonus' as const }
  character = apply(
    character,
    commitFeatOptionsCommand(character, character.provenance, feat, options, [metadata(level)]),
  )
  character = apply(
    character,
    replaceBonusFeatSelectionsCommand(character, character.provenance, [other]),
  )
  character = apply(
    character,
    commitFeatOptionsCommand(character, character.provenance, other, options, [metadata(level)]),
  )
  character = apply(
    character,
    editFeatOptionsCommand(
      character,
      character.provenance,
      feat,
      { spells: ['Stale|PHB'] },
      options,
      [],
    ),
  )
  expect(special(character).cantrips).toEqual(
    level === 0 ? ['Toll the Dead|HB', reference] : ['Toll the Dead|HB'],
  )
  expect(special(character).spellsKnown).toEqual(level === 1 ? [reference] : [])
  expect(special(character).fixedSpells).toEqual([reference])
  if (level === 0) {
    character = apply(
      character,
      editFeatOptionsCommand(character, character.provenance, feat, options, {}, []),
    )
    expect(special(character).fixedSpells).toEqual([reference])
    character = apply(
      character,
      replaceBonusFeatSelectionsCommand(character, character.provenance, []),
    )
  } else {
    character = apply(
      character,
      replaceBonusFeatSelectionsCommand(character, character.provenance, []),
    )
    expect(special(character).fixedSpells).toEqual([reference])
    character = apply(
      character,
      editFeatOptionsCommand(character, character.provenance, feat, options, {}, []),
    )
  }
  expect(special(character).fixedSpells).toEqual([])
  expect(
    character.provenance.spells['toll the dead'].filter((tag) => tag.grantSource === 'XPHB'),
  ).toEqual([expect.objectContaining({ sourceType: 'manual' })])
  character = apply(
    character,
    removeSpellFromCharacter(character, character.provenance, reference, {
      profileId,
      spellKind: level === 0 ? 'spell' : 'cantrip',
    }),
  )
  expect(special(character).cantrips).toEqual(['Toll the Dead|HB'])
  expect(special(character).spellsKnown).toEqual([])
  expect(
    character.spells.spellProfiles.find((profile) => profile.type === 'class')?.cantrips,
  ).toEqual(['Toll the Dead|XGE'])
  expect(character.provenance.spells['toll the dead'].map((tag) => tag.grantSource)).toEqual([
    'XGE',
    'HB',
  ])
  expect(
    original.spells.spellProfiles.find((profile) => profile.id === profileId)?.cantrips,
  ).toContain('Toll the Dead|HB')
})

test('manual bulk omission/removal retracts its ownership but never the remaining fixed target', () => {
  let character = manual()
  character = apply(
    character,
    removeSpellFromCharacter(character, character.provenance, reference, { profileId }),
  )
  character = apply(
    character,
    commitFeatOptionsCommand(character, character.provenance, feat, options, [metadata(0)]),
  )
  character = apply(
    character,
    setProfileSpells(character, character.provenance, profileId, [], [reference]),
  )
  expect(special(character).cantrips).toEqual([reference])
  expect(special(character).spellsKnown).toEqual([])
  expect(
    character.provenance.spells['toll the dead'].some((tag) => tag.sourceType === 'manual'),
  ).toBe(false)
  character = apply(
    character,
    addSpellToCharacter(character, character.provenance, reference, 'spell', profileId),
  )
  expect(special(character).cantrips).toEqual([reference])
  expect(
    character.provenance.spells['toll the dead'].some((tag) => tag.sourceType === 'manual'),
  ).toBe(true)
  character = apply(
    character,
    setProfileSpells(
      character,
      character.provenance,
      profileId,
      [],
      [],
      buildSpellLookup([metadata(1)]),
    ),
  )
  expect(special(character).spellsKnown).toEqual([reference])
  expect(special(character).cantrips).toEqual([])
  expect(
    character.provenance.spells['toll the dead'].some((tag) => tag.sourceType === 'manual'),
  ).toBe(false)
  character = apply(
    character,
    addSpellToCharacter(character, character.provenance, reference, 'cantrip', profileId),
  )
  character = apply(
    character,
    removeSpellFromCharacter(character, character.provenance, reference, {
      profileId,
      spellKind: 'cantrip',
    }),
  )
  expect(special(character).spellsKnown).toEqual([reference])
  expect(special(character).fixedSpells).toEqual([reference])
  character = apply(
    character,
    editFeatOptionsCommand(character, character.provenance, feat, options, {}, []),
  )
  expect(special(character).cantrips).toEqual([])
  expect(special(character).spellsKnown).toEqual([])
})

test('manual-only kind edits are explicit; contradictory or malformed requests reject atomically', () => {
  const original = manual()
  const changed = apply(
    original,
    setProfileSpells(original, original.provenance, profileId, [], [reference]),
  )
  expect(special(changed).cantrips).toEqual([])
  expect(special(changed).spellsKnown).toEqual([reference])
  expect(changed.provenance).toEqual(original.provenance)
  for (const result of [
    setProfileSpells(changed, changed.provenance, profileId, [reference], [reference]),
    setProfileSpells(changed, changed.provenance, profileId, [], ['Toll the Dead|XPHB|junk']),
    addSpellToCharacter(changed, changed.provenance, 'Toll the Dead|XPHB|junk', 'spell', profileId),
  ]) {
    expect(result.characterPatch).toEqual({})
    expect(result.provenanceUpdate).toBe(changed.provenance)
  }
})

test('exact refresh is immutable/idempotent and field conflicts cannot establish another target', () => {
  const original = manual()
  const before = structuredClone(original)
  for (const lookup of [
    {},
    buildSpellLookup([metadata(1, 'PHB')]),
    { [reference]: metadata(1, 'PHB') },
    { [reference]: { ...metadata(1), name: 'Toll the Dead|different' } },
  ]) {
    expect(refreshSpecialSpellKinds(original, lookup)).toBe(original)
  }
  const exact = buildSpellLookup([{ ...metadata(1), name: ' TOLL THE DEAD ', source: ' xphb ' }])
  const refreshed = refreshSpecialSpellKinds(original, {}, exact)
  expect(special(refreshed).cantrips).toEqual([])
  expect(special(refreshed).spellsKnown).toEqual([reference])
  expect(refreshed.provenance).toBe(original.provenance)
  expect(refreshSpecialSpellKinds(refreshed, exact)).toBe(refreshed)
  expect(refreshSpecialSpellKinds(refreshed, {})).toBe(refreshed)
  expect(original).toEqual(before)
})

test('bare manual values keep their explicit kind and remain distinct from qualified printings', () => {
  let character = manual()
  character = apply(
    character,
    addSpellToCharacter(character, character.provenance, 'Fireball', 'spell', profileId),
  )
  character = apply(
    character,
    setProfileSpells(
      character,
      character.provenance,
      profileId,
      [reference],
      ['Fireball', 'Fireball|PHB'],
    ),
  )
  const lookup = buildSpellLookup([makeSpellFixture({ name: 'Fireball', source: 'PHB', level: 0 })])
  character = characterPersistenceSchema.parse(refreshSpecialSpellKinds(character, lookup))
  expect(special(character).cantrips).toEqual([reference, 'Fireball|PHB'])
  expect(special(character).spellsKnown).toEqual(['Fireball'])
  character = apply(
    character,
    removeSpellFromCharacter(character, character.provenance, 'Fireball|PHB', { profileId }),
  )
  expect(special(character).spellsKnown).toEqual(['Fireball'])
  expect(character.provenance.spells.fireball).toEqual([
    expect.objectContaining({ sourceType: 'manual' }),
  ])
  expect(character.provenance.spells.fireball[0].grantSource).toBeUndefined()
})

test('shared projection, Actions, Sources and PDF agree without mutating the saved character', () => {
  const initial = manual()
  const original = apply(
    initial,
    commitFeatOptionsCommand(initial, initial.provenance, feat, options, [metadata(0)]),
  )
  const before = structuredClone(original)
  const lookup = buildSpellLookup([metadata(1)])
  const calculation = createCharacterCalculationContext(original, { spellsByKey: lookup })
  expect(special(calculation.character).cantrips).toEqual([])
  expect(special(calculation.character).spellsKnown).toEqual([reference])
  expect(deriveSpellActions(original, lookup)).toEqual([
    expect.objectContaining({ id: `spell:${encodeURIComponent(reference)}` }),
  ])
  const vm = createCurrentCharacterSheetViewModel(original, { spellsByKey: lookup })
  expect(vm.spellRows.filter((row) => row.id === 'toll the dead|xphb')).toEqual([
    expect.objectContaining({ level: '1' }),
  ])
  expect(
    getSpellRows(calculation.character.provenance).filter((row) => row.itemSource === 'XPHB'),
  ).toEqual([expect.objectContaining({ sourceTypes: ['manual', 'feat'] })])
  expect(original).toEqual(before)
})

test.each([
  'fixed',
  'ordinary',
  'bonus',
  'class',
] as const)('%s offline retained kind requires every owner and target field', (ownerKind) => {
  let initial = manual()
  const selected = { name: 'Magic Initiate', source: 'XPHB' }
  let targetFeat: FeatOptionTarget = feat
  if (ownerKind === 'ordinary' || ownerKind === 'bonus') {
    const select =
      ownerKind === 'ordinary' ? replaceFeatSelectionsCommand : replaceBonusFeatSelectionsCommand
    initial = apply(initial, select(initial, initial.provenance, [selected]))
    targetFeat = { ...selected, selectionKind: ownerKind }
  } else if (ownerKind === 'class') {
    initial = apply(
      initial,
      replaceClassFeatSelectionsCommand(
        initial,
        initial.provenance,
        {
          className: 'Cleric',
          classSource: 'XPHB',
          progressionName: 'Training|context',
          categories: [],
          slotLevels: [1],
        },
        [selected],
      ),
    )
    targetFeat = { ...selected, classFeatChoiceId: initial.classFeatChoices![0].id }
  }
  const configured = apply(
    initial,
    commitFeatOptionsCommand(initial, initial.provenance, targetFeat, options, [metadata(1)]),
  )
  const before = structuredClone(configured)
  for (const conflict of [
    { sourceType: 'background' as const },
    { sourceName: 'Magic Initiate|other' },
    { sourceRef: 'PHB' },
    { grantType: 'fixed' as const },
    { grantVariant: 'wizard' },
    { grantSource: 'PHB' },
  ]) {
    const ledger = structuredClone(configured.provenance)
    ledger.spells['toll the dead'] = ledger.spells['toll the dead'].map((tag) =>
      tag.sourceType === 'feat' ? { ...tag, ...conflict } : tag,
    )
    const result = editFeatOptionsCommand(
      configured,
      ledger,
      targetFeat,
      options,
      { ...options, skills: ['Arcana'] },
      [],
    )
    expect(result.characterPatch).toEqual({})
    expect(result.provenanceUpdate).toBe(ledger)
  }
  const normalized = structuredClone(configured.provenance)
  normalized.spells['toll the dead'] = normalized.spells['toll the dead'].map((tag) =>
    tag.sourceType === 'feat'
      ? {
          ...tag,
          sourceName: ownerKind === 'fixed' ? ' MAGIC INITIATE; CLERIC ' : ' MAGIC INITIATE ',
          sourceRef: ' xphb ',
          ...(ownerKind === 'fixed' ? { grantVariant: ' FIXED:CLERIC ' } : {}),
        }
      : tag,
  )
  const accepted = editFeatOptionsCommand(
    configured,
    normalized,
    targetFeat,
    options,
    { ...options, skills: ['Arcana'] },
    [],
  )
  expect(accepted.characterPatch.proficiencies?.skills).toContain('arcana')
  const retained = apply(configured, accepted)
  expect(special(retained).spellsKnown).toEqual([reference])
  const unowned = commitFeatOptionsCommand(initial, initial.provenance, targetFeat, options, [])
  expect(unowned.characterPatch).toEqual({})
  expect(unowned.provenanceUpdate).toBe(initial.provenance)
  expect(configured).toEqual(before)
})

test('format10 rejects contradictory special kind and fixed-owner state without converting originals', () => {
  const initial = manual()
  const configured = apply(
    initial,
    commitFeatOptionsCommand(initial, initial.provenance, feat, options, [metadata(0)]),
  )
  for (const mutate of [
    (c: Character) => {
      special(c).spellsKnown.push(reference)
    },
    (c: Character) => {
      special(c).cantrips.push(' TOLL THE DEAD | xphb ')
    },
    (c: Character) => {
      special(c).fixedSpells = []
    },
    (c: Character) => {
      delete c.provenance.spells['toll the dead']
    },
    (c: Character) => {
      special(c).fixedSpells?.push(reference)
    },
    ...['Toll the Dead|XPHB|literal', 'Toll the Dead|XPHB|', 'Toll the Dead|XPHB|OTHER'].map(
      (reference) => (c: Character) => {
        special(c).fixedSpells = [reference]
      },
    ),
  ]) {
    const candidate = structuredClone(configured)
    mutate(candidate)
    const before = structuredClone(candidate)
    expect(characterPersistenceSchema.safeParse(candidate).success).toBe(false)
    expect(candidate).toEqual(before)
  }
  expect(characterPersistenceSchema.safeParse({ ...configured, schemaVersion: 9 }).success).toBe(
    false,
  )
  const alias = structuredClone(configured)
  special(alias).fixedSpells = ['{@spell Toll the Dead|XPHB|Display alias}']
  expect(characterPersistenceSchema.safeParse(alias).success).toBe(true)
  const cleared = apply(
    alias,
    editFeatOptionsCommand(alias, alias.provenance, feat, options, {}, []),
  )
  expect(special(cleared).fixedSpells).toEqual([])
  expect(special(cleared).cantrips).toEqual([reference])
})
