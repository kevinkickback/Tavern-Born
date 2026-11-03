import type { CharacterClassChoiceSelection } from '@/types/character'
import type { NormalizedCharacterChoice } from '@/types/classRules'
import { getNormalizedClassChoiceId } from './classChoiceId'

export const legacyChoiceKey = (value: string | undefined) => value?.trim().toLowerCase() ?? ''
export const KENSEI_POOLS = {
  melee: { label: 'Kensei melee weapon', level: 3, slots: [3], domain: 'weapons' },
  ranged: { label: 'Kensei ranged weapon', level: 3, slots: [3], domain: 'weapons' },
  additional: {
    label: 'Additional Kensei weapons',
    level: 6,
    slots: [6, 11, 17],
    domain: 'weapons',
  },
  tools: { label: 'Way of the Brush', level: 3, slots: [3], domain: 'tools' },
} as const
export type KenseiPool = keyof typeof KENSEI_POOLS
export function legacyChoiceOwner(
  source: string,
  family: 'swords' | 'kensei',
): NormalizedCharacterChoice['owner'] {
  return {
    type: 'subclass',
    name: family === 'swords' ? 'Bard' : 'Monk',
    source,
    subclassName: family === 'swords' ? 'College of Swords' : 'Way of the Kensei',
    subclassSource: 'XGE',
  }
}
type LegacyChoiceRelation = { source: string; owner: NormalizedCharacterChoice['owner'] } & (
  | { family: 'kensei'; pool: KenseiPool }
  | { family: 'swords'; pool: 'style' }
)
const identities = new Map<string, LegacyChoiceRelation>(
  ['PHB', 'XPHB'].flatMap((source) => {
    const rows = (
      Object.entries(KENSEI_POOLS) as [KenseiPool, (typeof KENSEI_POOLS)[KenseiPool]][]
    ).map(([pool, rule]) => {
      const owner = legacyChoiceOwner(source, 'kensei')
      return [
        getNormalizedClassChoiceId(owner, rule.label, rule.level),
        { source, family: 'kensei' as const, pool, owner },
      ] as const
    })
    const owner = legacyChoiceOwner(source, 'swords')
    return [
      ...rows,
      [
        getNormalizedClassChoiceId(owner, 'Fighting Style', 3),
        { source, family: 'swords' as const, pool: 'style' as const, owner },
      ] as const,
    ]
  }),
)
/** Existing normalized IDs, with a finite relation shared by admission and live consumers. */
export const decodeLegacySubclassChoice = (id: string) => identities.get(id)
export const isKenseiChoiceId = (id: string) => decodeLegacySubclassChoice(id)?.family === 'kensei'
export function claimsKenseiChoice(
  row: Pick<
    CharacterClassChoiceSelection,
    'choiceId' | 'className' | 'subclassName' | 'subclassSource'
  >,
) {
  return (
    row.choiceId.includes('|subclass:way-of-the-kensei|') ||
    (legacyChoiceKey(row.className) === 'monk' &&
      legacyChoiceKey(row.subclassName) === 'way of the kensei' &&
      legacyChoiceKey(row.subclassSource) === 'xge')
  )
}
