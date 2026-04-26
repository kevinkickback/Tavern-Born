import { ArrowsLeftRight, BookOpen, Lock, Plus, Trash, WarningCircle } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { SPECIAL_SPELL_PROFILE_ID } from '@/lib/calculations/spellProfiles.constants'
import { formatSpellLevel, getSchoolName } from '@/lib/calculations/spellUtils'
import { getViewportBoundedMaxHeight } from '@/lib/layoutHeights'
import { cn } from '@/lib/utils'
import type { Spell5e } from '@/types/5etools'
import type { RaceSpellChoice } from '@/types/character'

const SCHOOL_STYLES: Record<string, string> = {
  A: 'bg-blue-500/10 text-blue-400',
  C: 'bg-amber-500/10 text-amber-400',
  D: 'bg-cyan-500/10 text-cyan-400',
  E: 'bg-pink-500/10 text-pink-400',
  V: 'bg-orange-500/10 text-orange-400',
  I: 'bg-violet-500/10 text-violet-400',
  N: 'bg-emerald-500/10 text-emerald-400',
  T: 'bg-teal-500/10 text-teal-400',
}

function getSchoolStyle(school: string | undefined): string {
  return SCHOOL_STYLES[school?.toUpperCase() ?? ''] ?? 'bg-muted/20 text-muted-foreground'
}

function getSpanForGroup(index: number, totalGroups: number, itemCount: number) {
  const isLast = index === totalGroups - 1
  if (!isLast) return { xlSpan: 1, xxlSpan: 1 }
  const xlRemainder = totalGroups % 2
  const xxlRemainder = totalGroups % 3
  const rawXl = xlRemainder === 1 ? 2 : 1
  const rawXxl = xxlRemainder === 1 ? 3 : xxlRemainder === 2 ? 2 : 1
  return {
    xlSpan: Math.min(rawXl, Math.max(1, itemCount)),
    xxlSpan: Math.min(rawXxl, Math.max(1, itemCount)),
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
  const xlCols = span.xlSpan >= 2 ? 'xl:columns-2' : 'xl:columns-1'
  const xxlCols =
    span.xxlSpan >= 3 ? '2xl:columns-3' : span.xxlSpan >= 2 ? '2xl:columns-2' : '2xl:columns-1'
  return `columns-2 md:columns-3 ${xlCols} ${xxlCols}`
}

interface CantripGroupProps {
  items: SpellListItem[]
  span: { xlSpan: number; xxlSpan: number }
  swappedByAddedName: Map<string, { removed: string; level: number }>
  selectionSourceByProfileAndSpell: Map<string, string>
  getSpellByName: (spellName: string) => Spell5e | undefined
  renderSpellName: (params: {
    item: SpellListItem
    spell?: Spell5e
    sourceContext?: string
  }) => ReactNode
  onRemoveSpell: (item: SpellListItem) => void
}

function CantripGroup({
  items,
  span,
  swappedByAddedName,
  selectionSourceByProfileAndSpell,
  getSpellByName,
  renderSpellName,
  onRemoveSpell,
}: CantripGroupProps) {
  const cantripItems = items.filter((item) => item.level === 0)

  return (
    <div
      className={cn(
        'rounded-lg border border-border/70 bg-card overflow-hidden',
        getColSpanClasses(span),
      )}
    >
      <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground border-b border-border/60 bg-accent/10">
        Cantrips
      </div>
      <div
        className={cn(
          'border-y border-border/60 divide-y divide-border/60',
          getInnerColumnClasses(span),
        )}
      >
        {cantripItems.map((item) => {
          const spell = getSpellByName(item.name)
          return (
            <div
              key={`${item.profileId}|${item.kind}|${item.name}`}
              className="px-4 py-2 flex items-center gap-3 break-inside-avoid hover:bg-muted/20 transition-colors"
            >
              <div className="min-w-0 flex-1">
                {renderSpellName({
                  item,
                  spell,
                  sourceContext: selectionSourceByProfileAndSpell.get(
                    `${item.profileId}|${item.name}`,
                  ),
                })}
              </div>
              {spell?.school ? (
                <span
                  className={cn(
                    'text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0',
                    getSchoolStyle(spell.school),
                  )}
                >
                  {getSchoolName(spell.school).slice(0, 3)}
                </span>
              ) : null}
              <div className="flex items-center gap-1.5 shrink-0">
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
                      <TooltipContent side="top" className="text-xs">
                        Swapped from {swap.removed} at level {swap.level}
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
        {cantripItems.length === 0 ? (
          <div className="px-4 py-2 text-sm text-muted-foreground/80 break-inside-avoid">
            No cantrips in this list.
          </div>
        ) : null}
      </div>
    </div>
  )
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

export interface PreparedCasterSpellItem {
  spell: Spell5e
  item: SpellListItem
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
  isLevelOnlyPreparedCaster?: boolean
  preparedSpellLimit?: number | null
  knownSpellLimit?: number | null
  cantripLimit?: number | null
}

interface SpellProfileManagerProps {
  spellProfiles: SpellProfileLike[]
  detailsByProfileId: Map<string, SpellcastingDetailLike>
  groupedItems: Map<string, SpellListItem[]>
  selectionSourceByProfileAndSpell: Map<string, string>
  preparedCasterItemsByProfile?: Map<string, PreparedCasterSpellItem[]>
  getSpellByName: (spellName: string) => Spell5e | undefined
  onTogglePrepared: (profileId: string, spellName: string) => void
  onRemoveSpell: (item: SpellListItem) => void
  onAddSpell?: (profileId: string) => void
  onOpenRacialChoice?: (profileId: string, choiceId: string) => void
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
  preparedCasterItemsByProfile,
  getSpellByName,
  onTogglePrepared,
  onRemoveSpell,
  onAddSpell,
  onOpenRacialChoice,
  renderSpellName,
}: SpellProfileManagerProps) {
  return (
    <Card className="w-full flex flex-col overflow-hidden">
      <div className="h-10 bg-gradient-to-r from-indigo-500/20 via-indigo-500/10 to-transparent border-b border-border/40 flex items-center px-4 flex-shrink-0">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-indigo-400" weight="duotone" />
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
            Spell List
          </span>
        </div>
      </div>
      <CardContent className="flex-1 p-0">
        {spellProfiles.length === 0 ? (
          <p className="px-6 text-sm text-muted-foreground text-center py-8">
            No spells assigned yet.
          </p>
        ) : (
          <Accordion
            type="multiple"
            defaultValue={spellProfiles.map((profile) => profile.id)}
            className="overflow-y-auto space-y-2 pb-2"
            style={{ maxHeight: getViewportBoundedMaxHeight(18) }}
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
              const isBonusProfile = profile.id === SPECIAL_SPELL_PROFILE_ID
              const unfulfilledChoices = (profile.choices ?? []).filter(
                (choice) => choice.selected.length < choice.count,
              )
              const hasUnfulfilledChoices = unfulfilledChoices.length > 0
              const totalUnchosenSpells = unfulfilledChoices.reduce(
                (sum, choice) => sum + (choice.count - choice.selected.length),
                0,
              )
              const firstUnfulfilledChoice = unfulfilledChoices[0]
              if (isRacial && items.length === 0 && !hasUnfulfilledChoices) return null
              const detail = detailsByProfileId.get(profile.id)

              // XPHB level-only casters (Sorcerer/Bard/Warlock 2024) behave like known casters — no toggle
              const isLevelOnly = profile.type === 'class' && !!detail?.isLevelOnlyPreparedCaster

              // True prepared casters show the full class spell list inline
              const isTruePrepared = profile.type === 'class' && !!detail?.isTruePreparedCaster
              const availableClassItems = isTruePrepared
                ? (preparedCasterItemsByProfile?.get(profile.id) ?? [])
                : []
              const availableClassSpells = availableClassItems.map(({ spell }) => spell)

              // For true prepared casters, prepared state lives in profile.preparedSpells
              // (not in items, since spellsKnown is empty for them).
              const preparedSet = isTruePrepared
                ? new Set(profile.preparedSpells ?? [])
                : new Set(items.filter((i) => i.kind === 'spell' && i.prepared).map((i) => i.name))
              const preparedCount = preparedSet.size
              const preparableSpells = isTruePrepared
                ? availableClassSpells
                : items.filter((item) => item.kind === 'spell' && !item.alwaysPrepared)
              const preparedTotal = detail?.isPreparedCaster
                ? (detail.preparedSpellLimit ?? preparableSpells.length)
                : preparableSpells.length
              const levels = [...new Set(items.map((item) => item.level))].sort((a, b) => a - b)
              const availLevels = isTruePrepared
                ? [...new Set(availableClassSpells.map((s) => s.level))].sort((a, b) => a - b)
                : []

              // Compute missing spells for class profiles
              const currentCantrips = items.filter((item) => item.kind === 'cantrip').length
              // Known-spell limits should track only choosable class spells; always-prepared
              // grants should not consume the "known" quota.
              const currentSpells = items.filter(
                (item) => item.kind === 'spell' && !item.alwaysPrepared,
              ).length
              const missingCantrips =
                detail?.cantripLimit != null
                  ? Math.max(0, detail.cantripLimit - currentCantrips)
                  : 0
              const missingSpells =
                !isRacial && !isTruePrepared && detail?.knownSpellLimit != null
                  ? Math.max(0, detail.knownSpellLimit - currentSpells)
                  : 0
              const hasMissingSpells = missingCantrips > 0 || missingSpells > 0
              const missingSummary = [
                missingCantrips > 0
                  ? `${missingCantrips} cantrip${missingCantrips !== 1 ? 's' : ''}`
                  : null,
                missingSpells > 0
                  ? `${missingSpells} spell${missingSpells !== 1 ? 's' : ''}`
                  : null,
              ]
                .filter(Boolean)
                .join(', ')
              const showDefaultEmptyState =
                items.length === 0 && availableClassSpells.length === 0 && !hasUnfulfilledChoices
              const isClassWithoutSpellcasting = profile.type === 'class' && !detail
              if (isClassWithoutSpellcasting) return null

              return (
                <AccordionItem
                  key={profile.id}
                  value={profile.id}
                  className="border-b border-border/30"
                >
                  <AccordionTrigger className="px-6 py-2.5 bg-muted/50 rounded-none hover:no-underline hover:bg-muted/70 transition-colors">
                    <div className="flex items-center gap-2 text-left w-full min-w-0">
                      <span className="font-medium text-sm">{profile.label}</span>
                      <div className="ml-auto flex items-center gap-2 pr-1">
                        {hasMissingSpells || hasUnfulfilledChoices ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge
                                variant="outline"
                                className="text-xs border-accent bg-accent text-accent-foreground"
                              >
                                <WarningCircle className="h-3.5 w-3.5 mr-1" weight="fill" />
                                Spell Selection Available
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
                              {hasUnfulfilledChoices ? (
                                <>
                                  <p>This racial spell list still has unselected spell choices.</p>
                                  <p className="mt-1">
                                    Remaining: {totalUnchosenSpells} unchosen spell
                                    {totalUnchosenSpells !== 1 ? 's' : ''}.
                                  </p>
                                  <div className="mt-2 space-y-1 text-muted-foreground">
                                    {unfulfilledChoices.map((choice) => {
                                      const remaining = choice.count - choice.selected.length
                                      const sourceHint = choice.filter?.classes
                                        ? `from ${choice.filter.classes.join(', ')} list`
                                        : choice.pool
                                          ? `from ${choice.pool.length} options`
                                          : ''
                                      return (
                                        <p key={choice.id}>
                                          Choose {choice.count}{' '}
                                          {choice.isCantrip ? 'cantrip' : 'spell'}
                                          {choice.count !== 1 ? 's' : ''}
                                          {sourceHint ? ` ${sourceHint}` : ''}
                                          {' — '}
                                          {remaining} remaining.
                                        </p>
                                      )
                                    })}
                                  </div>
                                </>
                              ) : (
                                <>
                                  <p>This class still has unselected spell choices.</p>
                                  <p className="mt-1">Remaining: {missingSummary}.</p>
                                  <p className="mt-1 text-muted-foreground">
                                    Pick the remaining spells from the Class page.
                                  </p>
                                </>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        ) : null}
                        {profile.alwaysPrepared ||
                        isLevelOnly ||
                        (profile.type === 'class' && detail && !detail.isPreparedCaster) ? (
                          <Badge variant="secondary" className="text-xs">
                            Always Prepared
                          </Badge>
                        ) : null}
                        {detail?.isPreparedCaster && !isLevelOnly ? (
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
                  <AccordionContent className="pb-1 border-t border-border/30 bg-muted/10">
                    {isBonusProfile && !showDefaultEmptyState ? (
                      <div className="px-5 py-2 bg-muted/10 flex items-center justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs px-2"
                          onClick={() => onAddSpell?.(profile.id)}
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" />
                          Add Spell
                        </Button>
                      </div>
                    ) : null}

                    {showDefaultEmptyState ? (
                      <div className="px-5 pb-3.5">
                        <div className="min-h-40 flex flex-col items-center justify-center text-center p-6">
                          <BookOpen
                            className="h-6 w-6 text-muted-foreground mb-2"
                            weight="duotone"
                          />
                          <h3 className="text-sm font-semibold">
                            {isClassWithoutSpellcasting
                              ? 'Spellcasting Not Available'
                              : 'No Spells Selected'}
                          </h3>
                          <p className="mt-1 text-xs text-muted-foreground max-w-sm">
                            {isBonusProfile
                              ? "Bonus spells are optional and do not count against your class's spell limits."
                              : isClassWithoutSpellcasting
                                ? 'This class does not currently grant spellcasting. If a subclass grants spellcasting, this section will update automatically.'
                                : hasMissingSpells
                                  ? 'Visit the Class page to select your spells.'
                                  : 'This spell list is currently empty.'}
                          </p>
                          {isBonusProfile ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs px-3 mt-4"
                              onClick={() => onAddSpell?.(profile.id)}
                            >
                              <Plus className="h-3.5 w-3.5 mr-1" />
                              Add Spell
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                    {isRacial &&
                    items.length === 0 &&
                    availableClassSpells.length === 0 &&
                    hasUnfulfilledChoices ? (
                      <div className="px-5 pb-3.5">
                        <div className="min-h-40 flex flex-col items-center justify-center text-center p-6">
                          <BookOpen
                            className="h-6 w-6 text-muted-foreground mb-2"
                            weight="duotone"
                          />
                          <h3 className="text-sm font-semibold">No Spells Selected</h3>
                          <p className="mt-1 text-xs text-muted-foreground max-w-sm">
                            Choose racial spells to populate this list.
                          </p>
                          {firstUnfulfilledChoice ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs px-3 mt-4"
                              onClick={() =>
                                onOpenRacialChoice?.(profile.id, firstUnfulfilledChoice.id)
                              }
                            >
                              <Plus className="h-3.5 w-3.5 mr-1" />
                              Choose Spell
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                    {/* True prepared casters: cantrips + full class spell list with prepare toggles */}
                    {isTruePrepared && (levels.includes(0) || availableClassSpells.length > 0)
                      ? (() => {
                          const totalGroups = (levels.includes(0) ? 1 : 0) + availLevels.length
                          let groupIndex = 0
                          return (
                            <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-3 px-6 py-3.5">
                              {levels.includes(0)
                                ? (() => {
                                    const cantripCount = items.filter((i) => i.level === 0).length
                                    const span = getSpanForGroup(
                                      groupIndex++,
                                      totalGroups,
                                      cantripCount,
                                    )
                                    return (
                                      <CantripGroup
                                        items={items}
                                        span={span}
                                        swappedByAddedName={swappedByAddedName}
                                        selectionSourceByProfileAndSpell={
                                          selectionSourceByProfileAndSpell
                                        }
                                        getSpellByName={getSpellByName}
                                        renderSpellName={renderSpellName}
                                        onRemoveSpell={onRemoveSpell}
                                      />
                                    )
                                  })()
                                : null}
                              {availLevels.map((spellLevel) => {
                                const itemsAtLevel = availableClassItems.filter(
                                  ({ spell }) => spell.level === spellLevel,
                                )
                                const span = getSpanForGroup(
                                  groupIndex++,
                                  totalGroups,
                                  itemsAtLevel.length,
                                )
                                return (
                                  <div
                                    key={`${profile.id}|avail|${spellLevel}`}
                                    className={cn(
                                      'rounded-lg border border-border/70 bg-card overflow-hidden',
                                      getColSpanClasses(span),
                                    )}
                                  >
                                    <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground border-b border-border/60 bg-accent/10">
                                      {formatSpellLevel(spellLevel)}s
                                    </div>
                                    <div
                                      className={cn(
                                        'border-y border-border/60 divide-y divide-border/60',
                                        getInnerColumnClasses(span),
                                      )}
                                    >
                                      {itemsAtLevel.map(({ spell, item }) => {
                                        const isPrepared = preparedSet.has(item.name)
                                        const atLimit =
                                          !isPrepared &&
                                          preparedTotal > 0 &&
                                          preparedCount >= preparedTotal
                                        return (
                                          <div
                                            key={`${profile.id}|avail|${spell.name}|${spell.source ?? ''}`}
                                            className={cn(
                                              'px-4 py-2 flex items-center gap-3 break-inside-avoid transition-colors',
                                              isPrepared ? 'bg-accent/10' : 'hover:bg-muted/20',
                                            )}
                                          >
                                            <div className="min-w-0 flex-1">
                                              {renderSpellName({ item, spell })}
                                            </div>
                                            {spell.school ? (
                                              <span
                                                className={cn(
                                                  'text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0',
                                                  getSchoolStyle(spell.school),
                                                )}
                                              >
                                                {getSchoolName(spell.school).slice(0, 3)}
                                              </span>
                                            ) : null}
                                            <button
                                              type="button"
                                              data-spell-prepare-toggle="true"
                                              disabled={atLimit}
                                              onClick={() =>
                                                onTogglePrepared(profile.id, item.name)
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
                                      {itemsAtLevel.length === 0 ? (
                                        <div className="px-4 py-2 text-sm text-muted-foreground/80 break-inside-avoid">
                                          No spells in this level.
                                        </div>
                                      ) : null}
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
                            <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-3 px-6 py-3.5">
                              {levels.includes(0)
                                ? (() => {
                                    const cantripCount = items.filter((i) => i.level === 0).length
                                    const span = getSpanForGroup(
                                      groupIndex++,
                                      totalGroups,
                                      cantripCount,
                                    )
                                    return (
                                      <CantripGroup
                                        items={items}
                                        span={span}
                                        swappedByAddedName={swappedByAddedName}
                                        selectionSourceByProfileAndSpell={
                                          selectionSourceByProfileAndSpell
                                        }
                                        getSpellByName={getSpellByName}
                                        renderSpellName={renderSpellName}
                                        onRemoveSpell={onRemoveSpell}
                                      />
                                    )
                                  })()
                                : null}
                              {levels
                                .filter((level) => level > 0)
                                .map((level) => {
                                  const levelItems = items.filter((item) => item.level === level)
                                  const span = getSpanForGroup(
                                    groupIndex++,
                                    totalGroups,
                                    levelItems.length,
                                  )
                                  return (
                                    <div
                                      key={`${profile.id}|level|${level}`}
                                      className={cn(
                                        'rounded-lg border border-border/70 bg-card overflow-hidden',
                                        getColSpanClasses(span),
                                      )}
                                    >
                                      <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground border-b border-border/60 bg-accent/10">
                                        {formatSpellLevel(level)}s
                                      </div>
                                      <div
                                        className={cn(
                                          'border-y border-border/60 divide-y divide-border/60',
                                          getInnerColumnClasses(span),
                                        )}
                                      >
                                        {levelItems.map((item) => {
                                          const canPrepare =
                                            !isRacial &&
                                            !isLevelOnly &&
                                            item.kind === 'spell' &&
                                            !item.alwaysPrepared &&
                                            !!item.isPreparedCaster
                                          const spell = getSpellByName(item.name)
                                          return (
                                            <div
                                              key={`${item.profileId}|${item.kind}|${item.name}`}
                                              className="px-4 py-2 flex items-center gap-3 break-inside-avoid hover:bg-muted/20 transition-colors"
                                            >
                                              <div className="min-w-0 flex-1">
                                                {renderSpellName({
                                                  item,
                                                  spell,
                                                  sourceContext:
                                                    selectionSourceByProfileAndSpell.get(
                                                      `${item.profileId}|${item.name}`,
                                                    ),
                                                })}
                                              </div>
                                              {spell?.school ? (
                                                <span
                                                  className={cn(
                                                    'text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0',
                                                    getSchoolStyle(spell.school),
                                                  )}
                                                >
                                                  {getSchoolName(spell.school).slice(0, 3)}
                                                </span>
                                              ) : null}
                                              <div className="flex items-center gap-1.5 shrink-0">
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
                                                {canPrepare ? (
                                                  <button
                                                    type="button"
                                                    data-spell-prepare-toggle="true"
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
                                        {levelItems.length === 0 ? (
                                          <div className="px-4 py-2 text-sm text-muted-foreground/80 break-inside-avoid">
                                            No spells in this level.
                                          </div>
                                        ) : null}
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
  )
}
