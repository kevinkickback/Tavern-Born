import { useCallback, useState } from 'react'
import type { ClassDetailsSelection } from '@/pages/build/class/model/pageUtils'

export function useClassPageState() {
  const [selectedClassTab, setSelectedClassTab] = useState('')
  const [classPickerOpen, setClassPickerOpen] = useState(false)
  const [classPickerSearch, setClassPickerSearch] = useState('')
  const [detailCollapsed, setDetailCollapsed] = useState(false)
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [selectedFeature, setSelectedFeature] = useState<ClassDetailsSelection | null>(null)

  const handleSelectClassTab = useCallback((value: string) => {
    setSelectedClassTab(value)
    setSelectedFeature(null)
  }, [])

  const handleClassSelectionApplied = useCallback(() => {
    setSelectedFeature(null)
    setClassPickerOpen(false)
    setClassPickerSearch('')
  }, [])

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
