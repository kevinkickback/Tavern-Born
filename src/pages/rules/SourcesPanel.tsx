import { BookOpen, Books, Database, Warning } from '@phosphor-icons/react'
import { useEffect, useId, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { AnchoredHint, WorkspacePaneHeader } from '@/components/workspace'
import { useAnchoredHintPosition } from '@/hooks/ui/useAnchoredHintPosition'
import { useRouteFocusTarget } from '@/hooks/ui/useRouteFocusTarget'
import { isSourceReadinessFocus } from '@/lib/navigation/readinessFocus'
import {
  getSourceCompatibility,
  normalizeAllowedSources,
  normalizeSelectableAllowedSources,
  getEffectiveSources as resolveEffectiveSources,
} from '@/lib/sourceCompatibility'
import {
  countRemovedSpells,
  detectSourceConflicts,
  pruneSpellsForDisabledSources,
} from '@/lib/sourceConflicts'
import {
  getImplicitSource,
  IMPLICIT_SOURCES,
  SOURCE_PRESETS,
  type SourcePreset,
} from '@/lib/sourcePresets'
import { isHintDismissed, setHintDismissed } from '@/lib/storage/hints'
import { cn } from '@/lib/utils'
import { NoCharCard } from '@/pages/_shared'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'

const groupLabels: Record<string, string> = {
  core: 'Core Rulebooks',
  supplement: 'Supplements',
  setting: 'Setting Books',
  adventure: 'Adventure Books',
  playtest: 'Playtest & Unofficial',
  other: 'Other Sources',
}

const groupOrder = ['core', 'supplement', 'setting', 'adventure', 'playtest', 'other']

const HINT_ID = 'sources-implicit-rulebook'
const HINT_WIDTH = 300
const ALLOWED_SOURCES_HEADER_SELECTOR = '[data-allowed-sources-header]'

export function SourcesPanel({ readinessFocus }: { readinessFocus?: string | null } = {}) {
  const preferNewerId = useId()
  const character = useCharacterStore((s) => s.activeCharacter)
  const updateCharacter = useCharacterStore((s) => s.updateCharacter)
  const gameData = useGameDataStore((s) => s.gameData)
  const isBundledSrd = useGameDataStore((s) => s.dataSourceConfig?.type === 'bundled')
  const { ref: sourceControlsRef, highlighted: sourceControlsHighlighted } =
    useRouteFocusTarget<HTMLDivElement>(isSourceReadinessFocus(readinessFocus))

  const [showHint, setShowHint] = useState(() => !isHintDismissed(HINT_ID))
  const hintPosition = useAnchoredHintPosition({
    enabled: showHint && !isBundledSrd,
    selector: ALLOWED_SOURCES_HEADER_SELECTOR,
    gap: 10,
  })

  const allSources = gameData?.sources ?? []
  const sources = useMemo(
    () => allSources.filter((s) => s.hasCharacterOptions !== false),
    [allSources],
  )
  const configuredSources = character?.allowedSources ?? []
  const allowedSources = useMemo(
    () =>
      character
        ? normalizeSelectableAllowedSources(configuredSources, character.originSystem, allSources)
        : configuredSources,
    [allSources, character, configuredSources],
  )
  const availableSourceSet = new Set(sources.map((s) => s.abbreviation))

  const effectiveSources = useMemo(() => {
    if (!character) return allowedSources
    return resolveEffectiveSources(allowedSources, character.originSystem, sources)
  }, [allowedSources, character, sources])

  useEffect(() => {
    if (!character) return
    if (
      configuredSources.length === allowedSources.length &&
      configuredSources.every((source, index) => source === allowedSources[index])
    ) {
      return
    }
    updateCharacter(character.id, { allowedSources })
  }, [allowedSources, character, configuredSources, updateCharacter])

  const sourcesByGroup = useMemo(
    () =>
      sources.reduce<Record<string, typeof sources>>((acc, source) => {
        if (!acc[source.group]) acc[source.group] = []
        acc[source.group].push(source)
        return acc
      }, {}),
    [sources],
  )

  const sourceNameMap = useMemo(
    () => new Map(sources.map((s) => [s.abbreviation, s.name])),
    [sources],
  )

  const conflicts = useMemo(
    () => (character ? detectSourceConflicts(character, effectiveSources) : []),
    [character, effectiveSources],
  )

  const presetSourceAbbreviations = new Set(SOURCE_PRESETS.flatMap((p) => p.abbreviations))
  const hasNonPresetSourcesSelected = allowedSources.some((a) => !presetSourceAbbreviations.has(a))

  const isPresetActive = (preset: SourcePreset) => {
    const filtered = normalizeSelectableAllowedSources(
      preset.abbreviations.filter((a) => availableSourceSet.has(a)),
      character?.originSystem ?? '2014',
      sources,
    )
    return (
      filtered.length === allowedSources.length && filtered.every((a) => allowedSources.includes(a))
    )
  }

  const preferNewerPrintings =
    character?.originSystem === '2024' || (character?.variantRules?.preferNewerPrintings ?? false)

  if (!character) {
    return <NoCharCard icon={<Books weight="duotone" />} noun="manage additional content" />
  }

  const implicitSource = getImplicitSource(character.originSystem)
  const implicitSourceName = sourceNameMap.get(implicitSource) ?? implicitSource
  const printingNotice =
    character.originSystem === '2024'
      ? preferNewerPrintings
        ? 'Revised replacements are always used. Compatible older options remain available when no revised version exists.'
        : ''
      : preferNewerPrintings
        ? 'Older printings are hidden where a newer version exists in the selected sources.'
        : 'Some selected books contain multiple printings of the same option. Prefer Newer Printings can remove those duplicates.'

  const patch = (updates: Partial<typeof character>) => updateCharacter(character.id, updates)

  const allSpells = gameData?.spells ?? []

  const getEffectiveSourcesForCharacter = (nextAllowed: string[]): string[] =>
    resolveEffectiveSources(nextAllowed, character.originSystem, sources)

  const applySpellPrune = (
    updates: Partial<typeof character>,
    nextAllowed: string[],
  ): Partial<typeof character> => {
    const prune = pruneSpellsForDisabledSources(
      character,
      getEffectiveSourcesForCharacter(nextAllowed),
      allSpells,
    )
    if (!prune) return updates
    const removed = countRemovedSpells(character, prune.spells.spellProfiles)
    if (removed > 0) {
      toast.warning(`${removed} spell${removed === 1 ? '' : 's'} removed (source disabled)`)
    }
    return { ...updates, ...prune }
  }

  const toggleSource = (abbr: string) => {
    const source = sources.find((candidate) => candidate.abbreviation === abbr) ?? abbr
    if (!getSourceCompatibility(source, character.originSystem).compatible) return
    const isRemoving = allowedSources.includes(abbr)
    const next = normalizeAllowedSources(
      isRemoving ? allowedSources.filter((s) => s !== abbr) : [...allowedSources, abbr],
      character.originSystem,
      sources,
    )
    const updates: Partial<typeof character> = { allowedSources: next }
    patch(isRemoving ? applySpellPrune(updates, next) : updates)
  }

  const applyPreset = (preset: SourcePreset) => {
    const next = normalizeAllowedSources(
      preset.abbreviations.filter((a) => availableSourceSet.has(a)),
      character.originSystem,
      sources,
    )
    patch(applySpellPrune({ allowedSources: next }, next))
  }

  const clearSources = () => {
    patch(applySpellPrune({ allowedSources: [] }, []))
  }

  const setPreferNewerPrintings = (checked: boolean) => {
    if (character.originSystem === '2024') return
    patch({ variantRules: { ...character.variantRules, preferNewerPrintings: checked } })
  }

  const handleDismissHint = () => {
    setShowHint(false)
    setHintDismissed(HINT_ID, true)
  }

  return (
    <div
      ref={sourceControlsRef}
      className={cn(
        'relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg',
        sourceControlsHighlighted && 'animate-route-focus',
      )}
    >
      <AnchoredHint
        position={showHint && !isBundledSrd ? hintPosition : null}
        width={HINT_WIDTH}
        onDismiss={handleDismissHint}
      >
        <span className="font-semibold">{implicitSourceName}</span> is always included — it's tied
        to your ruleset and can't be removed here.
      </AnchoredHint>

      {/* Additional Content */}
      <WorkspacePaneHeader
        icon={<BookOpen className="size-4 text-primary" weight="fill" />}
        title={
          <span className="inline-flex items-center gap-2">
            <span data-allowed-sources-header>Additional Content</span>
            {!isBundledSrd && allowedSources.length > 0 && (
              <span
                data-allowed-sources-count
                className="inline-flex min-w-6 items-center justify-center rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold tracking-normal text-primary"
              >
                {allowedSources.length}
              </span>
            )}
          </span>
        }
      >
        {!isBundledSrd && (
          <div className="ml-auto flex shrink-0 items-center gap-1">
            {[
              ...SOURCE_PRESETS.map((preset) => ({
                key: preset.id,
                label: preset.label,
                title: preset.description,
                onClick: () => applyPreset(preset),
                active: isPresetActive(preset),
              })),
              {
                key: 'none',
                label: 'None',
                title: 'Clear all selected content',
                onClick: clearSources,
                active: false,
              },
            ].map((action) => (
              <button
                key={action.key}
                type="button"
                onClick={action.onClick}
                title={action.title}
                className={cn(
                  'h-8 cursor-pointer rounded-md px-2.5 text-xs font-medium transition-colors',
                  action.active
                    ? 'bg-surface-selected text-foreground'
                    : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground',
                )}
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </WorkspacePaneHeader>

      {isBundledSrd ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="max-w-lg rounded-md border border-border bg-workspace-pane p-5 text-center">
            <Database className="mx-auto size-7 text-primary" weight="duotone" />
            <p className="mt-3 text-sm font-semibold text-foreground">Using the included SRD</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              The included SRD does not provide additional sourcebooks to enable. To add more
              options, open{' '}
              <Link
                to="/settings?section=data"
                className="font-medium text-primary underline underline-offset-2"
              >
                Settings → Game Data
              </Link>{' '}
              and add compatible 5etools data.
            </p>
          </div>
        </div>
      ) : sources.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          No additional content is available. Load game data in Settings first.
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex min-h-full w-full max-w-[var(--workspace-collection-max-width)] flex-col gap-4 p-4">
            <aside className="flex shrink-0 items-start gap-3 rounded-md border border-warning/35 bg-warning/10 px-4 py-3">
              <Warning className="mt-0.5 size-5 shrink-0 text-warning" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">Source configuration notes</p>
                <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                  {conflicts.length > 0 && (
                    <li>
                      Some character choices use disabled sources:{' '}
                      {conflicts
                        .map(({ source, items }) => `${source} (${items.join(', ')})`)
                        .join('; ')}
                      .
                    </li>
                  )}
                  {hasNonPresetSourcesSelected && (
                    <li>
                      Non-recommended sources may include DM-only or outdated options that add noise
                      to selection lists.
                    </li>
                  )}
                  <li aria-live="polite">{printingNotice}</li>
                </ul>
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-3 pl-3">
                <Label
                  htmlFor={preferNewerId}
                  className="cursor-pointer whitespace-nowrap text-xs font-semibold"
                >
                  Prefer Newer Printings
                </Label>
                <Switch
                  id={preferNewerId}
                  checked={preferNewerPrintings}
                  onCheckedChange={setPreferNewerPrintings}
                  disabled={character.originSystem === '2024'}
                />
              </div>
            </aside>

            <div className="flex-1 space-y-4 pr-1">
              {groupOrder.map((group) => {
                const groupSources = sourcesByGroup[group]?.filter(
                  (s) => !IMPLICIT_SOURCES.has(s.abbreviation),
                )
                if (!groupSources?.length) return null
                return (
                  <div key={group} className="space-y-1.5">
                    <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {groupLabels[group]}
                    </h5>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                      {groupSources.map((source) => {
                        const enabled = allowedSources.includes(source.abbreviation)
                        const compatibility = getSourceCompatibility(source, character.originSystem)
                        return (
                          <button
                            type="button"
                            key={source.abbreviation}
                            onClick={() => toggleSource(source.abbreviation)}
                            aria-pressed={enabled}
                            disabled={!compatibility.compatible}
                            title={compatibility.reason}
                            className={cn(
                              'flex min-h-14 cursor-pointer items-start gap-2 rounded-md border px-3 py-2.5 text-left text-sm transition-colors',
                              !compatibility.compatible &&
                                'cursor-not-allowed opacity-50 hover:border-border hover:text-muted-foreground',
                              enabled
                                ? 'border-accent bg-accent/10 text-foreground'
                                : 'border-border hover:border-accent/50 text-muted-foreground hover:text-foreground',
                            )}
                          >
                            <BookOpen
                              className={cn(
                                'h-4 w-4 shrink-0 mt-0.5',
                                enabled ? 'text-primary' : 'text-muted-foreground',
                              )}
                            />
                            <div className="min-w-0">
                              <div className="font-semibold truncate">{source.name}</div>
                              <div className="text-xs font-mono text-muted-foreground">
                                {source.abbreviation}
                                {source.year && ` (${source.year})`}
                              </div>
                              {!compatibility.compatible && (
                                <div className="mt-0.5 text-[11px] text-warning">
                                  {compatibility.reason}
                                </div>
                              )}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
