import { useState } from 'react'
import type { SelectedFeatureState } from '@/pages/build/class/components/DetailsPanel'

interface OptPickerState {
  progName: string
  featureTypes: string[]
  total: number
}

interface ClassFeatPickerState {
  progName: string
  categories: string[]
  total: number
}

export function useClassPageState() {
  const [selectedClassTab, setSelectedClassTab] = useState('')
  const [classPickerOpen, setClassPickerOpen] = useState(false)
  const [classPickerSearch, setClassPickerSearch] = useState('')
  const [subclassPickerOpen, setSubclassPickerOpen] = useState(false)
  const [spellPickerLevel, setSpellPickerLevel] = useState<number | null>(null)
  const [spellSwapLevel, setSpellSwapLevel] = useState<number | null>(null)
  const [spellSwapDrop, setSpellSwapDrop] = useState<string | null>(null)
  const [detailCollapsed, setDetailCollapsed] = useState(false)
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [selectedFeature, setSelectedFeature] = useState<SelectedFeatureState | null>(null)
  const [optPickerState, setOptPickerState] = useState<OptPickerState | null>(null)
  const [featPickerOpen, setFeatPickerOpen] = useState(false)
  const [classFeatPickerState, setClassFeatPickerState] = useState<ClassFeatPickerState | null>(
    null,
  )
  const [asiPickerLevel, setAsiPickerLevel] = useState<number | null>(null)
  const [asiModeByLevel, setAsiModeByLevel] = useState<Record<string, 'asi' | 'feat'>>({})

  const handleSelectClassTab = (value: string) => {
    setSelectedClassTab(value)
    setSelectedFeature(null)
  }

  const handleClassSelectionApplied = () => {
    setSelectedFeature(null)
    setClassPickerOpen(false)
    setClassPickerSearch('')
  }

  const handleSubclassSelectionApplied = (nextFeature: SelectedFeatureState) => {
    setSelectedFeature(nextFeature)
    setSubclassPickerOpen(false)
    setDetailCollapsed(false)
  }

  const setAsiMode = (levelKey: string, mode: 'asi' | 'feat') => {
    setAsiModeByLevel((prev) => ({
      ...prev,
      [levelKey]: mode,
    }))
  }

  const clearAsiMode = (levelKey: string) => {
    setAsiModeByLevel((prev) => {
      const next = { ...prev }
      delete next[levelKey]
      return next
    })
  }

  return {
    selectedClassTab,
    classPickerOpen,
    classPickerSearch,
    subclassPickerOpen,
    spellPickerLevel,
    detailCollapsed,
    leftCollapsed,
    selectedFeature,
    optPickerState,
    featPickerOpen,
    classFeatPickerState,
    asiPickerLevel,
    asiModeByLevel,
    setClassPickerOpen,
    setClassPickerSearch,
    setSubclassPickerOpen,
    setSpellPickerLevel,
    spellSwapLevel,
    spellSwapDrop,
    setSpellSwapLevel,
    setSpellSwapDrop,
    setDetailCollapsed,
    setLeftCollapsed,
    setSelectedFeature,
    setOptPickerState,
    setFeatPickerOpen,
    setClassFeatPickerState,
    setAsiPickerLevel,
    handleSelectClassTab,
    handleClassSelectionApplied,
    handleSubclassSelectionApplied,
    setAsiMode,
    clearAsiMode,
  }
}
