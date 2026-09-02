import { useMemo, useState } from 'react'
import { useUnifiedClassSelection } from '@/hooks/character/useUnifiedClassSelection'
import { useSubclass } from '@/hooks/data/useGameData'
import { resolveSubclassFeatureRefs } from '@/lib/5etools/classData'
import { isSubclassEligible } from '@/lib/calculations/subclassEligibility'
import { getImplicitSource } from '@/lib/sourcePresets'
import type { SelectedFeatureState } from '@/pages/build/class/components/DetailsPanel'
import type { Class5e, Subclass5e } from '@/types/5etools'
import type { Character, CharacterClassEntry } from '@/types/character'

interface SubclassSelectionControllerParams {
  character: Character | null
  viewingClassData?: Class5e
  viewingClass?: string
  viewingClassSource?: string
  viewingEntry?: CharacterClassEntry
  classProgression: CharacterClassEntry[]
  onSelectionApplied: (feature: SelectedFeatureState) => void
}

export function useSubclassSelectionController({
  character,
  viewingClassData,
  viewingClass,
  viewingClassSource,
  viewingEntry,
  classProgression,
  onSelectionApplied,
}: SubclassSelectionControllerParams) {
  const { selectSubclass } = useUnifiedClassSelection()
  const [pickerOpen, setPickerOpen] = useState(false)
  const subclasses = useMemo(() => {
    if (!character || !viewingClass) return []
    const allowedSources = character?.allowedSources
    const implicitSource = getImplicitSource(character?.originSystem ?? '2014')
    const effectiveSources =
      allowedSources && allowedSources.length > 0
        ? allowedSources.includes(implicitSource)
          ? allowedSources
          : [...allowedSources, implicitSource]
        : undefined

    return (viewingClassData?.subclasses ?? []).filter(
      (subclass) =>
        (!effectiveSources || effectiveSources.includes(subclass.source)) &&
        isSubclassEligible({ subclass, className: viewingClass, character }),
    )
  }, [character, viewingClass, viewingClassData?.subclasses])
  const subclassTitle =
    typeof viewingClassData?.subclassTitle === 'string'
      ? viewingClassData.subclassTitle
      : 'Subclass'
  // `getCharacterClassEntries` already folds the legacy top-level subclass into
  // its synthesized entry. Falling back here would make every subclass-less
  // multiclass entry display the primary class's top-level subclass.
  const viewingSubclass = viewingEntry?.subclass
  const viewingSubclassData = useSubclass(
    viewingClass ?? '',
    viewingClassSource,
    viewingSubclass ?? '',
    viewingEntry?.subclassSource,
  )

  const select = (subclass: Subclass5e) => {
    selectSubclass(subclass.name, subclass.source, classProgression, viewingEntry)
    onSelectionApplied({
      name: subclass.name,
      source: subclass.source,
      entries: resolveSubclassFeatureRefs(subclass.entries ?? [], subclass.shortName),
      levelFeatures: subclass.levelFeatures,
    })
    setPickerOpen(false)
  }

  return {
    pickerOpen,
    setPickerOpen,
    subclasses,
    subclassTitle,
    viewingSubclass,
    viewingSubclassData,
    select,
  }
}
