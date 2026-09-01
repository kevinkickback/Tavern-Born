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
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { checkMulticlassRequirements, MAX_CHARACTER_LEVEL } from '@/lib/calculations/gameRules'
import { addMulticlass, applyClassProgressionUpdate } from '@/lib/character/commands/classCommands'
import { removeSpellFromCharacter } from '@/lib/character/commands/spellCommands'
import { getCharacterClassEntries, getTotalCharacterLevel } from '@/lib/characterUtils'
import { getClassIconUrl } from '@/lib/classIcons'
import { getSpellsGrantedAtLevel, removeSpellChoicesAtLevel } from '@/lib/provenance'
import { cn } from '@/lib/utils'
import { emptyProvenance, useCharacterStore } from '@/store/characterStore'
import type { Class5e } from '@/types/5etools'
import type { CharacterClassEntry } from '@/types/character'

interface LevelUpModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function LevelUpModal({ open, onOpenChange }: LevelUpModalProps) {
  const character = useCharacterStore((s) => s.activeCharacter)
  const updateCharacter = useCharacterStore((s) => s.updateCharacter)
  const { classes } = useFilteredGameData()

  const [ignoreRestrictions, setIgnoreRestrictions] = useState(false)
  const [multiclassSelection, setMulticlassSelection] = useState('')
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false)
  const [levelHistory, setLevelHistory] = useState<
    Array<{ className: string; classLevel: number }>
  >([])
  const ignoreRestrictionsId = useId()

  if (!character) return null

  const classProgression: CharacterClassEntry[] = getCharacterClassEntries(character)

  const totalLevel = getTotalCharacterLevel(character)
  const isAtCap = totalLevel >= MAX_CHARACTER_LEVEL

  const seenClassNames = new Set<string>()
  const multiclassOptions = (classes as Class5e[])
    .filter((cls) => {
      if (cls.isSidekick) return false
      if (seenClassNames.has(cls.name)) return false
      seenClassNames.add(cls.name)
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
        already: classProgression.some((e) => e.name === cls.name),
      }
    })
  const multiclassOptionByName = new Map(
    multiclassOptions.map((option) => [option.cls.name, option.cls]),
  )

  function syncUpdate(char: typeof character, newProgression: CharacterClassEntry[]) {
    if (!char) return
    const result = applyClassProgressionUpdate(
      char,
      char.provenance ?? emptyProvenance(),
      newProgression,
    )

    updateCharacter(char.id, {
      ...result.characterUpdate,
      provenance: result.provenanceUpdate,
    })
  }

  const handleAddLevel = (index: number) => {
    if (isAtCap) {
      toast.warning(`Character is already level ${MAX_CHARACTER_LEVEL}.`)
      return
    }
    const entry = classProgression[index]
    const newClassLevel = entry.levels + 1
    const newProgression = classProgression.map((e, i) =>
      i === index ? { ...e, levels: newClassLevel } : e,
    )
    syncUpdate(character, newProgression)
    setLevelHistory((prev) => [...prev, { className: entry.name, classLevel: newClassLevel }])
    toast.success(`${entry.name} is now level ${newClassLevel}.`)
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
    const selectedClass = multiclassOptionByName.get(multiclassSelection)
    const { meetsRequirements } = checkMulticlassRequirements(
      selectedClass ?? { name: multiclassSelection, source: '' },
      character.abilityScores,
    )
    if (!ignoreRestrictions && !meetsRequirements) {
      toast.warning(`You don't meet the ability score requirements for ${multiclassSelection}.`)
      return
    }
    const newEntry: CharacterClassEntry = {
      name: multiclassSelection,
      source: selectedClass?.source,
      levels: 1,
    }

    const newProgression = [...classProgression, newEntry]

    const multiclassResult = selectedClass
      ? addMulticlass(
          character,
          character.provenance ?? emptyProvenance(),
          multiclassSelection,
          selectedClass,
          selectedClass.source,
          1,
        )
      : null

    const nextProficiencies =
      multiclassResult?.characterUpdate.proficiencies ?? character.proficiencies
    const nextProvenance =
      multiclassResult?.provenanceUpdate ?? character.provenance ?? emptyProvenance()
    const progressionResult = applyClassProgressionUpdate(character, nextProvenance, newProgression)

    updateCharacter(character.id, {
      ...progressionResult.characterUpdate,
      proficiencies: nextProficiencies,
      skills: multiclassResult?.characterUpdate.skills ?? character.skills,
      provenance: progressionResult.provenanceUpdate,
    })

    toast.success(`Added ${multiclassSelection} (level 1).`)
    setMulticlassSelection('')
    setLevelHistory((prev) => [...prev, { className: multiclassSelection, classLevel: 1 }])
  }

  const handleRemoveLastLevel = () => {
    if (totalLevel <= 1 || !classProgression.length) {
      toast.warning('Cannot go below level 1.')
      setConfirmRemoveOpen(false)
      return
    }

    const lastHistoryEntry = levelHistory[levelHistory.length - 1]
    const targetClassName =
      lastHistoryEntry?.className ?? classProgression[classProgression.length - 1].name
    const targetClassLevel =
      lastHistoryEntry?.classLevel ?? classProgression[classProgression.length - 1].levels

    const targetIdx = classProgression.findIndex((e) => e.name === targetClassName)
    if (targetIdx === -1) {
      toast.error('Could not find the target class to remove a level from.')
      setConfirmRemoveOpen(false)
      return
    }

    const ledger = character.provenance ?? emptyProvenance()
    const affectedSpells = getSpellsGrantedAtLevel(ledger, targetClassName, targetClassLevel)
    let updatedLedger = removeSpellChoicesAtLevel(ledger, targetClassName, targetClassLevel)
    let spellProfileUpdate: Parameters<typeof updateCharacter>[1] = {}
    if (affectedSpells.length > 0) {
      let updatedChar = character
      for (const spellName of affectedSpells) {
        const result = removeSpellFromCharacter(updatedChar, updatedLedger, spellName)
        updatedChar = {
          ...updatedChar,
          spells: { ...updatedChar.spells, ...result.profileUpdate },
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
      ...progressionResult.characterUpdate,
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
  const lastClassName =
    lastHistoryEntry?.className ?? classProgression[classProgression.length - 1]?.name ?? ''

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
                                  value={cls.name}
                                  disabled={disabled}
                                  className={cn(
                                    !meetsRequirements && !ignoreRestrictions ? 'opacity-50' : '',
                                  )}
                                >
                                  <span>{cls.name}</span>
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
