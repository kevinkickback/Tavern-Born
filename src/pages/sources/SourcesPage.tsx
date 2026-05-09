import { BookOpen, Books, Question, Sparkle, Warning, X } from '@phosphor-icons/react'
import { useEffect, useId, useMemo, useState } from 'react'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { detectSourceConflicts } from '@/lib/sourceConflicts'
import {
  getImplicitSource,
  IMPLICIT_SOURCES,
  SOURCE_PRESETS,
  type SourcePreset,
} from '@/lib/sourcePresets'
import { isHintDismissed, setHintDismissed } from '@/lib/storage/hints'
import { cn } from '@/lib/utils'
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

interface HintPosition {
  top: number
  left: number
  arrowLeft: number
}

export function SourcesPage() {
  const preferNewerId = useId()
  const character = useCharacterStore((s) => s.activeCharacter)
  const updateCharacter = useCharacterStore((s) => s.updateCharacter)
  const gameData = useGameDataStore((s) => s.gameData)

  const [showHint, setShowHint] = useState(() => !isHintDismissed(HINT_ID))
  const [hintPosition, setHintPosition] = useState<HintPosition | null>(null)

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

  useEffect(() => {
    if (!showHint) {
      setHintPosition(null)
      return
    }

    const updatePosition = () => {
      const el = document.querySelector<HTMLElement>(ALLOWED_SOURCES_HEADER_SELECTOR)
      if (!el) {
        setHintPosition(null)
        return
      }
      const rect = el.getBoundingClientRect()
      const centerX = rect.left + rect.width / 2
      const maxLeft = Math.max(16, window.innerWidth - HINT_WIDTH - 16)
      const left = Math.min(Math.max(centerX - HINT_WIDTH / 2, 16), maxLeft)
      const arrowLeft = Math.min(Math.max(centerX - left, 18), HINT_WIDTH - 18)
      setHintPosition({ top: rect.bottom + 10, left, arrowLeft })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [showHint])

  if (!character) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        No active character.
      </div>
    )
  }

  const implicitSource = getImplicitSource(character.originSystem)
  const implicitSourceName = sourceNameMap.get(implicitSource) ?? implicitSource

  const patch = (updates: Partial<typeof character>) => updateCharacter(character.id, updates)

  const toggleSource = (abbr: string) => {
    const next = allowedSources.includes(abbr)
      ? allowedSources.filter((s) => s !== abbr)
      : [...allowedSources, abbr]
    patch({ allowedSources: next })
  }

  const applyPreset = (preset: SourcePreset) => {
    patch({
      allowedSources: preset.abbreviations.filter((a) => availableSourceSet.has(a)),
    })
  }

  const clearSources = () => patch({ allowedSources: [] })

  const setPreferNewerPrintings = (checked: boolean) => {
    patch({ variantRules: { ...character.variantRules, preferNewerPrintings: checked } })
  }

  const handleDismissHint = () => {
    setShowHint(false)
    setHintDismissed(HINT_ID, true)
  }

  return (
    <TooltipProvider>
      <div className="h-full flex flex-col">
        <div className="px-6 py-5 page-header-band mb-6 shrink-0">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center gap-3">
              <Books className="h-6 w-6 text-primary" weight="duotone" />
              <div>
                <h1 className="text-2xl font-display font-bold">Sources</h1>
                <p className="text-sm text-muted-foreground">
                  Manage which sourcebooks are available for this character
                </p>
              </div>
            </div>
          </div>
        </div>

        {showHint && hintPosition ? (
          <div
            className="pointer-events-none fixed z-50 animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-300"
            style={{ top: hintPosition.top, left: hintPosition.left }}
          >
            <div
              className="pointer-events-auto relative rounded-lg border border-accent/50 bg-accent px-3 py-2 text-sm text-accent-foreground shadow-2xl ring-1 ring-accent/20"
              style={{ width: HINT_WIDTH }}
            >
              <div
                className="absolute -top-[7px] h-3.5 w-3.5 rotate-45 border-l border-t border-accent/50 bg-accent"
                style={{ left: hintPosition.arrowLeft - 7 }}
              />
              <button
                type="button"
                className="absolute top-1.5 right-1.5 inline-flex h-6 w-6 items-center justify-center rounded-md border border-white/35 bg-black/25 text-accent-foreground shadow-sm transition-colors hover:bg-black/40 hover:text-white"
                onClick={handleDismissHint}
                aria-label="Dismiss hint"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <p className="leading-snug text-accent-foreground/95 pr-8">
                <span className="font-semibold">{implicitSourceName}</span> is always included —
                it's tied to your ruleset and can't be removed here.
              </p>
            </div>
          </div>
        ) : null}

        <div className="flex-1 overflow-hidden px-6 pb-6">
          <div className="max-w-7xl mx-auto h-full flex flex-col gap-4">
            {/* Conflict warning */}
            {conflicts.length > 0 && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 flex gap-3 shrink-0">
                <Warning className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-amber-200">
                    Some choices use disabled sources
                  </p>
                  <p className="text-xs text-amber-200/80">
                    These selections remain on your character but won't appear in selection
                    dropdowns until their source is re-enabled.
                  </p>
                  <ul className="mt-2 space-y-1">
                    {conflicts.map(({ source, items }) => (
                      <li key={source} className="text-xs text-amber-200/90">
                        <span className="font-mono font-semibold text-amber-300">{source}</span>
                        {sourceNameMap.has(source) && (
                          <span className="text-amber-200/60"> — {sourceNameMap.get(source)}</span>
                        )}
                        <span className="text-amber-200/70">: {items.join(', ')}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Prefer Newer Printings toggle */}
            <div className="rounded-lg border border-border bg-muted/20 p-4 flex items-center justify-between gap-4 shrink-0">
              <div className="flex items-center gap-2">
                <Sparkle className="h-4 w-4 text-primary" weight="fill" />
                <Label htmlFor={preferNewerId} className="font-semibold cursor-pointer">
                  Prefer Newer Printings
                </Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground transition-colors"
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
            </div>

            {/* Allowed Sources */}
            <div className="rounded-lg border border-border bg-muted/20 flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-wrap gap-2 shrink-0">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-primary" weight="fill" />
                  <h4 className="font-semibold text-lg" data-allowed-sources-header>
                    Allowed Sources
                  </h4>
                  {allowedSources.length > 0 && (
                    <span className="inline-flex items-center justify-center rounded-full bg-primary/15 text-primary text-xs font-semibold px-2 py-0.5 min-w-[1.5rem]">
                      {allowedSources.length}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 text-sm flex-wrap">
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
                  ].map((action, index, all) => (
                    <div key={action.key} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={action.onClick}
                        title={action.title}
                        className={cn(
                          'font-medium text-primary hover:underline',
                          action.active && 'underline',
                        )}
                      >
                        {action.label}
                      </button>
                      {index < all.length - 1 && <span className="text-muted-foreground">|</span>}
                    </div>
                  ))}
                </div>
              </div>

              {sources.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-muted-foreground">
                  No sources available. Please load game data in Settings first.
                </div>
              ) : (
                <div className="flex-1 min-h-0 flex flex-col gap-2 p-4">
                  <div className="flex-1 overflow-y-auto pr-1 space-y-4">
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
                                  className={cn(
                                    'px-3 py-2.5 rounded-md border text-left transition-all text-sm flex items-start gap-2',
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

                  {hasNonPresetSourcesSelected && (
                    <div className="text-xs text-amber-200 flex items-center gap-1.5 shrink-0 bg-amber-500/10 border border-amber-500/30 p-3 rounded-md">
                      <Warning className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                      <span>
                        Non-recommended sources often contain DM-only or outdated content. These may
                        clutter your options with material not intended for players.
                      </span>
                    </div>
                  )}

                  {character.originSystem === '2024' && (
                    <div className="text-xs text-amber-200 flex items-center gap-1.5 shrink-0 bg-amber-500/10 border border-amber-500/30 p-3 rounded-md">
                      <Warning className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                      <span>
                        {preferNewerPrintings
                          ? 'Older options are hidden when newer versions exist. Disable "Prefer Newer Printings" to see all options (will show duplicate entries).'
                          : 'Some content exists in both Legacy (2014) and Revised (2024) editions. Enable "Prefer Newer Printings" to only see the most recent version.'}
                      </span>
                    </div>
                  )}

                  {character.originSystem === '2014' && (
                    <div className="text-xs text-amber-200 flex items-center gap-1.5 shrink-0 bg-amber-500/10 border border-amber-500/30 p-3 rounded-md">
                      <Warning className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                      <span>
                        {preferNewerPrintings
                          ? 'Older printings are hidden where a newer version exists in your selected sources. Disable "Prefer Newer Printings" to see all options.'
                          : 'Some races and features appear in multiple printings across your selected sources (e.g., ERLW content updated in MPMM). Enable "Prefer Newer Printings" to automatically hide older versions.'}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
