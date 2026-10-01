import type { Creature5e, GameData, ItemMastery5e } from '@/types/5etools'

/** Fresh catalogs keep loader writes isolated from unloaded hook views. */
export function createEmptyGameData(): GameData & {
  creatures: Creature5e[]
  itemMasteries: ItemMastery5e[]
} {
  return {
    races: [],
    classes: [],
    backgrounds: [],
    organizations: [],
    spells: [],
    feats: [],
    items: [],
    itemsBase: [],
    itemProperties: [],
    itemTypes: [],
    itemMasteries: [],
    classFeatures: [],
    creatures: [],
    actions: [],
    conditions: [],
    deities: [],
    skills: [],
    senses: [],
    languages: [],
    optionalfeatures: [],
    variantrules: [],
    trapHazards: [],
    rewards: [],
    cultsBoons: [],
    sources: [],
  }
}
