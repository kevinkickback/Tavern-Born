import {
  ArrowRight,
  Heart,
  Lightning,
  Minus,
  Plus,
  Scroll,
  Shield,
  SlidersHorizontal,
  Sword,
  Users,
} from '@phosphor-icons/react'
import { useId, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ClassToAddSelect } from '@/components/character/ClassToAddSelect'
import { ArmorClassModal } from '@/components/modals/ArmorClassModal'
import { HitPointsModal } from '@/components/modals/HitPointsModal'
import { MovementModal } from '@/components/modals/MovementModal'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useCharacterCalculationContext } from '@/hooks/character/useCharacterCalculationContext'
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData'
import { resolveClassProgressionRules } from '@/lib/5etools/classData'
import { findClassReference } from '@/lib/5etools/classReference'
import { getPsionicKey } from '@/lib/5etools/psionics'
import {
  checkMulticlassRequirements,
  getAbilityModifier,
  getHitDiceFromClass,
  MAX_CHARACTER_LEVEL,
} from '@/lib/calculations/gameRules'
import { hasCurrentCharacterSourceContext } from '@/lib/character/characterSourceContext'
import { advanceClassLevel } from '@/lib/character/commands/advanceClassLevel'
import {
  applyLevelDown,
  applyLevelUp,
  type LevelUpHitPointChoice,
} from '@/lib/character/commands/classCommands'
import { applyCharacterCommandResult } from '@/lib/character/commands/featCommandSupport'
import {
  getMysticDisciplineReplacementOptions,
  getMysticDisciplineSlotKey,
} from '@/lib/character/mysticDisciplineReplacement'
import { sameStartingReference } from '@/lib/character/startingEquipmentGrants'
import {
  getCharacterClassEntries,
  getEffectiveMaxHP,
  getMaxHitPointsOverride,
  getTotalCharacterLevel,
} from '@/lib/characterUtils'
import { getClassIconUrl } from '@/lib/classIcons'
import { normalizeKey } from '@/lib/provenance/normalization'
import { isHintDismissed, setHintDismissed } from '@/lib/storage/hints'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Class5e } from '@/types/5etools'
import type { CharacterClassEntry, MysticDisciplineReplacement } from '@/types/character'

type PendingLevelUp = {
  className: string
  classSource: string
  classLevel: number
  hitDie: number
} & ({ kind: 'existing' } | { kind: 'multiclass' })

type PendingDisciplineLevelUp = Extract<PendingLevelUp, { kind: 'existing' }>

const getClassOptionKey = (cls: Pick<Class5e, 'name' | 'source'>) =>
  `${cls.name}|${cls.source ?? ''}`
const EMPTY_CLASSES: Class5e[] = []
const REMOVE_LEVEL_CONFIRMATION = 'quick-actions-remove-level'

const CLASS_PREVIEW_LIMIT = 3
const TAB_BODY_CLASS = 'overview-adjustment-tab'

export function ManualAdjustments() {
  const character = useCharacterStore((s) => s.activeCharacter)
  const calculationContext = useCharacterCalculationContext(character)
  const updateCharacter = useCharacterStore((s) => s.updateCharacter)
  const filtered = useFilteredGameData()
  const { classes } = filtered
  const sourceData = useGameDataStore((state) => state.gameData)
  const rawClasses = sourceData?.classes ?? EMPTY_CLASSES
  const allClasses = rawClasses.length > 0 ? rawClasses : classes

  const [tab, setTab] = useState('levels')
  const [ignoreRestrictions, setIgnoreRestrictions] = useState(false)
  const [multiclassSelection, setMulticlassSelection] = useState('')
  const [openStat, setOpenStat] = useState<'hp' | 'ac' | 'movement' | null>(null)
  const [removalTarget, setRemovalTarget] = useState<CharacterClassEntry | null>(null)
  const [pendingLevelUp, setPendingLevelUp] = useState<PendingDisciplineLevelUp | null>(null)
  const [skipConfirmation, setSkipConfirmation] = useState(false)
  const [disciplineFrom, setDisciplineFrom] = useState('')
  const [disciplineTo, setDisciplineTo] = useState('')
  const heading = useRef<HTMLHeadingElement>(null)
  const fullListHeading = useRef<HTMLHeadingElement>(null)
  const dialogOpener = useRef<HTMLButtonElement>(null)
  const ignoreRestrictionsId = useId()
  const skipConfirmationId = useId()

  if (!character || !calculationContext) return null

  const focusLevelControl = (opener: HTMLButtonElement | null) => {
    if (opener?.isConnected && !opener.disabled) opener.focus()
    else (fullListHeading.current ?? heading.current)?.focus()
  }

  const restoreDialogFocus = (event: Event) => {
    event.preventDefault()
    focusLevelControl(dialogOpener.current)
  }

  const effectiveAbilityScores = calculationContext.abilityScores.total

  const classProgression: CharacterClassEntry[] = getCharacterClassEntries(character)
  const classLabel = (entry: CharacterClassEntry) =>
    classProgression.some(
      (other) => other !== entry && normalizeKey(other.name) === normalizeKey(entry.name),
    )
      ? `${entry.name} (${entry.source || 'Unknown source'})`
      : entry.name

  const totalLevel = getTotalCharacterLevel(character)
  const isAtCap = totalLevel >= MAX_CHARACTER_LEVEL
  const canRemove = (entry: CharacterClassEntry) =>
    totalLevel > 1 &&
    (entry.levels > 1 ||
      !sameStartingReference(entry, character.initialClass ?? classProgression[0]))
  const commitProgression = (draft: typeof character) => {
    const current = useCharacterStore.getState().activeCharacter
    if (
      current !== character ||
      !hasCurrentCharacterSourceContext(
        current,
        character,
        useGameDataStore.getState().gameData,
        sourceData,
      )
    ) {
      throw new RangeError('The character or source rules changed. Try the action again.')
    }
    updateCharacter(character.id, draft)
    if (useCharacterStore.getState().activeCharacter === character) {
      throw new RangeError('The level changes could not be applied.')
    }
  }

  const seenClassKeys = new Set<string>()
  const multiclassOptions = (classes as Class5e[])
    .filter((cls) => {
      if (cls.isSidekick) return false
      const key = getClassOptionKey(cls)
      if (seenClassKeys.has(key)) return false
      seenClassKeys.add(key)
      return true
    })
    .map((cls) => {
      const { meetsRequirements, requirementText } = checkMulticlassRequirements(
        cls,
        effectiveAbilityScores,
      )
      return {
        cls,
        meetsRequirements,
        requirementText,
        already: !!findClassReference(cls, classProgression),
      }
    })
  const multiclassOptionByKey = new Map(
    multiclassOptions.map((option) => [getClassOptionKey(option.cls), option.cls]),
  )

  const findClass = (name: string, source?: string) => {
    return (
      findClassReference({ name, source }, classes) ??
      findClassReference({ name, source }, allClasses)
    )
  }

  const resolvePendingClass = (pending: PendingLevelUp, liveClasses = allClasses) => {
    const selected = classProgression.find(
      (entry) => entry.name === pending.className && entry.source === pending.classSource,
    )
    return resolveClassProgressionRules(
      selected ?? { name: pending.className, source: pending.classSource },
      liveClasses,
    )
  }
  const commitLevelUp = (
    pending: PendingLevelUp,
    hpChoice: LevelUpHitPointChoice,
    replacement?: Omit<MysticDisciplineReplacement, 'classLevel'>,
  ) => {
    if (
      !resolvePendingClass(pending, useGameDataStore.getState().gameData?.classes ?? allClasses)
    ) {
      toast.error('Restore the current class and subclass rules before adding a level.')
      return
    }
    if (pending.kind === 'existing') {
      const targetIndex = classProgression.findIndex(
        (entry) => entry.name === pending.className && entry.source === pending.classSource,
      )
      if (targetIndex < 0) {
        toast.error('Could not find the class to level up.')
        return
      }
      const newProgression = classProgression.map((entry, index) =>
        index === targetIndex ? { ...entry, levels: pending.classLevel } : entry,
      )
      let result: ReturnType<typeof applyLevelUp>
      try {
        if (useCharacterStore.getState().activeCharacter !== character)
          throw new RangeError('The character changed. Review the level before confirming.')
        if (
          replacement &&
          !hasCurrentCharacterSourceContext(
            useCharacterStore.getState().activeCharacter,
            character,
            useGameDataStore.getState().gameData,
            sourceData,
          )
        )
          throw new RangeError(
            'The discipline source changed. Review the choices before confirming.',
          )
        result = applyLevelUp(
          character,
          character.provenance,
          newProgression,
          hpChoice,
          calculationContext,
          replacement,
        )
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not add the level.')
        return
      }
      updateCharacter(character.id, {
        ...result.characterPatch,
        provenance: result.provenanceUpdate,
      })
      toast.success(`${pending.className} is now level ${pending.classLevel}.`)
      return true
    }

    const selectedClass = findClass(pending.className, pending.classSource)
    if (!selectedClass) return false
    try {
      const result = advanceClassLevel(character, selectedClass, hpChoice, calculationContext)
      commitProgression(applyCharacterCommandResult(character, result))
      toast.success(`Added ${pending.className} (level 1).`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add the class.')
      return false
    }

    setMulticlassSelection('')
    return true
  }

  const replacementOptions = (pending: PendingDisciplineLevelUp) =>
    getMysticDisciplineReplacementOptions(
      character,
      calculationContext.classChoices.catalogs,
      pending.className,
      pending.classSource,
      pending.classLevel,
    )
  const beginLevelUp = (pending: PendingLevelUp) => {
    if (pending.kind !== 'existing' || !replacementOptions(pending)) {
      const dieResult = Math.floor(pending.hitDie / 2) + 1
      commitLevelUp(pending, {
        className: pending.className,
        classSource: pending.classSource,
        classLevel: pending.classLevel,
        hitDie: pending.hitDie,
        dieResult,
        method: 'average',
      })
      return
    }
    setDisciplineFrom('')
    setDisciplineTo('')
    setPendingLevelUp(pending)
  }

  const handleAddLevel = (index: number) => {
    if (isAtCap) {
      toast.warning(`Character is already level ${MAX_CHARACTER_LEVEL}.`)
      return
    }
    const entry = classProgression[index]
    const newClassLevel = entry.levels + 1
    const classEntity = resolveClassProgressionRules(entry, allClasses)
    if (!classEntity) return
    beginLevelUp({
      kind: 'existing',
      className: entry.name,
      classSource: entry.source,
      classLevel: newClassLevel,
      hitDie: getHitDiceFromClass(classEntity),
    })
  }

  const handleAddMulticlass = () => {
    if (!classProgression.length) return
    if (!multiclassSelection) {
      toast.warning('Please select a class.')
      return
    }
    if (isAtCap) {
      toast.warning(`Character is already level ${MAX_CHARACTER_LEVEL}.`)
      return
    }
    const selectedClass = multiclassOptionByKey.get(multiclassSelection)
    if (!selectedClass) {
      toast.error('Could not find the selected class.')
      return
    }
    const { meetsRequirements } = checkMulticlassRequirements(selectedClass, effectiveAbilityScores)
    if (!ignoreRestrictions && !meetsRequirements) {
      toast.warning(`You don't meet the ability score requirements for ${selectedClass.name}.`)
      return
    }
    beginLevelUp({
      kind: 'multiclass',
      className: selectedClass.name,
      classSource: selectedClass.source,
      classLevel: 1,
      hitDie: getHitDiceFromClass(selectedClass),
    })
  }

  const removeLevel = (target: CharacterClassEntry) => {
    if (!classProgression.includes(target) || !canRemove(target)) return false
    try {
      const result = applyLevelDown(character, character.provenance, calculationContext, target)
      commitProgression(applyCharacterCommandResult(character, result))
      const { removedSpellCount } = result
      toast.success(
        `Removed a level from ${target.name}.`,
        removedSpellCount
          ? {
              description: `Removed ${removedSpellCount} ${removedSpellCount === 1 ? 'spell' : 'spells'} gained at that level.`,
            }
          : undefined,
      )
      return true
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not remove the level.')
      return false
    }
  }

  const parsedHpDieResult = pendingLevelUp ? Math.floor(pendingLevelUp.hitDie / 2) + 1 : 0
  const availableReplacements = pendingLevelUp ? replacementOptions(pendingLevelUp) : undefined
  const outgoing = availableReplacements?.outgoing.find(
    (slot) => getMysticDisciplineSlotKey(slot) === disciplineFrom,
  )
  const incoming = availableReplacements?.incoming.find(
    (row) => getPsionicKey(row.name, row.source) === disciplineTo,
  )
  const replacementReady = !disciplineFrom || (!!outgoing?.current.source && !!incoming)
  const validHpDieResult =
    pendingLevelUp != null &&
    !!resolvePendingClass(pendingLevelUp) &&
    Number.isInteger(parsedHpDieResult) &&
    parsedHpDieResult >= 1 &&
    parsedHpDieResult <= pendingLevelUp.hitDie
  const conModifier = getAbilityModifier(effectiveAbilityScores.constitution)
  const hpIncrease = validHpDieResult ? Math.max(1, parsedHpDieResult + conModifier) : null
  const maximumOverride = getMaxHitPointsOverride(character)
  const currentEffectiveMaxHp = getEffectiveMaxHP(
    character,
    calculationContext.classes,
    effectiveAbilityScores,
    calculationContext.effects.sourceDeclarations,
  )
  const projectedEffectiveMaxHp =
    pendingLevelUp && validHpDieResult
      ? (() => {
          const nextProgression = classProgression.map((entry) =>
            entry.name === pendingLevelUp.className && entry.source === pendingLevelUp.classSource
              ? { ...entry, levels: pendingLevelUp.classLevel }
              : entry,
          )
          const preview = applyLevelUp(
            character,
            character.provenance,
            nextProgression,
            {
              className: pendingLevelUp.className,
              classSource: pendingLevelUp.classSource,
              classLevel: pendingLevelUp.classLevel,
              hitDie: pendingLevelUp.hitDie,
              dieResult: parsedHpDieResult,
              method: 'average',
            },
            calculationContext,
          )
          return preview.characterPatch.hitPoints?.current ?? currentEffectiveMaxHp
        })()
      : currentEffectiveMaxHp

  const handleConfirmHitPoints = () => {
    if (!pendingLevelUp || !validHpDieResult || !replacementReady) return
    const replacement =
      outgoing?.current.source && incoming
        ? {
            choiceId: outgoing.selection.choiceId,
            slotLevel: outgoing.original.slotLevel,
            from: { name: outgoing.current.name, source: outgoing.current.source },
            to: { name: incoming.name, source: incoming.source },
          }
        : undefined
    const committed = commitLevelUp(
      pendingLevelUp,
      {
        className: pendingLevelUp.className,
        classSource: pendingLevelUp.classSource,
        classLevel: pendingLevelUp.classLevel,
        hitDie: pendingLevelUp.hitDie,
        dieResult: parsedHpDieResult,
        method: 'average',
      },
      replacement,
    )
    if (committed) setPendingLevelUp(null)
  }

  const renderLevelRows = (entries: CharacterClassEntry[]) => (
    <div className="grid min-w-0 gap-1.5">
      {entries.map((entry, index) => (
        <div
          key={`${entry.name}|${entry.source ?? ''}`}
          className="flex min-h-12 items-center gap-2 rounded-md border border-border bg-workspace-pane px-2 py-1.5"
        >
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-primary/10 text-primary">
            {(() => {
              const iconUrl = getClassIconUrl(entry.name)
              return iconUrl ? (
                <img src={iconUrl} alt={entry.name} className="size-5" />
              ) : (
                <Sword className="size-4" weight="bold" />
              )
            })()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm font-semibold leading-tight">{entry.name}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Level {entry.levels} · {entry.source || 'Unknown source'}
            </p>
            {!resolveClassProgressionRules(entry, allClasses) && (
              <p className="text-xs text-warning">Restore the original rules to add a level.</p>
            )}
          </div>
          <div className="flex shrink-0 gap-1">
            <Button
              size="icon"
              variant="outline"
              className="size-8"
              aria-label={`Remove a level from ${classLabel(entry)}`}
              disabled={!canRemove(entry)}
              onClick={(event) => {
                dialogOpener.current = event.currentTarget
                if (isHintDismissed(REMOVE_LEVEL_CONFIRMATION)) {
                  if (removeLevel(entry)) {
                    const opener = event.currentTarget
                    requestAnimationFrame(() => {
                      if (!opener.isConnected || opener.disabled) focusLevelControl(opener)
                    })
                  }
                } else {
                  setSkipConfirmation(false)
                  setRemovalTarget(entry)
                }
              }}
            >
              <Minus aria-hidden />
            </Button>
            <Button
              size="icon"
              className="size-8"
              aria-label={`Add a level to ${classLabel(entry)}`}
              disabled={isAtCap || !resolveClassProgressionRules(entry, allClasses)}
              onClick={(event) => {
                const opener = event.currentTarget
                dialogOpener.current = opener
                handleAddLevel(index)
                requestAnimationFrame(() => {
                  if (!opener.isConnected || opener.disabled) focusLevelControl(opener)
                })
              }}
            >
              <Plus aria-hidden />
            </Button>
          </div>
        </div>
      ))}
    </div>
  )

  return (
    <>
      <Card className="min-h-0 min-w-0 gap-0 overflow-hidden border-border bg-workspace-detail py-0 shadow-none">
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-surface-raised px-3 py-3">
          <Scroll className="size-5 shrink-0 text-primary" weight="duotone" />
          <h2 ref={heading} tabIndex={-1} className="text-base font-semibold">
            Manual Adjustments
          </h2>
        </div>
        <Tabs value={tab} onValueChange={setTab} className="min-h-0 flex-1 gap-0">
          <TabsList
            aria-label="Manual Adjustments"
            className="overview-adjustment-tabs mx-3 mt-2 h-auto min-h-8 w-auto shrink-0 justify-start rounded-none border-0 border-b bg-transparent p-0"
          >
            <TabsTrigger value="levels">
              <Sword aria-hidden /> Levels
            </TabsTrigger>
            <TabsTrigger value="multiclass" disabled={classProgression.length === 0}>
              <Users aria-hidden /> Multiclass
            </TabsTrigger>
            <TabsTrigger value="stats">
              <SlidersHorizontal aria-hidden /> Stats
            </TabsTrigger>
          </TabsList>
          {/* The overlapping panels size this row to the tallest tab. */}
          <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-1">
            <TabsContent
              value="levels"
              forceMount
              inert={tab !== 'levels'}
              aria-hidden={tab !== 'levels'}
              className={TAB_BODY_CLASS}
            >
              {classProgression.length > 0 ? (
                renderLevelRows(classProgression.slice(0, CLASS_PREVIEW_LIMIT))
              ) : (
                <p className="py-3 text-sm text-muted-foreground">
                  Choose your first class on the Class page.
                </p>
              )}
              <Dialog>
                {classProgression.length > CLASS_PREVIEW_LIMIT && (
                  <DialogTrigger asChild>
                    <Button
                      variant="ghost"
                      className="w-full justify-between border-t border-border text-primary"
                    >
                      View all {classProgression.length} classes <ArrowRight aria-hidden />
                    </Button>
                  </DialogTrigger>
                )}
                <DialogContent
                  className="overview-list-dialog min-h-0"
                  onCloseAutoFocus={(event) => {
                    if (classProgression.length <= CLASS_PREVIEW_LIMIT) {
                      event.preventDefault()
                      heading.current?.focus()
                    }
                  }}
                >
                  <DialogHeader>
                    <DialogTitle ref={fullListHeading} tabIndex={-1}>
                      Class levels
                    </DialogTitle>
                    <DialogDescription>Manually adjust the level of any class.</DialogDescription>
                  </DialogHeader>
                  <div className="min-h-0 overflow-y-auto overscroll-contain">
                    {renderLevelRows(classProgression)}
                  </div>
                </DialogContent>
              </Dialog>
            </TabsContent>
            <TabsContent
              value="multiclass"
              forceMount
              inert={tab !== 'multiclass'}
              aria-hidden={tab !== 'multiclass'}
              className={TAB_BODY_CLASS}
            >
              {isAtCap ? (
                <p className="rounded-md border border-border bg-workspace-pane py-3 text-center text-xs text-muted-foreground">
                  Maximum level reached.
                </p>
              ) : (
                <div className="space-y-3 rounded-md border border-border bg-workspace-pane p-3">
                  <div className="flex items-center justify-end gap-2">
                    <div className="flex shrink-0 items-center gap-2">
                      <Label
                        htmlFor={ignoreRestrictionsId}
                        className="cursor-pointer select-none text-xs text-muted-foreground"
                      >
                        Ignore requirements
                      </Label>
                      <Switch
                        id={ignoreRestrictionsId}
                        checked={ignoreRestrictions}
                        onCheckedChange={setIgnoreRestrictions}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <ClassToAddSelect
                      value={multiclassSelection}
                      onValueChange={setMulticlassSelection}
                      options={multiclassOptions.map(
                        ({ cls, meetsRequirements, requirementText, already }) => {
                          const restricted = !ignoreRestrictions && !meetsRequirements
                          return {
                            value: getClassOptionKey(cls),
                            name: cls.name,
                            source: cls.source,
                            disabled: already || restricted,
                            note: already
                              ? 'already taken'
                              : restricted
                                ? requirementText
                                : undefined,
                          }
                        },
                      )}
                    />
                    <Button
                      onClick={(event) => {
                        dialogOpener.current = event.currentTarget
                        handleAddMulticlass()
                      }}
                      disabled={!multiclassSelection}
                      className="h-9 shrink-0 gap-1.5"
                    >
                      <Plus className="size-3.5" />
                      Add
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>
            <TabsContent
              value="stats"
              forceMount
              inert={tab !== 'stats'}
              aria-hidden={tab !== 'stats'}
              className={TAB_BODY_CLASS}
            >
              <div className="space-y-2">
                <HitPointsModal
                  open={openStat === 'hp'}
                  onOpenChange={(open) => setOpenStat(open ? 'hp' : null)}
                  trigger={
                    <Button variant="outline" size="sm" className="w-full">
                      <Heart className="text-red-600 dark:text-red-400" weight="fill" aria-hidden />
                      Manage Hit Points
                    </Button>
                  }
                />
                <ArmorClassModal
                  open={openStat === 'ac'}
                  onOpenChange={(open) => setOpenStat(open ? 'ac' : null)}
                  trigger={
                    <Button variant="outline" size="sm" className="w-full">
                      <Shield className="text-primary" weight="fill" aria-hidden />
                      Manage Armor Class
                    </Button>
                  }
                />
                <MovementModal
                  open={openStat === 'movement'}
                  onOpenChange={(open) => setOpenStat(open ? 'movement' : null)}
                  trigger={
                    <Button variant="outline" size="sm" className="w-full">
                      <Lightning className="text-primary" weight="fill" aria-hidden />
                      Manage Movement
                    </Button>
                  }
                />
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </Card>
      <Dialog
        open={pendingLevelUp != null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setPendingLevelUp(null)
        }}
      >
        <DialogContent
          className="border-border bg-workspace-detail sm:max-w-md"
          onCloseAutoFocus={restoreDialogFocus}
        >
          <DialogHeader>
            <DialogTitle>Confirm Level Up</DialogTitle>
            <DialogDescription>
              {pendingLevelUp
                ? `${pendingLevelUp.className} level ${pendingLevelUp.classLevel} uses a d${pendingLevelUp.hitDie} hit die.`
                : 'Review the class level.'}
            </DialogDescription>
          </DialogHeader>

          {pendingLevelUp && (
            <div className="space-y-4">
              {(availableReplacements || disciplineFrom) && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold">Replace a known discipline</p>
                  <Select
                    value={disciplineFrom || 'keep'}
                    onValueChange={(value) => {
                      setDisciplineFrom(value === 'keep' ? '' : value)
                      setDisciplineTo('')
                    }}
                  >
                    <SelectTrigger aria-label="Discipline to replace">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="keep">Keep current disciplines</SelectItem>
                      {availableReplacements?.outgoing.map((slot) => (
                        <SelectItem
                          key={getMysticDisciplineSlotKey(slot)}
                          value={getMysticDisciplineSlotKey(slot)}
                        >
                          {slot.current.name} ({slot.current.source})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!!disciplineFrom && (
                    <Select
                      value={disciplineTo}
                      onValueChange={setDisciplineTo}
                      disabled={!outgoing}
                    >
                      <SelectTrigger aria-label="New discipline">
                        <SelectValue placeholder="Choose a new discipline" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableReplacements?.incoming.map((row) => {
                          const key = getPsionicKey(row.name, row.source)
                          return (
                            <SelectItem key={key} value={key}>
                              {row.name} ({row.source})
                            </SelectItem>
                          )
                        })}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}

              <div className="rounded-md border border-border bg-workspace-pane p-4 text-center">
                {validHpDieResult && hpIncrease != null ? (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Average
                      {parsedHpDieResult}
                      {' + '}
                      {conModifier >= 0 ? `+${conModifier}` : conModifier} CON
                    </p>
                    <p className="mt-1 text-xl font-bold text-primary">+{hpIncrease} HP</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Maximum HP: {currentEffectiveMaxHp} → {projectedEffectiveMaxHp}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Restore the original class rules to add this level.
                  </p>
                )}
              </div>

              {maximumOverride != null && (
                <p className="text-xs text-warning-foreground">
                  This character has an exact maximum-HP override of {maximumOverride}. The average
                  will be saved, but that override remains authoritative.
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingLevelUp(null)}>
              Cancel
            </Button>
            <Button
              disabled={!validHpDieResult || !replacementReady}
              onClick={handleConfirmHitPoints}
            >
              Confirm Level Up
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!removalTarget} onOpenChange={(open) => !open && setRemovalTarget(null)}>
        <AlertDialogContent onCloseAutoFocus={restoreDialogFocus}>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Level</AlertDialogTitle>
            <AlertDialogDescription>
              {removalTarget &&
                (removalTarget.levels === 1
                  ? `Remove ${classLabel(removalTarget)} and all choices and grants earned from that class?`
                  : `Remove a level from ${classLabel(removalTarget)} and discard the choices and grants earned at that level?`)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center gap-2">
            <Checkbox
              id={skipConfirmationId}
              checked={skipConfirmation}
              onCheckedChange={(checked) => setSkipConfirmation(checked === true)}
            />
            <Label htmlFor={skipConfirmationId}>Don’t ask me again</Label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (removalTarget && removeLevel(removalTarget) && skipConfirmation)
                  setHintDismissed(REMOVE_LEVEL_CONFIRMATION, true)
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
