import { featureOptionRulesSignature } from '@/lib/5etools/featureTableOptions'
import { getFeatureOwnerKey } from '@/lib/character/classChoiceIdentity'
import type { ClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceOptions'
import { getStormAuraSelectionStates } from '@/lib/character/stormAuraSelections'
import { renderEntriesToText } from '@/lib/entryText'
import type { Class5e } from '@/types/5etools'
import type { CharacterAction } from '@/types/actions'
import type { Character } from '@/types/character'
import { getFeatureActionGroupId } from './featureActionGroups'

/** One source choice governs earned actions; activation/target application remains player-managed. */
export function deriveStormAuraActions(
  character: Character,
  classes: readonly Class5e[],
  catalogs?: ClassChoiceFeatureCatalogs,
): CharacterAction[] {
  return getStormAuraSelectionStates(character, classes, catalogs).flatMap((state) => {
    const environment = state.storm?.environment
    if (!environment) return []
    const owner = getFeatureOwnerKey(
      state.selection.className,
      state.selection.classSource,
      state.selection.subclassName,
      state.selection.subclassSource,
    )
    return (state.storm?.stages ?? []).flatMap((stage) => {
      if (!stage.available || !stage.child || !stage.target) return []
      const kind =
        stage.name === 'Storm Aura'
          ? 'bonus-action'
          : stage.name === 'Storm Soul' && environment !== 'Sea'
            ? 'action'
            : stage.name === 'Raging Storm' && environment !== 'Tundra'
              ? 'reaction'
              : undefined
      if (!kind) return []
      const rules =
        stage.name === 'Storm Aura'
          ? [stage.parent!.entries, stage.child.entries]
          : (stage.child.entries ?? [])
      const identityRules = JSON.parse(featureOptionRulesSignature(rules)!) as unknown[]
      const extra =
        stage.name === 'Storm Aura' && environment === 'Tundra'
          ? state
              .storm!.stages.filter((row) => row.name === 'Raging Storm' && row.available)
              .flatMap((row) => row.entries)
          : []
      return [
        {
          id: getFeatureActionGroupId(owner, stage.target, identityRules),
          name: `${stage.name} — ${environment}`,
          kind,
          description: renderEntriesToText([...stage.entries, ...extra]),
          source: { kind: 'subclass' as const, name: stage.name, source: 'XGE' },
          active: true,
        },
      ]
    })
  })
}
