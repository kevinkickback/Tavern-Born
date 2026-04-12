import { BookOpen, Check, Lock, Plus, Trash } from '@phosphor-icons/react'
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
import { formatSpellLevel } from '@/lib/calculations/spellUtils'
import { cn } from '@/lib/utils'
import type { Spell5e } from '@/types/5etools'
import type { RaceSpellChoice } from '@/types/character'

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
}

interface SpellcastingDetailLike {
  profileId: string
  isPreparedCaster?: boolean
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
  activeProfileId: string
  onActiveProfileChange: (profileId: string) => void
  activeProfile: SpellProfileLike | null
  spellModalOpen: boolean
  onSpellModalOpenChange: (open: boolean) => void
  modalConfig: SpellModalConfigLike | null
  allSpells: Spell5e[]
  getSpellByName: (spellName: string) => Spell5e | undefined
  onOpenModal: () => void
  onTogglePrepared: (profileId: string, spellName: string) => void
  onRemoveSpell: (item: SpellListItem) => void
  onConfirmSpells: (names: string[]) => void
  onSelectRacialSpell?: (profileId: string, choiceId: string, spellName: string) => void
  onRemoveRacialSpell?: (profileId: string, choiceId: string, spellName: string) => void
  onSetRacialCastingAbility?: (profileId: string, ability: string) => void
  racialChoiceModalOpen?: boolean
  onRacialChoiceModalOpenChange?: (open: boolean) => void
  racialChoiceModalConfig?: SpellModalConfigLike | null
  onConfirmRacialChoice?: (names: string[]) => void
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
  activeProfileId,
  onActiveProfileChange,
  activeProfile,
  spellModalOpen,
  onSpellModalOpenChange,
  modalConfig,
  allSpells,
  getSpellByName,
  onOpenModal,
  onTogglePrepared,
  onRemoveSpell,
  onConfirmSpells,
  onSetRacialCastingAbility,
  racialChoiceModalOpen,
  onRacialChoiceModalOpenChange,
  racialChoiceModalConfig,
  onConfirmRacialChoice,
  renderSpellName,
}: SpellProfileManagerProps) {
  return (
    <>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <BookOpen className="h-6 w-6 text-accent" weight="duotone" />
          Spells
        </h1>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-[320px]">
            <span className="text-xs text-muted-foreground min-w-[56px] shrink-0">Add to:</span>
            <Select
              value={activeProfileId || activeProfile?.id || ''}
              onValueChange={onActiveProfileChange}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose profile" />
              </SelectTrigger>
              <SelectContent>
                {spellProfiles.map((profile) => (
                  <SelectItem key={profile.id} value={profile.id}>
                    {profile.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            size="sm"
            className="bg-accent text-accent-foreground hover:bg-accent/90"
            onClick={onOpenModal}
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Add Spells
          </Button>
        </div>
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
              className="space-y-3 max-h-[620px] overflow-y-auto pr-1"
            >
              {spellProfiles.map((profile) => {
                const items = groupedItems.get(profile.id) ?? []
                const isRacial = profile.type === 'racial'
                const hasUnfulfilledChoices = profile.choices?.some(
                  (c) => c.selected.length < c.count,
                )
                if (profile.type === 'special' && items.length === 0) return null
                if (isRacial && items.length === 0 && !hasUnfulfilledChoices) return null
                const detail = detailsByProfileId.get(profile.id)

                const preparedCount = items.filter(
                  (item) => item.kind === 'spell' && !item.alwaysPrepared && item.prepared,
                ).length
                const preparableSpells = items.filter(
                  (item) => item.kind === 'spell' && !item.alwaysPrepared,
                )
                const preparedTotal = detail?.isPreparedCaster
                  ? (detail.knownSpellLimit ?? preparableSpells.length)
                  : preparableSpells.length
                const levels = [...new Set(items.map((item) => item.level))].sort((a, b) => a - b)

                // Compute missing spells for class profiles
                const currentCantrips = items.filter((item) => item.kind === 'cantrip').length
                const currentSpells = items.filter((item) => item.kind === 'spell').length
                const missingCantrips =
                  detail?.cantripLimit != null
                    ? Math.max(0, detail.cantripLimit - currentCantrips)
                    : 0
                const missingSpells =
                  !isRacial && detail?.knownSpellLimit != null
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
                            remaining to choose. Use Add Spells to select.
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
                                <span className="text-xs text-accent-foreground/80">
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
                              </div>
                            ))
                        : null}

                      {items.length === 0 && !hasMissingSpells && !hasUnfulfilledChoices ? (
                        <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                          No spells selected yet.
                        </div>
                      ) : null}

                      <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-px bg-border/60">
                        {levels.map((level) => {
                          const levelItems = items.filter((item) => item.level === level)
                          return (
                            <div key={`${profile.id}|level|${level}`} className="bg-card">
                              <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground bg-muted/15 border-b border-border/60">
                                {level === 0 ? 'Cantrips' : `${formatSpellLevel(level)}s`}
                              </div>
                              <div className="divide-y divide-border/60">
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
                                      className="px-3 py-2 flex items-center justify-between gap-3"
                                    >
                                      <div className="min-w-0">
                                        {renderSpellName({
                                          item,
                                          spell,
                                          sourceContext: selectionSourceByProfileAndSpell.get(
                                            `${item.profileId}|${item.name}`,
                                          ),
                                        })}
                                      </div>
                                      <div className="flex items-center gap-2">
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
                                            title={item.prepared ? 'Prepared' : 'Not prepared'}
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
                    </AccordionContent>
                  </AccordionItem>
                )
              })}
            </Accordion>
          )}
        </CardContent>
      </Card>

      {activeProfile && modalConfig ? (
        <SpellSelectionModal
          open={spellModalOpen}
          onOpenChange={onSpellModalOpenChange}
          title={modalConfig.title}
          spells={allSpells}
          initialSelectedNames={modalConfig.initialSelectedNames}
          lockedNames={modalConfig.lockedNames}
          className={modalConfig.className}
          classSource={modalConfig.classSource}
          classListOverrides={modalConfig.classListOverrides}
          allowedLevels={modalConfig.allowedLevels}
          initialFilters={modalConfig.initialFilters}
          categories={
            modalConfig.categories && modalConfig.categories.length > 0
              ? modalConfig.categories
              : undefined
          }
          onConfirm={onConfirmSpells}
        />
      ) : null}

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
        />
      ) : null}
    </>
  )
}
