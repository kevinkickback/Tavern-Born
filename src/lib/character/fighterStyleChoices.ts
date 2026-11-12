import { getNormalizedClassChoiceId } from '@/lib/5etools/classChoiceId'

const pairs = [
  { name: 'Fighter', ownerSource: 'PHB', source: 'PHB' },
  { name: 'Fighter', ownerSource: 'XPHB', source: 'XPHB' },
  { name: 'Warrior', ownerSource: 'WoW', source: 'XPHB' },
].map(({ name, ownerSource, source }) => {
  const fighter = { type: 'class' as const, name, source: ownerSource }
  const champion = {
    ...fighter,
    type: 'subclass' as const,
    subclassName: 'Champion',
    subclassSource: ownerSource,
  }
  const level = source === 'PHB' ? 10 : 7
  return {
    source,
    ...(ownerSource === 'WoW' && {
      retainedAdditionalTarget:
        'subclass-feature|additional fighting style|fighter|xphb|champion|xphb|7|xphb',
    }),
    base: getNormalizedClassChoiceId(fighter, 'Fighting Style', 1),
    additional: getNormalizedClassChoiceId(champion, 'Fighting Style', level),
  }
})

/** Stable identities for the paired style choices, including the configured copy. */
export function getFighterStylePair(choiceId: string) {
  return pairs.find((pair) => pair.base === choiceId || pair.additional === choiceId)
}
