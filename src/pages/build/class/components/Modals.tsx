import { FeatSelectionModal } from '@/components/modals/FeatSelectionModal'
import { SubclassSelectionModal } from '@/components/modals/SubclassSelectionModal'
import { useCharacterCalculationContext } from '@/hooks/character/useCharacterCalculationContext'
import { useTotalAbilityScores } from '@/hooks/character/useTotalAbilityScores'
import type { PrereqCharacterSnapshot } from '@/lib/calculations/prerequisites'
import type { ManagedClassSpellRequest } from '@/lib/character/commands/managedClassSpellCommands'
import { AsiPickerDialog } from '@/pages/build/class/components/AsiPickerDialog'
import { ClassSelectionDialog } from '@/pages/build/class/components/ClassSelectionDialog'
import { ManagedClassSpellsDialog } from '@/pages/build/class/components/ManagedClassSpellsDialog'
import type { Class5e, Feat5e, Subclass5e } from '@/types/5etools'
import type { AsiChoice, Character, CharacterClassEntry } from '@/types/character'

interface BuildClassModalsProps {
  character: Character
  classes: Class5e[]
  classPickerOpen: boolean
  classPickerSearch: string
  onClassPickerOpenChange: (open: boolean) => void
  onClassPickerSearchChange: (search: string) => void
  onClassSelect: (className: string, classSource: string) => void
  spellPickerLevel: number | null
  onSpellPickerLevelChange: (level: number | null) => void
  viewingEntry?: CharacterClassEntry
  onFinishClassSpellChoices: (requests: readonly ManagedClassSpellRequest[]) => void
  subclassPickerOpen: boolean
  onSubclassPickerOpenChange: (open: boolean) => void
  subclassTitle: string
  subclasses: Subclass5e[]
  viewingSubclass?: string
  onSubclassConfirm: (subclass: Subclass5e) => void
  characterSnapshot: PrereqCharacterSnapshot
  asiPickerLevel: number | null
  onAsiPickerLevelChange: (level: number | null) => void
  appliedAsiChoicesForClass: AsiChoice[]
  onAsiApply: (level: number, changes: Record<string, 1 | 2>) => void
  featPickerOpen: boolean
  onFeatPickerOpenChange: (open: boolean) => void
  featModalFeats: Feat5e[]
  featPickerInitialSelectedIds: string[]
  onFeatConfirm: (selectedFeats: Feat5e[]) => void
}

export function BuildClassModals(props: BuildClassModalsProps) {
  const { character } = props
  const calculation = useCharacterCalculationContext(character)
  const { total: totalAbilityScores } = useTotalAbilityScores(character)
  return (
    <>
      <ClassSelectionDialog
        open={props.classPickerOpen}
        classes={props.classes}
        search={props.classPickerSearch}
        selectedClassName={character.classProgression[0]?.name}
        selectedClassSource={character.classProgression[0]?.source}
        onOpenChange={(open) => {
          props.onClassPickerOpenChange(open)
          if (!open) props.onClassPickerSearchChange('')
        }}
        onSearchChange={props.onClassPickerSearchChange}
        onClassSelect={props.onClassSelect}
      />
      {props.spellPickerLevel !== null && props.viewingEntry && (
        <ManagedClassSpellsDialog
          key={`${props.viewingEntry.name}|${props.viewingEntry.source}|${props.viewingEntry.subclass ?? ''}|${props.viewingEntry.subclassSource ?? ''}|${props.spellPickerLevel}`}
          character={character}
          entry={props.viewingEntry}
          level={props.spellPickerLevel}
          context={calculation?.classChoices.spellContext}
          statuses={calculation?.managedClassSpellStatuses ?? []}
          onFinish={props.onFinishClassSpellChoices}
          onOpenChange={(open) => {
            if (!open) props.onSpellPickerLevelChange(null)
          }}
        />
      )}
      {props.subclassPickerOpen && (
        <SubclassSelectionModal
          open
          onOpenChange={props.onSubclassPickerOpenChange}
          title={`Choose ${props.subclassTitle}`}
          subclasses={props.subclasses}
          selectedName={props.viewingSubclass}
          onConfirm={props.onSubclassConfirm}
        />
      )}
      {props.asiPickerLevel !== null && (
        <AsiPickerDialog
          open
          level={props.asiPickerLevel}
          abilityScores={totalAbilityScores}
          existingChanges={
            props.appliedAsiChoicesForClass.find((choice) => choice.level === props.asiPickerLevel)
              ?.abilityChanges
          }
          onApply={(changes) => {
            if (props.asiPickerLevel !== null) props.onAsiApply(props.asiPickerLevel, changes)
          }}
          onClose={() => props.onAsiPickerLevelChange(null)}
        />
      )}
      <FeatSelectionModal
        open={props.featPickerOpen}
        onOpenChange={props.onFeatPickerOpenChange}
        feats={props.featModalFeats}
        maxSelections={1}
        initialSelectedIds={props.featPickerInitialSelectedIds}
        characterSnapshot={props.characterSnapshot}
        onConfirm={props.onFeatConfirm}
      />
    </>
  )
}
