import { getNormalizedClassChoiceId } from '@/lib/5etools/classChoiceId'

const pairs = ['PHB', 'XPHB'].map((source) => {
  const fighter = { type: 'class' as const, name: 'Fighter', source }
  const champion = {
    ...fighter,
    type: 'subclass' as const,
    subclassName: 'Champion',
    subclassSource: source,
  }
  const level = source === 'PHB' ? 10 : 7
  return {
    source,
    base: getNormalizedClassChoiceId(fighter, 'Fighting Style', 1),
    additional: getNormalizedClassChoiceId(champion, 'Fighting Style', level),
  }
})

/** The two bundled Fighter/Champion progressions share their edition's style pool. */
export function getFighterStylePair(choiceId: string) {
  return pairs.find((pair) => pair.base === choiceId || pair.additional === choiceId)
}
