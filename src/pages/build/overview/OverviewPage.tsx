import { useMemo } from 'react'
import { AdditionalContentBadge } from '@/components/character/AdditionalContentBadge'
import { ManualAdjustments } from '@/components/character/ManualAdjustments'
import { WorkspaceBody, WorkspacePage } from '@/components/workspace'
import { useArmorClass } from '@/hooks/character/useArmorClass'
import { useCharacterActions } from '@/hooks/character/useCharacterActions'
import { useCharacterCalculationContext } from '@/hooks/character/useCharacterCalculationContext'
import { useCharacterReadiness } from '@/hooks/character/useCharacterReadiness'
import { useHitPoints } from '@/hooks/character/useHitPoints'
import {
  characterUsesContentOutsideCatalog,
  createGameDataAvailabilityIndex,
} from '@/lib/character/additionalContentAvailability'
import { getEffectiveSources } from '@/lib/sourceCompatibility'
import { getImplicitSource } from '@/lib/sourcePresets'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import { CharacterOverview } from './CharacterOverview'
import { OverviewAttention } from './OverviewAttention'
import './overview.css'

export function BuildOverviewPage() {
  const character = useCharacterStore((state) => state.activeCharacter)
  const calculation = useCharacterCalculationContext(character)
  const readiness = useCharacterReadiness(character)
  const actions = useCharacterActions(character)
  const { effectiveAC } = useArmorClass()
  const { effectiveMaxHP, hitDicePools } = useHitPoints()
  const gameData = useGameDataStore((state) => state.gameData)
  const usingIncludedSrd = useGameDataStore(
    (state) => !!state.sessionBundledSource || state.dataSourceConfig?.type === 'bundled',
  )
  const availability = useMemo(
    () => gameData && createGameDataAvailabilityIndex(gameData),
    [gameData],
  )
  const hasUnavailableContent = useMemo(
    () =>
      !!character && !!availability && characterUsesContentOutsideCatalog(character, availability),
    [character, availability],
  )

  const sources = useMemo(() => {
    if (!character) return []
    const catalog = gameData?.sources ?? []
    const names = new Map(
      catalog.map((source) => [source.abbreviation.trim().toUpperCase(), source.name]),
    )
    return getEffectiveSources(character.allowedSources ?? [], character.originSystem, catalog).map(
      (id) => ({
        id,
        name:
          usingIncludedSrd && id === getImplicitSource(character.originSystem)
            ? 'Included SRD'
            : (names.get(id) ?? id),
        unavailable: !!gameData && !names.has(id),
      }),
    )
  }, [character, gameData, usingIncludedSrd])

  if (!character || !calculation || !readiness) return null

  return (
    <WorkspacePage>
      <WorkspaceBody className="bg-workspace-pane p-4">
        <div className="@container mx-auto flex w-full max-w-7xl flex-col gap-3">
          {hasUnavailableContent && (
            <aside
              aria-label="Unavailable saved content"
              className="flex shrink-0 flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2"
            >
              <AdditionalContentBadge showLabel />
              <p className="text-sm text-muted-foreground">
                Some choices are unavailable in the current game data. Your choices are still saved.
                Load their original source to use them fully.
              </p>
            </aside>
          )}
          <CharacterOverview
            key={character.id}
            calculation={calculation}
            actions={actions}
            effectiveAC={effectiveAC}
            effectiveMaxHP={effectiveMaxHP}
            hitDicePools={hitDicePools}
            sources={sources}
            manualAdjustments={
              <aside aria-label="Manual Adjustments" className="grid min-w-0 grid-rows-1">
                <ManualAdjustments />
              </aside>
            }
            attention={
              <OverviewAttention
                key={JSON.stringify([
                  character.background.trim(),
                  character.backgroundSource?.trim(),
                ])}
                character={character}
                background={calculation.background}
                readiness={readiness}
              />
            }
          />
        </div>
      </WorkspaceBody>
    </WorkspacePage>
  )
}
