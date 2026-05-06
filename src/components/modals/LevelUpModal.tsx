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
  // Ordered history of levels added this session: [{className, classLevel}]
  // classLevel is the class's own level count (1-based) at the moment it was added.
  // Popping from this stack drives Remove Last Level targeting.
  const [levelHistory, setLevelHistory] = useState<
    Array<{ className: string; classLevel: number }>
  >([])
  const ignoreRestrictionsId = useId()

  if (!character) return null

  const classProgression: CharacterClassEntry[] = getCharacterClassEntries(character)

  const totalLevel = getTotalCharacterLevel(character)
  const isAtCap = totalLevel >= MAX_CHARACTER_LEVEL

  // Classes available to add — deduplicate by name, exclude sidekick classes
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

    // Determine which class+level to remove.
    // If we have history from this session, pop the last entry.
    // Otherwise fall back to the last class in progression at its current level.
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

    // Remove spells and spell choice placeholders attributed to this class at this class level.
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
    // Drop the class entirely if it hits 0 levels
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
        <DialogContent className="sm:max-w-lg flex flex-col gap-0 p-0 overflow-hidden max-h-[90vh]">
          <div className="h-12 bg-gradient-to-r from-indigo-500/20 via-indigo-500/10 to-transparent border-b border-border/40 flex items-center gap-3 px-5 shrink-0">
            <Scroll className="h-4 w-4 text-indigo-600 dark:text-indigo-400" weight="duotone" />
            <span className="text-sm font-bold">Level Up</span>
            <span className="text-sm text-muted-foreground truncate min-w-0">{character.name}</span>
            <div className="ml-auto mr-8 flex items-center gap-2 shrink-0">
              <span className="text-xs text-muted-foreground">Total Level</span>
              <span className="inline-flex items-center justify-center h-6 min-w-[1.5rem] px-1.5 rounded-md bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 text-xs font-bold tabular-nums">
                {totalLevel}
              </span>
            </div>
          </div>

          <DialogHeader className="sr-only">
            <DialogTitle>Level Up Character</DialogTitle>
            <DialogDescription>Manage character levels and multiclassing</DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1 overflow-hidden">
            <div className="px-5 py-4 space-y-4">
              {/* Your Classes */}
              <div>
                <div className="flex items-center gap-2 mb-2.5">
                  <Scroll className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Your Classes
                  </span>
                </div>

                {classProgression.length > 0 ? (
                  <div className="border border-border rounded-xl overflow-hidden">
                    {classProgression.map((entry, index) => {
                      const colors = [
                        'from-indigo-500 to-indigo-600/60',
                        'from-violet-500 to-violet-600/60',
                        'from-teal-500 to-teal-600/60',
                        'from-amber-500 to-amber-600/60',
                        'from-rose-500 to-rose-600/60',
                      ]
                      const gradient = colors[index % colors.length]
                      return (
                        <div
                          key={`${entry.name}|${entry.source ?? ''}`}
                          className="flex items-center gap-3 px-4 py-3 border-b border-border/40 last:border-b-0 hover:bg-muted/20 transition-colors"
                        >
                          <div
                            className={cn(
                              'h-9 w-9 rounded-lg bg-gradient-to-br flex items-center justify-center shrink-0',
                              gradient,
                            )}
                          >
                            {(() => {
                              const iconUrl = getClassIconUrl(entry.name)
                              return iconUrl ? (
                                <img
                                  src={iconUrl}
                                  alt={entry.name}
                                  className="h-5 w-5"
                                  style={{ filter: 'brightness(0) invert(1)' }}
                                />
                              ) : (
                                <Sword className="h-4 w-4 text-white" weight="bold" />
                              )
                            })()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-sm leading-tight truncate">
                              {entry.name}
                            </p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              Level {entry.levels}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            disabled={isAtCap}
                            onClick={() => handleAddLevel(index)}
                            className="h-8 gap-1 shrink-0"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Level Up
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-3">
                    No class progression data found.
                  </p>
                )}

                <div className="flex items-center justify-between mt-2 min-h-[28px]">
                  {classProgression.length > 0 && totalLevel > 1 ? (
                    <button
                      type="button"
                      className="flex items-center gap-1 text-xs text-destructive/70 hover:text-destructive font-medium transition-colors"
                      onClick={() => setConfirmRemoveOpen(true)}
                    >
                      <ArrowDown className="h-3 w-3" />
                      Remove last level
                      {lastClassName && <span className="opacity-80">({lastClassName})</span>}
                    </button>
                  ) : (
                    <span />
                  )}
                  {isAtCap && (
                    <span className="text-xs text-warning-foreground dark:text-warning bg-warning/10 border border-warning/30 rounded-md px-2 py-1">
                      Level cap reached ({MAX_CHARACTER_LEVEL})
                    </span>
                  )}
                </div>
              </div>

              {/* Add Multiclass */}
              <div>
                <div className="flex items-center gap-2 mb-2.5">
                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Add Multiclass
                  </span>
                </div>

                {isAtCap ? (
                  <p className="text-xs text-muted-foreground text-center py-3 border border-border/50 rounded-xl bg-muted/10">
                    Maximum level reached.
                  </p>
                ) : (
                  <div className="border border-border rounded-xl p-3 bg-muted/5 space-y-2.5">
                    <div className="flex gap-2">
                      <Select value={multiclassSelection} onValueChange={setMulticlassSelection}>
                        <SelectTrigger className="flex-1 h-9">
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
                        className="h-9 shrink-0 gap-1"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add
                      </Button>
                    </div>
                    <div className="flex items-center justify-between pt-0.5">
                      <Label
                        htmlFor={ignoreRestrictionsId}
                        className="text-xs text-muted-foreground cursor-pointer select-none"
                      >
                        Ignore ability score requirements
                      </Label>
                      <Switch
                        id={ignoreRestrictionsId}
                        checked={ignoreRestrictions}
                        onCheckedChange={setIgnoreRestrictions}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>

          <div className="px-5 py-3 border-t border-border/40 flex justify-end shrink-0">
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
