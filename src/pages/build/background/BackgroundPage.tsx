import { CaretLeft, CaretRight, Scroll } from '@phosphor-icons/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useProvenance } from '@/hooks/character/useProvenance'
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData'
import {
  formatEquipmentOptionEntries,
  resolveBackgroundEquipmentBlocks,
} from '@/lib/5etools/startingEquipment'
import {
  ABILITY_ABBREVIATIONS,
  type AbilityName,
  getBackgroundAbilityData,
} from '@/lib/calculations/abilityScores'
import { matchesGameDataEntry } from '@/lib/characterUtils'
import { cn } from '@/lib/utils'
import { NoCharCard } from '@/pages/_shared'
import { BuildBackgroundDetailsPanel } from '@/pages/build/background/components/DetailsPanel'
import {
  getBackgroundLanguageNames,
  getBackgroundSkillNames,
  getBackgroundToolNames,
} from '@/pages/build/background/model/data'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Background5e } from '@/types/5etools'

export function BuildBackgroundPage() {
  const character = useCharacterStore((s) => s.activeCharacter)
  const updateCharacter = useCharacterStore((s) => s.updateCharacter)
  const { backgrounds } = useFilteredGameData()
  const itemLookup = useGameDataStore((s) => s.itemLookup)
  const [detailCollapsed, setDetailCollapsed] = useState(false)
  const [bgSearch, setBgSearch] = useState('')
  const { applyBackgroundSelection, applyBackgroundAbilityChoices } = useProvenance()
  const selectedBackgroundRef = useRef<HTMLDivElement | null>(null)
  const isInitialLoadRef = useRef(true)
  const previousSearchRef = useRef('')

  const filteredBackgrounds = useMemo(() => {
    const q = bgSearch.trim().toLowerCase()
    if (!q) return backgrounds
    return backgrounds.filter((b) => b.name.toLowerCase().includes(q))
  }, [backgrounds, bgSearch])

  useEffect(() => {
    // Only scroll on initial mount or when search changes, not on selection change
    const isSearchChanged = previousSearchRef.current !== bgSearch
    const shouldScroll = isInitialLoadRef.current || isSearchChanged

    if (shouldScroll && selectedBackgroundRef.current) {
      selectedBackgroundRef.current.scrollIntoView({
        behavior: 'auto',
        block: 'start',
        inline: 'nearest',
      })
    }

    isInitialLoadRef.current = false
    previousSearchRef.current = bgSearch
  }, [bgSearch])

  const selectedBg = character
    ? (backgrounds.find((b) =>
        matchesGameDataEntry(character.background, character.backgroundSource, b),
      ) as Background5e | undefined)
    : undefined
  const selectedBackgroundKey = selectedBg ? `${selectedBg.name}|${selectedBg.source ?? ''}` : null

  const equipmentBlocks = useMemo(
    () => resolveBackgroundEquipmentBlocks(selectedBg?.startingEquipment, itemLookup),
    [selectedBg?.startingEquipment, itemLookup],
  )
  const choiceBlocks = equipmentBlocks.filter((b) => !b.isFixed)
  const optionCountByBackground = useMemo(() => {
    const counts = new Map<string, number>()
    for (const bg of backgrounds) {
      const key = `${bg.name}|${bg.source ?? ''}`
      const count = resolveBackgroundEquipmentBlocks(bg.startingEquipment, itemLookup).reduce(
        (total, block) => total + block.choiceKeys.length,
        0,
      )
      counts.set(key, count)
    }
    return counts
  }, [backgrounds, itemLookup])

  if (!character) {
    return <NoCharCard icon={<Scroll weight="duotone" />} noun="choose a background" />
  }

  const handleBackground = (name: string, bgSource?: string) => {
    const bg = backgrounds.find((b) => matchesGameDataEntry(name, bgSource, b)) as
      | Background5e
      | undefined
    if (!bg) return
    applyBackgroundSelection(bg)
    updateCharacter(character.id, {
      background: name,
      backgroundSource: bgSource ?? undefined,
      backgroundEquipmentChoices: [],
    })
    if (detailCollapsed) setDetailCollapsed(false)
  }

  const skills = getBackgroundSkillNames(selectedBg)
  const langs = getBackgroundLanguageNames(selectedBg)
  const tools = getBackgroundToolNames(selectedBg)
  const bgAsiData = getBackgroundAbilityData(selectedBg)
  const bgBlockIndex = character.backgroundAsiBlockIndex ?? 0
  const bgChoices = character.backgroundAsiChoices ?? []
  const bgEquipmentChoices = character.backgroundEquipmentChoices ?? []

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 pt-6 pb-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="font-display text-2xl font-bold flex items-center gap-3">
            <Scroll className="h-6 w-6 text-accent" weight="duotone" />
            Background
          </h1>
        </div>
      </div>

      <div className="flex-1 overflow-hidden px-6 pb-6">
        <div className="max-w-7xl mx-auto h-full">
          <Card className="h-full overflow-hidden flex flex-col">
            <div className="relative flex flex-row flex-1 overflow-hidden min-h-0 -my-6">
              {' '}
              <button
                type="button"
                onClick={() => setDetailCollapsed((c) => !c)}
                title={detailCollapsed ? 'Expand details panel' : 'Collapse details panel'}
                className="absolute top-2 right-2 z-10 w-8 h-8 rounded-full bg-accent text-accent-foreground flex items-center justify-center shadow-md hover:bg-accent/80 transition-all"
              >
                {detailCollapsed ? (
                  <CaretLeft className="h-3.5 w-3.5" />
                ) : (
                  <CaretRight className="h-3.5 w-3.5" />
                )}
              </button>{' '}
              <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
                <div className="p-4 border-b border-border flex flex-col gap-2">
                  <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Backgrounds ({filteredBackgrounds.length}
                    {bgSearch ? ` of ${backgrounds.length}` : ''})
                  </span>
                  <Input
                    placeholder="Search backgrounds…"
                    value={bgSearch}
                    onChange={(e) => setBgSearch(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <ScrollArea className="flex-1 overflow-hidden">
                  <div className="p-4 space-y-1 pr-8">
                    {filteredBackgrounds.map((bg) => {
                      const bgKey = `${bg.name}|${bg.source ?? ''}`
                      const isSelected = selectedBackgroundKey === bgKey
                      const rowChoiceBlocks = isSelected ? choiceBlocks : []
                      const bgOptionCount = optionCountByBackground.get(bgKey) ?? 0
                      return (
                        <div
                          key={bgKey}
                          ref={isSelected ? selectedBackgroundRef : null}
                          className={cn(
                            'w-full p-3 rounded-lg border transition-colors hover:border-accent flex items-center justify-between gap-2',
                            isSelected ? 'border-accent bg-accent/10' : 'border-border bg-card',
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => handleBackground(bg.name, bg.source ?? undefined)}
                            className="flex items-center gap-2 min-w-0 flex-1 text-left"
                          >
                            <div
                              className={cn(
                                'h-3.5 w-3.5 rounded-full border-2 flex-shrink-0',
                                isSelected ? 'bg-accent border-accent' : 'border-muted-foreground',
                              )}
                            />
                            <span className="font-medium text-sm truncate">{bg.name}</span>
                          </button>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {isSelected && rowChoiceBlocks.length > 0 ? (
                              <div className="flex flex-col gap-1.5 min-w-[220px]">
                                {rowChoiceBlocks.map((block) => {
                                  const currentChoice =
                                    bgEquipmentChoices[block.index]?.toLowerCase() ??
                                    block.choiceKeys[0] ??
                                    'a'
                                  return (
                                    <Select
                                      key={block.index}
                                      value={currentChoice}
                                      onValueChange={(val) => {
                                        if (!selectedBg) return
                                        const next = [...bgEquipmentChoices]
                                        while (next.length <= block.index) next.push('a')
                                        next[block.index] = val
                                        applyBackgroundSelection(selectedBg, next)
                                        updateCharacter(character.id, {
                                          backgroundEquipmentChoices: next,
                                        })
                                      }}
                                    >
                                      <SelectTrigger className="h-7 text-xs w-full">
                                        <SelectValue placeholder={`Choice ${block.index + 1}…`} />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {block.choiceKeys.map((key) => {
                                          const optionData = block.options[key]
                                          const label =
                                            formatEquipmentOptionEntries(optionData).join(', ')
                                          return (
                                            <SelectItem key={key} value={key} className="text-xs">
                                              ({key.toUpperCase()}) {label}
                                            </SelectItem>
                                          )
                                        })}
                                      </SelectContent>
                                    </Select>
                                  )
                                })}
                              </div>
                            ) : (
                              <>
                                {bgOptionCount > 0 && (
                                  <Badge variant="secondary" className="text-xs px-1.5 py-0">
                                    {bgOptionCount} item option{bgOptionCount === 1 ? '' : 's'}
                                  </Badge>
                                )}
                                <Badge variant="outline" className="text-xs">
                                  {bg.source}
                                </Badge>
                              </>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </ScrollArea>
                {selectedBg && bgAsiData.blocks.length > 0 && (
                  <div className="border-t border-border p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Ability Score Improvements
                      </span>
                      {bgAsiData.blocks.length > 1 && (
                        <div className="flex rounded-md border border-border overflow-hidden text-xs">
                          <button
                            type="button"
                            onClick={() => applyBackgroundAbilityChoices(selectedBg, 0, [])}
                            className={cn(
                              'px-2 py-1 transition-colors',
                              bgBlockIndex === 0
                                ? 'bg-accent text-accent-foreground'
                                : 'hover:bg-muted',
                            )}
                          >
                            +2 / +1
                          </button>
                          <button
                            type="button"
                            onClick={() => applyBackgroundAbilityChoices(selectedBg, 1, [])}
                            className={cn(
                              'px-2 py-1 border-l border-border transition-colors',
                              bgBlockIndex === 1
                                ? 'bg-accent text-accent-foreground'
                                : 'hover:bg-muted',
                            )}
                          >
                            +1 / +1 / +1
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="space-y-2">
                      {(() => {
                        const block = bgAsiData.blocks[bgBlockIndex] ?? bgAsiData.blocks[0]
                        const slotLabels = ['first', 'second', 'third']
                        const slots = block.weights.map((weight, i) => ({
                          weight,
                          key: slotLabels[i] ?? `slot${i + 1}`,
                          index: i,
                        }))
                        return slots.map(({ weight, key, index: slotIndex }) => {
                          const currentChoice =
                            (bgChoices[slotIndex] as AbilityName | undefined) ?? ''
                          return (
                            <div key={key} className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-primary w-6 text-right shrink-0">
                                +{weight}
                              </span>
                              <Select
                                value={currentChoice}
                                onValueChange={(val) => {
                                  const newChoices = Array.from<string>({
                                    length: block.weights.length,
                                  }).map((_, i) => bgChoices[i] ?? '')
                                  newChoices[slotIndex] = val
                                  applyBackgroundAbilityChoices(
                                    selectedBg,
                                    bgBlockIndex,
                                    newChoices,
                                  )
                                }}
                              >
                                <SelectTrigger className="h-7 text-xs flex-1">
                                  <SelectValue placeholder="Choose ability…" />
                                </SelectTrigger>
                                <SelectContent>
                                  {block.from.map((ability) => (
                                    <SelectItem
                                      key={ability}
                                      value={ability}
                                      disabled={
                                        bgChoices.includes(ability) && currentChoice !== ability
                                      }
                                    >
                                      {ABILITY_ABBREVIATIONS[ability]} —{' '}
                                      {ability.charAt(0).toUpperCase() + ability.slice(1)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )
                        })
                      })()}
                    </div>
                  </div>
                )}
              </div>{' '}
              <BuildBackgroundDetailsPanel
                detailCollapsed={detailCollapsed}
                selectedBackground={selectedBg}
                skillNames={skills}
                languageNames={langs}
                toolNames={tools}
              />
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
