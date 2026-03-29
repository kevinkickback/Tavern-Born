import { useState } from 'react'
import { toast } from 'sonner'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog'
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
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Plus, Minus, Users, Scroll } from '@phosphor-icons/react'
import { useCharacterStore } from '@/store/characterStore'
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData'
import { getProficiencyBonus, MAX_CHARACTER_LEVEL, checkMulticlassRequirements } from '@/lib/calculations/gameRules'
import { cn } from '@/lib/utils'
import type { Class5e } from '@/types/5etools'
import type { CharacterClassEntry } from '@/types/character'

// ─── Props ────────────────────────────────────────────────────────────────────

interface LevelUpModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

// ─── Component ───────────────────────────────────────────────────────────────

export function LevelUpModal({ open, onOpenChange }: LevelUpModalProps) {
    const character = useCharacterStore((s) => s.activeCharacter)
    const updateCharacter = useCharacterStore((s) => s.updateCharacter)
    const { classes } = useFilteredGameData()

    const [ignoreRestrictions, setIgnoreRestrictions] = useState(false)
    const [multiclassSelection, setMulticlassSelection] = useState('')
    const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false)

    if (!character) return null

    // ── Derive progression array ─────────────────────────────────────────────
    // If classProgression exists and is non-empty, use it as the source of truth.
    // Otherwise fall back to the legacy single-class fields for backward compatibility.
    const classProgression: CharacterClassEntry[] =
        character.classProgression?.length
            ? character.classProgression
            : character.class
                ? [{ name: character.class, source: character.classSource, levels: character.level }]
                : []

    const totalLevel = classProgression.reduce((sum, e) => sum + e.levels, 0) || character.level
    const isAtCap = totalLevel >= MAX_CHARACTER_LEVEL

    // Classes available to add — deduplicate by name (same class can appear from multiple sources),
    // then exclude classes already in the progression
    const seenClassNames = new Set<string>()
    const multiclassOptions = (classes as Class5e[])
        .filter((cls) => {
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

    // ── Helpers ───────────────────────────────────────────────────────────────

    function syncUpdate(newProgression: CharacterClassEntry[]) {
        const newTotal = newProgression.reduce((s, e) => s + e.levels, 0)
        updateCharacter(character!.id, {
            classProgression: newProgression,
            level: newTotal,
            class: newProgression[0]?.name ?? character!.class,
            classSource: newProgression[0]?.source ?? character!.classSource,
            proficiencyBonus: getProficiencyBonus(newTotal),
        })
    }

    // ── Actions ───────────────────────────────────────────────────────────────

    const handleAddLevel = (index: number) => {
        if (isAtCap) {
            toast.warning(`Character is already level ${MAX_CHARACTER_LEVEL}.`)
            return
        }
        const newProgression = classProgression.map((e, i) =>
            i === index ? { ...e, levels: e.levels + 1 } : e,
        )
        syncUpdate(newProgression)
        toast.success(`${classProgression[index].name} is now level ${classProgression[index].levels + 1}.`)
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
        const { meetsRequirements } = checkMulticlassRequirements(
            classes.find((c: Class5e) => c.name === multiclassSelection) as Class5e ?? { name: multiclassSelection, source: '' },
            character.abilityScores,
        )
        if (!ignoreRestrictions && !meetsRequirements) {
            toast.warning(`You don't meet the ability score requirements for ${multiclassSelection}.`)
            return
        }
        const found = classes.find((c: Class5e) => c.name === multiclassSelection) as Class5e | undefined
        const newEntry: CharacterClassEntry = {
            name: multiclassSelection,
            source: found?.source,
            levels: 1,
        }
        syncUpdate([...classProgression, newEntry])
        toast.success(`Added ${multiclassSelection} (level 1).`)
        setMulticlassSelection('')
    }

    const handleRemoveLastLevel = () => {
        if (totalLevel <= 1 || !classProgression.length) {
            toast.warning('Cannot go below level 1.')
            setConfirmRemoveOpen(false)
            return
        }
        const lastIdx = classProgression.length - 1
        let newProgression = classProgression.map((e, i) =>
            i === lastIdx ? { ...e, levels: e.levels - 1 } : e,
        )
        const removedClass = classProgression[lastIdx].name
        // Drop the class entirely if it hits 0 levels
        if (newProgression[lastIdx].levels <= 0) {
            newProgression = newProgression.slice(0, -1)
        }
        syncUpdate(newProgression)
        toast.success(`Removed a level from ${removedClass}.`)
        setConfirmRemoveOpen(false)
    }

    // The class that would lose a level on "Remove Last Level"
    const lastClassName = classProgression.length ? classProgression[classProgression.length - 1].name : ''

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="sm:max-w-2xl flex flex-col gap-0 p-0 overflow-hidden max-h-[90vh]">
                    <DialogHeader className="px-6 pt-6 pb-4 flex-shrink-0 border-b border-border">
                        <DialogTitle className="font-display text-xl flex items-center gap-2">
                            <Scroll className="h-5 w-5 text-accent" weight="duotone" />
                            Level Up Character
                        </DialogTitle>
                        <DialogDescription className="sr-only">
                            Manage character levels and multiclassing
                        </DialogDescription>
                    </DialogHeader>

                    <ScrollArea className="flex-1 overflow-hidden">
                        <div className="px-6 py-5 space-y-6">

                            {/* ── Your Classes ──────────────────────────────── */}
                            <section>
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                        <Scroll className="h-3.5 w-3.5" />
                                        Your Classes
                                    </h3>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-muted-foreground">Character Level</span>
                                        <Badge className="font-mono">{totalLevel}</Badge>
                                    </div>
                                </div>

                                {classProgression.length > 0 ? (
                                    <div className="grid grid-cols-2 gap-3">
                                        {classProgression.map((entry, index) => (
                                            <div
                                                key={`${entry.name}|${entry.source ?? ''}`}
                                                className="border border-border rounded-xl p-4 bg-card/50 flex items-center justify-between gap-3"
                                            >
                                                <div className="min-w-0">
                                                    <div className="font-semibold font-display truncate">{entry.name}</div>
                                                    <div className="text-xs text-muted-foreground mt-0.5">
                                                        Class Level {entry.levels}
                                                    </div>
                                                </div>
                                                <Button
                                                    size="sm"
                                                    disabled={isAtCap}
                                                    onClick={() => handleAddLevel(index)}
                                                    className="flex-shrink-0 gap-1"
                                                >
                                                    <Plus className="h-3.5 w-3.5" />
                                                    Add Level
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-sm text-muted-foreground text-center py-4 border border-dashed border-border rounded-lg">
                                        No class selected yet.
                                    </p>
                                )}

                                {classProgression.length > 0 && totalLevel > 1 && (
                                    <div className="flex justify-center mt-3">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="text-destructive border-destructive/40 hover:bg-destructive/10 gap-1"
                                            onClick={() => setConfirmRemoveOpen(true)}
                                        >
                                            <Minus className="h-3.5 w-3.5" />
                                            Remove Last Level
                                            {lastClassName && (
                                                <span className="text-muted-foreground font-normal ml-0.5">
                                                    ({lastClassName})
                                                </span>
                                            )}
                                        </Button>
                                    </div>
                                )}

                                {isAtCap && (
                                    <p className="text-xs text-amber-400 text-center mt-3 border border-amber-500/30 bg-amber-500/5 rounded-lg py-2 px-3">
                                        Character is already level {MAX_CHARACTER_LEVEL}. Remove a level to add more.
                                    </p>
                                )}
                            </section>

                            <Separator />

                            {/* ── Add Class (multiclass) ─────────────────── */}
                            <section>
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                        <Users className="h-3.5 w-3.5" />
                                        Add Class
                                    </h3>
                                    <div className="flex items-center gap-2">
                                        <Label htmlFor="ignoreRestrictions" className="text-xs text-muted-foreground cursor-pointer">
                                            Ignore Restrictions
                                        </Label>
                                        <Switch
                                            id="ignoreRestrictions"
                                            checked={ignoreRestrictions}
                                            onCheckedChange={setIgnoreRestrictions}
                                        />
                                    </div>
                                </div>

                                {isAtCap ? (
                                    <p className="text-xs text-muted-foreground text-center py-3">
                                        Maximum level reached.
                                    </p>
                                ) : (
                                    <div className="flex gap-2">
                                        <Select value={multiclassSelection} onValueChange={setMulticlassSelection}>
                                            <SelectTrigger className="flex-1">
                                                <SelectValue placeholder="Choose a class…" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {multiclassOptions.map(({ cls, meetsRequirements, requirementText, already }) => {
                                                    const disabled = already || (!ignoreRestrictions && !meetsRequirements)
                                                    return (
                                                        <SelectItem
                                                            key={`${cls.name}|${cls.source ?? ''}`}
                                                            value={cls.name}
                                                            disabled={disabled}
                                                            className={cn(!meetsRequirements && !ignoreRestrictions ? 'opacity-50' : '')}
                                                        >
                                                            <span>{cls.name}</span>
                                                            {already && (
                                                                <span className="ml-1 text-muted-foreground text-xs">(already taken)</span>
                                                            )}
                                                            {!already && requirementText && !meetsRequirements && !ignoreRestrictions && (
                                                                <span className="ml-1 text-muted-foreground text-xs">({requirementText})</span>
                                                            )}
                                                        </SelectItem>
                                                    )
                                                })}
                                            </SelectContent>
                                        </Select>
                                        <Button
                                            onClick={handleAddMulticlass}
                                            disabled={!multiclassSelection}
                                            className="flex-shrink-0 gap-1"
                                        >
                                            <Plus className="h-3.5 w-3.5" />
                                            Add Class
                                        </Button>
                                    </div>
                                )}
                            </section>

                        </div>
                    </ScrollArea>

                    <div className="px-6 py-4 border-t border-border flex justify-end flex-shrink-0">
                        <Button variant="outline" onClick={() => onOpenChange(false)} className="gap-1.5">
                            Close
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* ── Confirm remove level ──────────────────────────────────────── */}
            <AlertDialog open={confirmRemoveOpen} onOpenChange={setConfirmRemoveOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Remove Level</AlertDialogTitle>
                        <AlertDialogDescription>
                            {lastClassName
                                ? `Remove a level from ${lastClassName}${classProgression[classProgression.length - 1]?.levels === 1 ? ' — this will remove the class entirely' : ''}?`
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
