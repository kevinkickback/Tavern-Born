import { ArrowDown, Plus, Scroll, Sword, Users } from '@phosphor-icons/react'
import { useId, useState } from 'react'
import { toast } from 'sonner'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData'
import {
  checkMulticlassRequirements,
  getAbilityModifier,
  getHitDiceFromClass,
  MAX_CHARACTER_LEVEL,
  rollDie,
} from '@/lib/calculations/gameRules'
import {
  addMulticlass,
  applyClassProgressionUpdate,
  applyLevelUp,
  type LevelUpHitPointChoice,
} from '@/lib/character/commands/classCommands'
import { removeSpellFromCharacter } from '@/lib/character/commands/spellCommands'
import {
  calculateHitPointAdjustmentTotal,
  calculateMaxHP,
  getCharacterClassEntries,
  getMaxHitPointsOverride,
  getTotalCharacterLevel,
} from '@/lib/characterUtils'
import { getClassIconUrl } from '@/lib/classIcons'
import {
  getSpellsGrantedAtLevel,
  normalizeKey,
  removeSpellChoicesAtLevel,
  removeSpellGrantsAtLevel,
} from '@/lib/provenance'
import { cn } from '@/lib/utils'
import { emptyProvenance, useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Class5e } from '@/types/5etools'
import type { CharacterClassEntry } from '@/types/character'

interface LevelUpModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface PendingLevelUp {
  kind: 'existing' | 'multiclass'
  className: string
  classSource?: string
  classLevel: number
  hitDie: number
}

const getClassOptionKey = (cls: Pick<Class5e, 'name' | 'source'>) =>
  `${cls.name}|${cls.source ?? ''}`
const EMPTY_CLASSES: Class5e[] = []

export function LevelUpModal({ open, onOpenChange }: LevelUpModalProps) {
  const character = useCharacterStore((s) => s.activeCharacter)
  const updateCharacter = useCharacterStore((s) => s.updateCharacter)
  const { classes } = useFilteredGameData()
  const rawClasses = useGameDataStore((state) => state.gameData?.classes ?? EMPTY_CLASSES)
  const allClasses = rawClasses.length > 0 ? rawClasses : classes

  const [ignoreRestrictions, setIgnoreRestrictions] = useState(false)
  const [multiclassSelection, setMulticlassSelection] = useState('')
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false)
  const [pendingLevelUp, setPendingLevelUp] = useState<PendingLevelUp | null>(null)
  const [hpEntryMethod, setHpEntryMethod] = useState<'rolled' | 'manual'>('rolled')
  const [hpDieResult, setHpDieResult] = useState('')
  const [levelHistory, setLevelHistory] = useState<
    Array<{ className: string; classSource?: string; classLevel: number }>
  >([])
  const ignoreRestrictionsId = useId()
  const manualHpRollId = useId()

  if (!character) return null

  const classProgression: CharacterClassEntry[] = getCharacterClassEntries(character)

  const totalLevel = getTotalCharacterLevel(character)
  const isAtCap = totalLevel >= MAX_CHARACTER_LEVEL

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
        character.abilityScores,
      )
      return {
        cls,
        meetsRequirements,
        requirementText,
        already: classProgression.some(
          (entry) => entry.name === cls.name && (entry.source ?? '') === (cls.source ?? ''),
        ),
      }
    })
  const multiclassOptionByKey = new Map(
    multiclassOptions.map((option) => [getClassOptionKey(option.cls), option.cls]),
  )

  const findClass = (name: string, source?: string) => {
    const normalizedSource = source?.trim()
    if (!normalizedSource) {
      return classes.find((cls) => cls.name === name) ?? allClasses.find((cls) => cls.name === name)
    }
    return (
      classes.find((cls) => cls.name === name && cls.source === normalizedSource) ??
      allClasses.find((cls) => cls.name === name && cls.source === normalizedSource)
    )
  }

  const commitLevelUp = (pending: PendingLevelUp, hpChoice: LevelUpHitPointChoice) => {
    if (pending.kind === 'existing') {
      const targetIndex = classProgression.findIndex(
        (entry) =>
          entry.name === pending.className && (entry.source ?? '') === (pending.classSource ?? ''),
      )
      if (targetIndex < 0) {
        toast.error('Could not find the class to level up.')
        return
      }
      const newProgression = classProgression.map((entry, index) =>
        index === targetIndex ? { ...entry, levels: pending.classLevel } : entry,
      )
      const result = applyLevelUp(
        character,
        character.provenance ?? emptyProvenance(),
        newProgression,
        hpChoice,
      )
      updateCharacter(character.id, {
        ...result.characterPatch,
        provenance: result.provenanceUpdate,
      })
      setLevelHistory((previous) => [
        ...previous,
        {
          className: pending.className,
          classSource: pending.classSource,
          classLevel: pending.classLevel,
        },
      ])
      toast.success(`${pending.className} is now level ${pending.classLevel}.`)
      return
    }

    const selectedClass = findClass(pending.className, pending.classSource)
    const newEntry: CharacterClassEntry = {
      name: pending.className,
      source: pending.classSource,
      levels: 1,
    }
    const newProgression = [...classProgression, newEntry]
    const multiclassResult = selectedClass
      ? addMulticlass(
          character,
          character.provenance ?? emptyProvenance(),
          pending.className,
          selectedClass,
          selectedClass.source,
          1,
        )
      : null
    const nextProficiencies =
      multiclassResult?.characterPatch.proficiencies ?? character.proficiencies
    const nextProvenance =
      multiclassResult?.provenanceUpdate ?? character.provenance ?? emptyProvenance()
    const result = applyLevelUp(character, nextProvenance, newProgression, hpChoice)

    updateCharacter(character.id, {
      ...result.characterPatch,
      proficiencies: nextProficiencies,
      skills: multiclassResult?.characterPatch.skills ?? character.skills,
      provenance: result.provenanceUpdate,
    })
    toast.success(`Added ${pending.className} (level 1).`)
    setMulticlassSelection('')
    setLevelHistory((previous) => [
      ...previous,
      { className: pending.className, classSource: pending.classSource, classLevel: 1 },
    ])
  }

  const beginLevelUp = (pending: PendingLevelUp) => {
    const averageHitPoints = character.variantRules?.averageHitPoints !== false
    if (averageHitPoints) {
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
    setHpEntryMethod('rolled')
    setHpDieResult('')
    setPendingLevelUp(pending)
  }

  const handleAddLevel = (index: number) => {
    if (isAtCap) {
      toast.warning(`Character is already level ${MAX_CHARACTER_LEVEL}.`)
      return
    }
    const entry = classProgression[index]
    const newClassLevel = entry.levels + 1
    const classEntity = findClass(entry.name, entry.source)
    beginLevelUp({
      kind: 'existing',
      className: entry.name,
      classSource: entry.source,
      classLevel: newClassLevel,
      hitDie: getHitDiceFromClass(classEntity),
    })
  }

  const handleAddMulticlass = () => {
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
    const { meetsRequirements } = checkMulticlassRequirements(
      selectedClass,
      character.abilityScores,
    )
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

  const handleRemoveLastLevel = () => {
    if (totalLevel <= 1 || !classProgression.length) {
      toast.warning('Cannot go below level 1.')
      setConfirmRemoveOpen(false)
      return
    }

    const lastRecordedGain = [...(character.hitPointGains ?? [])].sort(
      (a, b) => b.characterLevel - a.characterLevel,
    )[0]
    const lastHistoryEntry = levelHistory[levelHistory.length - 1] ?? lastRecordedGain
    const fallbackProgressionEntry = classProgression[classProgression.length - 1]
    const targetClassName = lastHistoryEntry?.className ?? fallbackProgressionEntry.name
    const targetClassSource = lastHistoryEntry
      ? lastHistoryEntry.classSource || undefined
      : fallbackProgressionEntry.source
    const targetClassLevel = lastHistoryEntry?.classLevel ?? fallbackProgressionEntry.levels

    const targetIndices = classProgression.flatMap((entry, index) =>
      entry.name === targetClassName &&
      (targetClassSource == null || entry.source === targetClassSource)
        ? [index]
        : [],
    )
    if (targetIndices.length !== 1) {
      toast.error('Could not find the target class to remove a level from.')
      setConfirmRemoveOpen(false)
      return
    }
    const targetIdx = targetIndices[0]

    const ledger = character.provenance ?? emptyProvenance()
    const affectedSpells = getSpellsGrantedAtLevel(
      ledger,
      targetClassName,
      targetClassLevel,
      targetClassSource,
    )
    let updatedLedger = removeSpellChoicesAtLevel(
      ledger,
      targetClassName,
      targetClassLevel,
      targetClassSource,
    )
    updatedLedger = removeSpellGrantsAtLevel(
      updatedLedger,
      targetClassName,
      targetClassLevel,
      targetClassSource,
    )
    let spellProfileUpdate: Parameters<typeof updateCharacter>[1] = {}
    if (affectedSpells.length > 0) {
      let updatedChar = character
      for (const spellName of affectedSpells) {
        if ((updatedLedger.spells[normalizeKey(spellName)] ?? []).length > 0) continue
        const result = removeSpellFromCharacter(updatedChar, updatedLedger, spellName)
        updatedChar = {
          ...updatedChar,
          ...result.characterPatch,
        } as typeof character
        updatedLedger = result.provenanceUpdate
      }
      spellProfileUpdate = { spells: updatedChar.spells }
    }

    let newProgression = classProgression.map((e, i) =>
      i === targetIdx ? { ...e, levels: e.levels - 1 } : e,
    )
    if (newProgression[targetIdx].levels <= 0) {
      newProgression = newProgression.filter((_, i) => i !== targetIdx)
    }

    const progressionResult = applyClassProgressionUpdate(character, updatedLedger, newProgression)
    updateCharacter(character.id, {
      ...progressionResult.characterPatch,
      provenance: progressionResult.provenanceUpdate,
      ...spellProfileUpdate,
    })

    setLevelHistory((prev) => prev.slice(0, -1))

    const removedMsg =
      affectedSpells.length > 0
        ? ` Removed ${affectedSpells.length} spell${affectedSpells.length > 1 ? 's' : ''} gained at that level.`
        : ''
    toast.success(`Removed a level from ${targetClassName}.${removedMsg}`)
    setConfirmRemoveOpen(false)
  }

  const lastHistoryEntry = levelHistory[levelHistory.length - 1]
  const lastPersistedGain = [...(character.hitPointGains ?? [])].sort(
    (a, b) => b.characterLevel - a.characterLevel,
  )[0]
  const lastClassName =
    lastHistoryEntry?.className ??
    lastPersistedGain?.className ??
    classProgression[classProgression.length - 1]?.name ??
    ''

  const parsedHpDieResult = Number.parseInt(hpDieResult, 10)
  const validHpDieResult =
    pendingLevelUp != null &&
    Number.isInteger(parsedHpDieResult) &&
    parsedHpDieResult >= 1 &&
    parsedHpDieResult <= pendingLevelUp.hitDie
  const conModifier = getAbilityModifier(character.abilityScores.constitution)
  const hpIncrease = validHpDieResult ? Math.max(1, parsedHpDieResult + conModifier) : null
  const calculatedMaxHp = calculateMaxHP(classProgression, conModifier, {
    averageHp: character.variantRules?.averageHitPoints !== false,
    classesData: allClasses,
    hitPointGains: character.hitPointGains,
  })
  const currentAdjustmentTotal = calculateHitPointAdjustmentTotal(
    character.hitPointAdjustments,
    totalLevel,
  )
  const projectedAdjustmentTotal = calculateHitPointAdjustmentTotal(
    character.hitPointAdjustments,
    totalLevel + 1,
  )
  const currentAdjustedMaxHp = Math.max(1, calculatedMaxHp + currentAdjustmentTotal)
  const projectedAdjustedMaxHp = Math.max(
    1,
    calculatedMaxHp + (hpIncrease ?? 0) + projectedAdjustmentTotal,
  )
  const maximumOverride = getMaxHitPointsOverride(character)
  const currentEffectiveMaxHp = maximumOverride ?? currentAdjustedMaxHp
  const projectedEffectiveMaxHp = maximumOverride ?? projectedAdjustedMaxHp

  const handleConfirmHitPoints = () => {
    if (!pendingLevelUp || !validHpDieResult) return
    commitLevelUp(pendingLevelUp, {
      className: pendingLevelUp.className,
      classSource: pendingLevelUp.classSource,
      classLevel: pendingLevelUp.classLevel,
      hitDie: pendingLevelUp.hitDie,
      dieResult: parsedHpDieResult,
      method: hpEntryMethod,
    })
    setPendingLevelUp(null)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden border-border bg-workspace-detail p-0 sm:max-w-xl">
          <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface-raised px-5 pr-12">
            <Scroll className="size-5 text-primary" weight="duotone" />
            <span className="text-base font-semibold">Level Up</span>
            <span className="min-w-0 truncate text-sm text-muted-foreground">{character.name}</span>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <span className="text-xs text-muted-foreground">Total Level</span>
              <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-md border border-primary/40 bg-primary/10 px-2 text-sm font-semibold tabular-nums text-primary">
                {totalLevel}
              </span>
            </div>
          </div>

          <DialogHeader className="sr-only">
            <DialogTitle>Level Up Character</DialogTitle>
            <DialogDescription>Manage character levels and multiclassing</DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1 overflow-hidden">
            <div className="space-y-5 px-5 py-5">
              <div>
                <div className="mb-2.5 flex items-center gap-2">
                  <Scroll className="size-4 text-muted-foreground" />
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Your Classes
                  </span>
                </div>

                {classProgression.length > 0 ? (
                  <div className="overflow-hidden rounded-md border border-border bg-workspace-pane">
                    {classProgression.map((entry, index) => (
                      <div
                        key={`${entry.name}|${entry.source ?? ''}`}
                        className="flex min-h-14 items-center gap-3 border-b border-border/70 px-3 py-2.5 last:border-b-0"
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
                          <p className="truncate text-sm font-semibold leading-tight">
                            {entry.name}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Level {entry.levels} · {entry.source || 'Unknown source'}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          disabled={isAtCap}
                          onClick={() => handleAddLevel(index)}
                          className="h-8 shrink-0 gap-1.5"
                        >
                          <Plus className="size-3.5" />
                          Level Up
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-3">
                    No class progression data found.
                  </p>
                )}

                <div className="mt-2 flex min-h-7 items-center justify-between">
                  {classProgression.length > 0 && totalLevel > 1 ? (
                    <button
                      type="button"
                      className="flex cursor-pointer items-center gap-1 text-xs font-medium text-destructive/75 transition-colors hover:text-destructive"
                      onClick={() => setConfirmRemoveOpen(true)}
                    >
                      <ArrowDown className="size-3" />
                      Remove last level
                      {lastClassName && <span className="opacity-80">({lastClassName})</span>}
                    </button>
                  ) : (
                    <span />
                  )}
                  {isAtCap && (
                    <span className="rounded-md border border-warning/30 bg-warning/10 px-2 py-1 text-xs text-warning-foreground dark:text-warning">
                      Level cap reached ({MAX_CHARACTER_LEVEL})
                    </span>
                  )}
                </div>
              </div>

              <div className="border-t border-border pt-4">
                <div className="mb-2.5 flex items-center gap-2">
                  <Users className="size-4 text-muted-foreground" />
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Multiclass
                  </span>
                </div>

                {isAtCap ? (
                  <p className="rounded-md border border-border bg-workspace-pane py-3 text-center text-xs text-muted-foreground">
                    Maximum level reached.
                  </p>
                ) : (
                  <div className="space-y-3 rounded-md border border-border bg-workspace-pane p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs text-muted-foreground">Add level 1 in another class.</p>
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
                      <Select value={multiclassSelection} onValueChange={setMulticlassSelection}>
                        <SelectTrigger className="h-9 flex-1 bg-workspace-detail shadow-none">
                          <SelectValue placeholder="Choose a class..." />
                        </SelectTrigger>
                        <SelectContent>
                          {multiclassOptions.map(
                            ({ cls, meetsRequirements, requirementText, already }) => {
                              const disabled =
                                already || (!ignoreRestrictions && !meetsRequirements)
                              return (
                                <SelectItem
                                  key={`${cls.name}|${cls.source ?? ''}`}
                                  value={getClassOptionKey(cls)}
                                  disabled={disabled}
                                  className={cn(
                                    !meetsRequirements && !ignoreRestrictions ? 'opacity-50' : '',
                                  )}
                                >
                                  <span>{cls.name}</span>
                                  <span className="ml-1 text-muted-foreground text-xs">
                                    ({cls.source || 'Unknown source'})
                                  </span>
                                  {already && (
                                    <span className="ml-1 text-muted-foreground text-xs">
                                      (already taken)
                                    </span>
                                  )}
                                  {!already &&
                                    requirementText &&
                                    !meetsRequirements &&
                                    !ignoreRestrictions && (
                                      <span className="ml-1 text-muted-foreground text-xs">
                                        ({requirementText})
                                      </span>
                                    )}
                                </SelectItem>
                              )
                            },
                          )}
                        </SelectContent>
                      </Select>
                      <Button
                        onClick={handleAddMulticlass}
                        disabled={!multiclassSelection}
                        className="h-9 shrink-0 gap-1.5"
                      >
                        <Plus className="size-3.5" />
                        Add
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>

          <div className="flex shrink-0 justify-end border-t border-border bg-surface-raised px-5 py-3">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={pendingLevelUp != null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setPendingLevelUp(null)
        }}
      >
        <DialogContent className="border-border bg-workspace-detail sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Hit Point Increase</DialogTitle>
            <DialogDescription>
              {pendingLevelUp
                ? `${pendingLevelUp.className} level ${pendingLevelUp.classLevel} uses a d${pendingLevelUp.hitDie} hit die.`
                : 'Choose the hit-die result for this level.'}
            </DialogDescription>
          </DialogHeader>

          {pendingLevelUp && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  aria-label={`Roll d${pendingLevelUp.hitDie}`}
                  onClick={() => {
                    setHpEntryMethod('rolled')
                    setHpDieResult(String(rollDie(pendingLevelUp.hitDie)))
                  }}
                  className={cn(
                    'rounded-md border p-3 text-left transition-colors',
                    hpEntryMethod === 'rolled'
                      ? 'border-primary/60 bg-primary/10'
                      : 'border-border bg-workspace-pane hover:border-primary/40',
                  )}
                >
                  <span className="block text-sm font-semibold">Roll d{pendingLevelUp.hitDie}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Roll within Tavern Born
                  </span>
                </button>

                <div
                  className={cn(
                    'rounded-md border p-3 transition-colors',
                    hpEntryMethod === 'manual'
                      ? 'border-primary/60 bg-primary/10'
                      : 'border-border bg-workspace-pane',
                  )}
                >
                  <Label htmlFor={manualHpRollId} className="text-sm font-semibold">
                    Enter a roll
                  </Label>
                  <Input
                    id={manualHpRollId}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={pendingLevelUp.hitDie}
                    value={hpEntryMethod === 'manual' ? hpDieResult : ''}
                    placeholder={`1–${pendingLevelUp.hitDie}`}
                    className="mt-2 h-8"
                    aria-invalid={
                      hpEntryMethod === 'manual' && hpDieResult !== '' && !validHpDieResult
                    }
                    onFocus={() => {
                      setHpEntryMethod('manual')
                      setHpDieResult('')
                    }}
                    onChange={(event) => {
                      setHpEntryMethod('manual')
                      setHpDieResult(event.target.value)
                    }}
                  />
                </div>
              </div>

              <div className="rounded-md border border-border bg-workspace-pane p-4 text-center">
                {validHpDieResult && hpIncrease != null ? (
                  <>
                    <p className="text-sm text-muted-foreground">
                      {hpEntryMethod === 'rolled' ? 'Rolled' : 'Entered'} {parsedHpDieResult}
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
                    Roll or enter an integer from 1 to {pendingLevelUp.hitDie}.
                  </p>
                )}
              </div>

              {maximumOverride != null && (
                <p className="text-xs text-warning-foreground dark:text-warning">
                  This character has an exact maximum-HP override of {maximumOverride}. The roll
                  will be saved, but that override remains authoritative.
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingLevelUp(null)}>
              Cancel
            </Button>
            <Button disabled={!validHpDieResult} onClick={handleConfirmHitPoints}>
              Confirm Level Up
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirmRemoveOpen} onOpenChange={setConfirmRemoveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Level</AlertDialogTitle>
            <AlertDialogDescription>
              {lastClassName
                ? `Remove a level from ${lastClassName}${classProgression.find((e) => e.name === lastClassName)?.levels === 1 ? ' - this will remove the class entirely' : ''}?`
                : 'Are you sure you want to remove the last level?'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveLastLevel}
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
