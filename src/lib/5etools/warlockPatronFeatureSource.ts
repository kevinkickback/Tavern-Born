import type { NativeSubclassOwner } from './nativeSubclassFeatureSource'

export type NativeWarlockSource = 'phb' | 'xphb'

interface NativeWarlockPatron extends NativeSubclassOwner {
  level: number
  intro: string
  nested: readonly string[]
  direct: ReadonlyArray<{ level: number; target: string }>
}

function patron(
  source: NativeWarlockSource,
  name: string,
  shortName: string,
  nested: readonly string[],
  direct: ReadonlyArray<readonly [string, number]>,
): NativeWarlockPatron {
  const level = source === 'phb' ? 1 : 3
  const target = (feature: string, gain: number) =>
    `subclass-feature|${feature.toLowerCase()}|warlock|${source}|${shortName}|${source}|${gain}|${source}`
  return {
    className: 'Warlock',
    name,
    source,
    shortName,
    level,
    intro: target(name, level),
    nested: nested.map((feature) => target(feature, level)),
    direct: direct.map(([feature, gain]) => ({ level: gain, target: target(feature, gain) })),
  }
}

const fiendGains = [
  ["Dark One's Own Luck", 6],
  ['Fiendish Resilience', 10],
  ['Hurl Through Hell', 14],
] as const

export const NATIVE_WARLOCK_PATRONS = {
  phb: [
    patron('phb', 'The Fiend', 'fiend', ["Dark One's Blessing"], fiendGains),
    patron(
      'phb',
      'The Archfey',
      'archfey',
      ['Fey Presence'],
      [
        ['Misty Escape', 6],
        ['Beguiling Defenses', 10],
        ['Dark Delirium', 14],
      ],
    ),
    patron(
      'phb',
      'The Great Old One',
      'great old one',
      ['Awakened Mind'],
      [
        ['Entropic Ward', 6],
        ['Thought Shield', 10],
        ['Create Thrall', 14],
      ],
    ),
  ],
  xphb: [
    patron('xphb', 'Fiend Patron', 'fiend', ["Dark One's Blessing"], fiendGains),
    patron(
      'xphb',
      'Archfey Patron',
      'archfey',
      ['Archfey Spells', 'Steps of the Fey'],
      [
        ['Misty Escape', 6],
        ['Beguiling Defenses', 10],
        ['Bewitching Magic', 14],
      ],
    ),
    patron(
      'xphb',
      'Celestial Patron',
      'celestial',
      ['Celestial Spells', 'Healing Light'],
      [
        ['Radiant Soul', 6],
        ['Celestial Resilience', 10],
        ['Searing Vengeance', 14],
      ],
    ),
    patron(
      'xphb',
      'Great Old One Patron',
      'great old one',
      ['Great Old One Spells', 'Awakened Mind', 'Psychic Spells'],
      [
        ['Clairvoyant Combatant', 6],
        ['Eldritch Hex', 10],
        ['Thought Shield', 10],
        ['Create Thrall', 14],
      ],
    ),
  ],
}

const featureOwners = new Map(
  Object.values(NATIVE_WARLOCK_PATRONS)
    .flat()
    .flatMap((owner) =>
      [owner.intro, ...owner.nested, ...owner.direct.map(({ target }) => target)].map(
        (target) => [target, owner] as const,
      ),
    ),
)

export function getNativeWarlockPatronFeatureOwner(target: string | undefined) {
  return target ? featureOwners.get(target) : undefined
}
