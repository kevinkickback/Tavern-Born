import { ArrowsLeftRight, BookOpen, Lock, Plus, Trash, WarningCircle } from '@phosphor-icons/react'
import { memo, type ReactNode, useEffect, useMemo, useState } from 'react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useRouteFocusTarget } from '@/hooks/ui/useRouteFocusTarget'
import {
  buildSpellProfileDisplayModels,
  type PreparedCasterSpellItem,
  type SpellcastingDetailLike,
  type SpellListItem,
  type SpellProfileLike,
} from '@/lib/calculations/spellProfileDisplayModel'
import {
  formatSpellDisplayName,
  formatSpellLevel,
  getSchoolName,
} from '@/lib/calculations/spellUtils'
import { normalizeKey } from '@/lib/provenance/normalization'
import { cn } from '@/lib/utils'
import type { Spell5e } from '@/types/5etools'

export type {
  PreparedCasterSpellItem,
  SpellListItem,
} from '@/lib/calculations/spellProfileDisplayModel'

const SCHOOL_STYLES: Record<string, string> = {
  A: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  C: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  D: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
  E: 'bg-pink-500/10 text-pink-600 dark:text-pink-400',
  V: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  I: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  N: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  T: 'bg-teal-500/10 text-teal-600 dark:text-teal-400',
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
  const xlCols = span.xlSpan >= 2 ? 'xl:grid-cols-2' : 'xl:grid-cols-1'
  const xxlCols =
    span.xxlSpan >= 3
      ? '2xl:grid-cols-3'
      : span.xxlSpan >= 2
        ? '2xl:grid-cols-2'
        : '2xl:grid-cols-1'
  return `grid grid-cols-1 gap-px sm:grid-cols-2 ${xlCols} ${xxlCols}`
}

interface SpellLevelGroupProps {
  title: string
  span: { xlSpan: number; xxlSpan: number }
  children: ReactNode
}

const SpellLevelGroup = memo(function SpellLevelGroup({
  title,
  span,
  children,
}: SpellLevelGroupProps) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-md border border-border bg-surface-raised/35',
        getColSpanClasses(span),
      )}
    >
      <div className="flex h-10 items-center border-b border-border bg-surface-raised px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      <div className={getInnerColumnClasses(span)}>{children}</div>
    </div>
  )
})

interface SpellRowProps {
  item: SpellListItem
  spell?: Spell5e
  sourceContext?: string
  swap?: { removed: string; level: number }
  selected?: boolean
  preparation?: {
    prepared: boolean
    disabled?: boolean
    title: string
    onToggle: () => void
  }
  removable?: boolean
  getSpellByName: (spellName: string) => Spell5e | undefined
  onRemoveSpell: (item: SpellListItem) => void
  renderSpellName: SpellProfileManagerProps['renderSpellName']
}

const SpellRow = memo(function SpellRow({
  item,
  spell,
  sourceContext,
  swap,
  selected = false,
  preparation,
  removable = false,
  getSpellByName,
  onRemoveSpell,
  renderSpellName,
}: SpellRowProps) {
  return (
    <div
      className={cn(
        'flex min-h-11 min-w-0 break-inside-avoid items-center gap-3 px-3 py-2.5 text-sm ring-1 ring-inset ring-border/75 transition-colors',
        selected ? 'bg-primary/10 hover:bg-primary/15' : 'bg-workspace-pane hover:bg-surface-hover',
      )}
    >
      <div className="min-w-0 flex-1">{renderSpellName({ item, spell, sourceContext })}</div>
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
      <div className="flex shrink-0 items-center gap-1.5">
        {swap ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border/60 text-muted-foreground">
                <ArrowsLeftRight className="h-3.5 w-3.5" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              Swapped from{' '}
              {formatSpellDisplayName(swap.removed, getSpellByName(swap.removed)?.name)} at level{' '}
              {swap.level}
            </TooltipContent>
          </Tooltip>
        ) : null}
        {preparation ? (
          <button
            type="button"
            data-spell-prepare-toggle="true"
            disabled={preparation.disabled}
            onClick={(event) => {
              event.stopPropagation()
              preparation.onToggle()
            }}
            className={cn(
              'flex size-8 flex-shrink-0 items-center justify-center rounded-md transition-colors',
              preparation.disabled
                ? 'cursor-not-allowed'
                : 'cursor-pointer hover:bg-workspace-row-hover',
            )}
            title={preparation.title}
          >
            <span
              className={cn(
                'size-4 rounded-full border-2 transition-colors',
                preparation.prepared
                  ? 'border-accent bg-accent'
                  : preparation.disabled
                    ? 'border-muted-foreground/30'
                    : 'border-muted-foreground',
              )}
            />
          </button>
        ) : null}
        {item.isFixed ? (
          <Lock
            className="h-3.5 w-3.5 text-muted-foreground/50"
            aria-label="Granted spell — cannot be removed"
          />
        ) : removable ? (
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Remove ${item.name}`}
            className="size-9 cursor-pointer p-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            onClick={(event) => {
              event.stopPropagation()
              onRemoveSpell(item)
            }}
          >
            <Trash className="h-3.5 w-3.5" />
          </Button>
        ) : null}
      </div>
    </div>
  )
})

interface KnownSpellLevelGroupProps {
  title: string
  items: SpellListItem[]
  span: { xlSpan: number; xxlSpan: number }
  swappedByAddedName: Map<string, { removed: string; level: number }>
  selectionSourceByProfileAndSpell: Map<string, string>
  canPrepare?: (item: SpellListItem) => boolean
  getSpellByName: (spellName: string) => Spell5e | undefined
  onTogglePrepared: (profileId: string, spellName: string) => void
  onRemoveSpell: (item: SpellListItem) => void
  renderSpellName: SpellProfileManagerProps['renderSpellName']
}

const KnownSpellLevelGroup = memo(function KnownSpellLevelGroup({
  title,
  items,
  span,
  swappedByAddedName,
  selectionSourceByProfileAndSpell,
  canPrepare,
  getSpellByName,
  onTogglePrepared,
  onRemoveSpell,
  renderSpellName,
}: KnownSpellLevelGroupProps) {
  return (
    <SpellLevelGroup title={title} span={span}>
      {items.map((item) => {
        const spell = getSpellByName(item.name)
        const sourceContext = selectionSourceByProfileAndSpell.get(`${item.profileId}|${item.name}`)
        const showPreparation = canPrepare?.(item) ?? false
        return (
          <SpellRow
            key={`${item.profileId}|${item.kind}|${item.name}`}
            item={item}
            spell={spell}
            sourceContext={sourceContext}
            swap={swappedByAddedName.get(item.name)}
            preparation={
              showPreparation
                ? {
                    prepared: item.prepared,
                    title: item.prepared ? 'Prepared' : 'Not prepared',
                    onToggle: () => onTogglePrepared(item.profileId, item.name),
                  }
                : undefined
            }
            removable
            getSpellByName={getSpellByName}
            onRemoveSpell={onRemoveSpell}
            renderSpellName={renderSpellName}
          />
        )
      })}
      {items.length === 0 ? (
        <div className="px-4 py-2 text-sm text-muted-foreground/80 break-inside-avoid">
          No spells in this level.
        </div>
      ) : null}
    </SpellLevelGroup>
  )
})

interface SpellProfileManagerProps {
  spellProfiles: SpellProfileLike[]
  focusProfileId?: string
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

export const SpellProfileManager = memo(function SpellProfileManager({
  spellProfiles,
  focusProfileId,
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
  const [openProfiles, setOpenProfiles] = useState(() => spellProfiles.map((profile) => profile.id))
  const { ref: focusedProfileRef, highlighted: focusedProfileHighlighted } =
    useRouteFocusTarget<HTMLDivElement>(!!focusProfileId)

  useEffect(() => {
    if (!focusProfileId) return
    setOpenProfiles((current) =>
      current.includes(focusProfileId) ? current : [...current, focusProfileId],
    )
  }, [focusProfileId])
  const displayModels = useMemo(
    () =>
      buildSpellProfileDisplayModels({
        spellProfiles,
        detailsByProfileId,
        groupedItems,
        preparedCasterItemsByProfile,
      }),
    [spellProfiles, detailsByProfileId, groupedItems, preparedCasterItemsByProfile],
  )

  return (
    <div className="w-full">
      {spellProfiles.length === 0 ? (
        <p className="px-6 text-sm text-muted-foreground text-center py-8">
          No spells assigned yet.
        </p>
      ) : (
        <Accordion
          type="multiple"
          value={openProfiles}
          onValueChange={setOpenProfiles}
          className="space-y-6"
        >
          {displayModels.map((model) => {
            const {
              profile,
              items,
              swappedByAddedName,
              isRacial,
              isBonusProfile,
              unfulfilledChoices,
              hasUnfulfilledChoices,
              totalUnchosenSpells,
              firstUnfulfilledChoice,
              detail,
              isLevelOnly,
              isTruePrepared,
              availableClassItems,
              availableClassSpells,
              preparedSet,
              preparedCount,
              preparedTotal,
              levels,
              availableLevels: availLevels,
              displayedTotal,
              hasMissingSpells,
              missingSummary,
              showDefaultEmptyState,
            } = model

            return (
              <AccordionItem
                key={profile.id}
                value={profile.id}
                ref={profile.id === focusProfileId ? focusedProfileRef : undefined}
                className={cn(
                  'border-0 bg-transparent last:border-b-0',
                  profile.id === focusProfileId &&
                    focusedProfileHighlighted &&
                    'animate-route-focus',
                )}
              >
                <AccordionTrigger className="min-h-11 cursor-pointer rounded-none border-b border-border bg-transparent px-1 py-2.5 transition-colors hover:bg-surface-hover/35 hover:no-underline">
                  <div className="flex items-center gap-2 text-left w-full min-w-0">
                    <span className="font-medium text-sm">{profile.label}</span>
                    <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5 pr-1">
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
                        <Badge variant="outline" className="text-xs">
                          Always Prepared
                        </Badge>
                      ) : null}
                      {detail?.isPreparedCaster && !isLevelOnly ? (
                        <Badge variant="outline" className="text-xs">
                          Prepared: {preparedCount}/{preparedTotal}
                        </Badge>
                      ) : null}
                      <Badge variant="outline" className="text-xs">
                        Total: {displayedTotal}
                      </Badge>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="bg-transparent pb-0">
                  {isBonusProfile && !showDefaultEmptyState ? (
                    <div className="flex items-center justify-end pt-3">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 cursor-pointer px-3 text-xs"
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
                        <BookOpen className="h-6 w-6 text-muted-foreground mb-2" weight="duotone" />
                        <h3 className="text-sm font-semibold">No Spells Selected</h3>
                        <p className="mt-1 text-xs text-muted-foreground max-w-sm">
                          {isBonusProfile
                            ? "Bonus spells are optional and do not count against your class's spell limits."
                            : hasMissingSpells
                              ? 'Visit the Class page to select your spells.'
                              : 'This spell list is currently empty.'}
                        </p>
                        {isBonusProfile ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="mt-4 h-8 cursor-pointer px-3 text-xs"
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
                        <BookOpen className="h-6 w-6 text-muted-foreground mb-2" weight="duotone" />
                        <h3 className="text-sm font-semibold">No Spells Selected</h3>
                        <p className="mt-1 text-xs text-muted-foreground max-w-sm">
                          Choose racial spells to populate this list.
                        </p>
                        {firstUnfulfilledChoice ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="mt-4 h-8 cursor-pointer px-3 text-xs"
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
                  {isTruePrepared && (levels.includes(0) || availableClassSpells.length > 0)
                    ? (() => {
                        const totalGroups = (levels.includes(0) ? 1 : 0) + availLevels.length
                        let groupIndex = 0
                        return (
                          <div className="grid grid-cols-1 gap-3 pt-3 xl:grid-cols-2 2xl:grid-cols-3">
                            {levels.includes(0)
                              ? (() => {
                                  const cantripCount = items.filter((i) => i.level === 0).length
                                  const span = getSpanForGroup(
                                    groupIndex++,
                                    totalGroups,
                                    cantripCount,
                                  )
                                  return (
                                    <KnownSpellLevelGroup
                                      title="Cantrips"
                                      items={items.filter((item) => item.level === 0)}
                                      span={span}
                                      swappedByAddedName={swappedByAddedName}
                                      selectionSourceByProfileAndSpell={
                                        selectionSourceByProfileAndSpell
                                      }
                                      getSpellByName={getSpellByName}
                                      renderSpellName={renderSpellName}
                                      onTogglePrepared={onTogglePrepared}
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
                                <SpellLevelGroup
                                  key={`${profile.id}|avail|${spellLevel}`}
                                  title={`${formatSpellLevel(spellLevel)}s`}
                                  span={span}
                                >
                                  {itemsAtLevel.map(({ spell, item }) => {
                                    const isAlwaysPrepared = !!item.alwaysPrepared
                                    const isPrepared =
                                      isAlwaysPrepared || preparedSet.has(normalizeKey(item.name))
                                    const atLimit =
                                      !isAlwaysPrepared &&
                                      !isPrepared &&
                                      preparedTotal > 0 &&
                                      preparedCount >= preparedTotal
                                    const sourceContext = selectionSourceByProfileAndSpell.get(
                                      `${item.profileId}|${item.name}`,
                                    )
                                    return (
                                      <SpellRow
                                        key={`${profile.id}|avail|${spell.name}|${spell.source ?? ''}`}
                                        item={item}
                                        spell={spell}
                                        sourceContext={sourceContext}
                                        selected={isPrepared}
                                        preparation={
                                          isAlwaysPrepared
                                            ? undefined
                                            : {
                                                prepared: isPrepared,
                                                disabled: atLimit,
                                                title: isPrepared
                                                  ? 'Prepared — click to unprepare'
                                                  : atLimit
                                                    ? `Prepare limit reached (${preparedCount}/${preparedTotal})`
                                                    : 'Not prepared — click to prepare',
                                                onToggle: () =>
                                                  onTogglePrepared(profile.id, item.name),
                                              }
                                        }
                                        getSpellByName={getSpellByName}
                                        onRemoveSpell={onRemoveSpell}
                                        renderSpellName={renderSpellName}
                                      />
                                    )
                                  })}
                                </SpellLevelGroup>
                              )
                            })}
                          </div>
                        )
                      })()
                    : null}

                  {!isTruePrepared
                    ? (() => {
                        const totalGroups = levels.length
                        let groupIndex = 0
                        return (
                          <div className="grid grid-cols-1 gap-3 pt-3 xl:grid-cols-2 2xl:grid-cols-3">
                            {levels.includes(0)
                              ? (() => {
                                  const cantripCount = items.filter((i) => i.level === 0).length
                                  const span = getSpanForGroup(
                                    groupIndex++,
                                    totalGroups,
                                    cantripCount,
                                  )
                                  return (
                                    <KnownSpellLevelGroup
                                      title="Cantrips"
                                      items={items.filter((item) => item.level === 0)}
                                      span={span}
                                      swappedByAddedName={swappedByAddedName}
                                      selectionSourceByProfileAndSpell={
                                        selectionSourceByProfileAndSpell
                                      }
                                      getSpellByName={getSpellByName}
                                      renderSpellName={renderSpellName}
                                      onTogglePrepared={onTogglePrepared}
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
                                  <KnownSpellLevelGroup
                                    key={`${profile.id}|level|${level}`}
                                    title={`${formatSpellLevel(level)}s`}
                                    items={levelItems}
                                    span={span}
                                    swappedByAddedName={swappedByAddedName}
                                    selectionSourceByProfileAndSpell={
                                      selectionSourceByProfileAndSpell
                                    }
                                    canPrepare={(item) =>
                                      !isRacial &&
                                      !isLevelOnly &&
                                      item.kind === 'spell' &&
                                      !item.alwaysPrepared &&
                                      !!item.isPreparedCaster
                                    }
                                    getSpellByName={getSpellByName}
                                    onTogglePrepared={onTogglePrepared}
                                    onRemoveSpell={onRemoveSpell}
                                    renderSpellName={renderSpellName}
                                  />
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
    </div>
  )
})
