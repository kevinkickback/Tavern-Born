import { ArrowSquareOut, CircleNotch } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'

interface ChangelogModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  version: string
  changelog: string | null
  loading?: boolean
  onInstall?: () => void
}

export function ChangelogModal({
  open,
  onOpenChange,
  version,
  changelog,
  loading = false,
  onInstall,
}: ChangelogModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-xs sm:max-w-md p-3 sm:p-6">
        <DialogHeader>
          <DialogTitle>
            {onInstall ? `Update Available — v${version}` : `Changelog — v${version}`}
          </DialogTitle>
          <DialogDescription>
            {onInstall
              ? 'A new version is ready to install. Review the changes below.'
              : 'Changes included in this version.'}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-64 rounded-md border p-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <CircleNotch className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : changelog ? (
            <pre className="whitespace-pre-wrap text-sm text-muted-foreground font-sans">
              {changelog}
            </pre>
          ) : (
            <div className="text-sm text-muted-foreground space-y-2">
              <p>No changelog available for this release.</p>
              <a
                href={`https://github.com/kevinkickback/Tavern-Born/releases/tag/v${version}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                View release on GitHub <ArrowSquareOut size={14} />
              </a>
            </div>
          )}
        </ScrollArea>

        <DialogFooter>
          {onInstall ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Skip
              </Button>
              <Button onClick={onInstall}>Install Now</Button>
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
