import { readFileSync } from 'node:fs'
import { describe, expect, test, vi } from 'vitest'
import { resolveCopiedRecords } from '@/lib/5etools/copyResolution'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { parseItems } from '@/lib/5etools/parsers/basic'
import { deriveCharacterActions, deriveWeaponActions } from '@/lib/calculations/actions'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { deriveStructuredItemEffects } from '@/lib/calculations/characterEffects'
import { resolveNumericEffect } from '@/lib/calculations/effects'
import { removeManualEquipmentCommand } from '@/lib/character/commands/equipmentCommands'
import {
  clearGameDataCache,
  GAME_DATA_CACHE_SCHEMA_VERSION,
  readGameDataCache,
  writeGameDataCache,
} from '@/lib/storage/dataCache'
import type { Item5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeGameDataFixture } from '../fixtures/gameDataFixtures'
import { characterWithWeapons, venom } from '../fixtures/weaponBonusFixtures'

vi.unmock('@/lib/storage/idb-storage')

import { createIdbStorage } from '@/lib/storage/idb-storage'

const lookup = (...items: Item5e[]) => new Map(items.map((item, index) => [String(index), item]))
function project(character: Character, primary = lookup(venom), raw = primary) {
  const calculation = createCharacterCalculationContext(
    character,
    { itemLookup: primary },
    { itemLookup: raw },
  )
  const context = {
    abilityModifiers: calculation.abilityScores.modifiers,
    proficiencyBonus: 2,
    effects: calculation.effects.declarations,
    effectContext: calculation.effects.resolutionContext,
  }
  return { calculation, actions: deriveWeaponActions(character, context), context }
}
function totals(character: Character, primary = lookup(venom), raw = primary) {
  return project(character, primary, raw).actions.map((action) => [
    action.attackBonus,
    action.damage?.[0].bonus,
  ])
}

describe('fixed intrinsic weapon bonuses', () => {
  test('actual bundled items retain tags through parsing, copy resolution and layered cache persistence', async () => {
    const input = JSON.parse(readFileSync('resources/srd/core/data/items.json', 'utf8'))
    const parsed = resolveCopiedRecords(parseItems(input) as Item5e[], 'item')
    expect(parsed.diagnostics).toEqual([])
    const dagger = parsed.records.find(
      (item) => item.name === 'Dagger of Venom' && item.source === 'DMG',
    )!
    const staff = parsed.records.find(
      (item) => item.name === 'Staff of Power' && item.source === 'DMG',
    )!
    expect(dagger.bonusWeapon).toBe('+1')
    expect(staff.bonusWeapon).toBe('+2')
    const character = characterWithWeapons([dagger, staff])
    character.equipment[1].attuned = true
    const gameData = makeGameDataFixture({ items: [dagger, staff] })
    try {
      await writeGameDataCache(gameData, {
        base: {
          type: 'bundled',
          path: 'srd/core',
          packId: 'core',
          packVersion: '1.0.0',
          isValid: true,
        },
        additional: { type: 'local', path: 'external-rules', isValid: true },
      })
      const restored = (await readGameDataCache())!
      expect(restored.cacheSchemaVersion).toBe(GAME_DATA_CACHE_SCHEMA_VERSION)
      const lookups = buildGameDataLookups(restored.data)
      expect(totals(character, lookups.itemLookup)).toEqual([
        [6, 4],
        [7, 5],
      ])
      expect(totals(character, new Map(), lookups.itemLookup)).toEqual([
        [6, 4],
        [7, 5],
      ])
    } finally {
      await clearGameDataCache()
    }
  })
  test('scopes two command-created instances, quantity and independent manual owners', () => {
    const plain = { ...venom, name: 'Ordinary Dagger', bonusWeapon: undefined }
    const character = characterWithWeapons([venom, venom, plain])
    character.equipment[0].quantity = 20
    character.equipment[0].description = 'Player notes stay separate.'
    const before = JSON.stringify(character)
    expect(totals(character, lookup(venom, plain))).toEqual([
      [6, 4],
      [6, 4],
      [5, 3],
    ])
    const declarations = project(character, lookup(venom, plain)).calculation.effects
      .sourceDeclarations
    expect(
      declarations
        .filter((effect) => effect.target.kind === 'attack-roll')
        .map((effect) => effect.target),
    ).toEqual([
      { kind: 'attack-roll', attackId: 'owned-0' },
      { kind: 'attack-roll', attackId: 'owned-1' },
    ])
    character.manualEffects = [
      {
        id: 'manual:attack',
        label: 'Independent attack',
        source: { kind: 'manual', name: 'Player' },
        target: { kind: 'attack-roll' },
        operation: { kind: 'add', value: 2 },
      },
      {
        id: 'manual:damage',
        label: 'Independent damage',
        source: { kind: 'manual', name: 'Player' },
        target: { kind: 'damage' },
        operation: { kind: 'add', value: 3 },
      },
    ]
    expect(totals(character, lookup(venom, plain))).toEqual([
      [8, 7],
      [8, 7],
      [7, 6],
    ])
    const { calculation } = project(character)
    expect(
      resolveNumericEffect(
        0,
        { kind: 'spell-attack' },
        calculation.effects.declarations,
        calculation.effects.resolutionContext,
      ).value,
    ).toBe(0)
    character.suppressedEffectIds = ['item:owned-0:weapon-attack', 'item:owned-0:weapon-damage']
    expect(totals(character, lookup(venom, plain))).toEqual([
      [7, 6],
      [8, 7],
      [7, 6],
    ])
    delete character.suppressedEffectIds
    character.equipment[0].equipped = false
    expect(totals(character, lookup(venom, plain))).toEqual([
      [8, 7],
      [7, 6],
      [7, 6],
    ])
    const removed = removeManualEquipmentCommand(character, character.provenance!, 'owned-0')
    const remaining = {
      ...character,
      ...removed.characterPatch,
      provenance: removed.provenanceUpdate,
    }
    expect(totals(remaining, lookup(venom, plain))).toEqual([
      [8, 7],
      [7, 6],
    ])
    expect(remaining.provenance!.equipment['dagger of venom']).toHaveLength(1)
    expect(remaining.manualEffects).toEqual(character.manualEffects)
    expect(JSON.parse(before).equipment[0].description).toBe('Player notes stay separate.')
  })

  test('gates a physical legacy staff by equipped AND attuned; no implicit projection in action calls', () => {
    const staff = {
      ...venom,
      name: 'Staff of Power',
      type: undefined,
      reqAttune: true,
      bonusWeapon: '+2',
      bonusAc: '+2',
      bonusSpellAttack: '+2',
    } as unknown as Item5e
    const character = characterWithWeapons([staff])
    expect(totals(character, lookup(staff))).toEqual([[5, 3]])
    character.equipment[0].attuned = true
    expect(totals(character, lookup(staff))).toEqual([[7, 5]])
    const { calculation, context } = project(character, lookup(staff))
    expect(
      resolveNumericEffect(
        10,
        { kind: 'armor-class' },
        calculation.effects.declarations,
        calculation.effects.resolutionContext,
      ).value,
    ).toBe(12)
    expect(deriveWeaponActions(character, { ...context, effects: undefined })[0].attackBonus).toBe(
      5,
    )
    character.equipment[0].equipped = false
    expect(totals(character, lookup(staff))).toEqual([[5, 3]])
    character.equipment[0].equipped = true
    character.equipment[0].attuned = false
    expect(totals(character, lookup(staff))).toEqual([[5, 3]])
    character.equipment[0].attuned = true
    expect(totals(character, lookup(staff))).toEqual([[7, 5]])
  })

  test('retains primary ownership and exact source through missing, raw fallback, replacement and same-map refresh', () => {
    const character = characterWithWeapons()
    const before = JSON.stringify(character)
    const wrong = { ...venom, source: 'XDMG', bonusWeapon: '+3' }
    const raw = lookup(venom, wrong)
    const primary = lookup(venom, wrong)
    expect(totals(character, primary)).toEqual([[6, 4]])
    primary.delete('0')
    expect(totals(character, primary)).toEqual([[5, 3]])
    expect(totals(character, primary, raw)).toEqual([[6, 4]])
    primary.set('0', { ...venom, bonusWeapon: undefined })
    expect(totals(character, primary, raw)).toEqual([[5, 3]])
    primary.set('0', { ...venom, bonusWeapon: 'conditional', bonusWeaponAttack: '+2' })
    expect(totals(character, primary, raw)).toEqual([[5, 3]])
    expect(
      project(character, primary, raw).calculation.effects.sourceDeclarations.some(
        (effect) => effect.operation.kind === 'conditional-note',
      ),
    ).toBe(true)
    primary.set('0', { ...venom, bonusWeapon: '+2' })
    expect(totals(character, primary)).toEqual([[7, 5]])
    primary.get('0')!.bonusWeapon = '+1'
    expect(totals(character, primary)).toEqual([[6, 4]])
    expect(totals(character, lookup(wrong, venom))).toEqual([[6, 4]])
    expect(JSON.stringify(character)).toBe(before)
    const legacy = structuredClone(character)
    legacy.equipment[0].source = undefined
    expect(totals(legacy, lookup(wrong, venom))).toEqual([[6, 4]])
  })

  test.each([
    [{ bonusWeapon: ' +1 ' }, 6, 4],
    [{ bonusWeapon: 0 }, 5, 3],
    [{ bonusWeapon: '-2' }, 3, 1],
    [{ bonusWeaponAttack: '+1' }, 6, 3],
    [{ bonusWeaponDamage: '+2' }, 5, 5],
    [{ bonusWeaponAttack: '+1', bonusWeaponDamage: '+2' }, 6, 5],
  ])('supports only its declared integer channels: %j', (fields, attack, damage) => {
    // Attack-only and unequal-split concrete examples are synthetic contracts, not generated items.
    const data = { ...venom, bonusWeapon: undefined, ...fields }
    expect(totals(characterWithWeapons([data]), lookup(data))).toEqual([[attack, damage]])
  })

  test.each([
    '+1 while raging',
    '',
    '1e2',
    '1.5',
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
    null,
    {},
    true,
  ])('fails closed for malformed metadata %j without dropping unrelated effects', (value) => {
    const data = { ...venom, bonusWeapon: value, bonusWeaponAttack: '+2', bonusAc: '1.5' } as Item5e
    const { calculation, actions } = project(characterWithWeapons(), lookup(data))
    expect([actions[0].attackBonus, actions[0].damage?.[0].bonus]).toEqual([5, 3])
    expect(
      calculation.effects.sourceDeclarations.filter(
        (effect) => effect.operation.kind === 'conditional-note',
      ),
    ).toHaveLength(1)
    expect(
      resolveNumericEffect(
        10,
        { kind: 'armor-class' },
        calculation.effects.declarations,
        calculation.effects.resolutionContext,
      ).value,
    ).toBe(11.5)
  })

  test.each([
    '+1',
    '+2',
  ])('does not invent combined/split precedence even for matching values %s', (split) => {
    const data = { ...venom, bonusWeaponAttack: split }
    expect(totals(characterWithWeapons([data]), lookup(data))).toEqual([[5, 3]])
  })

  test.each([
    'A',
    'AF|XPHB',
    'HA',
    'P|XPHB',
    'SC',
    'GV',
  ])('catalog classification %s cannot be overridden by edited physical inventory', (type) => {
    const data = { ...venom, type }
    expect(deriveStructuredItemEffects(characterWithWeapons().equipment, lookup(data))).toEqual([])
  })
  test('excludes groups, references and nonphysical global grants but retains physical rods/wands', () => {
    for (const data of [
      { ...venom, items: ['Dagger|PHB'] },
      { ...venom, magicVariantReference: { name: '+1 Weapon', source: 'DMG' } },
      { name: 'Bracers of Archery', source: 'DMG', type: 'W', bonusWeaponDamage: '+2' },
      { name: 'Oil of Sharpness', source: 'DMG', type: 'P', bonusWeapon: '+3' },
    ])
      expect(
        deriveStructuredItemEffects(characterWithWeapons([data]).equipment, lookup(data)),
      ).toEqual([])
    for (const type of ['RD|DMG', 'WD|XDMG']) {
      const data = { ...venom, type }
      expect(totals(characterWithWeapons([data]), lookup(data))).toEqual([[6, 4]])
    }
  })

  test.each([
    ['Blood Spear', 'CoS'],
    ['Bloodrage Greataxe', 'BMT'],
    ['Duskcrusher', 'EGW'],
    ['Hammer of Runic Focus', 'BMT'],
    ['Hazirawn', 'HotDQ'],
    ["Niko's Mace", 'UtHftLH'],
    ['True-Ice Shards (Rapier)', 'CoA'],
    ['Dawnbringer', 'OotA'],
    ['Sun Blade', 'DMG'],
    ['Sun Blade', 'XDMG'],
    ['Sunsword', 'CoS'],
    ["Baba Yaga's Pestle", 'TCE'],
  ])('keeps special weapon %s|%s manual with an equipped, unattuned explanation', (name, source) => {
    const data = { ...venom, name, source, reqAttune: true, bonusWeapon: '+3' }
    const character = characterWithWeapons([data])
    for (const attuned of [false, true]) {
      character.equipment[0].attuned = attuned
      const { actions, calculation } = project(character, lookup(data))
      expect([actions[0].attackBonus, actions[0].damage?.[0].bonus]).toEqual([5, 3])
      expect(
        resolveNumericEffect(
          5,
          { kind: 'attack-roll', attackId: 'owned-0' },
          calculation.effects.declarations,
          calculation.effects.resolutionContext,
        ).conditionalNotes,
      ).toHaveLength(1)
    }
    const otherPrinting = { ...data, source: 'HB', reqAttune: false }
    expect(totals(characterWithWeapons([otherPrinting]), lookup(otherPrinting))).toEqual([[8, 6]])
  })

  test.each([
    ['Mace of Smiting', 'DMG'],
    ['Mace of Smiting', 'XDMG'],
    ['Dragontooth Dagger', 'RoT'],
    ['Moonblade', 'DMG'],
  ])('retains the fixed baseline and conditional-increase note for %s|%s', (name, source) => {
    const data = { ...venom, name, source }
    const { actions, calculation } = project(characterWithWeapons([data]), lookup(data))
    expect([actions[0].attackBonus, actions[0].damage?.[0].bonus]).toEqual([6, 4])
    expect(
      calculation.effects.sourceDeclarations.filter(
        (effect) => effect.operation.kind === 'conditional-note',
      ),
    ).toHaveLength(1)
  })

  test('Hammer of Thunderbolts baseline does not infer nested attunement; Niko spell tag never becomes +9 attack', () => {
    const hammer = { ...venom, name: 'Hammer of Thunderbolts', reqAttune: undefined }
    expect(totals(characterWithWeapons([hammer]), lookup(hammer))).toEqual([[6, 4]])
    const niko = {
      ...venom,
      name: "Niko's Mace",
      source: 'UtHftLH',
      bonusWeapon: undefined,
      bonusWeaponAttack: '+9',
    }
    expect(totals(characterWithWeapons([niko]), lookup(niko))).toEqual([[5, 3]])
  })

  test('Needle of Mending requires a separately activated dagger form, even when equipped and attuned', () => {
    // Literal relevant fields of the EGW producer: equip/attune does not establish its form.
    const needle: Item5e = {
      name: 'Needle of Mending',
      source: 'EGW',
      type: 'M',
      weaponCategory: 'simple',
      dmg1: '1d4',
      dmgType: 'P',
      reqAttune: true,
      bonusWeapon: '+1',
    }
    const character = characterWithWeapons([needle])
    expect(totals(character, lookup(needle))).toEqual([[5, 3]])
    character.equipment[0].attuned = true
    const { actions, calculation } = project(character, lookup(needle))
    expect([actions[0].attackBonus, actions[0].damage?.[0].bonus]).toEqual([5, 3])
    expect(calculation.effects.sourceDeclarations).toContainEqual(
      expect.objectContaining({
        operation: { kind: 'conditional-note', note: 'The +1 bonus requires dagger form.' },
      }),
    )
    character.equipment[0].equipped = false
    const inactive = project(character, lookup(needle)).calculation.effects
    expect(
      resolveNumericEffect(
        5,
        { kind: 'attack-roll', attackId: 'owned-0' },
        inactive.declarations,
        inactive.resolutionContext,
      ).conditionalNotes,
    ).toEqual([])
    const other = { ...needle, source: 'HB' }
    const otherCharacter = characterWithWeapons([other])
    otherCharacter.equipment[0].attuned = true
    expect(totals(otherCharacter, lookup(other))).toEqual([[6, 4]])
  })

  test('source-qualified ranged types use Dexterity and preserve manual action precedence', () => {
    const data = { ...venom, name: 'Synthetic Bow', type: 'R|XPHB' }
    const character = characterWithWeapons([data])
    character.abilityScores = { ...character.abilityScores, strength: 12, dexterity: 18 }
    expect(totals(character, lookup(data))).toEqual([[7, 5]])
    const { context, actions } = project(character, lookup(data))
    character.manualActions = [
      { ...actions[0], attackBonus: 42, source: { kind: 'manual', name: 'Player' } },
    ]
    expect(deriveCharacterActions(character, context)[0].attackBonus).toBe(42)
  })

  test('actual IndexedDB save/reopen keeps physical/provenance/manual data and recomputes inverse transitions', async () => {
    const character = characterPersistenceSchema.parse(characterWithWeapons([venom, venom]))
    character.equipment[0].description = 'Owner notes'
    const before = JSON.stringify(character)
    const storage = createIdbStorage<{ character: Character }>()
    const key = 'weapon-bonus-persistence'
    try {
      await storage.setItem(key, { state: { character }, version: 11 })
      const reopened = characterPersistenceSchema.parse(
        (await storage.getItem(key))!.state.character,
      )
      expect(JSON.stringify(reopened)).toBe(before)
      expect(totals(reopened)).toEqual([
        [6, 4],
        [6, 4],
      ])
      expect(JSON.stringify(reopened)).toBe(before)
      const removed = removeManualEquipmentCommand(
        reopened,
        reopened.provenance!,
        reopened.equipment[0].id,
      )
      const next = { ...reopened, ...removed.characterPatch, provenance: removed.provenanceUpdate }
      expect(totals(next)).toEqual([[6, 4]])
      next.equipment[0].equipped = false
      expect(totals(next)).toEqual([[5, 3]])
      next.equipment[0].equipped = true
      expect(totals(next)).toEqual([[6, 4]])
    } finally {
      await storage.removeItem(key)
    }
  })
})
