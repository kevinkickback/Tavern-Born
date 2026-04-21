import { ArrowCounterClockwise, ArrowsClockwise, Newspaper } from '@phosphor-icons/react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { ChangelogModal } from '@/components/updates/ChangelogModal'
import { resetAllHints } from '@/lib/storage/hints'
import { useAppPreferencesStore } from '@/store/appPreferencesStore'

export function GeneralPanel() {
  const autoUpdate = useAppPreferencesStore((s) => s.autoUpdate)
  const setAutoUpdate = useAppPreferencesStore((s) => s.setAutoUpdate)

  const [appVersion, setAppVersion] = useState('')
  const [checking, setChecking] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [currentChangelogOpen, setCurrentChangelogOpen] = useState(false)
  const [currentChangelog, setCurrentChangelog] = useState<string | null>(null)
  const [currentChangelogLoading, setCurrentChangelogLoading] = useState(false)

  useEffect(() => {
    void window.electronAPI?.getAppVersion().then(setAppVersion)
  }, [])

  function handleResetHints() {
    resetAllHints()
    toast.success('One-time hints have been reset.')
  }

  const handleCheckNow = useCallback(async () => {
    if (!window.electronAPI) return
    setChecking(true)
    setStatusMessage('')

    const unsubs: (() => void)[] = []
    const cleanup = () =>
      unsubs.forEach((u) => {
        u()
      })

    unsubs.push(
      window.electronAPI.onUpdateAvailable(() => {
        setStatusMessage('Update available!')
        setChecking(false)
        cleanup()
      }),
    )
    unsubs.push(
      window.electronAPI.onUpdateNotAvailable(() => {
        setStatusMessage('You are on the latest version.')
        setChecking(false)
        cleanup()
      }),
    )
    unsubs.push(
      window.electronAPI.onUpdateError((data) => {
        setStatusMessage(`Error: ${data.message}`)
        setChecking(false)
        cleanup()
      }),
    )

    await window.electronAPI.checkForUpdate()
  }, [])

  const handleViewChangelog = useCallback(async () => {
    if (!window.electronAPI) return
    setCurrentChangelogLoading(true)
    setCurrentChangelogOpen(true)
    const result = await window.electronAPI.getCurrentChangelog()
    setCurrentChangelog(result.changelog)
    setCurrentChangelogLoading(false)
  }, [])

  return (
    <div className="space-y-6">
      {/* Hints */}
      <Card className="w-full">
        <CardHeader className="border-b border-border pb-4">
          <div className="flex items-center gap-2">
            <ArrowCounterClockwise className="h-4 w-4 text-primary" weight="duotone" />
            <CardTitle className="text-base">One-Time Hints</CardTitle>
          </div>
          <p className="text-sm text-muted-foreground">
            Contextual tips and guidance shown once throughout the app.
          </p>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Reset dismissed hints</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                All banners and tips you've closed will reappear.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={handleResetHints} className="shrink-0">
              <ArrowCounterClockwise weight="bold" />
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Updates */}
      <Card className="w-full">
        <CardHeader className="border-b border-border pb-4">
          <div className="flex items-center gap-2">
            <ArrowsClockwise className="h-4 w-4 text-primary" weight="duotone" />
            <CardTitle className="text-base">Updates</CardTitle>
          </div>
          <p className="text-sm text-muted-foreground">
            Manage automatic update checks and view release notes.
          </p>
        </CardHeader>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Check for updates automatically</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Checks on startup and every 24 hours.
              </p>
            </div>
            <Switch
              checked={autoUpdate}
              onCheckedChange={(v) => {
                setAutoUpdate(v)
                void window.electronAPI?.setAutoCheck?.(v)
                toast.success(v ? 'Auto-update enabled' : 'Auto-update disabled')
              }}
            />
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleCheckNow} disabled={checking}>
              <ArrowsClockwise weight="bold" className={checking ? 'animate-spin' : ''} />
              Check Now
            </Button>
            {appVersion && (
              <Button variant="ghost" size="sm" onClick={handleViewChangelog}>
                <Newspaper weight="duotone" />
                {`What's New (v${appVersion})`}
              </Button>
            )}
          </div>

          {statusMessage && <p className="text-xs text-muted-foreground">{statusMessage}</p>}
        </CardContent>
      </Card>

      <ChangelogModal
        open={currentChangelogOpen}
        onOpenChange={setCurrentChangelogOpen}
        version={appVersion}
        changelog={currentChangelog}
        loading={currentChangelogLoading}
      />
    </div>
  )
}
