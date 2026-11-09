import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { HashRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { Toaster, toast } from 'sonner'
import { RulesPreviewManager } from '@/components/editor/RulesPreviewManager'
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
import { UpdateProgressModal } from '@/components/updates/UpdateProgressModal'
import { useDataInit } from '@/hooks/data/useDataInit'
import { setAccentTheme, setAppearanceTheme } from '@/lib/themeManager'
import { applyUiScale, useAppPreferencesStore } from '@/store/appPreferencesStore'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'

const TOAST_VIEWPORT_OFFSET = { bottom: '3rem' }

const ChangelogModal = lazy(() =>
  import('@/components/updates/ChangelogModal').then(({ ChangelogModal }) => ({
    default: ChangelogModal,
  })),
)

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
const BuildReviewPage = lazy(() =>
  import('@/pages/build/review/ReviewPage').then((module) => ({
    default: module.BuildReviewPage,
  })),
)
const AdjustmentsPage = lazy(() =>
  import('@/pages/adjustments/AdjustmentsPage').then((module) => ({
    default: module.AdjustmentsPage,
  })),
)
const CharacterSheetRoutes = lazy(() =>
  import('@/pages/CharacterSheetRoutes').then((module) => ({
    default: module.CharacterSheetRoutes,
  })),
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
  import('@/pages/details/PortraitPage').then((module) => ({ default: module.RoutedPortraitPage })),
)
const EquipmentPage = lazy(() =>
  import('@/pages/equipment/EquipmentPage').then((module) => ({ default: module.EquipmentPage })),
)
const FeatsPage = lazy(() =>
  import('@/pages/feats/FeatsPage').then((module) => ({ default: module.FeatsPage })),
)
const HomePage = lazy(() =>
  import('@/pages/HomePage').then((module) => ({ default: module.RoutedHomePage })),
)
const SettingsPage = lazy(() =>
  import('@/pages/SettingsPage').then((module) => ({ default: module.SettingsPage })),
)
const RulesPage = lazy(() =>
  import('@/pages/rules/RulesPage').then((module) => ({ default: module.RulesPage })),
)
const SourcesPage = lazy(() =>
  import('@/pages/rules/SourcesPage').then((module) => ({ default: module.SourcesPage })),
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

function WorkspaceRoute({ onReady }: { onReady: (ready: boolean) => void }) {
  useLayoutEffect(() => onReady(true), [onReady])
  return <Outlet />
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
    return window.electronAPI?.onConfirmClose(handleConfirmClose)
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
  const choosingRecoverySource = useGameDataStore((s) => s.remoteStartup === 'setup')

  const [updateData, setUpdateData] = useState<{
    version: string
    changelog: string | null
    isPortable: boolean
  } | null>(null)
  const [changelogOpen, setChangelogOpen] = useState(false)
  const [hasAppUpdate, setHasAppUpdate] = useState(false)
  const [progressVersion, setProgressVersion] = useState<string | null>(null)
  const [initialRouteReady, setInitialRouteReady] = useState(false)
  const [startupComplete, setStartupComplete] = useState(false)
  const workspaceRoute = <WorkspaceRoute onReady={setInitialRouteReady} />
  const canOpenStartupDialogs = initialRouteReady && startupComplete
  const finishStartup = useCallback(() => setStartupComplete(true), [])
  const openAppUpdate = useCallback(() => setChangelogOpen(true), [])

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
    const api = window.electronAPI
    if (!api?.onUpdateAvailable) return
    let updateToast: ReturnType<typeof toast.info> | undefined
    const unsubscribeAvailable = api.onUpdateAvailable((data) => {
      setUpdateData(data)
      setHasAppUpdate(true)
      if (updateToast !== undefined) toast.dismiss(updateToast)
      updateToast = toast.info(`Update v${data.version} available`, {
        action: { label: 'View', onClick: openAppUpdate },
        duration: 8000,
      })
    })
    const unsubscribeUnavailable = api.onUpdateNotAvailable?.(() => {
      setHasAppUpdate(false)
      if (updateToast !== undefined) toast.dismiss(updateToast)
      updateToast = undefined
    })
    return () => {
      unsubscribeAvailable()
      unsubscribeUnavailable?.()
    }
  }, [openAppUpdate])

  return (
    <TooltipProvider delayDuration={300}>
      <RulesPreviewManager>
        <HashRouter>
          <AppLayout onOpenAppUpdate={hasAppUpdate ? openAppUpdate : undefined}>
            <Suspense fallback={initialRouteReady ? <RouteLoadingFallback /> : null}>
              <Routes>
                <Route element={<RequireActiveCharacter />}>
                  <Route path="/build" element={<Navigate to="/build/race" replace />} />
                  <Route path="/details" element={<Navigate to="/details/portrait" replace />} />
                  <Route element={workspaceRoute}>
                    <Route path="/build/race" element={<BuildRacePage />} />
                    <Route path="/build/class" element={<BuildClassPage />} />
                    <Route path="/build/background" element={<BuildBackgroundPage />} />
                    <Route path="/build/proficiencies" element={<BuildProficienciesPage />} />
                    <Route path="/build/ability-scores" element={<BuildAbilityScoresPage />} />
                    <Route path="/build/review" element={<BuildReviewPage />} />
                    <Route path="/build/adjustments" element={<AdjustmentsPage />} />
                    <Route path="/feats" element={<FeatsPage />} />
                    <Route path="/spells" element={<SpellsPage />} />
                    <Route path="/equipment" element={<EquipmentPage />} />
                    <Route path="/rules" element={<RulesPage />} />
                    <Route path="/details/portrait" element={<PortraitPage />} />
                    <Route path="/details/characteristics" element={<CharacteristicsPage />} />
                    <Route path="/details/conditions" element={<ConditionsPage />} />
                    <Route path="/sources" element={<SourcesPage />} />
                    <Route path="/character-sheet/*" element={<CharacterSheetRoutes />} />
                  </Route>
                </Route>
                <Route element={workspaceRoute}>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/compendium" element={<CompendiumPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                </Route>
                <Route path="/settings/*" element={<Navigate to="/settings" replace />} />
                <Route path="*" element={workspaceRoute} />
              </Routes>
            </Suspense>
          </AppLayout>
          <Toaster
            position="bottom-right"
            offset={TOAST_VIEWPORT_OFFSET}
            mobileOffset={TOAST_VIEWPORT_OFFSET}
          />
          {(canOpenStartupDialogs || choosingRecoverySource) && <DataSourceStartupModal />}
          <AppLoadingOverlay
            initialRoutePending={!initialRouteReady}
            onStartupComplete={startupComplete ? undefined : finishStartup}
          />
          <CloseConfirmDialog />
          {canOpenStartupDialogs && updateData && (
            <Suspense fallback={null}>
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
                        setProgressVersion(updateData.version)
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
            </Suspense>
          )}
          <UpdateProgressModal
            open={progressVersion !== null}
            version={progressVersion ?? ''}
            onOpenChange={(open) => {
              if (!open) setProgressVersion(null)
            }}
          />
        </HashRouter>
      </RulesPreviewManager>
    </TooltipProvider>
  )
}

export default App
