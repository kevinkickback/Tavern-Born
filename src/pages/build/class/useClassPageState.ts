import { useState } from 'react'
import type { SelectedFeatureState } from '@/pages/build/class/components/DetailsPanel'

export function useClassPageState() {
  const [selectedClassTab, setSelectedClassTab] = useState('')
  const [classPickerOpen, setClassPickerOpen] = useState(false)
  const [classPickerSearch, setClassPickerSearch] = useState('')
  const [detailCollapsed, setDetailCollapsed] = useState(false)
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [selectedFeature, setSelectedFeature] = useState<SelectedFeatureState | null>(null)

  const handleSelectClassTab = (value: string) => {
    setSelectedClassTab(value)
    setSelectedFeature(null)
  }

  const handleClassSelectionApplied = () => {
    setSelectedFeature(null)
    setClassPickerOpen(false)
    setClassPickerSearch('')
  }

  return {
    selectedClassTab,
    classPickerOpen,
    classPickerSearch,
    detailCollapsed,
    leftCollapsed,
    selectedFeature,
    setClassPickerOpen,
    setClassPickerSearch,
    setDetailCollapsed,
    setLeftCollapsed,
    setSelectedFeature,
    handleSelectClassTab,
    handleClassSelectionApplied,
  }
}
