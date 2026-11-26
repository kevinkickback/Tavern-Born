import { ArrowSquareOut } from '@phosphor-icons/react'
import { useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ChangelogEntry } from '@/lib/changelog'

interface ChangelogModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  version: string
  changelog?: string | null
  releases?: readonly ChangelogEntry[]
  updateAvailable?: boolean
  onDownload?: () => void
  onOpenDownloadPage?: () => void | Promise<void>
}

export function ChangelogModal({
  open,
  onOpenChange,
  version,
  changelog,
  releases,
  updateAvailable = false,
  onDownload,
  onOpenDownloadPage,
}: ChangelogModalProps) {
  const returnFocus = useRef<HTMLElement | null>(null)
  const [selectedVersion, setSelectedVersion] = useState<string>()
  const selectedRelease =
    releases?.find((release) => release.version === selectedVersion) ?? releases?.[0]
  const viewedVersion = selectedRelease?.version ?? version
  const notes = updateAvailable ? changelog : selectedRelease?.notes
  const handleOpenDownloadPage = async () => {
    try {
      await onOpenDownloadPage?.()
    } catch (error) {
      toast.error('Could not open the download page', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[calc(100dvh-2rem)] flex-col gap-3 p-3 sm:p-6 lg:max-w-2xl"
        onOpenAutoFocus={() => {
          setSelectedVersion(undefined)
          const active = document.activeElement
          returnFocus.current = active instanceof HTMLElement ? active : null
        }}
        onCloseAutoFocus={() => returnFocus.current?.focus()}
      >
        <DialogHeader className="shrink-0 pr-6">
          <DialogTitle>
            {updateAvailable ? `Update Available — v${version}` : `Changelog — v${viewedVersion}`}
          </DialogTitle>
          <DialogDescription>
            {updateAvailable
              ? onDownload
                ? 'A new version is ready to download. Review the changes below.'
                : 'Download the new version from the release page and replace your current app.'
              : 'Browse release notes by version.'}
          </DialogDescription>
        </DialogHeader>

        {releases && releases.length > 1 && (
          <Select value={viewedVersion} onValueChange={setSelectedVersion}>
            <SelectTrigger aria-label="Release version" className="shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {releases.map((release) => (
                <SelectItem key={release.version} value={release.version}>
                  {`v${release.version}${release.version === version ? ' (Current)' : ''}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <section
          key={viewedVersion}
          aria-label="Release notes"
          className="min-h-0 overflow-y-auto overscroll-contain rounded-md border p-4"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: Focus enables keyboard scrolling of the notes.
          tabIndex={0}
        >
          {!updateAvailable && !releases ? (
            <p role="status" className="text-sm text-muted-foreground">
              Loading release notes…
            </p>
          ) : notes ? (
            <div className="changelog-markdown">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{notes}</ReactMarkdown>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground space-y-2">
              <p>No changelog available for this release.</p>
              {updateAvailable && (
                <a
                  href={`https://github.com/kevinkickback/Tavern-Born/releases/tag/v${version}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  View release on GitHub <ArrowSquareOut size={14} />
                </a>
              )}
            </div>
          )}
        </section>

        <DialogFooter className="shrink-0">
          {updateAvailable && onDownload ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Skip
              </Button>
              <Button
                onClick={() => {
                  returnFocus.current = null
                  onDownload()
                }}
              >
                Download
              </Button>
            </>
          ) : updateAvailable && onOpenDownloadPage ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Not Now
              </Button>
              <Button onClick={handleOpenDownloadPage}>
                Open Download Page <ArrowSquareOut size={14} />
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
