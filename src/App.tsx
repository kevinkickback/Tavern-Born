import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Toaster, toast } from 'sonner'
import { AppLayout } from '@/components/layout/AppLayout'
import { AppLoadingOverlay } from '@/components/layout/AppLoadingOverlay'
import { DataSourceStartupModal } from '@/components/settings/DataSourceStartupModal'
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
import { TooltipProvider } from '@/components/ui/tooltip'
import { ChangelogModal } from '@/components/updates/ChangelogModal'
import { UpdateProgressModal } from '@/components/updates/UpdateProgressModal'
import { useDataInit } from '@/hooks/data/useDataInit'
import { setAccentTheme, setAppearanceTheme } from '@/lib/themeManager'
import { BuildAbilityScoresPage } from '@/pages/build/ability-scores/AbilityScoresPage'
import { BuildBackgroundPage } from '@/pages/build/background/BackgroundPage'
import { BuildClassPage } from '@/pages/build/class/ClassPage'
import { BuildProficienciesPage } from '@/pages/build/proficiencies/ProficienciesPage'
import { BuildRacePage } from '@/pages/build/race/RacePage'
import { CharacterSheetPage } from '@/pages/CharacterSheetPage'
import { CompendiumPage } from '@/pages/compendium/CompendiumPage'
import { CharacteristicsPage } from '@/pages/details/CharacteristicsPage'
import { ConditionsPage } from '@/pages/details/ConditionsPage'
import { PortraitPage } from '@/pages/details/PortraitPage'
import { EquipmentPage } from '@/pages/equipment/EquipmentPage'
import { FeatsPage } from '@/pages/feats/FeatsPage'
import { HomePage } from '@/pages/HomePage'
import { SettingsPage } from '@/pages/SettingsPage'
import { SourcesPage } from '@/pages/sources/SourcesPage'
import { SpellsPage } from '@/pages/spells/SpellsPage'
import { applyUiScale, useAppPreferencesStore } from '@/store/appPreferencesStore'

function CloseConfirmDialog() {
  const [open, setOpen] = useState(false)

  const handleConfirmClose = useCallback(() => {
    setOpen(true)
  }, [])

  useEffect(() => {
    window.electronAPI?.onConfirmClose(handleConfirmClose)
    return () => {
      window.electronAPI?.removeConfirmCloseListener(handleConfirmClose)
    }
  }, [handleConfirmClose])

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
          <AlertDialogDescription>
            Closing the app will discard unsaved changes to the current character.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => window.electronAPI?.forceClose()}>
            Discard & Close
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function App() {
  useDataInit()

  const themeAccent = useAppPreferencesStore((s) => s.themeAccent)
  const themeAppearance = useAppPreferencesStore((s) => s.themeAppearance)
  const uiScale = useAppPreferencesStore((s) => s.uiScale)

  const [updateData, setUpdateData] = useState<{
    version: string
    changelog: string | null
    isPortable: boolean
  } | null>(null)
  const [changelogOpen, setChangelogOpen] = useState(false)
  const [progressOpen, setProgressOpen] = useState(false)

  useLayoutEffect(() => {
    setAccentTheme(themeAccent)
  }, [themeAccent])

  useLayoutEffect(() => {
    setAppearanceTheme(themeAppearance)
  }, [themeAppearance])

  useLayoutEffect(() => {
    applyUiScale(uiScale)
  }, [uiScale])

  // Start auto-check schedule based on persisted preference
  useEffect(() => {
    if (!window.electronAPI?.setAutoCheck) return
    const { autoUpdate } = useAppPreferencesStore.getState()
    void window.electronAPI.setAutoCheck(autoUpdate)
  }, [])

  // Listen for update-available events and show a toast
  useEffect(() => {
    if (!window.electronAPI?.onUpdateAvailable) return
    return window.electronAPI.onUpdateAvailable((data) => {
      setUpdateData(data)
      toast.info(`Update v${data.version} available`, {
        action: { label: 'View', onClick: () => setChangelogOpen(true) },
        duration: 8000,
      })
    })
  }, [])

  return (
    <TooltipProvider delayDuration={300}>
      <BrowserRouter>
        <AppLayout>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/build" element={<Navigate to="/build/race" replace />} />
            <Route path="/build/race" element={<BuildRacePage />} />
            <Route path="/build/class" element={<BuildClassPage />} />
            <Route path="/build/background" element={<BuildBackgroundPage />} />
            <Route path="/build/proficiencies" element={<BuildProficienciesPage />} />
            <Route path="/build/ability-scores" element={<BuildAbilityScoresPage />} />
            <Route path="/feats" element={<FeatsPage />} />
            <Route path="/spells" element={<SpellsPage />} />
            <Route path="/equipment" element={<EquipmentPage />} />
            <Route path="/details" element={<Navigate to="/details/portrait" replace />} />
            <Route path="/details/portrait" element={<PortraitPage />} />
            <Route path="/details/characteristics" element={<CharacteristicsPage />} />
            <Route path="/details/conditions" element={<ConditionsPage />} />
            <Route path="/character-sheet" element={<CharacterSheetPage />} />
            <Route path="/compendium" element={<CompendiumPage />} />
            <Route path="/sources" element={<SourcesPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </AppLayout>
        <Toaster position="bottom-right" />
        <DataSourceStartupModal />
        <AppLoadingOverlay />
        <CloseConfirmDialog />
        {updateData && (
          <ChangelogModal
            open={changelogOpen}
            onOpenChange={setChangelogOpen}
            version={updateData.version}
            changelog={updateData.changelog}
            onInstall={() => {
              setChangelogOpen(false)
              setProgressOpen(true)
              void window.electronAPI?.downloadUpdate()
            }}
          />
        )}
        <UpdateProgressModal
          open={progressOpen}
          version={updateData?.version ?? ''}
          onOpenChange={setProgressOpen}
        />
      </BrowserRouter>
    </TooltipProvider>
  )
}

export default App
