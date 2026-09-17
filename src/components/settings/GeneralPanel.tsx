import {
  ArrowCounterClockwise,
  ArrowsClockwise,
  CheckCircle,
  Newspaper,
} from '@phosphor-icons/react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { ChangelogModal } from '@/components/updates/ChangelogModal'
import { Section } from '@/components/workspace'
import { resetAllHints } from '@/lib/storage/hints'
import { useAppPreferencesStore } from '@/store/appPreferencesStore'

interface UpdateCheckStatus {
  status: 'available' | 'not-available' | 'error'
  error?: string
}

function isUpdateCheckStatus(value: unknown): value is UpdateCheckStatus {
  if (!value || typeof value !== 'object' || !('status' in value)) return false
  return ['available', 'not-available', 'error'].includes(String(value.status))
}

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

    try {
      const result = await window.electronAPI.checkForUpdate()
      if (!result.success) {
        setStatusMessage(`Error: ${result.error ?? 'The update check could not be completed.'}`)
        return
      }
      if (!isUpdateCheckStatus(result.data)) {
        setStatusMessage('Error: The update check returned an unexpected response.')
        return
      }
      if (result.data.status === 'available') {
        setStatusMessage('Update available!')
      } else if (result.data.status === 'not-available') {
        setStatusMessage('You are on the latest version.')
      } else {
        setStatusMessage(
          `Error: ${result.data.error ?? 'The update check could not be completed.'}`,
        )
      }
    } catch (error) {
      setStatusMessage(
        `Error: ${error instanceof Error ? error.message : 'The update check could not be completed.'}`,
      )
    } finally {
      setChecking(false)
      cleanup()
    }
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
    <div>
      <Section
        title="App Updates"
        description="Manage how and when the app checks for new releases."
        className="pt-0"
      >
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Automatically Check for Updates</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Check for new releases when Tavern Born starts and notify you when one is available.
              </p>
            </div>
            <Switch
              checked={autoUpdate}
              onCheckedChange={(v) => {
                setAutoUpdate(v)
                void window.electronAPI?.setAutoCheck?.(v)
                toast.success(
                  v ? 'Automatic update checks enabled' : 'Automatic update checks disabled',
                )
              }}
            />
          </div>

          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Manual Update</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Check for a new release right now.
              </p>
              {statusMessage && statusMessage !== 'You are on the latest version.' && (
                <p className="text-xs text-muted-foreground mt-0.5">{statusMessage}</p>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCheckNow}
              disabled={checking}
              className={`shrink-0 ${
                statusMessage === 'You are on the latest version.'
                  ? 'border-success text-success hover:text-success hover:bg-success/10'
                  : ''
              }`}
            >
              {statusMessage === 'You are on the latest version.' ? (
                <CheckCircle weight="bold" />
              ) : (
                <ArrowsClockwise weight="bold" className={checking ? 'animate-spin' : ''} />
              )}
              {statusMessage === 'You are on the latest version.' ? 'Up to Date' : 'Check Now'}
            </Button>
          </div>

          {appVersion && (
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium">What's New?</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Browse release notes for the current version.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleViewChangelog}
                className="shrink-0"
              >
                <Newspaper weight="duotone" />
                {`Changelog (v${appVersion})`}
              </Button>
            </div>
          )}
        </div>
      </Section>

      <Section
        title="One-Time Hints"
        description="Contextual tips and guidance shown once throughout the app."
      >
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
      </Section>

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
