import { useLayoutEffect, useState } from 'react'
import { toast } from 'sonner'
import { creatorChoicePillClass, RaceChoiceRow } from '@/components/character/RaceChoiceRow'
import { GuidedLevelChoices } from '@/components/modals/GuidedLevelChoices'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { getSelectedSubclassData, getSubclassSelectionInfo } from '@/lib/5etools/classData'
import { findClassReference } from '@/lib/5etools/classReference'
import type { CharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { isSubclassEligible } from '@/lib/calculations/subclassEligibility'
import {
  getClassProgressionRestriction,
  selectSubclass,
} from '@/lib/character/commands/classCommands'
import { cn } from '@/lib/utils'
import { useCharacterEditingStore } from '@/store/characterEditingContext'
import type { Class5e } from '@/types/5etools'
import type { Character } from '@/types/character'

export function CreatorClassChoices({
  character,
  context,
  classes,
  onStatusChange,
}: {
  character: Character
  context: CharacterCalculationContext
  classes: Class5e[]
  onStatusChange: (available: boolean, pending: boolean) => void
}) {
  const store = useCharacterEditingStore()
  const entry = character.classProgression[0]
  const profiles = context.character.spells.spellProfiles
  const [guided, setGuided] = useState({ available: false, pending: false })
  const cls = entry && findClassReference(entry, classes)
  const { subclassLevel, subclassFeatureName } = getSubclassSelectionInfo(cls)
  const subclasses =
    entry && subclassLevel === 1
      ? (cls?.subclasses ?? []).filter((subclass) => {
          const target = { subclass: subclass.name, subclassSource: subclass.source }
          return (
            !!subclass.source &&
            getSelectedSubclassData(cls, target) === subclass &&
            !getClassProgressionRestriction(character, [{ ...entry, ...target }]) &&
            isSubclassEligible({
              subclass,
              className: entry.name,
              classSource: entry.source,
              character,
              effectiveAbilityScores: context.abilityScores.total,
              classChoiceFeatureCatalogs: context.classChoices.catalogs,
              classChoicePrerequisites: context.classChoices.prerequisites,
              effectiveSpellProfiles: profiles,
            })
          )
        })
      : []
  const select = (id: string) => {
    const subclass = subclasses.find((row) => JSON.stringify([row.name, row.source]) === id)
    if (!entry || !subclass || store.getState().activeCharacter !== character) return
    try {
      const result = selectSubclass(
        character,
        character.provenance,
        subclass.name,
        subclass.source,
        undefined,
        {
          viewingEntry: entry,
          raceResolution: context.raceResolution,
          spellsByKey: context.lookups.primary.spellsByKey,
          rawSpellsByKey: context.lookups.raw.spellsByKey,
          classChoiceFeatureCatalogs: context.classChoices.catalogs,
          spellContext: context.classChoices.spellContext,
        },
      )
      store.getState().updateCharacter(character.id, {
        ...result.characterPatch,
        provenance: result.provenanceUpdate,
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The subclass could not be selected.')
    }
  }

  const needsSubclass =
    subclasses.length > 0 &&
    !subclasses.some((row) => row.name === entry?.subclass && row.source === entry?.subclassSource)
  const available = subclasses.length > 0 || guided.available
  const pending = needsSubclass || guided.pending
  useLayoutEffect(() => onStatusChange(available, pending), [available, pending, onStatusChange])
  return (
    <>
      {subclasses.length > 0 && (
        <RaceChoiceRow
          title={subclassFeatureName ?? 'Subclass'}
          detail="Choose your subclass"
          pending={needsSubclass}
          complete={!needsSubclass}
        >
          <Select
            value={entry?.subclass ? JSON.stringify([entry.subclass, entry.subclassSource]) : ''}
            onValueChange={select}
          >
            <SelectTrigger
              className={cn(
                'min-w-40',
                !needsSubclass &&
                  `${creatorChoicePillClass} min-w-0 data-[size=default]:h-7 dark:bg-primary/10 [&>svg]:text-primary`,
              )}
              aria-label={subclassFeatureName ?? 'Choose a subclass'}
            >
              <SelectValue placeholder="Choose a subclass" />
            </SelectTrigger>
            <SelectContent>
              {subclasses.map((subclass) => {
                const id = JSON.stringify([subclass.name, subclass.source])
                return (
                  <SelectItem key={id} value={id}>
                    {subclass.name} ({subclass.source})
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
        </RaceChoiceRow>
      )}
      {entry && (
        <GuidedLevelChoices
          character={character}
          entry={entry}
          onStatusChange={(available, pending) =>
            setGuided((old) =>
              old.available === available && old.pending === pending ? old : { available, pending },
            )
          }
        />
      )}
    </>
  )
}
