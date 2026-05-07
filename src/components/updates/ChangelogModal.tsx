import { ArrowSquareOut, CircleNotch } from '@phosphor-icons/react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
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
            <div className="text-sm text-muted-foreground [&>h1]:text-base [&>h1]:font-semibold [&>h1]:text-foreground [&>h1]:mb-1 [&>h2]:text-sm [&>h2]:font-semibold [&>h2]:text-foreground [&>h2]:mt-3 [&>h2]:mb-1 [&>h3]:text-xs [&>h3]:font-semibold [&>h3]:text-foreground [&>h3]:mt-2 [&>h3]:mb-0.5 [&>p]:mb-2 [&>ul]:list-disc [&>ul]:pl-4 [&>ul]:mb-2 [&>ol]:list-decimal [&>ol]:pl-4 [&>ol]:mb-2 [&_li]:mb-0.5 [&>hr]:border-border [&>hr]:my-3 [&_a]:text-primary [&_a]:underline [&_strong]:text-foreground [&_code]:bg-muted [&_code]:rounded [&_code]:px-1 [&_code]:text-xs [&_pre]:bg-muted [&_pre]:rounded [&_pre]:p-2 [&_pre]:overflow-x-auto [&_pre]:text-xs [&_pre_code]:bg-transparent [&_pre_code]:p-0">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{changelog}</ReactMarkdown>
            </div>
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
