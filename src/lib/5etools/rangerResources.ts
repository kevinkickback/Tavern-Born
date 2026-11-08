import type { ClassResourceDef } from '@/types/classRules'
import { optionalDeclarationObject as record } from './optionalClassDeclarationStructure'
import type { getCurrentRangerFeatures } from './rangerFeatureSource'

const classPools = ['Tireless', "Nature's Veil"]
const subclassPools = [
  'Dread Ambusher',
  'Detect Portal',
  'Ethereal Step',
  "Hunter's Sense",
  "Magic-User's Nemesis",
  'Fey Reinforcements',
  'Misty Wanderer',
  'Writhing Tide',
  'Swarming Dispersal',
  'Drake Companion',
  "Drake's Breath",
  'Perfected Bond',
  'Fortifying Soul',
  'Chilling Retribution',
  'Frozen Haunt',
  'Ancient Might',
]
const poolLabels = new Map([
  ['Dread Ambusher', 'Dreadful Strike'],
  ['Ancient Might', 'Persistent Wrath'],
  ['Perfected Bond', 'Reflexive Resistance'],
])

function clauses(entries: readonly unknown[]): string[] {
  return entries.flatMap((entry) => {
    if (typeof entry === 'string')
      return [entry.replace(/\{@variantrule (Short Rest|Long Rest)\|XPHB\}/g, '$1').toLowerCase()]
    const section = record(entry)
    if (section.type === 'list' && Array.isArray(section.items)) return clauses(section.items)
    return (section.type === 'entries' || section.type === 'item') && Array.isArray(section.entries)
      ? clauses(section.entries)
      : []
  })
}

function readPool(
  entries: readonly unknown[],
  wisdom: number,
  proficiency: number,
): { max: number; rest: string; slot?: string }[] {
  return clauses(entries).flatMap((line) => {
    const ability =
      /a number of times equal to your wisdom modifier \(minimum of (once|twice)\)[.,](?: and you regain| you regain) all expended uses(?: of it)? when you finish a (long|short or long) rest\./.exec(
        line,
      )
    if (ability)
      return [
        {
          max: Math.max(wisdom, ability[1] === 'twice' ? 2 : 1),
          rest: ability[2],
        },
      ]
    const byProficiency =
      /you can use this (?:feature|reaction) a number of times equal to your proficiency bonus, and you regain all expended uses when you finish a (long|short or long) rest\./.exec(
        line,
      )
    if (byProficiency) return [{ max: proficiency, rest: byProficiency[1] }]
    const freeCast =
      /you can also cast it (once|twice|three times) without a spell slot, and you regain the ability to (?:do so|cast it in this way) when you finish a (long|short or long) rest\./.exec(
        line,
      )
    if (freeCast)
      return [{ max: ['once', 'twice', 'three times'].indexOf(freeCast[1]) + 1, rest: freeCast[2] }]
    const single =
      /once you (?:use this feature|summon the drake), you can't (?:use it|do so) again until you finish a (long|short or long) rest(?:\.|,? unless you expend (?:a spell slot of (\d+)(?:st|nd|rd|th) level or higher|a level (\d+)\+ spell slot))/.exec(
        line,
      )
    if (!single) return []
    const restored =
      /you can also expend a level (\d+)\+ spell slot \(no action required\) to restore your use of this feature\./.exec(
        line,
      )
    return [{ max: 1, rest: single[1], slot: single[2] ?? single[3] ?? restored?.[1] }]
  })
}

export function getRangerJourneyResources(
  rules: ReturnType<typeof getCurrentRangerFeatures>,
  wisdom: number,
  proficiency: number,
): ClassResourceDef[] {
  if (!rules) return []
  const features = [
    ...(rules.source === 'xphb' ? classPools.map(rules.base) : []),
    ...subclassPools.map((name) => rules.specialization?.earned(name)),
  ]
  return features.flatMap((feature) => {
    if (!feature) return []
    const pools = readPool(feature.entries, wisdom, proficiency)
    if (pools.length !== 1) return []
    const [{ max, rest, slot }] = pools
    return [
      {
        id: `resource:${feature.target}`,
        label: poolLabels.get(feature.name) ?? feature.name,
        maxPerLevel: Array.from({ length: 20 }, (_, index) =>
          index + 1 >= feature.level ? max : 0,
        ),
        restType: rest === 'short or long' ? 'short' : 'long',
        ...(slot && {
          usageText: `The feature also allows a level ${slot}+ spell slot. See the earned rule for timing.`,
        }),
      },
    ]
  })
}
