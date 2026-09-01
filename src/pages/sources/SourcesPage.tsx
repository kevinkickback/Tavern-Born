import { BookOpen, Books, Question, Sparkle, Warning } from '@phosphor-icons/react'
import { useId, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  AnchoredHint,
  WorkspaceBody,
  WorkspacePage,
  WorkspacePaneHeader,
  WorkspaceToolbar,
} from '@/components/workspace'
import { useAnchoredHintPosition } from '@/hooks/ui/useAnchoredHintPosition'
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

export function SourcesPage() {
  const preferNewerId = useId()
  const character = useCharacterStore((s) => s.activeCharacter)
  const updateCharacter = useCharacterStore((s) => s.updateCharacter)
  const gameData = useGameDataStore((s) => s.gameData)

  const [showHint, setShowHint] = useState(() => !isHintDismissed(HINT_ID))
  const hintPosition = useAnchoredHintPosition({
    enabled: showHint,
    selector: ALLOWED_SOURCES_HEADER_SELECTOR,
    width: HINT_WIDTH,
    gap: 10,
  })

  const allSources = gameData?.sources ?? []
  const sources = useMemo(
    () => allSources.filter((s) => s.hasCharacterOptions !== false),
    [allSources],
  )
  const allowedSources = character?.allowedSources ?? []
  const availableSourceSet = new Set(sources.map((s) => s.abbreviation))

  const effectiveSources = useMemo(() => {
    if (!character) return allowedSources
    const implicit = getImplicitSource(character.originSystem)
    return allowedSources.includes(implicit) ? allowedSources : [...allowedSources, implicit]
  }, [allowedSources, character])

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
    const filtered = preset.abbreviations.filter((a) => availableSourceSet.has(a))
    return (
      filtered.length === allowedSources.length && filtered.every((a) => allowedSources.includes(a))
    )
  }

  const preferNewerPrintings = character?.variantRules?.preferNewerPrintings ?? false

  if (!character) {
    return <NoCharCard icon={<Books weight="duotone" />} noun="manage sources" />
  }

  const implicitSource = getImplicitSource(character.originSystem)
  const implicitSourceName = sourceNameMap.get(implicitSource) ?? implicitSource
  const printingNotice =
    character.originSystem === '2024'
      ? preferNewerPrintings
        ? 'Older options are hidden when newer versions exist. Disable Prefer Newer Printings to show every version.'
        : 'Legacy and Revised content can overlap. Enable Prefer Newer Printings to hide older versions when replacements exist.'
      : preferNewerPrintings
        ? 'Older printings are hidden where a newer version exists in the selected sources.'
        : 'Some selected books contain multiple printings of the same option. Prefer Newer Printings can remove those duplicates.'

  const patch = (updates: Partial<typeof character>) => updateCharacter(character.id, updates)

  const allSpells = gameData?.spells ?? []

  const getEffectiveSources = (nextAllowed: string[]): string[] => {
    const implicit = getImplicitSource(character.originSystem)
    return nextAllowed.includes(implicit) ? nextAllowed : [...nextAllowed, implicit]
  }

  const applySpellPrune = (
    updates: Partial<typeof character>,
    nextAllowed: string[],
  ): Partial<typeof character> => {
    const prune = pruneSpellsForDisabledSources(
      character,
      getEffectiveSources(nextAllowed),
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
    const isRemoving = allowedSources.includes(abbr)
    const next = isRemoving ? allowedSources.filter((s) => s !== abbr) : [...allowedSources, abbr]
    const updates: Partial<typeof character> = { allowedSources: next }
    patch(isRemoving ? applySpellPrune(updates, next) : updates)
  }

  const applyPreset = (preset: SourcePreset) => {
    const next = preset.abbreviations.filter((a) => availableSourceSet.has(a))
    patch(applySpellPrune({ allowedSources: next }, next))
  }

  const clearSources = () => {
    patch(applySpellPrune({ allowedSources: [] }, []))
  }

  const setPreferNewerPrintings = (checked: boolean) => {
    patch({ variantRules: { ...character.variantRules, preferNewerPrintings: checked } })
  }

  const handleDismissHint = () => {
    setShowHint(false)
    setHintDismissed(HINT_ID, true)
  }

  return (
    <TooltipProvider>
      <WorkspacePage>
        <AnchoredHint
          position={showHint ? hintPosition : null}
          width={HINT_WIDTH}
          onDismiss={handleDismissHint}
        >
          <span className="font-semibold">{implicitSourceName}</span> is always included — it's tied
          to your ruleset and can't be removed here.
        </AnchoredHint>

        <WorkspaceBody className="flex flex-col overflow-hidden bg-workspace-pane">
          <aside className="flex shrink-0 gap-3 border-b border-warning/35 bg-warning/10 px-4 py-3">
            <Warning className="mt-0.5 size-5 shrink-0 text-warning" />
            <div className="min-w-0">
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
                <li>{printingNotice}</li>
              </ul>
            </div>
          </aside>

          <WorkspaceToolbar className="justify-between overflow-x-auto">
            <div className="flex items-center gap-2">
              <Sparkle className="h-4 w-4 text-primary" weight="fill" />
              <Label htmlFor={preferNewerId} className="font-semibold cursor-pointer">
                Prefer Newer Printings
              </Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
                    aria-label="Info: Prefer Newer Printings"
                  >
                    <Question className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-[240px] text-wrap">
                  When enabled, older printings are hidden when a newer reprint exists in your
                  selected sources. Reduces duplicates across races, classes, feats, and spells.
                </TooltipContent>
              </Tooltip>
            </div>
            <Switch
              id={preferNewerId}
              checked={preferNewerPrintings}
              onCheckedChange={setPreferNewerPrintings}
            />
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
                  title: 'Clear all selected sources',
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
          </WorkspaceToolbar>

          {/* Allowed Sources */}
          <WorkspacePaneHeader
            icon={<BookOpen className="size-4 text-primary" weight="fill" />}
            title={<span data-allowed-sources-header>Allowed sources</span>}
            count={`${allowedSources.length} selected`}
          />

          {sources.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              No sources available. Please load game data in Settings first.
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="mx-auto flex min-h-full w-full max-w-[var(--workspace-collection-max-width)] flex-col gap-2 p-4">
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
                            return (
                              <button
                                type="button"
                                key={source.abbreviation}
                                onClick={() => toggleSource(source.abbreviation)}
                                aria-pressed={enabled}
                                className={cn(
                                  'flex min-h-14 cursor-pointer items-start gap-2 rounded-md border px-3 py-2.5 text-left text-sm transition-colors',
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
        </WorkspaceBody>
      </WorkspacePage>
    </TooltipProvider>
  )
}
