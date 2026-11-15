import { SpinnerGap, X } from '@phosphor-icons/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useCharacterStore } from '@/store/characterStore'

interface UpdateProgressModalProps {
  open: boolean
  version: string
  onOpenChange: (open: boolean) => void
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / k ** i).toFixed(1)} ${sizes[i]}`
}

type UpdatePhase = 'downloading' | 'downloaded' | 'error' | 'cancelled'

export function UpdateProgressModal({ open, version, onOpenChange }: UpdateProgressModalProps) {
  const [phase, setPhase] = useState<UpdatePhase>('downloading')
  const [percentage, setPercentage] = useState(0)
  const [bytesPerSecond, setBytesPerSecond] = useState(0)
  const [total, setTotal] = useState(0)
  const [transferred, setTransferred] = useState(0)
  const [restarting, setRestarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cancelledRef = useRef(false)
  const restartRequested = useRef(false)
  const draftDirty = useCharacterStore((state) => state.hasUnsavedChanges())

  const beginDownload = useCallback(async () => {
    const api = window.electronAPI
    if (!api) {
      setPhase('error')
      setError('Updates are only available in the desktop app.')
      return
    }

    cancelledRef.current = false
    setPhase('downloading')
    setPercentage(0)
    setBytesPerSecond(0)
    setTotal(0)
    setTransferred(0)
    setError(null)

    try {
      const result = await api.downloadUpdate()
      if (!result.success && !cancelledRef.current) {
        setPhase('error')
        setError(result.error ?? 'The update download could not be started.')
      }
    } catch (downloadError) {
      if (cancelledRef.current) return
      setPhase('error')
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : 'The update download could not be started.',
      )
    }
  }, [])

  useEffect(() => {
    if (!open) {
      cancelledRef.current = false
      setPhase('downloading')
      setPercentage(0)
      setBytesPerSecond(0)
      setTotal(0)
      setTransferred(0)
      restartRequested.current = false
      setRestarting(false)
      setError(null)
      return
    }

    const unsubs: (() => void)[] = []

    if (window.electronAPI) {
      unsubs.push(
        window.electronAPI.onDownloadProgress((data) => {
          if (cancelledRef.current) return
          setPhase('downloading')
          setPercentage(data.percentage)
          setBytesPerSecond(data.bytesPerSecond)
          setTotal(data.total)
          setTransferred(data.transferred)
        }),
      )

      unsubs.push(
        window.electronAPI.onUpdateDownloaded(() => {
          if (cancelledRef.current) return
          setPhase('downloaded')
        }),
      )

      unsubs.push(
        window.electronAPI.onUpdateError((data) => {
          if (cancelledRef.current) return
          setPhase('error')
          setError(data.message)
        }),
      )

      unsubs.push(
        window.electronAPI.onUpdateCancelled(() => {
          cancelledRef.current = true
          setPhase('cancelled')
        }),
      )
    }

    // Subscribe before starting the download so immediate progress/error events
    // cannot be lost between opening the dialog and mounting this effect.
    void beginDownload()

    return () => {
      unsubs.forEach((unsub) => {
        unsub()
      })
    }
  }, [beginDownload, open])

  const handleRestart = useCallback(async () => {
    const api = window.electronAPI
    if (!api || restartRequested.current) return
    restartRequested.current = true
    setRestarting(true)
    setError(null)
    try {
      const draft = useCharacterStore.getState()
      if (draft.hasUnsavedChanges()) await draft.saveActiveCharacter()
      if (useCharacterStore.getState().hasUnsavedChanges()) {
        throw new Error('Your character still has unsaved changes. Save again before restarting.')
      }
      await api.installUpdate()
    } catch (restartError) {
      restartRequested.current = false
      setRestarting(false)
      setError(restartError instanceof Error ? restartError.message : 'The app could not restart.')
    }
  }, [])

  useEffect(() => {
    const protectDraft = (event: BeforeUnloadEvent) => {
      if (restartRequested.current && useCharacterStore.getState().hasUnsavedChanges()) {
        event.preventDefault()
      }
    }
    window.addEventListener('beforeunload', protectDraft)
    return () => window.removeEventListener('beforeunload', protectDraft)
  }, [])

  const handleCancel = useCallback(() => {
    window.electronAPI?.cancelUpdate()
  }, [])

  const handleRetry = useCallback(() => {
    void beginDownload()
  }, [beginDownload])

  const handleDismiss = useCallback(() => {
    onOpenChange(false)
  }, [onOpenChange])

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!restartRequested.current) onOpenChange(nextOpen)
      }}
    >
      <DialogContent
        className="w-full max-w-xs sm:max-w-sm p-3 sm:p-6"
        closeDisabled={restarting}
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>
            {phase === 'downloading' && `Downloading v${version}...`}
            {phase === 'downloaded' && 'Update Ready'}
            {phase === 'error' && 'Update Failed'}
            {phase === 'cancelled' && 'Download Cancelled'}
          </DialogTitle>
          <DialogDescription>
            {phase === 'downloading' && 'Please wait while the update is being downloaded.'}
            {phase === 'downloaded' &&
              (draftDirty
                ? 'Save your character and restart to install the update.'
                : 'Restart Tavern Born to install the update.')}
            {phase === 'error' && (error ?? 'An error occurred during download.')}
            {phase === 'cancelled' && 'The download was cancelled.'}
          </DialogDescription>
        </DialogHeader>

        {phase === 'downloading' && (
          <div className="space-y-3">
            <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-primary h-full rounded-full transition-all duration-300"
                style={{ width: `${Math.min(percentage, 100)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{percentage.toFixed(0)}%</span>
              <span>
                {formatBytes(transferred)} / {formatBytes(total)}
              </span>
              <span>{formatBytes(bytesPerSecond)}/s</span>
            </div>
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={handleCancel}>
                <X size={14} className="mr-1" />
                Cancel
              </Button>
            </div>
          </div>
        )}

        {phase === 'downloaded' && (
          <div className="space-y-3">
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" disabled={restarting} onClick={handleDismiss}>
                Later
              </Button>
              <Button size="sm" disabled={restarting} onClick={() => void handleRestart()}>
                {restarting && <SpinnerGap size={14} className="animate-spin" />}
                {restarting ? 'Preparing to restart…' : draftDirty ? 'Save and restart' : 'Restart'}
              </Button>
            </div>
          </div>
        )}

        {phase === 'error' && (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={handleDismiss}>
              Dismiss
            </Button>
            <Button variant="outline" size="sm" onClick={handleRetry}>
              Retry
            </Button>
          </div>
        )}

        {phase === 'cancelled' && (
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={handleDismiss}>
              Close
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
