import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { HashRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
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
import { applyUiScale, useAppPreferencesStore } from '@/store/appPreferencesStore'
import { useCharacterStore } from '@/store/characterStore'

const BuildAbilityScoresPage = lazy(() =>
  import('@/pages/build/ability-scores/AbilityScoresPage').then((module) => ({
    default: module.BuildAbilityScoresPage,
  })),
)
const BuildBackgroundPage = lazy(() =>
  import('@/pages/build/background/BackgroundPage').then((module) => ({
    default: module.BuildBackgroundPage,
  })),
)
const BuildClassPage = lazy(() =>
  import('@/pages/build/class/ClassPage').then((module) => ({ default: module.BuildClassPage })),
)
const BuildProficienciesPage = lazy(() =>
  import('@/pages/build/proficiencies/ProficienciesPage').then((module) => ({
    default: module.BuildProficienciesPage,
  })),
)
const BuildRacePage = lazy(() =>
  import('@/pages/build/race/RacePage').then((module) => ({ default: module.BuildRacePage })),
)
const CharacterSheetPage = lazy(() =>
  import('@/pages/CharacterSheetPage').then((module) => ({ default: module.CharacterSheetPage })),
)
const CompendiumPage = lazy(() =>
  import('@/pages/compendium/CompendiumPage').then((module) => ({
    default: module.CompendiumPage,
  })),
)
const CharacteristicsPage = lazy(() =>
  import('@/pages/details/CharacteristicsPage').then((module) => ({
    default: module.CharacteristicsPage,
  })),
)
const ConditionsPage = lazy(() =>
  import('@/pages/details/ConditionsPage').then((module) => ({
    default: module.ConditionsPage,
  })),
)
const PortraitPage = lazy(() =>
  import('@/pages/details/PortraitPage').then((module) => ({ default: module.PortraitPage })),
)
const EquipmentPage = lazy(() =>
  import('@/pages/equipment/EquipmentPage').then((module) => ({ default: module.EquipmentPage })),
)
const FeatsPage = lazy(() =>
  import('@/pages/feats/FeatsPage').then((module) => ({ default: module.FeatsPage })),
)
const HomePage = lazy(() =>
  import('@/pages/HomePage').then((module) => ({ default: module.HomePage })),
)
const SettingsPage = lazy(() =>
  import('@/pages/SettingsPage').then((module) => ({ default: module.SettingsPage })),
)
const SourcesPage = lazy(() =>
  import('@/pages/sources/SourcesPage').then((module) => ({ default: module.SourcesPage })),
)
const SpellsPage = lazy(() =>
  import('@/pages/spells/SpellsPage').then((module) => ({ default: module.SpellsPage })),
)

function RouteLoadingFallback() {
  return (
    <div
      className="flex min-h-48 items-center justify-center text-sm text-muted-foreground"
      role="status"
    >
      Loading page…
    </div>
  )
}

function CharacterSheetRedirect() {
  const originSystem = useCharacterStore((state) => state.activeCharacter?.originSystem)
  return <Navigate to={`/character-sheet/${originSystem ?? '2024'}`} replace />
}

function RequireActiveCharacter() {
  const activeCharacter = useCharacterStore((state) => state.activeCharacter)
  return activeCharacter ? <Outlet /> : <Navigate to="/" replace />
}

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

  useEffect(() => {
    if (!window.electronAPI?.setAutoCheck) return
    const { autoUpdate } = useAppPreferencesStore.getState()
    void window.electronAPI.setAutoCheck(autoUpdate)
  }, [])

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
      <HashRouter>
        <AppLayout>
          <Suspense fallback={<RouteLoadingFallback />}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route element={<RequireActiveCharacter />}>
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
                <Route path="/sources" element={<SourcesPage />} />
                <Route path="/character-sheet" element={<CharacterSheetRedirect />} />
                <Route
                  path="/character-sheet/2014"
                  element={<CharacterSheetPage key="character-sheet-2014" templateId="2014" />}
                />
                <Route
                  path="/character-sheet/2024"
                  element={<CharacterSheetPage key="character-sheet-2024" templateId="2024" />}
                />
              </Route>
              <Route path="/compendium" element={<CompendiumPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/settings/*" element={<Navigate to="/settings" replace />} />
            </Routes>
          </Suspense>
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
            updateAvailable
            onInstall={
              updateData.isPortable
                ? undefined
                : () => {
                    setChangelogOpen(false)
                    setProgressOpen(true)
                  }
            }
            onOpenDownloadPage={
              updateData.isPortable
                ? async () => {
                    try {
                      const result = await window.electronAPI.openPortableUpdatePage()
                      if (!result.success) {
                        toast.error('Could not open the download page', {
                          description: result.error ?? undefined,
                        })
                        return
                      }
                      setChangelogOpen(false)
                    } catch (error) {
                      toast.error('Could not open the download page', {
                        description: error instanceof Error ? error.message : 'Unknown error',
                      })
                    }
                  }
                : undefined
            }
          />
        )}
        <UpdateProgressModal
          open={progressOpen}
          version={updateData?.version ?? ''}
          onOpenChange={setProgressOpen}
        />
      </HashRouter>
    </TooltipProvider>
  )
}

export default App
