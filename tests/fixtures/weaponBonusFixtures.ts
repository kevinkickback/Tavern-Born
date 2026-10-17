import { addManualEquipmentBatchCommand } from '@/lib/character/commands/equipmentCommands'
import type { Item5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import { makeCharacterFixture } from './characterFixtures'

// Minimal literal contracts from the audited producers; no template generation is implied.
export const venom: Item5e = {
  name: 'Dagger of Venom',
  source: 'DMG',
  type: 'M',
  weaponCategory: 'simple',
  dmg1: '1d4',
  dmgType: 'P',
  bonusWeapon: '+1',
}

export function characterWithWeapons(items: readonly Item5e[] = [venom]): Character {
  const base = makeCharacterFixture({
    abilityScores: {
      strength: 16,
      dexterity: 12,
      constitution: 10,
      intelligence: 10,
      wisdom: 10,
      charisma: 10,
    },
    proficiencies: { ...makeCharacterFixture().proficiencies, weapons: ['simple', 'martial'] },
  })
  const added = addManualEquipmentBatchCommand(base, base.provenance!, items)
  return {
    ...base,
    ...added.characterPatch,
    provenance: added.provenanceUpdate,
    equipment: added.characterPatch.equipment!.map((item, index) => ({
      ...item,
      id: `owned-${index}`,
      equipped: true,
    })),
  }
}
