/**
 * Fallback metadata for source abbreviations that appear in 5etools game data
 * but are absent from books.json / adventures.json.
 *
 * NEVER edit files under data/ to fix missing names — add entries here instead.
 * Keep entries sorted alphabetically by key for easy scanning.
 */
export interface SourceFallback {
  name: string
  group: string
  published?: string
}

export const SOURCE_FALLBACKS: Record<string, SourceFallback> = {
  ALCurseOfStrahd:  { name: 'AL: Curse of Strahd',                            group: 'organized-play', published: '2016-03-01' },
  ALElementalEvil:  { name: 'AL: Elemental Evil',                              group: 'organized-play', published: '2015-03-01' },
  ALRageOfDemons:   { name: 'AL: Rage of Demons',                              group: 'organized-play', published: '2015-09-01' },
  EEPC:             { name: "Elemental Evil Player's Companion",                group: 'supplement',     published: '2015-04-07' },
  EET:              { name: 'Elemental Evil Trinkets',                          group: 'supplement-alt'                         },
  'HAT-LMI':        { name: 'Hunt: A Board Game — Magic Items',                 group: 'supplement-alt'                         },
  MCV2DC:           { name: 'Monstrous Compendium Vol. 2: Dragonlance Creatures', group: 'supplement-alt', published: '2022-12-05' },
  RoTOS:            { name: 'Rise of Tiamat Online Supplement',                group: 'supplement-alt', published: '2014-11-04' },
  TftYP:            { name: 'Tales from the Yawning Portal',                   group: 'supplement',     published: '2017-04-04' },
  ToD:              { name: 'Tyranny of Dragons',                               group: 'supplement',     published: '2014-09-09' },
}
