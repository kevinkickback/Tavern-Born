import { ArrowsLeftRight, BookOpen, Check, Lock, Plus, Trash } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import type { ActiveFilters, CategoryLimit } from '@/components/modals/SelectionModal'
import { SpellSelectionModal } from '@/components/modals/SpellSelectionModal'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatSpellLevel } from '@/lib/calculations/spellUtils'
import { cn } from '@/lib/utils'
import type { Spell5e } from '@/types/5etools'
import type { RaceSpellChoice } from '@/types/character'

function getSpanForGroup(index: number, totalGroups: number) {
  // At 2xl: 3 columns. At xl: 2 columns. Below: 1 column.
  // Last group fills remaining columns on its row.
  const isLast = index === totalGroups - 1
  if (!isLast) return { xlSpan: 1, xxlSpan: 1 }

  const xlRemainder = totalGroups % 2
  const xxlRemainder = totalGroups % 3

  return {
    xlSpan: xlRemainder === 1 ? 2 : 1,
    xxlSpan: xxlRemainder === 1 ? 3 : xxlRemainder === 2 ? 2 : 1,
  }
}

function getColSpanClasses(span: { xlSpan: number; xxlSpan: number }) {
  const parts: string[] = []
  if (span.xlSpan === 2) parts.push('xl:col-span-2')
  if (span.xxlSpan === 2) parts.push('2xl:col-span-2')
  if (span.xxlSpan === 3) parts.push('2xl:col-span-3')
  return parts.join(' ')
}

function getInnerColumnClasses(span: { xlSpan: number; xxlSpan: number }) {
  // Base/md: always multi-column (grid is single column so full width is available)
  // xl/2xl: match inner columns to the group's grid span
  const xlCols = span.xlSpan >= 2 ? 'xl:columns-2' : 'xl:columns-1'
  const xxlCols =
    span.xxlSpan >= 3 ? '2xl:columns-3' : span.xxlSpan >= 2 ? '2xl:columns-2' : '2xl:columns-1'
  return `columns-2 md:columns-3 ${xlCols} ${xxlCols}`
}

export interface SpellListItem {
  profileId: string
  profileLabel: string
  className?: string
  classSource?: string
  alwaysPrepared?: boolean
  isPreparedCaster?: boolean
  name: string
  level: number
  kind: 'cantrip' | 'spell'
  prepared: boolean
  isFixed?: boolean
}

interface SpellProfileLike {
  id: string
  type?: string
  label: string
  className?: string
  classSource?: string
  alwaysPrepared?: boolean
  castingAbility?: string
  castingAbilityOptions?: string[]
  choices?: RaceSpellChoice[]
  fixedSpells?: string[]
  preparedSpells?: string[]
  spellSwaps?: Record<number, { removed: string; added: string }>
}

interface SpellcastingDetailLike {
  profileId: string
  isPreparedCaster?: boolean
  isTruePreparedCaster?: boolean
  knownSpellLimit?: number | null
  cantripLimit?: number | null
}

interface SpellModalConfigLike {
  title: string
  initialSelectedNames: string[]
  lockedNames?: Set<string>
  className?: string
  classSource?: string
  classListOverrides?: Set<string>
  allowedLevels?: Set<string>
  initialFilters?: ActiveFilters
  categories?: CategoryLimit<Spell5e>[]
}

interface SpellProfileManagerProps {
  spellProfiles: SpellProfileLike[]
  detailsByProfileId: Map<string, SpellcastingDetailLike>
  groupedItems: Map<string, SpellListItem[]>
  selectionSourceByProfileAndSpell: Map<string, string>
  preparedCasterSpellsByProfile?: Map<string, Spell5e[]>
  allSpells: Spell5e[]
  getSpellByName: (spellName: string) => Spell5e | undefined
  onTogglePrepared: (profileId: string, spellName: string) => void
  onRemoveSpell: (item: SpellListItem) => void
  onSetRacialCastingAbility?: (profileId: string, ability: string) => void
  onOpenRacialChoiceModal?: (profileId: string, choiceId: string) => void
  racialChoiceModalOpen?: boolean
  onRacialChoiceModalOpenChange?: (open: boolean) => void
  racialChoiceModalConfig?: SpellModalConfigLike | null
  onConfirmRacialChoice?: (names: string[]) => void
  characterSpellNames?: Set<string>
  renderSpellName: (params: {
    item: SpellListItem
    spell?: Spell5e
    sourceContext?: string
  }) => ReactNode
}

export function SpellProfileManager({
  spellProfiles,
  detailsByProfileId,
  groupedItems,
  selectionSourceByProfileAndSpell,
  preparedCasterSpellsByProfile,
  allSpells,
  getSpellByName,
  onTogglePrepared,
  onRemoveSpell,
  onSetRacialCastingAbility,
  onOpenRacialChoiceModal,
  racialChoiceModalOpen,
  onRacialChoiceModalOpenChange,
  racialChoiceModalConfig,
  onConfirmRacialChoice,
  characterSpellNames,
  renderSpellName,
}: SpellProfileManagerProps) {
  return (
    <>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <BookOpen className="h-6 w-6 text-accent" weight="duotone" />
          Spells
        </h1>
      </div>

      <Card className="w-full flex flex-col">
        <CardHeader>
          <CardTitle className="font-display text-xl flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-accent" weight="duotone" />
            Spell List
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1">
          {spellProfiles.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No spells assigned yet.
            </p>
          ) : (
            <Accordion
              type="multiple"
              defaultValue={spellProfiles.map((profile) => profile.id)}
              className="space-y-3 max-h-[calc(100vh-18rem)] overflow-y-auto pr-1"
            >
              {spellProfiles.map((profile) => {
                const items = groupedItems.get(profile.id) ?? []
                const swappedByAddedName = new Map<string, { removed: string; level: number }>()
                for (const [levelStr, swap] of Object.entries(profile.spellSwaps ?? {})) {
                  swappedByAddedName.set(swap.added, {
                    removed: swap.removed,
                    level: Number(levelStr),
                  })
                }
                const isRacial = profile.type === 'racial'
                const hasUnfulfilledChoices = profile.choices?.some(
                  (c) => c.selected.length < c.count,
                )
                if (profile.type === 'special' && items.length === 0) return null
                if (isRacial && items.length === 0 && !hasUnfulfilledChoices) return null
                const detail = detailsByProfileId.get(profile.id)

                // True prepared casters show the full class spell list inline
                const isTruePrepared = profile.type === 'class' && !!detail?.isTruePreparedCaster
                const availableClassSpells = isTruePrepared
                  ? (preparedCasterSpellsByProfile?.get(profile.id) ?? [])
                  : []

                // For true prepared casters, prepared state lives in profile.preparedSpells
                // (not in items, since spellsKnown is empty for them).
                const preparedSet = isTruePrepared
                  ? new Set(profile.preparedSpells ?? [])
                  : new Set(
                      items.filter((i) => i.kind === 'spell' && i.prepared).map((i) => i.name),
                    )
                const preparedCount = preparedSet.size
                const preparableSpells = isTruePrepared
                  ? availableClassSpells
                  : items.filter((item) => item.kind === 'spell' && !item.alwaysPrepared)
                const preparedTotal = detail?.isPreparedCaster
                  ? (detail.knownSpellLimit ?? preparableSpells.length)
                  : preparableSpells.length
                const levels = [...new Set(items.map((item) => item.level))].sort((a, b) => a - b)
                const availLevels = isTruePrepared
                  ? [...new Set(availableClassSpells.map((s) => s.level))].sort((a, b) => a - b)
                  : []

                // Compute missing spells for class profiles
                const currentCantrips = items.filter((item) => item.kind === 'cantrip').length
                const currentSpells = items.filter((item) => item.kind === 'spell').length
                const missingCantrips =
                  detail?.cantripLimit != null
                    ? Math.max(0, detail.cantripLimit - currentCantrips)
                    : 0
                const missingSpells =
                  !isRacial && !isTruePrepared && detail?.knownSpellLimit != null
                    ? Math.max(0, detail.knownSpellLimit - currentSpells)
                    : 0
                const hasMissingSpells = missingCantrips > 0 || missingSpells > 0

                return (
                  <AccordionItem
                    key={profile.id}
                    value={profile.id}
                    className="rounded-lg border border-border bg-card overflow-hidden"
                  >
                    <AccordionTrigger className="px-3 py-2 bg-muted/30 hover:no-underline">
                      <div className="flex items-center gap-2 text-left w-full min-w-0">
                        <span className="font-medium text-sm">{profile.label}</span>
                        <div className="ml-auto flex items-center gap-2 pr-1">
                          {profile.alwaysPrepared ||
                          (profile.type === 'class' && detail && !detail.isPreparedCaster) ? (
                            <Badge variant="secondary" className="text-xs">
                              Always Prepared
                            </Badge>
                          ) : null}
                          {detail?.isPreparedCaster ? (
                            <Badge variant="outline" className="text-xs">
                              Prepared: {preparedCount}/{preparedTotal}
                            </Badge>
                          ) : null}
                          <Badge variant="outline" className="text-xs">
                            Total: {items.length}
                          </Badge>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-0">
                      {/* Missing spells note for all profiles */}
                      {hasMissingSpells ? (
                        <div className="px-3 py-2 border-b border-border/60 bg-accent/10 flex items-center gap-2">
                          <span className="text-xs text-accent-foreground/80">
                            ⚠{' '}
                            {[
                              missingCantrips > 0
                                ? `${missingCantrips} cantrip${missingCantrips !== 1 ? 's' : ''}`
                                : null,
                              missingSpells > 0
                                ? `${missingSpells} spell${missingSpells !== 1 ? 's' : ''}`
                                : null,
                            ]
                              .filter(Boolean)
                              .join(' and ')}{' '}
                            remaining to choose.{' '}
                            {isRacial ? 'Use the Choose button below.' : 'Select via Class page.'}
                          </span>
                        </div>
                      ) : null}
                      {/* Racial profile: casting ability selector */}
                      {isRacial &&
                      profile.castingAbilityOptions &&
                      profile.castingAbilityOptions.length > 1 ? (
                        <div className="px-3 py-2 border-b border-border/60 bg-muted/10 flex items-center gap-2">
                          <span className="text-xs text-muted-foreground font-medium">
                            Casting Ability:
                          </span>
                          <Select
                            value={profile.castingAbility ?? ''}
                            onValueChange={(value) =>
                              onSetRacialCastingAbility?.(profile.id, value)
                            }
                          >
                            <SelectTrigger className="h-7 w-[100px] text-xs">
                              <SelectValue placeholder="Choose..." />
                            </SelectTrigger>
                            <SelectContent>
                              {profile.castingAbilityOptions.map((opt) => (
                                <SelectItem key={opt} value={opt} className="text-xs uppercase">
                                  {opt.toUpperCase()}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : null}
                      {/* Racial profile: unfulfilled choice prompts */}
                      {isRacial && profile.choices
                        ? profile.choices
                            .filter((choice) => choice.selected.length < choice.count)
                            .map((choice) => (
                              <div
                                key={choice.id}
                                className="px-3 py-2 border-b border-border/60 bg-accent/10 flex items-center gap-2"
                              >
                                <span className="text-xs text-accent-foreground/80 flex-1">
                                  ⚠ {choice.count - choice.selected.length} unchosen{' '}
                                  {choice.isCantrip ? 'cantrip' : 'spell'}
                                  {choice.count - choice.selected.length !== 1 ? 's' : ''}
                                  {' — '}
                                  Choose {choice.count} {choice.isCantrip ? 'cantrip' : 'spell'}
                                  {choice.filter?.classes
                                    ? ` from ${choice.filter.classes.join(', ')} list`
                                    : choice.pool
                                      ? ` from ${choice.pool.length} options`
                                      : ''}
                                </span>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 text-xs px-2"
                                  onClick={() => onOpenRacialChoiceModal?.(profile.id, choice.id)}
                                >
                                  <Plus className="h-3 w-3 mr-1" />
                                  Choose
                                </Button>
                              </div>
                            ))
                        : null}
                      {items.length === 0 &&
                      availableClassSpells.length === 0 &&
                      !hasMissingSpells &&
                      !hasUnfulfilledChoices ? (
                        <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                          No spells selected yet.
                        </div>
                      ) : null}
                      {/* True prepared casters: cantrips + full class spell list with prepare toggles */}
                      {isTruePrepared && (levels.includes(0) || availableClassSpells.length > 0)
                        ? (() => {
                            const totalGroups = (levels.includes(0) ? 1 : 0) + availLevels.length
                            let groupIndex = 0

                            return (
                              <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-px bg-border/60">
                                {levels.includes(0)
                                  ? (() => {
                                      const span = getSpanForGroup(groupIndex++, totalGroups)
                                      return (
                                        <div className={cn('bg-card', getColSpanClasses(span))}>
                                          <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground bg-muted/15 border-b border-border/60">
                                            Cantrips
                                          </div>
                                          <div
                                            className={cn(
                                              'divide-y divide-border/60',
                                              getInnerColumnClasses(span),
                                            )}
                                          >
                                            {items
                                              .filter((item) => item.level === 0)
                                              .map((item) => {
                                                const spell = getSpellByName(item.name)
                                                return (
                                                  <div
                                                    key={`${item.profileId}|${item.kind}|${item.name}`}
                                                    className="px-3 py-2 flex items-center justify-between gap-3 break-inside-avoid"
                                                  >
                                                    <div className="min-w-0">
                                                      {renderSpellName({
                                                        item,
                                                        spell,
                                                        sourceContext:
                                                          selectionSourceByProfileAndSpell.get(
                                                            `${item.profileId}|${item.name}`,
                                                          ),
                                                      })}
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                      {(() => {
                                                        const swap = swappedByAddedName.get(
                                                          item.name,
                                                        )
                                                        if (!swap) return null
                                                        return (
                                                          <Tooltip>
                                                            <TooltipTrigger asChild>
                                                              <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border/60 text-muted-foreground">
                                                                <ArrowsLeftRight className="h-3.5 w-3.5" />
                                                              </span>
                                                            </TooltipTrigger>
                                                            <TooltipContent
                                                              side="top"
                                                              className="text-xs"
                                                            >
                                                              Swapped from {swap.removed} at level{' '}
                                                              {swap.level}
                                                            </TooltipContent>
                                                          </Tooltip>
                                                        )
                                                      })()}
                                                      {item.isFixed ? (
                                                        <Lock className="h-3.5 w-3.5 text-muted-foreground/50" />
                                                      ) : (
                                                        <Button
                                                          variant="ghost"
                                                          size="sm"
                                                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                                                          onClick={() => onRemoveSpell(item)}
                                                        >
                                                          <Trash className="h-3.5 w-3.5" />
                                                        </Button>
                                                      )}
                                                    </div>
                                                  </div>
                                                )
                                              })}
                                          </div>
                                        </div>
                                      )
                                    })()
                                  : null}
                                {availLevels.map((spellLevel) => {
                                  const spellsAtLevel = availableClassSpells.filter(
                                    (s) => s.level === spellLevel,
                                  )
                                  const span = getSpanForGroup(groupIndex++, totalGroups)
                                  return (
                                    <div
                                      key={`${profile.id}|avail|${spellLevel}`}
                                      className={cn('bg-card', getColSpanClasses(span))}
                                    >
                                      <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground bg-muted/15 border-b border-border/60">
                                        {formatSpellLevel(spellLevel)}s
                                      </div>
                                      <div
                                        className={cn(
                                          'divide-y divide-border/60',
                                          getInnerColumnClasses(span),
                                        )}
                                      >
                                        {spellsAtLevel.map((spell) => {
                                          const isPrepared = preparedSet.has(spell.name)
                                          const atLimit =
                                            !isPrepared &&
                                            preparedTotal > 0 &&
                                            preparedCount >= preparedTotal
                                          const syntheticItem: SpellListItem = {
                                            profileId: profile.id,
                                            profileLabel: profile.label,
                                            className: profile.className,
                                            classSource: profile.classSource,
                                            name: spell.name,
                                            level: spell.level,
                                            kind: 'spell',
                                            prepared: isPrepared,
                                            isPreparedCaster: true,
                                          }

                                          return (
                                            <div
                                              key={`${profile.id}|avail|${spell.name}|${spell.source ?? ''}`}
                                              className={cn(
                                                'px-3 py-2 flex items-center justify-between gap-3 break-inside-avoid',
                                                isPrepared ? 'bg-accent/5' : 'opacity-70',
                                              )}
                                            >
                                              <div className="min-w-0">
                                                {renderSpellName({
                                                  item: syntheticItem,
                                                  spell,
                                                })}
                                              </div>
                                              <button
                                                type="button"
                                                disabled={atLimit}
                                                onClick={() =>
                                                  onTogglePrepared(profile.id, spell.name)
                                                }
                                                className={cn(
                                                  'h-4 w-4 rounded-full border-2 transition-colors flex-shrink-0',
                                                  isPrepared
                                                    ? 'bg-accent border-accent'
                                                    : atLimit
                                                      ? 'border-muted-foreground/30 cursor-not-allowed'
                                                      : 'border-muted-foreground hover:border-accent/60',
                                                )}
                                                title={
                                                  isPrepared
                                                    ? 'Prepared — click to unprepare'
                                                    : atLimit
                                                      ? `Prepare limit reached (${preparedCount}/${preparedTotal})`
                                                      : 'Not prepared — click to prepare'
                                                }
                                              />
                                            </div>
                                          )
                                        })}
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            )
                          })()
                        : null}

                      {/* Non-true-prepared: cantrips + normal spell list from items */}
                      {!isTruePrepared
                        ? (() => {
                            const totalGroups = levels.length
                            let groupIndex = 0

                            return (
                              <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-px bg-border/60">
                                {levels.includes(0)
                                  ? (() => {
                                      const span = getSpanForGroup(groupIndex++, totalGroups)
                                      return (
                                        <div className={cn('bg-card', getColSpanClasses(span))}>
                                          <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground bg-muted/15 border-b border-border/60">
                                            Cantrips
                                          </div>
                                          <div
                                            className={cn(
                                              'divide-y divide-border/60',
                                              getInnerColumnClasses(span),
                                            )}
                                          >
                                            {items
                                              .filter((item) => item.level === 0)
                                              .map((item) => {
                                                const spell = getSpellByName(item.name)
                                                return (
                                                  <div
                                                    key={`${item.profileId}|${item.kind}|${item.name}`}
                                                    className="px-3 py-2 flex items-center justify-between gap-3 break-inside-avoid"
                                                  >
                                                    <div className="min-w-0">
                                                      {renderSpellName({
                                                        item,
                                                        spell,
                                                        sourceContext:
                                                          selectionSourceByProfileAndSpell.get(
                                                            `${item.profileId}|${item.name}`,
                                                          ),
                                                      })}
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                      {(() => {
                                                        const swap = swappedByAddedName.get(
                                                          item.name,
                                                        )
                                                        if (!swap) return null
                                                        return (
                                                          <Tooltip>
                                                            <TooltipTrigger asChild>
                                                              <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border/60 text-muted-foreground">
                                                                <ArrowsLeftRight className="h-3.5 w-3.5" />
                                                              </span>
                                                            </TooltipTrigger>
                                                            <TooltipContent
                                                              side="top"
                                                              className="text-xs"
                                                            >
                                                              Swapped from {swap.removed} at level{' '}
                                                              {swap.level}
                                                            </TooltipContent>
                                                          </Tooltip>
                                                        )
                                                      })()}
                                                      {item.isFixed ? (
                                                        <Lock className="h-3.5 w-3.5 text-muted-foreground/50" />
                                                      ) : (
                                                        <Button
                                                          variant="ghost"
                                                          size="sm"
                                                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                                                          onClick={() => onRemoveSpell(item)}
                                                        >
                                                          <Trash className="h-3.5 w-3.5" />
                                                        </Button>
                                                      )}
                                                    </div>
                                                  </div>
                                                )
                                              })}
                                          </div>
                                        </div>
                                      )
                                    })()
                                  : null}
                                {levels
                                  .filter((level) => level > 0)
                                  .map((level) => {
                                    const levelItems = items.filter((item) => item.level === level)
                                    const span = getSpanForGroup(groupIndex++, totalGroups)
                                    return (
                                      <div
                                        key={`${profile.id}|level|${level}`}
                                        className={cn('bg-card', getColSpanClasses(span))}
                                      >
                                        <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground bg-muted/15 border-b border-border/60">
                                          {formatSpellLevel(level)}s
                                        </div>
                                        <div
                                          className={cn(
                                            'divide-y divide-border/60',
                                            getInnerColumnClasses(span),
                                          )}
                                        >
                                          {levelItems.map((item) => {
                                            const canPrepare =
                                              !isRacial &&
                                              item.kind === 'spell' &&
                                              !item.alwaysPrepared &&
                                              !!item.isPreparedCaster
                                            const spell = getSpellByName(item.name)

                                            return (
                                              <div
                                                key={`${item.profileId}|${item.kind}|${item.name}`}
                                                className="px-3 py-2 flex items-center justify-between gap-3 break-inside-avoid"
                                              >
                                                <div className="min-w-0">
                                                  {renderSpellName({
                                                    item,
                                                    spell,
                                                    sourceContext:
                                                      selectionSourceByProfileAndSpell.get(
                                                        `${item.profileId}|${item.name}`,
                                                      ),
                                                  })}
                                                </div>
                                                <div className="flex items-center gap-2">
                                                  {(() => {
                                                    const swap = swappedByAddedName.get(item.name)
                                                    if (!swap) return null
                                                    return (
                                                      <Tooltip>
                                                        <TooltipTrigger asChild>
                                                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border/60 text-muted-foreground">
                                                            <ArrowsLeftRight className="h-3.5 w-3.5" />
                                                          </span>
                                                        </TooltipTrigger>
                                                        <TooltipContent
                                                          side="top"
                                                          className="text-xs"
                                                        >
                                                          Swapped from {swap.removed} at level{' '}
                                                          {swap.level}
                                                        </TooltipContent>
                                                      </Tooltip>
                                                    )
                                                  })()}
                                                  {!isRacial && item.alwaysPrepared ? (
                                                    <Badge className="text-xs bg-accent text-accent-foreground">
                                                      <Check className="h-3 w-3 mr-1" />
                                                      Prepared
                                                    </Badge>
                                                  ) : canPrepare ? (
                                                    <button
                                                      type="button"
                                                      onClick={() =>
                                                        onTogglePrepared(item.profileId, item.name)
                                                      }
                                                      className={cn(
                                                        'h-4 w-4 rounded-full border-2 transition-colors',
                                                        item.prepared
                                                          ? 'bg-accent border-accent'
                                                          : 'border-muted-foreground',
                                                      )}
                                                      title={
                                                        item.prepared ? 'Prepared' : 'Not prepared'
                                                      }
                                                    />
                                                  ) : null}
                                                  {item.isFixed ? (
                                                    <Lock className="h-3.5 w-3.5 text-muted-foreground/50" />
                                                  ) : (
                                                    <Button
                                                      variant="ghost"
                                                      size="sm"
                                                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                                                      onClick={() => onRemoveSpell(item)}
                                                    >
                                                      <Trash className="h-3.5 w-3.5" />
                                                    </Button>
                                                  )}
                                                </div>
                                              </div>
                                            )
                                          })}
                                        </div>
                                      </div>
                                    )
                                  })}
                              </div>
                            )
                          })()
                        : null}
                    </AccordionContent>
                  </AccordionItem>
                )
              })}
            </Accordion>
          )}
        </CardContent>
      </Card>

      {racialChoiceModalConfig ? (
        <SpellSelectionModal
          open={racialChoiceModalOpen ?? false}
          onOpenChange={onRacialChoiceModalOpenChange ?? (() => {})}
          title={racialChoiceModalConfig.title}
          spells={allSpells}
          initialSelectedNames={racialChoiceModalConfig.initialSelectedNames}
          lockedNames={racialChoiceModalConfig.lockedNames}
          className={racialChoiceModalConfig.className}
          classSource={racialChoiceModalConfig.classSource}
          classListOverrides={racialChoiceModalConfig.classListOverrides}
          allowedLevels={racialChoiceModalConfig.allowedLevels}
          initialFilters={racialChoiceModalConfig.initialFilters}
          categories={
            racialChoiceModalConfig.categories && racialChoiceModalConfig.categories.length > 0
              ? racialChoiceModalConfig.categories
              : undefined
          }
          onConfirm={onConfirmRacialChoice ?? (() => {})}
          characterSpellNames={characterSpellNames}
        />
      ) : null}
    </>
  )
}
