import {
  decodeClassFeatureReference,
  getClassFeatureIdentity,
} from '@/lib/5etools/classFeatureIdentity'
import {
  decodeFavoredEnemyChoiceId,
  getFavoredEnemyChoiceId,
} from '@/lib/5etools/favoredEnemyIdentity'
import type { Class5e } from '@/types/5etools'
import type { Character, CharacterClassChoiceSelection } from '@/types/character'
import type { ClassChoiceDiagnostic, NormalizedCharacterChoice } from '@/types/classRules'
import { getClassChoiceOptionKey } from './classChoiceIdentity'
import {
  type ClassChoiceFeatureCatalogs,
  type ClassChoiceOptionView,
  createClassChoiceCatalogs,
  resolveClassChoiceOptions,
} from './classChoiceOptions'
import { getFavoredEnemyAuthority } from './favoredEnemyAuthority'
import type { FeatureOptionSelectionState } from './featureOptionSelections'

export function scopeFavoredEnemyOptions(
  choice: Pick<NormalizedCharacterChoice, 'id'>,
  options: ClassChoiceOptionView[],
  selections: readonly CharacterClassChoiceSelection[],
) {
  const r = decodeFavoredEnemyChoiceId(choice.id)
  if (!r) return options
  const occupied = new Set(
    selections.flatMap((s) => {
      const other = decodeFavoredEnemyChoiceId(s.choiceId)
      return other &&
        s.choiceId !== choice.id &&
        JSON.stringify(other.owner) === JSON.stringify(r.owner)
        ? s.selected.map(getClassChoiceOptionKey)
        : []
    }),
  )
  return options.map((o) =>
    occupied.has(getClassChoiceOptionKey(o.reference))
      ? {
          ...o,
          availability: 'retained' as const,
          entries: ['Already chosen by another earned Favored Enemy allocation.'],
        }
      : o,
  )
}
export function describeFavoredEnemyLanguage(selection: CharacterClassChoiceSelection) {
  const l = selection.favoredEnemy?.language
  return l?.kind === 'none'
    ? 'No spoken language (campaign-confirmed)'
    : l?.kind === 'spoken'
      ? 'Language: ' + l.name + ' (campaign-confirmed)'
      : 'Language: pending campaign confirmation'
}
export function getFavoredEnemySelectionStates(
  character: Character,
  classes: readonly Class5e[],
  catalogs?: ClassChoiceFeatureCatalogs,
): FeatureOptionSelectionState[] {
  return getFavoredEnemyAuthority(character, classes, catalogs).map(
    ({
      selection,
      relation: r,
      owner,
      classData,
      choice,
      complete,
      languageAvailable,
      recovery,
    }) => {
      const options = choice
        ? scopeFavoredEnemyOptions(
            choice,
            resolveClassChoiceOptions(
              choice,
              createClassChoiceCatalogs(catalogs),
              selection.selected,
              owner!.levels,
            ),
            character.classChoiceSelections ?? [],
          )
        : selection.selected.map((reference) => ({
            reference,
            availability: 'retained' as const,
            entries: [],
          }))
      const language = selection.favoredEnemy?.language
      const suffix =
        language?.kind === 'none'
          ? 'No spoken language (campaign-confirmed)'
          : language?.kind === 'spoken'
            ? `Language: ${language.name} (campaign-confirmed${languageAvailable ? '' : '; unavailable'})`
            : 'Language: pending campaign confirmation'
      const details = selection.selected.map((s) => ({
        name: s.name,
        available: complete,
        entries: [
          ...(complete
            ? (options.find(
                (o) => getClassChoiceOptionKey(o.reference) === getClassChoiceOptionKey(s),
              )?.entries ?? [])
            : []),
          suffix,
          ...(selection.favoredEnemy?.mode === 'humanoid-races' &&
          !selection.favoredEnemy.humanoidsConfirmed
            ? ['Humanoid races pending campaign confirmation.']
            : []),
        ],
      }))
      if (!details.length)
        details.push({ name: 'Enemy selection pending', available: false, entries: [suffix] })
      // A synthetic presentation row is not persisted and cannot confer rules or a language grant.
      return {
        selection,
        owner,
        classData,
        choice,
        options,
        recovery,
        details,
        enemy: { complete, languageAvailable },
        literalGroup: {
          family: JSON.stringify([r.owner, r.pool, r.group]),
          group: r.group,
          gain: r.level,
          title: 'Favored Enemy',
        },
      }
    },
  )
}
export function isFavoredEnemySetupComplete(state: FeatureOptionSelectionState | undefined) {
  return !!state?.enemy?.complete && state.enemy.languageAvailable
}
export function hasFavoredEnemyRecovery(
  d: ClassChoiceDiagnostic,
  states: readonly FeatureOptionSelectionState[],
) {
  const ref = d.requiredChoice?.target
  const target =
    ref?.entityType === 'classFeature' && ref.ref
      ? getClassFeatureIdentity(decodeClassFeatureReference(ref.ref))
      : undefined
  return (
    !!target &&
    states.some(
      (s) =>
        s.enemy &&
        s.recovery &&
        !s.selection.inactive &&
        s.selection.choiceId ===
          getFavoredEnemyChoiceId(
            {
              name: d.className,
              source: d.classSource,
              subclassName: d.subclassName,
              subclassSource: d.subclassSource,
            },
            target,
            d.level ?? 1,
          ),
    )
  )
}
